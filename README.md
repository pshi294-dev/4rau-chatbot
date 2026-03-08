# 4RAU Barber Cutclub — Zalo OA Chatbot

Bot tự động trả lời khách hàng trên Zalo OA, tích hợp Gemini AI + Google Sheets Knowledge Base.

## Cấu trúc
```
Zalo OA → server.js (Render.com) → Gemini API → reply Zalo
                   ↕
           Google Sheets (FAQ, Dịch vụ)
```

## Deploy lên Render.com

### Bước 1 — Push code lên GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/pshi294-dev/4rau-chatbot.git
git push -u origin main
```

### Bước 2 — Tạo Web Service trên Render.com
1. Vào render.com → New → Web Service
2. Connect GitHub repo: `4rau-chatbot`
3. Settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance Type: Free

### Bước 3 — Điền Environment Variables trên Render
```
ZALO_APP_SECRET=N4u1O63iURgLV6G78ANp
ZALO_APP_ID=4408086432808610647
ZALO_OA_TOKEN=<token hiện tại>
ZALO_REFRESH_TOKEN=<refresh token>
GEMINI_API_KEY=<gemini key>
SHEETS_CSV_FAQ=<csv url tab FAQ>
SHEETS_CSV_SERVICES=<csv url tab Dịch Vụ>
```

### Bước 4 — Cập nhật Webhook URL trên Zalo
Sau khi deploy, Render sẽ cấp URL dạng:
```
https://4rau-chatbot.onrender.com
```

Cập nhật file `zalo-webhook.php` trên 4rau.vn:
```php
$n8n_url = "https://4rau-chatbot.onrender.com/webhook";
```

### Bước 5 — Setup UptimeRobot (chống sleep)
1. Vào uptimerobot.com → Add Monitor
2. URL: `https://4rau-chatbot.onrender.com/ping`
3. Interval: 5 phút

## Cập nhật Knowledge Base
Chỉ cần sửa Google Sheets — bot tự đọc lại sau 30 phút.
