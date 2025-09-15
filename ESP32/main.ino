#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "DHT.h"
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// --- DHT22 Configuration ---
#define DHTPIN 4
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

// --- LCD 16x2 I2C Configuration ---
LiquidCrystal_I2C lcd(0x27, 16, 2);

// --- WiFi Credentials ---
const char* WIFI_SSID = "WIFI-SSID";
const char* WIFI_PASS = "WIFI-PASSWORD";

// --- Google Sheets Web App Endpoint ---
const char* WEB_APP_URL = "APPSCRIPT-URL";

// --- Timing Variables ---
unsigned long lastUploadTime = 0;
const unsigned long uploadInterval = 3600000UL; // 1 hour = 3600 sec = 3.6e6 ms
const unsigned long sampleInterval = 2000UL;    // 2 seconds
unsigned long lastSampleTime = 0;

// --- Thresholds ---
const float TEMP_MIN = 15.0;
const float TEMP_MAX = 32.0;
const float HUM_MIN  = 40.0;
const float HUM_MAX  = 85.0;

void setup() {
  Serial.begin(115200);
  dht.begin();

  // --- Initialize LCD ---
  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("ESP32 + DHT22");
  lcd.setCursor(0, 1);
  lcd.print("Connecting WiFi");

  // --- Connect to WiFi ---
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(" Connected!");

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("WiFi Connected!");

  // Force first upload immediately
  lastUploadTime = millis() - uploadInterval;
}

void loop() {
  unsigned long currentMillis = millis();

  // --- Read sensor every 2 seconds ---
  if (currentMillis - lastSampleTime >= sampleInterval) {
    lastSampleTime = currentMillis;

    float humidity = dht.readHumidity();
    float temperature = dht.readTemperature();

    if (isnan(humidity) || isnan(temperature)) {
      Serial.println("Failed to read DHT22!");
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Sensor Error!");
      return;
    }

    // Check thresholds
    bool safe = (temperature >= TEMP_MIN && temperature <= TEMP_MAX &&
                 humidity >= HUM_MIN && humidity <= HUM_MAX);

    // --- Serial Monitor ---
    Serial.printf("Temp: %.2f C | Hum: %.2f %% | Status: %s\n",
                  temperature, humidity, safe ? "SAFE" : "ALERT");

    // --- LCD Display ---
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("T:");
    lcd.print(temperature, 1);
    lcd.print((char)223); // degree symbol
    lcd.print("C H:");
    lcd.print(humidity, 1);
    lcd.print("%");

    lcd.setCursor(0, 1);
    lcd.print(safe ? "Status: SAFE" : "Status: ALERT");

    // --- Upload data every 1 hour ---
    if (currentMillis - lastUploadTime >= uploadInterval) {
      lastUploadTime = currentMillis;

      if (WiFi.status() == WL_CONNECTED) {
        WiFiClientSecure client;
        client.setInsecure();

        HTTPClient http;
        http.begin(client, WEB_APP_URL);
        http.addHeader("Content-Type", "application/json");

        String payload = "{\"temperature\":" + String(temperature, 2) +
                         ",\"humidity\":" + String(humidity, 2) + "}";
        Serial.println("Sending payload: " + payload);

        int httpResponseCode = http.POST(payload);

        if (httpResponseCode > 0) {
          Serial.println("HTTP Response code: " + String(httpResponseCode));
          String response = http.getString();
          Serial.println("Response: " + response);
        } else {
          Serial.println("Error code: " + String(httpResponseCode));
        }

        http.end();
      }
    }
  }
}
