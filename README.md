# 📈 Smart Compost Monitoring System

This project presents an IoT-based compost monitoring system developed to automate the decomposition process by measuring temperature and humidity in real time. This system reduces the risk of failure, optimizes the process, and provides predictive insights through data analysis and AI integration.

---

🗂️ **Dataset**: Historical compost temperature and humidity data, stored in **Google Sheets** [https://docs.google.com/spreadsheets/d/1lisEESwTWg-lHCll2W5_Ch30QqpX6EexbYzBV8LYaEM/edit?usp=sharing].

🛠️ **Tools Used**: **ESP32** (Microcontroller), **DHT22** (Sensor), **Google Apps Script**, **Google Sheets**, **Gemini 2.0 Flash** (AI Model), **Telegram Bot**.

🤖 **Telegram Bot**: HYBOT - Reports [https://t.me/HYBOT_Reports_bot]

🎯 **Goal**: To provide objective, data-driven, and measurable monitoring for the composting process.

---

## 🗃️ Project Structure

Smart-Compost-Monitoring/
├── ESP32/
│ └── main.ino
├── appscript/
│ └── code.gs
├── .gitattributes
└── README.md

---

## 🔍 Code Insight Highlights

| File | Insight |
| :--- | :--- |
| `main.ino` | **ESP32 Program:** Reads temperature and humidity data from the DHT22 sensor, displays it on an LCD, and sends the data to Google Sheets every 1 hour. |
| `code.gs` | **Apps Script Program:** Receives data from the ESP32, saves it to Google Sheets, performs statistical analysis (mean & volatility), sends data to the Gemini AI model for recommendations, and sends automatic reports to a Telegram Bot. |

---

## 📊 Sample Visual Insights

![**Monthly Reports**](![alt text](example-output.png))

---

## 📚 Why This Project?

By combining **IoT** and **AI**, this project transforms the composting process from manual to data-driven. The system provides predictive insights and preventive recommendations, making the process more efficient and effective for farmers, and reducing organic waste that fails to decompose for the environment.
