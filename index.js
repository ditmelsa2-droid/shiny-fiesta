const express = require('express');
const mineflayer = require('mineflayer');

// ==========================================
// 1. CẤU HÌNH SERVER & DANH SÁCH BOT
// ==========================================
const CONFIG = {
  // Địa chỉ máy chủ (đã check SRV record)
  host: process.env.MC_HOST || 'node.healthrecords.id.vn',
  // Cổng máy chủ (port SRV là 25641)
  port: parseInt(process.env.MC_PORT || '25641'),
  // Tự động nhận diện phiên bản Minecraft
  version: false,
  // Mật khẩu chung cho các bot đăng ký/đăng nhập
  botPassword: process.env.MC_BOT_PASSWORD || 'MatKhauBot123',
  // Thời gian chờ trước khi kết nối lại nếu bị kick (mili-giây)
  reconnectDelayMs: 15000
};

// Danh sách tên bot giống người thật
const BOT_NAMES = process.env.MC_USERNAMES 
  ? process.env.MC_USERNAMES.split(',').map(s => s.trim())
  : ['RayLight431', 'tuantuoitre'];

// ==========================================
// 2. HTTP SERVER CHO UPTIMEROBOT KEEPALIVE
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;

const botsStatus = {};
BOT_NAMES.forEach(name => {
  botsStatus[name] = {
    connected: false,
    loggedIn: false,
    lastEvent: 'Khởi tạo...',
    updatedAt: new Date().toISOString()
  };
});

app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Hệ thống Minecraft AFK Bot (Bypass Pack & Auto-Login) đang chạy!',
    totalBots: BOT_NAMES.length,
    bots: botsStatus
  });
});

app.listen(PORT, () => {
  console.log(`[Web Keepalive] Server đang lắng nghe trên cổng: ${PORT}`);
});

// ==========================================
// 3. XỬ LÝ RESOURCE PACK (BỎ QUA TẢI FILE NẶNG)
// ==========================================
function setupResourcePackBypass(bot, username) {
  // 1. Xử lý qua API tiêu chuẩn của Mineflayer
  bot.on('resourcePack', (url, hash) => {
    console.log(`[${username}] Server yêu cầu Resource Pack -> Báo đã tải xong (không tải file nặng)...`);
    try {
      if (typeof bot.acceptResourcePack === 'function') {
        bot.acceptResourcePack();
      }
    } catch (e) {
      console.warn(`[${username}] Lỗi acceptResourcePack:`, e.message);
    }
  });

  // 2. Xử lý hook packet cấp thấp (Hỗ trợ từ 1.16 đến 1.20+ / 1.21+)
  if (bot._client) {
    const handlePackPacket = (data) => {
      try {
        console.log(`[${username}] Nhận packet Resource Pack -> Gửi ACCEPTED và LOADED.`);
        const payloadAccepted = { result: 3 }; // 3 = ACCEPTED
        const payloadLoaded = { result: 0 };   // 0 = SUCCESSFULLY_LOADED

        if (data.uuid) {
          payloadAccepted.uuid = data.uuid;
          payloadLoaded.uuid = data.uuid;
        }
        if (data.hash) {
          payloadAccepted.hash = data.hash;
          payloadLoaded.hash = data.hash;
        }

        bot._client.write('resource_pack_receive', payloadAccepted);
        setTimeout(() => {
          bot._client.write('resource_pack_receive', payloadLoaded);
        }, 500);
      } catch (err) {
        // Bỏ qua nếu socket đóng
      }
    };

    bot._client.on('resource_pack_send', handlePackPacket);
    bot._client.on('add_resource_pack', handlePackPacket);
  }
}

// ==========================================
// 4. XỬ LÝ AUTO-LOGIN (AUTHME / NLOGIN)
// ==========================================
function setupAutoLogin(bot, username, updateStatus) {
  let isDoneLogin = false;

  const performAuth = () => {
    if (isDoneLogin) return;
    console.log(`[${username}] Tự động thực hiện xác thực tài khoản...`);
    bot.chat(`/login ${CONFIG.botPassword}`);
    setTimeout(() => {
      bot.chat(`/register ${CONFIG.botPassword} ${CONFIG.botPassword}`);
    }, 1500);
  };

  bot.on('spawn', () => {
    setTimeout(performAuth, 2000);
  });

  bot.on('message', (jsonMsg) => {
    const text = jsonMsg.toString().toLowerCase();

    if (text.includes('/register') || text.includes('dang ky') || text.includes('đăng ký')) {
      console.log(`[${username}] Server yêu cầu /register -> Đang gửi lệnh...`);
      bot.chat(`/register ${CONFIG.botPassword} ${CONFIG.botPassword}`);
      isDoneLogin = true;
      updateStatus(true, true, 'Đã gửi /register');
    } else if (text.includes('/login') || text.includes('dang nhap') || text.includes('đăng nhập')) {
      console.log(`[${username}] Server yêu cầu /login -> Đang gửi lệnh...`);
      bot.chat(`/login ${CONFIG.botPassword}`);
      isDoneLogin = true;
      updateStatus(true, true, 'Đã gửi /login');
    } else if (text.includes('thành công') || text.includes('success') || text.includes('logged in')) {
      isDoneLogin = true;
      updateStatus(true, true, 'Đã đăng nhập thành công vào server');
    }
  });
}

// ==========================================
// 5. KHỞI TẠO VÀ QUẢN LÝ TỪNG BOT
// ==========================================
function createManagedBot(username) {
  let bot = null;
  let antiAfkInterval = null;

  function updateStatus(connected, loggedIn, eventText) {
    botsStatus[username] = {
      connected,
      loggedIn,
      lastEvent: eventText,
      updatedAt: new Date().toISOString()
    };
  }

  function start() {
    console.log(`[${username}] Đang kết nối tới ${CONFIG.host}:${CONFIG.port}...`);
    updateStatus(false, false, `Đang kết nối tới ${CONFIG.host}:${CONFIG.port}`);

    try {
      bot = mineflayer.createBot({
        host: CONFIG.host,
        port: CONFIG.port,
        username: username,
        version: CONFIG.version
      });
    } catch (err) {
      console.error(`[${username}] Lỗi khi khởi tạo:`, err.message);
      scheduleReconnect();
      return;
    }

    setupResourcePackBypass(bot, username);
    setupAutoLogin(bot, username, updateStatus);

    bot.on('login', () => {
      console.log(`[${username}] Đã vượt qua handshake và login vào server.`);
      updateStatus(true, false, 'Đã kết nối vào server');
    });

    bot.on('spawn', () => {
      console.log(`[${username}] Đã spawn vào thế giới game!`);
      updateStatus(true, false, 'Đã vào thế giới game');

      if (antiAfkInterval) clearInterval(antiAfkInterval);
      antiAfkInterval = setInterval(() => {
        if (bot && bot.entity) {
          const deltaYaw = (Math.random() * 0.4 - 0.2);
          bot.look(bot.entity.yaw + deltaYaw, bot.entity.pitch, true);
        }
      }, 30000);
    });

    bot.on('kicked', (reason) => {
      console.warn(`[${username}] Bị kick khỏi server:`, reason);
      updateStatus(false, false, `Bị kick: ${typeof reason === 'string' ? reason : JSON.stringify(reason)}`);
    });

    bot.on('error', (err) => {
      console.error(`[${username}] Lỗi mạng:`, err.message);
      updateStatus(false, false, `Lỗi: ${err.message}`);
    });

    bot.on('end', (reason) => {
      console.log(`[${username}] Kết nối bị ngắt (${reason}). Sẽ kết nối lại...`);
      updateStatus(false, false, `Ngắt kết nối (${reason})`);

      if (antiAfkInterval) {
        clearInterval(antiAfkInterval);
        antiAfkInterval = null;
      }

      scheduleReconnect();
    });
  }

  function scheduleReconnect() {
    const delay = CONFIG.reconnectDelayMs + Math.floor(Math.random() * 5000);
    console.log(`[${username}] Sẽ thử kết nối lại sau ${Math.round(delay / 1000)}s...`);
    setTimeout(() => {
      start();
    }, delay);
  }

  start();
}

// Khởi chạy các bot cách nhau 5 giây
console.log(`[Hệ thống] Đang khởi chạy ${BOT_NAMES.length} bot: ${BOT_NAMES.join(', ')}`);
BOT_NAMES.forEach((name, index) => {
  setTimeout(() => {
    createManagedBot(name);
  }, index * 5000);
});
