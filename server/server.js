/**
 * server.js — NO-JOYSTICK 遊戲後端
 * 技術棧：Node.js + Express + SQLite (better-sqlite3)
 *
 * 啟動方式：
 *   node server.js          （生產環境）
 *   npx nodemon server.js   （開發環境，自動重啟）
 */

'use strict';

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const db      = require('./database');

const {
  VALIDATION,
  validatePhone,
  validateUsername,
  validateGameData,
  validateEventTiming,
  validateScoreReasonable,
  calculateScore,
  checkRateLimit,
  checkDeviceFingerprint,
  maskPlayerName,
  maskPhone,
  formatPlayerResponse
} = require('./validation');

// ── 設定 ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// 靜態文件（前端 HTML/JS/CSS/圖片）
app.use(express.static(path.join(__dirname, '..')));

// ── 請求日誌 ──────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// ── API 路由 ──────────────────────────────────────────────────────────────

// POST /api/players/register
app.post('/api/players/register', (req, res) => {
  try {
    if (!checkRateLimit(req.ip)) {
      return res.status(429).json({ error: 'Too many requests. Please wait.' });
    }

    const { playerId, username } = req.body;

    if (!playerId || !validatePhone(playerId)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }
    if (!username || !validateUsername(username)) {
      return res.status(400).json({ error: 'Invalid username format' });
    }

    const result = db.registerPlayer(username, playerId);

    res.json({
      success: true,
      player: formatPlayerResponse(result.player),
      isNew: result.isNew
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// GET /api/players/:playerId
app.get('/api/players/:playerId', (req, res) => {
  try {
    const { playerId } = req.params;

    if (!validatePhone(playerId)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    const player = db.getPlayer(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json({ success: true, player: formatPlayerResponse(player) });
  } catch (error) {
    console.error('Get player error:', error);
    res.status(500).json({ error: 'Failed to get player data' });
  }
});

// POST /api/game/submit
app.post('/api/game/submit', (req, res) => {
  try {
    const { player_id, score, coins, xp_collected, xp_used, distance, duration, events, player_name } = req.body;

    // 🌟 核心升級：提前呼叫計分公式，獲取你想要的「超詳細各項得分拆解數據」！
    const scoreDetails = calculateScore(req.body);

    // 🌟 核心升級：將「玩家名字」+「原始數據」+「詳細計分結果」三合一打包！
    const enrichedData = {
        player_name: player_name || 'UNKNOWN',
        ...req.body,
        detailed_breakdown: scoreDetails // 這裡就包含了 boostedCoins, totalScore 等所有詳情！
    };

    // 1. 檢查頻率限制
    if (!checkRateLimit(player_id)) {
      db.logError(player_id, 'RATE_LIMIT_EXCEEDED', '1分鐘內請求超過10次', enrichedData);
      return res.status(429).json({ error: 'Too many requests' });
    }

    // 2. 檢查基本格式
    if (!validateGameData(req.body)) {
      db.logError(player_id, 'INVALID_FORMAT', '數據格式缺失或為負數', enrichedData);
      return res.status(400).json({ error: 'Invalid game data' });
    }

    // 3. 防作弊驗證
    const validationErrors = [];
    validationErrors.push(...validateEventTiming(events));
    validationErrors.push(...validateScoreReasonable(req.body));

    if (validationErrors.length > 0) {
      db.logError(player_id, 'ANTI_CHEAT_TRIGGERED', validationErrors.join(' | '), enrichedData);
      return res.status(400).json({ error: validationErrors.join(', ') });
    }

    // 4. 寫入資料庫
    const recordId = db.saveGameRecord(
      player_id,           // 第一個參數：玩家電話
      {                    // 第二個參數：遊戲基礎數據
        coins: coins,
        xpCollected: xp_collected,
        xpUsed: xp_used,
        distance: distance,
        gameDuration: duration,
        player_name: player_name // 順手將名字都放入去，等資料庫有得紀錄
      },
      scoreDetails         // 第三個參數：超詳細計分結果
    );

   // ✅ 修復：返回 gameScore 和 scoreBreakdown，讓前端可以啟用分享按鈕
const player = db.getPlayer(player_id);

res.json({
  success: true,
  message: 'Score submitted',
  recordId,
  gameScore: scoreDetails.totalScore,       // ← 新增
  scoreBreakdown: {                          // ← 新增
    coins: scoreDetails.coins,
    coinScore: scoreDetails.coinScore,
    boostedCoins: scoreDetails.boostedCoins,
    normalCoins: scoreDetails.normalCoins,
    distanceScore: scoreDetails.distanceScore,
    xpUsed: scoreDetails.xpUsed,
    xpBoostedCoinScore: scoreDetails.xpBoostedCoinScore,
    xpBoostedDistanceScore: scoreDetails.xpBoostedDistanceScore,
    totalScore: scoreDetails.totalScore
  },
  player: player ? formatPlayerResponse(player) : null  // ← 新增
});


  } catch (error) {
    console.error('Submit error:', error);
    db.logError(req.body.player_id || 'UNKNOWN', 'SERVER_CRASH', error.message, req.body);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 🌟 同步更新：專門接收前端網絡崩潰的錯誤日誌路由 (加入玩家名字)
app.post('/api/log/client-error', (req, res) => {
  try {
    const { phone, name, message, data } = req.body;
    // 將 name 放進 data 裡面，方便在 raw_data 一眼看到
    const enrichedData = { player_name: name || 'UNKNOWN', ...data };
    db.logError(phone, 'CLIENT_SIDE_ERROR', message, enrichedData);
    res.json({ success: true });
  } catch (e) {
    res.status(500).send('Error logging');
  }
});

// GET /api/leaderboard
app.get('/api/leaderboard', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const leaderboard = db.getLeaderboard(limit);

    const masked = leaderboard.map((row, i) => ({
      rank:         i + 1,
      masked_name:  maskPlayerName(row.name),
      masked_phone: maskPhone(row.phone),
      best_score:   row.best_score,
      total_score:  row.best_score,   // 前端讀取 total_score 欄位
      total_games:  row.total_games
    }));

    res.json({ success: true, leaderboard: masked, type: 'score' });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// GET /api/player/:playerId/history
app.get('/api/player/:playerId/history', (req, res) => {
  try {
    const { playerId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const history = db.getPlayerHistory(playerId, limit);

    res.json({
      success: true,
      history: history.map(r => ({
        score:        r.score,
        coins:        r.coins,
        xp_collected: r.xp_collected,
        xp_used:      r.xp_used,
        distance:     r.distance,
        duration:     r.duration,
        played_at:    r.played_at
      }))
    });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: 'Failed to get player history' });
  }
});

// GET /api/stats
app.get('/api/stats', (req, res) => {
  try {
    const stats = db.getStats();
    if (stats.topPlayer) {
      stats.topPlayer.masked_username = maskPlayerName(stats.topPlayer.username);
      delete stats.topPlayer.username;
    }
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// SPA fallback — 所有其他路由返回 index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// ── 啟動 ──────────────────────────────────────────────────────────────────
function start() {
  const ok = db.initDatabase();
  if (!ok) {
    console.error('❌ Database init failed. Server will start but may not function.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║   🎮  NO-JOYSTICK Game Server                        ║
║   http://0.0.0.0:${String(PORT).padEnd(5)}                               ║
║   Database: SQLite  (game.db)                        ║
║   Anti-cheat: enabled                                ║
╚══════════════════════════════════════════════════════╝
    `);
  });
}

start();
