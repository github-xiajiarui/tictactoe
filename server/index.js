/**
 * index.js — WebSocket 服务器入口
 *
 * 协议消息类型：
 *   客户端 → 服务端: create_room, join_room, move, restart
 *   服务端 → 客户端: room_created, room_joined, game_start, state, opponent_left, error
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const {
  createRoom, joinRoom, handleMove,
  resetGame, getRoom, removePlayer,
} = require('./rooms');
const { createBoard, formatSymbol, playerToPiece } = require('./game');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ── HTTP 服务器（提供静态页面）──
const httpServer = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(PUBLIC_DIR, filePath);

  // 安全：确保不跳出 public 目录
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const mime = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
    };
    res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain' });
    res.end(data);
  });
});

// ── WebSocket 服务器（挂载在 HTTP server 上）──
const wss = new WebSocketServer({ server: httpServer });

httpServer.listen(PORT, () => {
  console.log(`🎮 井字棋服务器启动 | http://localhost:${PORT}`);
});

// ── 客户端连接 ──────────────────────────────────────────────

wss.on('connection', (ws) => {
  console.log('🔗 新客户端连接');

  // 每个 ws 关联的当前房间和玩家 ID
  let currentRoomId = null;
  let currentPlayerId = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleMessage(ws, msg);
    } catch (e) {
      send(ws, { type: 'error', message: '无效的消息格式' });
    }
  });

  ws.on('close', () => {
    console.log(`🔌 客户端断开 (room=${currentRoomId}, player=${currentPlayerId})`);
    if (currentRoomId && currentPlayerId !== null) {
      const room = getRoom(currentRoomId);
      if (room) {
        // 通知对手
        const other = room.players.find(p => p.playerId !== currentPlayerId);
        if (other) {
          send(other.ws, { type: 'opponent_left', message: '对手已离开游戏' });
        }
        removePlayer(currentRoomId, currentPlayerId);
      }
    }
  });

  // ── 消息分发 ────────────────────────────────────────────

  function handleMessage(ws, msg) {
    switch (msg.type) {

      case 'create_room': {
        const roomId = createRoom();
        const result = joinRoom(roomId, ws);
        if (result.ok) {
          currentRoomId = roomId;
          currentPlayerId = result.playerId;
          send(ws, {
            type: 'room_created',
            roomId,
            playerId: result.playerId,
            message: `🏠 房间 ${roomId} 已创建，等待对手加入...`,
          });
          console.log(`📦 房间 ${roomId} 创建 (Player ${result.playerId})`);
        } else {
          send(ws, { type: 'error', message: result.error });
        }
        break;
      }

      case 'join_room': {
        const result = joinRoom(msg.roomId, ws);
        if (!result.ok) {
          send(ws, { type: 'error', message: result.error });
          return;
        }
        currentRoomId = msg.roomId;
        currentPlayerId = result.playerId;
        const room = result.room;

        // 通知加入者
        send(ws, {
          type: 'room_joined',
          roomId: msg.roomId,
          playerId: result.playerId,
          message: `✅ 已加入房间 ${msg.roomId}`,
        });

        // 如果两人已齐，通知双方 game_start
        if (result.state === 'started') {
          broadcastGameStart(room);
          console.log(`🎯 房间 ${msg.roomId} 游戏开始`);
        }
        console.log(`📥 Player ${result.playerId} 加入房间 ${msg.roomId}`);
        break;
      }

      case 'move': {
        if (!currentRoomId || currentPlayerId === null) {
          send(ws, { type: 'error', message: '请先加入或创建房间' });
          return;
        }
        const room = getRoom(currentRoomId);
        if (!room) {
          send(ws, { type: 'error', message: '房间不存在' });
          return;
        }

        const result = handleMove(room, currentPlayerId, msg.position);
        if (!result.ok) {
          send(ws, { type: 'error', message: result.error });
          return;
        }

        // 广播新状态给双方
        broadcastState(room, { position: msg.position, playerId: currentPlayerId });
        break;
      }

      case 'restart': {
        if (!currentRoomId) {
          send(ws, { type: 'error', message: '不在房间中' });
          return;
        }
        const room = getRoom(currentRoomId);
        if (!room) {
          send(ws, { type: 'error', message: '房间不存在' });
          return;
        }
        resetGame(room);
        broadcastGameStart(room);
        break;
      }

      default:
        send(ws, { type: 'error', message: '未知消息类型' });
    }
  }
});

// ── 广播辅助函数 ──────────────────────────────────────────

/** 向房间内所有玩家发送 game_start */
function broadcastGameStart(room) {
  room.players.forEach(p => {
    send(p.ws, {
      type: 'game_start',
      board: room.board,
      turn: room.turn,
      you: p.playerId,
    });
  });
}

/** 向房间内所有玩家发送 state（含最新落子信息） */
function broadcastState(room, lastMoveInfo) {
  room.players.forEach(p => {
    send(p.ws, {
      type: 'state',
      board: room.board,
      turn: room.turn,
      phase: room.phase,
      winner: room.winner,
      isDraw: room.isDraw,
      lastMove: lastMoveInfo.position,
      lastPlayer: lastMoveInfo.playerId,
    });
  });
}

/** 安全的 ws.send 封装 */
function send(ws, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}
