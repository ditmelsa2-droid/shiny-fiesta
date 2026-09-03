const express = require('express');
const mineflayer = require('mineflayer');

// ==========================================
// 1. CẤU HÌNH
// ==========================================
const CONFIG = {
  host:          process.env.MC_HOST     || 'node.healthrecords.id.vn',
  port:          parseInt(process.env.MC_PORT || '25641'),
  // Server: Java 25, Minecraft 1.21.11 — dùng false để mineflayer tự detect protocol
  version:       process.env.MC_VERSION  || false,
  botPassword:   process.env.MC_BOT_PASSWORD || 'MatKhauBot123',
  reconnectDelay: 18000,
  openRouterKey: process.env.OPENROUTER_API_KEY || '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',
  aiModel:       process.env.AI_MODEL    || 'nvidia/nemotron-3.5-lightning:free',
  worldCmd:      process.env.MC_WORLD_CMDS || '/rtp',
};

const BOT_NAMES = process.env.MC_USERNAMES
  ? process.env.MC_USERNAMES.split(',').map(s => s.trim())
  : ['RayLight431', 'tuantuoitre'];

// ==========================================
// 2. HTTP KEEPALIVE
// ==========================================
const app = express();
const botsStatus = {};
BOT_NAMES.forEach(n => { botsStatus[n] = { connected: false, action: 'init' }; });

app.get('/', (_req, res) => res.json({ ok: true, bots: botsStatus }));
app.listen(process.env.PORT || 3000, () =>
  console.log('[HTTP] Keepalive server ready'));

// ==========================================
// 3. RESOURCE PACK BYPASS
// ==========================================
function setupPackBypass(bot) {
  // Mineflayer high-level API
  bot.on('resourcePack', () => {
    try { if (bot.acceptResourcePack) bot.acceptResourcePack(); } catch (_) {}
  });

  if (!bot._client) return;

  const respond = (data) => {
    const mk = (r) => {
      const p = { result: r };
      if (data.uuid) p.uuid = data.uuid;
      if (data.hash) p.hash = data.hash;
      return p;
    };
    try { bot._client.write('resource_pack_receive', mk(3)); } catch (_) {}       // ACCEPTED
    setTimeout(() => {
      try { bot._client.write('resource_pack_receive', mk(0)); } catch (_) {}    // LOADED
    }, 400);
  };

  bot._client.on('resource_pack_send',  respond);
  bot._client.on('add_resource_pack',   respond);

  // Đóng mọi GUI/inventory server mở
  bot._client.on('open_window', (d) => {
    setTimeout(() => {
      try { bot._client.write('close_window', { windowId: d.windowId || 0 }); } catch (_) {}
    }, 200);
  });
}

// ==========================================
// 4. AUTO LOGIN + /rtp
// ==========================================
function setupLogin(bot, username) {
  const pw = CONFIG.botPassword;
  let authed = false;
  let rtpDone = false;

  const doAuth = () => {
    if (authed) return;
    bot.chat(`/login ${pw}`);
    setTimeout(() => { bot.chat(`/register ${pw} ${pw}`); }, 1200);
  };

  const doRtp = () => {
    if (rtpDone) return;
    rtpDone = true;
    const cmds = CONFIG.worldCmd.split(',').map(s => s.trim()).filter(Boolean);
    cmds.forEach((cmd, i) => {
      setTimeout(() => {
        try { if (bot.entity) bot.chat(cmd); } catch (_) {}
      }, i * 2500);
    });
  };

  bot.on('spawn', () => {
    // Đóng window 0 phòng bị block
    setTimeout(() => {
      try { bot._client && bot._client.write('close_window', { windowId: 0 }); } catch (_) {}
    }, 400);
    setTimeout(doAuth, 2000);
  });

  bot.on('message', (msg) => {
    const t = msg.toString().toLowerCase();
    if (t.includes('/login') || t.includes('đăng nhập') || t.includes('dang nhap')) {
      bot.chat(`/login ${pw}`);
      if (!authed) { authed = true; setTimeout(doRtp, 2500); }
    } else if (t.includes('/register') || t.includes('đăng ký') || t.includes('dang ky')) {
      bot.chat(`/register ${pw} ${pw}`);
      if (!authed) { authed = true; setTimeout(doRtp, 2500); }
    } else if (t.includes('thành công') || t.includes('success') || t.includes('logged in')) {
      if (!authed) { authed = true; setTimeout(doRtp, 1500); }
    }
  });
}

// ==========================================
// 5. AI BRAIN
// ==========================================
async function askAI(username, data) {
  if (!CONFIG.openRouterKey) return null;
  try {
    const prompt = `Minecraft player "${username}". HP:${data.hp} Food:${data.food} ${data.isDay?'Day':'Night'} Threat:${data.threat} Pos:${data.x},${data.y},${data.z}. Reply JSON only: {"thought":"brief","action":"explore"|"flee"|"fight"|"watch_player"}`;
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${CONFIG.openRouterKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: CONFIG.aiModel, messages: [{ role: 'user', content: prompt }] })
    });
    const j = await r.json();
    const txt = j?.choices?.[0]?.message?.content?.trim() || '';
    const m = txt.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch (_) { return null; }
}

// ==========================================
// 6. SURVIVAL LOGIC
// ==========================================
function setupSurvival(bot, username) {
  let action = 'explore';
  let yaw = Math.random() * Math.PI * 2;
  let stuck = 0;
  let aiTimer = null;

  const sense = () => {
    const mob = bot.nearestEntity(e => (e.type === 'mob' || e.type === 'hostile') && bot.entity?.position.distanceTo(e.position) < 16);
    return {
      hp: Math.round(bot.health || 20),
      food: Math.round(bot.food || 20),
      isDay: bot.time?.isDay ?? true,
      threat: mob ? `${mob.name} ${Math.round(bot.entity.position.distanceTo(mob.position))}m` : 'none',
      x: Math.round(bot.entity?.position.x || 0),
      y: Math.round(bot.entity?.position.y || 0),
      z: Math.round(bot.entity?.position.z || 0),
      mob
    };
  };

  const think = async () => {
    if (!bot.entity) return;
    const s = sense();
    const d = await askAI(username, s);
    if (!d) return;
    action = d.action;
    console.log(`[${username}] ${d.thought} → ${d.action}`);
    botsStatus[username].action = d.action;

    if (d.action === 'flee' && s.mob) {
      const dx = bot.entity.position.x - s.mob.position.x;
      const dz = bot.entity.position.z - s.mob.position.z;
      yaw = Math.atan2(-dx, dz);
      bot.look(yaw, 0, true);
      bot.setControlState('sprint', true);
      bot.setControlState('forward', true);
    } else if (d.action === 'fight' && s.mob) {
      bot.lookAt(s.mob.position.offset(0, s.mob.height * 0.5, 0), true);
      bot.attack(s.mob);
    } else {
      action = 'explore';
      bot.setControlState('sprint', true);
      bot.setControlState('forward', true);
    }
  };

  bot.on('spawn', () => {
    console.log(`[${username}] Spawned! Bắt đầu chạy...`);
    botsStatus[username].connected = true;
    yaw = Math.random() * Math.PI * 2;
    bot.look(yaw, 0, true);
    bot.setControlState('forward', true);
    bot.setControlState('sprint', true);

    // AI mỗi 20s
    if (aiTimer) clearInterval(aiTimer);
    aiTimer = setInterval(think, 20000);
    setTimeout(think, 5000);

    // Đổi hướng random mỗi 15–25s để không kẹt 1 chỗ mãi
    const wander = () => {
      if (!bot.entity || action !== 'explore') { setTimeout(wander, 20000); return; }
      yaw = Math.random() * Math.PI * 2;
      bot.look(yaw, 0, true);
      setTimeout(wander, 15000 + Math.random() * 10000);
    };
    setTimeout(wander, 20000);

    // ===== TỰ CHẶT CÂY =====
    // Các loại block gỗ trong Minecraft 1.21.x
    const LOG_TYPES = [
      'oak_log','birch_log','spruce_log','jungle_log','acacia_log',
      'dark_oak_log','mangrove_log','cherry_log','bamboo_block',
      'oak_wood','birch_wood','spruce_wood','jungle_wood',
    ];
    let isChopping = false;

    const chopNearbyTree = async () => {
      if (isChopping || !bot.entity || action === 'flee') return;

      // Tìm log block trong vòng 4 block
      const logBlock = bot.findBlock({
        matching: (b) => LOG_TYPES.includes(b.name),
        maxDistance: 4,
        count: 1
      });

      if (!logBlock) return;

      isChopping = true;
      try {
        // Nhìn vào block gỗ
        await bot.lookAt(logBlock.position.offset(0.5, 0.5, 0.5), true);
        bot.setControlState('forward', false);
        bot.setControlState('sprint', false);

        // Đào block (tự động dùng tay hoặc rìu nếu có)
        await bot.dig(logBlock);
        console.log(`[${username}] Đã chặt: ${logBlock.name}`);
      } catch (e) {
        // Không đào được (quá xa, bị chặn, v.v.) → tiếp tục đi
      } finally {
        isChopping = false;
        // Sau khi chặt xong → tiếp tục chạy
        bot.setControlState('sprint', true);
        bot.setControlState('forward', true);
      }
    };

    // Kiểm tra cây gần đó mỗi 3s
    setInterval(() => {
      chopNearbyTree();
    }, 3000);
  });

  bot.on('physicsTick', () => {
    if (!bot.entity) return;

    // Bơi
    if (bot.entity.isInWater) {
      bot.setControlState('jump', true);
      bot.setControlState('sprint', false);
      return;
    }

    if (action === 'explore' || action === 'flee') {
      const spd = Math.hypot(bot.entity.velocity.x, bot.entity.velocity.z);
      if (spd < 0.02) {
        stuck++;
        bot.setControlState('jump', true);
        if (stuck > 5) {                               // Kẹt 5 ticks → quay 120–180°
          const a = (2 * Math.PI / 3) + Math.random() * (Math.PI / 3);
          yaw += (Math.random() > 0.5 ? 1 : -1) * a;
          bot.look(yaw, 0, true);
          stuck = 0;
        }
      } else {
        stuck = 0;
        bot.setControlState('jump', false);
        bot.setControlState('sprint', true);
        bot.setControlState('forward', true);
      }
    }

    // Tự đánh mob gần
    const near = bot.nearestEntity(e =>
      (e.type === 'mob' || e.type === 'hostile') && bot.entity.position.distanceTo(e.position) < 3.2);
    if (near) {
      bot.lookAt(near.position.offset(0, near.height * 0.5, 0), true);
      bot.attack(near);
    }
  });

  bot.on('death', () => {
    console.log(`[${username}] Chết! Hồi sinh...`);
    bot.clearControlStates();
    setTimeout(() => {
      bot.respawn();
      setTimeout(() => {
        action = 'explore';
        try { bot.chat('/rtp'); } catch (_) {}
        setTimeout(() => {
          bot.setControlState('forward', true);
          bot.setControlState('sprint', true);
        }, 3000);
      }, 3000);
    }, 2000);
  });

  bot.on('end', () => {
    if (aiTimer) { clearInterval(aiTimer); aiTimer = null; }
    botsStatus[username].connected = false;
  });
}

// ==========================================
// 7. TẠO BOT + TỰ RECONNECT
// ==========================================
function createBot(username) {
  console.log(`[${username}] Kết nối → ${CONFIG.host}:${CONFIG.port}...`);

  let bot;
  try {
    bot = mineflayer.createBot({
      host:     CONFIG.host,
      port:     CONFIG.port,
      username: username,
      version:  CONFIG.version,
    });
  } catch (e) {
    console.error(`[${username}] Lỗi tạo bot:`, e.message);
    setTimeout(() => createBot(username), CONFIG.reconnectDelay);
    return;
  }

  // Bắt PartialReadError trên client — KHÔNG crash
  bot._client?.on('error', (err) => {
    const m = err?.message || '';
    if (m.includes('PartialReadError') || m.includes('Read error')) {
      console.warn(`[${username}] Packet lỗi (bỏ qua): ${m.slice(0, 60)}`);
    } else {
      console.error(`[${username}] _client error: ${m.slice(0, 80)}`);
    }
  });

  setupPackBypass(bot);
  setupLogin(bot, username);
  setupSurvival(bot, username);

  bot.on('kicked', r  => console.warn(`[${username}] Kicked: ${String(r).slice(0, 80)}`));
  bot.on('error',  e  => console.error(`[${username}] Error: ${e?.message?.slice(0, 80)}`));
  bot.on('end',    () => {
    console.log(`[${username}] Disconnected. Reconnect sau ${CONFIG.reconnectDelay/1000}s...`);
    setTimeout(() => createBot(username), CONFIG.reconnectDelay + Math.random() * 3000);
  });
}

// ==========================================
// KHỞI ĐỘNG
// ==========================================
console.log(`[Boot] Khởi chạy ${BOT_NAMES.length} bots: ${BOT_NAMES.join(', ')}`);
BOT_NAMES.forEach((name, i) => setTimeout(() => createBot(name), i * 8000));

// Safety — không để crash vì bất cứ thứ gì
process.on('uncaughtException',  e  => console.warn('[!] uncaughtException:', e?.message?.slice(0,100)));
process.on('unhandledRejection', r  => console.warn('[!] unhandledRejection:', String(r).slice(0,100)));
