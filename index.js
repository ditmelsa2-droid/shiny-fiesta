const express = require('express');
const mineflayer = require('mineflayer');

// ==========================================
// 1. CẤU HÌNH SERVER & DANH SÁCH BOT
// ==========================================
const CONFIG = {
  host: process.env.MC_HOST || 'node.healthrecords.id.vn',
  port: parseInt(process.env.MC_PORT || '25641'),
  version: false,
  botPassword: process.env.MC_BOT_PASSWORD || 'MatKhauBot123',
  reconnectDelayMs: 15000
};

// Danh sách tên bot sinh tồn
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
    status: 'Khởi tạo...',
    updatedAt: new Date().toISOString()
  };
});

app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Hệ thống Minecraft Autonomous Survival Bot đang chạy!',
    totalBots: BOT_NAMES.length,
    bots: botsStatus
  });
});

app.listen(PORT, () => {
  console.log(`[Web Keepalive] Server đang lắng nghe trên cổng: ${PORT}`);
});

// ==========================================
// 3. RESOURCE PACK BYPASS (KHÔNG TẢI FILE NẶNG)
// ==========================================
function setupResourcePackBypass(bot, username) {
  bot.on('resourcePack', () => {
    try {
      if (typeof bot.acceptResourcePack === 'function') {
        bot.acceptResourcePack();
      }
    } catch (e) {}
  });

  if (bot._client) {
    const handlePack = (data) => {
      try {
        const payloadAccepted = { result: 3 };
        const payloadLoaded = { result: 0 };
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
      } catch (err) {}
    };

    bot._client.on('resource_pack_send', handlePack);
    bot._client.on('add_resource_pack', handlePack);
  }
}

// ==========================================
// 4. AUTO-LOGIN (AUTHME / NLOGIN)
// ==========================================
function setupAutoLogin(bot, username, onLoggedIn) {
  let isDoneLogin = false;

  const performAuth = () => {
    if (isDoneLogin) return;
    bot.chat(`/login ${CONFIG.botPassword}`);
    setTimeout(() => {
      bot.chat(`/register ${CONFIG.botPassword} ${CONFIG.botPassword}`);
      isDoneLogin = true;
      if (onLoggedIn) onLoggedIn();
    }, 1500);
  };

  bot.on('spawn', () => {
    setTimeout(performAuth, 2000);
  });

  bot.on('message', (jsonMsg) => {
    const text = jsonMsg.toString().toLowerCase();
    if (text.includes('/register') || text.includes('dang ky') || text.includes('đăng ký')) {
      bot.chat(`/register ${CONFIG.botPassword} ${CONFIG.botPassword}`);
      isDoneLogin = true;
      if (onLoggedIn) onLoggedIn();
    } else if (text.includes('/login') || text.includes('dang nhap') || text.includes('đăng nhập')) {
      bot.chat(`/login ${CONFIG.botPassword}`);
      isDoneLogin = true;
      if (onLoggedIn) onLoggedIn();
    } else if (text.includes('thành công') || text.includes('success') || text.includes('logged in')) {
      isDoneLogin = true;
      if (onLoggedIn) onLoggedIn();
    }
  });
}

// ==========================================
// 5. AUTONOMOUS SURVIVAL ENGINE (ĐI SINH TỒN, KHÁM PHÁ, TỰ VỆ)
// ==========================================
function setupSurvivalEngine(bot, username, updateStatus) {
  let isExploring = false;
  let currentYaw = Math.random() * Math.PI * 2;
  let stuckTicks = 0;
  let exploreInterval = null;

  function startExploring() {
    if (isExploring) return;
    isExploring = true;
    console.log(`[${username}] Bắt đầu hành trình sinh tồn: Rời spawn và đi khám phá thế giới!`);
    updateStatus(true, true, 'Đang đi khám phá & sinh tồn tự do');

    // Chọn một hướng ngẫu nhiên để rời xa spawn
    currentYaw = Math.random() * Math.PI * 2;
    bot.look(currentYaw, 0, true);
    bot.setControlState('forward', true);
    bot.setControlState('sprint', true);

    // Cứ mỗi 15-20 giây đổi hướng nhẹ để lượn theo địa hình tự nhiên
    if (exploreInterval) clearInterval(exploreInterval);
    exploreInterval = setInterval(() => {
      if (!bot || !bot.entity) return;
      currentYaw += (Math.random() * 1.4 - 0.7);
      bot.look(currentYaw, 0, true);

      // Thi thoảng vung tay như đang cầm đuốc/vũ khí
      if (Math.random() < 0.3) {
        bot.swingArm();
      }
    }, 15000);
  }

  // Tự động xử lý vật lý vượt địa hình
  bot.on('physicsTick', () => {
    if (!isExploring || !bot.entity) return;

    // 1. Tự bơi ngoi lên nếu rơi xuống nước
    if (bot.entity.isInWater) {
      bot.setControlState('jump', true);
      bot.setControlState('sprint', false);
      return;
    }

    // 2. Kiểm tra nếu bị vướng block phía trước (vận tốc di chuyển gần bằng 0)
    const velocityHorizontal = Math.hypot(bot.entity.velocity.x, bot.entity.velocity.z);
    if (velocityHorizontal < 0.02) {
      stuckTicks++;
      // Nhảy thử để trèo lên block 1 bậc
      bot.setControlState('jump', true);

      // Nếu kẹt lâu (tường cao, chướng ngại vật) -> quay ngoắt sang hướng khác
      if (stuckTicks > 12) {
        currentYaw += (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 2 + (Math.random() * 0.4));
        bot.look(currentYaw, 0, true);
        stuckTicks = 0;
      }
    } else {
      stuckTicks = 0;
      bot.setControlState('jump', false);
      bot.setControlState('sprint', true);
      bot.setControlState('forward', true);
    }

    // 3. Tự vệ nếu có quái vật lại gần trong 3.5 block
    const hostileMob = bot.nearestEntity((e) => {
      return (e.type === 'mob' || e.type === 'hostile') && bot.entity.position.distanceTo(e.position) < 3.5;
    });
    if (hostileMob) {
      bot.lookAt(hostileMob.position.offset(0, hostileMob.height * 0.5, 0), true);
      bot.attack(hostileMob);
    }
  });

  // Khi chết: Tự động hồi sinh sau 2 giây và tiếp tục chạy đi sinh tồn tiếp
  bot.on('death', () => {
    console.log(`[${username}] Bot bị chết. Tự động hồi sinh sau 2 giây...`);
    updateStatus(true, true, 'Đã tử nạn -> Đang tự hồi sinh');
    isExploring = false;
    bot.clearControlStates();

    setTimeout(() => {
      bot.respawn();
      setTimeout(startExploring, 3000);
    }, 2000);
  });

  bot.on('end', () => {
    isExploring = false;
    if (exploreInterval) {
      clearInterval(exploreInterval);
      exploreInterval = null;
    }
  });

  return { startExploring };
}

// ==========================================
// 6. KHỞI TẠO VÀ QUẢN LÝ TỪNG BOT
// ==========================================
function createManagedBot(username) {
  let bot = null;

  function updateStatus(connected, loggedIn, statusText) {
    botsStatus[username] = {
      connected,
      loggedIn,
      status: statusText,
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

    const survivalEngine = setupSurvivalEngine(bot, username, updateStatus);

    // Đăng nhập xong là chuẩn bị cắm đầu chạy
    setupAutoLogin(bot, username, () => {
      console.log(`[${username}] Đăng nhập hoàn tất! Bắt đầu xuất phát...`);
      setTimeout(() => {
        survivalEngine.startExploring();
      }, 3000);
    });

    bot.on('login', () => {
      console.log(`[${username}] Đã kết nối vào server.`);
      updateStatus(true, false, 'Đã vào server');
    });

    bot.on('spawn', () => {
      console.log(`[${username}] Đã spawn vào thế giới.`);
      // Dự phòng nếu không có plugin login thì 5s sau tự chạy luôn
      setTimeout(() => {
        survivalEngine.startExploring();
      }, 5000);
    });

    bot.on('kicked', (reason) => {
      console.warn(`[${username}] Bị kick:`, reason);
      updateStatus(false, false, `Bị kick: ${typeof reason === 'string' ? reason : JSON.stringify(reason)}`);
    });

    bot.on('error', (err) => {
      console.error(`[${username}] Lỗi:`, err.message);
      updateStatus(false, false, `Lỗi: ${err.message}`);
    });

    bot.on('end', (reason) => {
      console.log(`[${username}] Ngắt kết nối (${reason}). Sẽ kết nối lại...`);
      updateStatus(false, false, `Ngắt kết nối (${reason})`);
      scheduleReconnect();
    });
  }

  function scheduleReconnect() {
    const delay = CONFIG.reconnectDelayMs + Math.floor(Math.random() * 5000);
    setTimeout(() => {
      start();
    }, delay);
  }

  start();
}

console.log(`[Hệ thống] Đang khởi chạy ${BOT_NAMES.length} bot sinh tồn: ${BOT_NAMES.join(', ')}`);
BOT_NAMES.forEach((name, index) => {
  setTimeout(() => {
    createManagedBot(name);
  }, index * 5000);
});
