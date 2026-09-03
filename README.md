# Minecraft AFK Bot (Express + Mineflayer)

Bot Minecraft tự động kết nối và giữ trạng thái online, tích hợp sẵn Express web server phục vụ keepalive bằng UptimeRobot trên Render/Koyeb.

## Cấu trúc thư mục
- `index.js`: Mã nguồn bot và web keepalive endpoint.
- `package.json`: Danh sách thư viện cần cài đặt (`mineflayer`, `express`).
- `.gitignore`: Bỏ qua các file rác khi đẩy lên GitHub.

## Cách chạy thử trên máy tính cá nhân
1. Mở PowerShell / Command Prompt tại thư mục này:
   ```bash
   npm install
   npm start
   ```
2. Mở trình duyệt truy cập `http://localhost:3000` để xem trạng thái bot.

## Deploy lên Render.com
1. Đẩy thư mục này lên một repository trên GitHub.
2. Trên Render, tạo **New Web Service** trỏ tới repo đó.
3. Cài đặt môi trường:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Dùng link Render được cấp thêm vào UptimeRobot (HTTP ping mỗi 5 phút).
