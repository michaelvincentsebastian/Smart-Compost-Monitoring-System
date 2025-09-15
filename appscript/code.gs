// ===== CONFIG =====
const DATA_SHEET_NAME = 'INTERVAL'; // Nama sheet tempat data masuk
const HEADER_ROWS = 1; // Baris header di sheet

// ===== WEB APP ENDPOINT: menerima data dari ESP32 =====
function doPost(e) {
  try {
    const sheet = getDataSheet();
    const data = JSON.parse(e.postData.contents);
    const timestamp = new Date();
    
    const temp = data.temperature;
    const humid = data.humidity;

    if (temp !== undefined && humid !== undefined) {
      sheet.appendRow([timestamp, temp, humid]);
      return ContentService.createTextOutput("Data appended successfully.").setMimeType(ContentService.MimeType.TEXT);
    } else {
      return ContentService.createTextOutput("Error: Missing temperature or humidity in JSON payload.").setMimeType(ContentService.MimeType.TEXT);
    }
  } catch (error) {
    return ContentService.createTextOutput("Error: " + error.message).setMimeType(ContentService.MimeType.TEXT);
  }
}

// ===== MAIN TRIGGER: jalankan hourly =====
function hourlyAnalystTrigger() {
  try {
    analyzeAndReport();
  } catch (e) {
    console.error('hourlyAnalystTrigger error: ' + e);
  }
}

// ===== CORE =====
function analyzeAndReport() {
  const props = PropertiesService.getScriptProperties();
  const sheet = getDataSheet();

  const lastRow = sheet.getLastRow();
  const dataCount = Math.max(0, lastRow - HEADER_ROWS);

  if (dataCount < 24) {
    console.log('Not enough data. Count=' + dataCount);
    return;
  }

  let windowSize = null;
  let windowName = null;

  if (dataCount >= 720 && (dataCount % 720 === 0)) {
    windowSize = 720; windowName = 'monthly';
  } else if (dataCount >= 168 && (dataCount % 168 === 0)) {
    windowSize = 168; windowName = 'weekly';
  } else if (dataCount >= 24 && (dataCount % 24 === 0)) {
    windowSize = 24; windowName = 'daily';
  } else {
    console.log('No window boundary hit. dataCount=' + dataCount);
    return;
  }

  const lastSentKey = 'LAST_SENT_COUNT_' + windowName.toUpperCase();
  const lastSentCount = Number(props.getProperty(lastSentKey) || '0');
  if (lastSentCount === dataCount) {
    console.log('Already processed ' + windowName + ' for count ' + dataCount);
    return;
  }

  const rows = fetchLastNRows(sheet, windowSize);
  if (!rows || rows.length < windowSize) {
    console.log('Insufficient rows returned: ' + (rows ? rows.length : 0));
    return;
  }

  const temps = rows.map(r => Number(r[1]));
  const hums  = rows.map(r => Number(r[2]));
  const statsTemp = calcStats(temps);
  const statsHum  = calcStats(hums);

  const start_ts = rows[0][0];
  const end_ts   = rows[rows.length - 1][0];

  const payload = {
    window: windowName,
    temp_mean: statsTemp.mean,
    temp_sd: statsTemp.sd,
    rh_mean: statsHum.mean,
    rh_sd: statsHum.sd,
    count: rows.length,
    start_ts: start_ts,
    end_ts: end_ts
  };

  console.log('Prepared payload: ' + JSON.stringify(payload));

  const aiText = analyzeWithGemini(payload);
  console.log('AI Text Output: ' + aiText);

  const telegramResult = sendToTelegram(formatTelegramMessage(windowName, payload, aiText));

  if (telegramResult && telegramResult.ok) {
    props.setProperty(lastSentKey, String(dataCount));
    console.log('Report sent, set ' + lastSentKey + '=' + dataCount);
  } else {
    console.warn('Telegram send failed or returned not-ok:', telegramResult);
  }
}

// ===== Helpers untuk sheet & data =====
function getDataSheet() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty('DATA_SHEET_ID');
  if (sheetId) {
    return SpreadsheetApp.openById(sheetId).getSheetByName(DATA_SHEET_NAME);
  } else {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('No active spreadsheet and DATA_SHEET_ID not set.');
    return ss.getSheetByName(DATA_SHEET_NAME);
  }
}

function fetchLastNRows(sheet, n) {
  const lastRow = sheet.getLastRow();
  const available = Math.max(0, lastRow - HEADER_ROWS);
  if (available < n) return null;
  const startRow = lastRow - n + 1;
  const range = sheet.getRange(startRow, 1, n, 3); // A=Timestamp, B=Temp, C=Humid
  const values = range.getValues();
  return values.map(r => {
    const ts = r[0] instanceof Date ? Utilities.formatDate(r[0], Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss") : String(r[0]);
    return [ts, Number(r[1]), Number(r[2])];
  });
}

function calcStats(arr) {
  const n = arr.length;
  if (n === 0) return { mean: 0, sd: 0 };
  const mean = arr.reduce((s,v)=>s+v,0) / n;
  const variance = arr.reduce((s,v)=>s+Math.pow(v-mean,2),0) / n; // population sd
  const sd = Math.sqrt(variance);
  return { mean: Number(mean.toFixed(3)), sd: Number(sd.toFixed(3)) };
}

// ===== Gemini integration =====
function analyzeWithGemini(payload) {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('GEMINI_API_KEY');
  if (!apiKey) return 'AI unavailable (no API key)';

  const prompt = buildAIPrompt(payload);
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 600, temperature: 0.2 }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  };

  try {
    const resp = UrlFetchApp.fetch(url, options);
    const txt = resp.getContentText();
    const j = JSON.parse(txt);
    try {
      return j.candidates[0].content.parts[0].text || JSON.stringify(j).slice(0,1500);
    } catch(e) {
      return JSON.stringify(j).slice(0,1500);
    }
  } catch (e) {
    console.error('analyzeWithGemini error: ' + e);
    return 'AI call failed: ' + e;
  }
}

function buildAIPrompt(payload) {
  return `
You are an expert assistant in vermicomposting. Create a concise report (in English) following this format:
- Title (Daily/Weekly/Monthly Report) + date range
- Average Temperature: <value> °C
- Temperature Volatility: <value>
- Average Humidity: <value> %
- Humidity Volatility: <value>
- 3 short action recommendations (one line each).
If monthly, also add a line: Ready/Not Ready: <conclusion> with a short reason.
Data:
${JSON.stringify(payload, null, 2)}
Selesai.
`;
}

// ===== Telegram =====
function formatTelegramMessage(windowName, payload, aiText) {
  const title = windowName === 'daily' ? 'Daily Report' : (windowName === 'weekly' ? 'Weekly Report' : 'Monthly Report');
  let msg = '*' + title + '*\n';
  msg += '_' + escapeMarkdownV2(payload.start_ts) + ' → ' + escapeMarkdownV2(payload.end_ts) + '_\n\n';
  msg += '*Stats*\n';
  msg += 'Temp mean: ' + escapeMarkdownV2(String(payload.temp_mean)) + ' °C\n';
  msg += 'Temp sd: ' + escapeMarkdownV2(String(payload.temp_sd)) + '\n';
  msg += 'Hum mean: ' + escapeMarkdownV2(String(payload.rh_mean)) + ' %\n';
  msg += 'Hum sd: ' + escapeMarkdownV2(String(payload.rh_sd)) + '\n';
  msg += 'Count: ' + payload.count + '\n\n';
  msg += '*AI Analysis & Recommendations*\n';
  msg += escapeMarkdownV2(aiText); // Gunakan fungsi escape di sini
  return msg;
}

function sendToTelegram(text) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TELEGRAM_BOT_TOKEN');
  const chatId = props.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chatId) {
    console.error('Telegram token/chat_id not set.');
    return null;
  }
  const url = 'https://api.telegram.org/bot' + token + '/sendMessage';
  const chunks = splitMessage(text, 3800);
  let lastResp = null;
  for (let i=0;i<chunks.length;i++) {
    const payload = { chat_id: chatId, text: chunks[i], parse_mode: 'MarkdownV2' };
    const opts = { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true };
    try {
      const resp = UrlFetchApp.fetch(url, opts);
      lastResp = JSON.parse(resp.getContentText());
    } catch(e) {
      console.error('sendToTelegram error: ' + e);
      return null;
    }
  }
  return lastResp;
}

// Fungsi utilitas untuk escaping Markdown V2
function escapeMarkdownV2(str) {
  if (!str) return '';
  // Karakter yang perlu di-escape untuk MarkdownV2, termasuk hyphen '-'
  const specialChars = ['\\', '_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
  return str.split('').map(char => specialChars.includes(char) ? '\\' + char : char).join('');
}

function splitMessage(str, chunkSize) {
  const out=[]; let i=0;
  while(i<str.length){ out.push(str.substring(i,i+chunkSize)); i+=chunkSize; }
  return out;
}

// ===== Utilities =====
function createHourlyTrigger() {
  ScriptApp.newTrigger('hourlyAnalystTrigger').timeBased().everyHours(1).create();
}

function deleteAllTriggers() {
  const t = ScriptApp.getProjectTriggers();
  t.forEach(x => ScriptApp.deleteTrigger(x));
}

function insertDummyRows(n) {
  const sheet = getDataSheet();
  const lastRow = sheet.getLastRow();
  let ts = new Date();
  for (let i=0;i<n;i++) {
    ts = new Date(ts.getTime() - ( (n-i) * 60 * 60 * 1000 ));
    const temp = (20 + Math.random()*12).toFixed(1);
    const hum  = (45 + Math.random()*40).toFixed(1);
    sheet.appendRow([ts, temp, hum]);
  }
  console.log('Inserted ' + n + ' dummy rows');
}
