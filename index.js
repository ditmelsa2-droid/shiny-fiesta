const express = require('express');
const mineflayer = require('mineflayer');

// ==========================================
// 1. CẤU HÌNH SERVER, BOT & AI BRAIN
// ==========================================
const CONFIG = {
  host: process.env.MC_HOST || 'node.healthrecords.id.vn',
  port: parseInt(process.env.MC_PORT || '25641'),
  version: false,
  botPassword: process.env.MC_BOT_PASSWORD || 'MatKhauBot123',
  reconnectDelayMs: 15000,
  // Key OpenRouter có sẵn trên máy của bạn
  openRouterKey: process.env.OPENROUTER_API_KEY || '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',
  // Model AI miễn phí, tư duy cực nhanh và nhạy bén
  aiModel: process.env.AI_MODEL || 'nvidia/nemotron-3.5-lightning:free'
};

const BOT_NAMES = process.env.MC_USERNAMES 
  ? process.env.MC_USERNAMES.split(',').map(s => s.trim())
  : ['RayLight431', 'tuantuoitre'];

// ==========================================
// 2. HTTP KEEPALIVE SERVER CHO UPTIMEROBOT
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;

const botsStatus = {};
BOT_NAMES.forEach(name => {
  botsStatus[name] = {
    connected: false,
    loggedIn: false,
    aiThought: 'Chờ kết nối...',
    currentAction: 'Khởi tạo...',
    updatedAt: new Date().toISOString()
  };
});

app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Hệ thống Minecraft Bot AI Thông Minh (OpenRouter AI Brain) đang chạy!',
    totalBots: BOT_NAMES.length,
    bots: botsStatus
  });
});

app.listen(PORT, () => {
  console.log(`[Web Keepalive] Server đang lắng nghe trên cổng: ${PORT}`);
});

// ==========================================
// 3. RESOURCE PACK BYPASS (KHÔNG TẢI FILE NẶNG - FIX ĐỨNG IM)
// ==========================================
function setupResourcePackBypass(bot, username) {
  // HIGH-LEVEL API fallback
  bot.on('resourcePack', () => {
    try { if (typeof bot.acceptResourcePack === 'function') bot.acceptResourcePack(); } catch (e) {}
  });

  if (bot._client) {
    const handlePack = (data) => {
      try {
        const makePayload = (result) => {
          const p = { result };
          if (data.uuid) p.uuid = data.uuid;
          if (data.hash) p.hash = data.hash;
          return p;
        };
        // result 3 = ACCEPTED ngay lập tức
        bot._client.write('resource_pack_receive', makePayload(3));
        // 300ms sau: SUCCESSFULLY_LOADED → server mở lock, bot đi lại được
        setTimeout(() => {
          try { bot._client.write('resource_pack_receive', makePayload(0)); } catch (_) {}
        }, 300);
      } catch (err) {}
    };

    bot._client.on('resource_pack_send', handlePack);
    bot._client.on('add_resource_pack', handlePack);

    // Auto-close bất kỳ GUI/menu nào server mở (menu chọn kit, xác nhận pack, v.v.)
    bot._client.on('open_window', (data) => {
      try {
        setTimeout(() => {
          try { bot._client.write('close_window', { windowId: data.windowId || 0 }); } catch (_) {}
        }, 250);
      } catch (e) {}
    });
  }
}

// ==========================================
// 4. AUTO-LOGIN + TỰ ĐI VÀO WORLD SURVIVAL
// ==========================================

// Danh sách lệnh thử lần lượt để vào world survival
// Thêm /warp, /world, /go, v.v. theo server của bạn
const WORLD_CMDS = (process.env.MC_WORLD_CMDS || '/rtp')
  .split(',').map(s => s.trim()).filter(Boolean);

function setupAutoLogin(bot, username, onLoggedIn) {
  let isDoneLogin = false;
  let hasEnteredWorld = false;

  // Sau khi login xong → tự vào survival world
  const goToSurvivalWorld = () => {
    if (hasEnteredWorld) return;
    hasEnteredWorld = true;
    console.log(`[${username}] Login xong! Thử vào survival world...`);

    // Thử từng lệnh cách nhau 2.5s cho đến khi vào được
    WORLD_CMDS.forEach((cmd, i) => {
      setTimeout(() => {
        if (!bot || !bot.entity) return;
        console.log(`[${username}] Thử lệnh world: ${cmd}`);
        bot.chat(cmd);
      }, i * 2500);
    });

    // Sau khi thử hết lệnh → bắt đầu di chuyển dù sao đi nữa
    setTimeout(() => {
      console.log(`[${username}] Bắt đầu sinh tồn!`);
      if (onLoggedIn) onLoggedIn();
    }, WORLD_CMDS.length * 2500 + 1500);
  };

  const performAuth = () => {
    if (isDoneLogin) return;
    bot.chat(`/login ${CONFIG.botPassword}`);
    setTimeout(() => {
      bot.chat(`/register ${CONFIG.botPassword} ${CONFIG.botPassword}`);
    }, 1500);
  };

  bot.on('spawn', () => {
    // Đóng window 0 (inventory/GUI mặc định) ngay khi spawn
    setTimeout(() => {
      try { bot._client && bot._client.write('close_window', { windowId: 0 }); } catch (_) {}
    }, 500);
    setTimeout(performAuth, 2000);
  });

  bot.on('message', (jsonMsg) => {
    const text = jsonMsg.toString().toLowerCase();

    // Xử lý prompt đăng ký/đăng nhập
    if (text.includes('/register') || text.includes('dang ky') || text.includes('đăng ký')) {
      bot.chat(`/register ${CONFIG.botPassword} ${CONFIG.botPassword}`);
      if (!isDoneLogin) { isDoneLogin = true; setTimeout(goToSurvivalWorld, 1500); }
    } else if (text.includes('/login') || text.includes('dang nhap') || text.includes('đăng nhập')) {
      bot.chat(`/login ${CONFIG.botPassword}`);
      if (!isDoneLogin) { isDoneLogin = true; setTimeout(goToSurvivalWorld, 2000); }
    } else if (text.includes('thành công') || text.includes('success') || text.includes('logged in')) {
      if (!isDoneLogin) { isDoneLogin = true; setTimeout(goToSurvivalWorld, 1000); }
    }

    // Detect khi teleport world thành công (server thường báo kiểu này)
    if (
      text.includes('teleport') || text.includes('dich chuyen') || text.includes('dịch chuyển') ||
      text.includes('world') || text.includes('welcome') || text.includes('chào mừng')
    ) {
      if (!hasEnteredWorld) {
        console.log(`[${username}] Phát hiện đã vào world! (${text.substring(0, 60)})`);
      }
    }
  });
}

// ==========================================
// 5. BỘ NÃO AI (AI BRAIN DECISION ENGINE)
// ==========================================
async function askAIBrain(username, sensoryData) {
  if (!CONFIG.openRouterKey) return null;

  try {
    const prompt = `You are an intelligent Minecraft survival player named "${username}".
Current Sensory Status:
- Health: ${sensoryData.health}/20
- Food/Hunger: ${sensoryData.food}/20
- Time of Day: ${sensoryData.isDay ? 'Daytime (Safe)' : 'Nighttime (Dangerous)'}
- Nearby Threats: ${sensoryData.threatSummary}
- Nearby Players: ${sensoryData.playerSummary}
- Position: X=${sensoryData.x}, Y=${sensoryData.y}, Z=${sensoryData.z}

Decide your next action. You must reply ONLY with a valid JSON object matching this schema:
{"thought": "concise 1-sentence reason in Vietnamese or English", "action": "explore" | "flee" | "fight" | "watch_player"}`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.openRouterKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: CONFIG.aiModel,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    if (data && data.choices && data.choices[0] && data.choices[0].message) {
      const content = data.choices[0].message.content.trim();
      // Tìm đoạn JSON trong câu trả lời
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    }
  } catch (err) {
    console.warn(`[${username}] Lỗi khi hỏi AI Brain:`, err.message);
  }
  return null;
}

// ==========================================
// 6. THIẾT LẬP HÀNH VI SINH TỒN THÔNG MINH
// ==========================================
function setupSmartSurvival(bot, username) {
  let currentAction = 'explore';
  let currentYaw = Math.random() * Math.PI * 2;
  let stuckTicks = 0;
  let aiLoopTimer = null;
  let isThinking = false;

  function updateStatusUI(thought, action) {
    botsStatus[username] = {
      connected: true,
      loggedIn: true,
      aiThought: thought || botsStatus[username].aiThought,
      currentAction: action || currentAction,
      updatedAt: new Date().toISOString()
    };
  }

  // Chu kỳ tư duy AI mỗi 20 giây
  async function triggerAITactics() {
    if (!bot || !bot.entity || isThinking) return;
    isThinking = true;

    // 1. Thu thập dữ liệu giác quan
    const nearestMob = bot.nearestEntity((e) => {
      return (e.type === 'mob' || e.type === 'hostile') && bot.entity.position.distanceTo(e.position) < 16;
    });

    const nearestPlayer = bot.nearestEntity((e) => {
      return e.type === 'player' && e.username !== bot.username && !BOT_NAMES.includes(e.username);
    });

    const sensoryData = {
      health: Math.round(bot.health || 20),
      food: Math.round(bot.food || 20),
      isDay: bot.time ? bot.time.isDay : true,
      threatSummary: nearestMob ? `${nearestMob.name || 'Monster'} cách ${Math.round(bot.entity.position.distanceTo(nearestMob.position))}m` : 'Không có nguy hiểm',
      playerSummary: nearestPlayer ? `Người chơi ${nearestPlayer.username} cách ${Math.round(bot.entity.position.distanceTo(nearestPlayer.position))}m` : 'Đang đi một mình',
      x: Math.round(bot.entity.position.x),
      y: Math.round(bot.entity.position.y),
      z: Math.round(bot.entity.position.z)
    };

    // 2. Hỏi bộ não AI
    const decision = await askAIBrain(username, sensoryData);
    isThinking = false;

    if (decision && decision.action) {
      currentAction = decision.action;
      console.log(`[${username} AI Suy nghĩ]: "${decision.thought}" -> Hành động: [${decision.action}]`);
      updateStatusUI(decision.thought, decision.action);

      if (decision.action === 'flee' && nearestMob) {
        // Tháo chạy: quay lưng 180 độ so với quái vật
        const dx = bot.entity.position.x - nearestMob.position.x;
        const dz = bot.entity.position.z - nearestMob.position.z;
        currentYaw = Math.atan2(-dx, dz);
        bot.look(currentYaw, 0, true);
        bot.setControlState('sprint', true);
        bot.setControlState('forward', true);
      } else if (decision.action === 'fight' && nearestMob) {
        // Chiến đấu
        bot.lookAt(nearestMob.position.offset(0, nearestMob.height * 0.5, 0), true);
        bot.attack(nearestMob);
      } else if (decision.action === 'watch_player' && nearestPlayer) {
        // Tò mò nhìn người chơi
        bot.setControlState('forward', false);
        bot.lookAt(nearestPlayer.position.offset(0, 1.6, 0), true);
        if (Math.random() < 0.4) bot.swingArm();
      } else {
        // Mặc định là đi khám phá
        currentAction = 'explore';
        bot.setControlState('sprint', true);
        bot.setControlState('forward', true);
      }
    }
  }

  bot.on('spawn', () => {
    console.log(`[${username}] Đã vào thế giới! Bắt đầu kích hoạt AI Survival...`);
    currentYaw = Math.random() * Math.PI * 2;
    bot.look(currentYaw, 0, true);
    bot.setControlState('forward', true);
    bot.setControlState('sprint', true);

    // Kích hoạt chu kỳ suy nghĩ AI mỗi 20 giây
    if (aiLoopTimer) clearInterval(aiLoopTimer);
    aiLoopTimer = setInterval(triggerAITactics, 20000);
    setTimeout(triggerAITactics, 4000);

    // ĐỔI HƯỚNG NGẪU NHIÊN định kỳ mỗi 15-25s để không đi mãi 1 chiều
    const randomTurnLoop = () => {
      if (!bot || !bot.entity) return;
      // Chỉ đổi hướng khi đang explore (không phải flee/fight)
      if (currentAction === 'explore') {
        currentYaw = Math.random() * Math.PI * 2;
        bot.look(currentYaw, 0, true);
        console.log(`[${username}] Đổi hướng ngẫu nhiên`);
      }
      setTimeout(randomTurnLoop, 15000 + Math.random() * 10000);
    };
    setTimeout(randomTurnLoop, 20000);
  });

  // Tự xử lý vật lý vượt địa hình theo thời gian thực
  bot.on('physicsTick', () => {
    if (!bot.entity) return;

    // Bơi nếu rơi xuống nước
    if (bot.entity.isInWater) {
      bot.setControlState('jump', true);
      bot.setControlState('sprint', false);
      return;
    }

    if (currentAction === 'explore' || currentAction === 'flee') {
      const speedHorizontal = Math.hypot(bot.entity.velocity.x, bot.entity.velocity.z);

      if (speedHorizontal < 0.02) {
        stuckTicks++;
        // Nhảy để thử trèo bậc thấp
        bot.setControlState('jump', true);

        // Kẹt > 5 ticks (thay vì 12) → đổi hướng ngay lập tức, góc lớn hơn
        if (stuckTicks > 5) {
          // Quay 120°–180° để thoát khỏi vật cản lớn (cây, tường, vách núi)
          const angle = (Math.PI * 2 / 3) + Math.random() * (Math.PI / 3); // 120°–180°
          const turnDir = Math.random() > 0.5 ? 1 : -1;
          currentYaw += turnDir * angle;
          bot.look(currentYaw, 0, true);
          stuckTicks = 0;
          console.log(`[${username}] Kẹt! Đổi hướng ${Math.round(angle * 180 / Math.PI)}°`);
        }
      } else {
        stuckTicks = 0;
        bot.setControlState('jump', false);
        bot.setControlState('sprint', true);
        bot.setControlState('forward', true);
      }
    }

    // Tự vệ tức thì nếu quái vật vào tầm đánh 3.2 block
    const closeMonster = bot.nearestEntity((e) => {
      return (e.type === 'mob' || e.type === 'hostile') && bot.entity.position.distanceTo(e.position) < 3.2;
    });
    if (closeMonster) {
      bot.lookAt(closeMonster.position.offset(0, closeMonster.height * 0.5, 0), true);
      bot.attack(closeMonster);
    }
  });

  // Khi chết: Tự hồi sinh và kích hoạt lại AI
  bot.on('death', () => {
    console.log(`[${username}] Bot bị chết. Tự động hồi sinh sau 2s...`);
    updateStatusUI('Vừa tử nạn, đang hồi sinh...', 'respawning');
    bot.clearControlStates();

    setTimeout(() => {
      bot.respawn();
      setTimeout(() => {
        currentAction = 'explore';
        // Hồi sinh xong chạy /rtp lại để ra khỏi spawn
        bot.chat('/rtp');
        setTimeout(() => {
          bot.setControlState('forward', true);
          bot.setControlState('sprint', true);
        }, 3000);
      }, 3000);
    }, 2000);
  });

  bot.on('end', () => {
    if (aiLoopTimer) {
      clearInterval(aiLoopTimer);
      aiLoopTimer = null;
    }
  });
}

// ==========================================
// 7. KHỞI TẠO TỪNG BOT
// ==========================================
function createManagedBot(username) {
  let bot = null;

  function start() {
    console.log(`[${username}] Đang kết nối tới ${CONFIG.host}:${CONFIG.port}...`);

    try {
      bot = mineflayer.createBot({
        host: CONFIG.host,
        port: CONFIG.port,
        username: username,
        version: CONFIG.version
      });
    } catch (err) {
      console.error(`[${username}] Lỗi khởi tạo:`, err.message);
      scheduleReconnect();
      return;
    }

    setupResourcePackBypass(bot, username);
    setupSmartSurvival(bot, username);

    setupAutoLogin(bot, username, () => {
      console.log(`[${username}] Xác thực thành công! Sẵn sàng hành động.`);
    });

    bot.on('kicked', (reason) => {
      console.warn(`[${username}] Bị kick:`, reason);
    });

    bot.on('error', (err) => {
      console.error(`[${username}] Lỗi:`, err.message);
    });

    bot.on('end', (reason) => {
      console.log(`[${username}] Ngắt kết nối (${reason}). Sẽ kết nối lại sau ${CONFIG.reconnectDelayMs / 1000}s...`);
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

console.log(`[Hệ thống] Đang khởi chạy ${BOT_NAMES.length} bot AI: ${BOT_NAMES.join(', ')}`);
BOT_NAMES.forEach((name, index) => {
  setTimeout(() => {
    createManagedBot(name);
  }, index * 5000);
});
