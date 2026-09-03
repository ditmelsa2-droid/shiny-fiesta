const express = require('express');
const mineflayer = require('mineflayer');

// ==========================================
// 1. CẤU HÌNH SERVER & BOT MINECRAFT
// ==========================================
const CONFIG = {
  // Địa chỉ server Minecraft của bạn
  host: process.env.MC_HOST || 'ply.healthrecords.id.vn',
  // Cổng server (mặc định 25565)
  port: parseInt(process.env.MC_PORT || '25565'),
  // Tên hiển thị của bot trong game
  username: process.env.MC_USERNAME || 'Bot_AFK',
  // Tự động nhận diện phiên bản game (để false)
  version: false,
  // Lệnh đăng nhập nếu server dùng AuthMe / nLogin (nếu không có thì để trống "")
  loginCommand: process.env.MC_LOGIN_CMD || '', // Ví dụ: '/login MatKhau123'
  // Thời gian chờ tự kết nối lại nếu bị kick hoặc server reload (mili-giây)
  reconnectDelayMs: 15000
};

// ==========================================
// 2. HTTP SERVER CHO UPTIMEROBOT KEEPALIVE
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;

let botStatus = {
  connected: false,
  username: CONFIG.username,
  lastEvent: 'Khởi tạo tiến trình...',
  updatedAt: new Date().toISOString()
};

app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Bot Minecraft Keepalive Web Service đang chạy!',
    bot: botStatus
  });
});

app.listen(PORT, () => {
  console.log(`[Web Keepalive] Server đang lắng nghe trên cổng: ${PORT}`);
});

// ==========================================
// 3. KHỞI TẠO VÀ QUẢN LÝ BOT MINECRAFT
// ==========================================
let bot = null;
let antiAfkInterval = null;

function startBot() {
  console.log(`[Bot] Đang thử kết nối tới ${CONFIG.host}:${CONFIG.port} với tên "${CONFIG.username}"...`);
  botStatus.lastEvent = `Đang kết nối tới ${CONFIG.host}:${CONFIG.port}`;
  botStatus.updatedAt = new Date().toISOString();

  try {
    bot = mineflayer.createBot({
      host: CONFIG.host,
      port: CONFIG.port,
      username: CONFIG.username,
      version: CONFIG.version
    });
  } catch (err) {
    console.error('[Bot Error khi tạo]:', err.message);
    scheduleReconnect();
    return;
  }

  bot.on('login', () => {
    console.log(`[Bot] Đã đăng nhập thành công vào server với tên: ${bot.username}`);
    botStatus.connected = true;
    botStatus.lastEvent = 'Đã đăng nhập vào server';
    botStatus.updatedAt = new Date().toISOString();
  });

  bot.on('spawn', () => {
    console.log('[Bot] Đã vào thế giới (spawn)!');
    botStatus.lastEvent = 'Đã vào thế giới game';
    botStatus.updatedAt = new Date().toISOString();

    // Tự động gửi lệnh login nếu có cấu hình
    if (CONFIG.loginCommand) {
      setTimeout(() => {
        bot.chat(CONFIG.loginCommand);
        console.log(`[Bot] Đã gửi lệnh xác thực: ${CONFIG.loginCommand}`);
      }, 2000);
    }

    // Cơ chế chống AFK kick: Cứ 30 giây xoay nhẹ góc nhìn
    if (antiAfkInterval) clearInterval(antiAfkInterval);
    antiAfkInterval = setInterval(() => {
      if (bot && bot.entity) {
        bot.look(bot.entity.yaw + 0.15, bot.entity.pitch, true);
      }
    }, 30000);
  });

  bot.on('kicked', (reason) => {
    console.warn('[Bot] Bị kick khỏi server:', reason);
    botStatus.connected = false;
    botStatus.lastEvent = `Bị kick: ${typeof reason === 'string' ? reason : JSON.stringify(reason)}`;
    botStatus.updatedAt = new Date().toISOString();
  });

  bot.on('error', (err) => {
    console.error('[Bot Lỗi mạng/kết nối]:', err.message);
    botStatus.lastEvent = `Lỗi: ${err.message}`;
    botStatus.updatedAt = new Date().toISOString();
  });

  bot.on('end', (reason) => {
    console.log(`[Bot] Kết nối bị ngắt (${reason}). Chuẩn bị kết nối lại...`);
    botStatus.connected = false;
    botStatus.lastEvent = `Ngắt kết nối (${reason})`;
    botStatus.updatedAt = new Date().toISOString();

    if (antiAfkInterval) {
      clearInterval(antiAfkInterval);
      antiAfkInterval = null;
    }

    scheduleReconnect();
  });
}

function scheduleReconnect() {
  console.log(`[Bot] Sẽ kết nối lại sau ${CONFIG.reconnectDelayMs / 1000} giây...`);
  setTimeout(() => {
    startBot();
  }, CONFIG.reconnectDelayMs);
}

// Bắt đầu chạy bot
startBot();
