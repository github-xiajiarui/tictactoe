/**
 * rooms.js — 房间管理与 WebSocket 连接生命周期
 *
 * 一个房间的生命周期：
 *   创建(waiting) → 双人加入(playing) → 游戏结束(ended) → 清理
 */

const {
  createBoard, isValidMove, applyMove,
  checkResult, playerToPiece,
} = require('./game');

// 全局房间表 roomId → Room
const rooms = new Map();

/** 生成短房间号（6位大写字母+数字） */
function generateId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 避免混淆 0/O, 1/I
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/** 创建新房间 */
function createRoom() {
  let id;
  do {
    id = generateId();
  } while (rooms.has(id)); // 防止碰撞（概率极低）

  const room = {
    id,
    players: [],      // [{ ws, playerId: 1|2 }]
    board: null,
    turn: null,       // 当前轮到哪位玩家 (1|2)
    phase: 'waiting', // waiting | playing | ended
    winner: null,     // X=1 | O=2 | null
    isDraw: false,
  };
  rooms.set(id, room);
  return id;
}

/** 加入房间 */
function joinRoom(roomId, ws) {
  const room = rooms.get(roomId);
  if (!room) return { ok: false, error: '房间不存在，请检查房间号' };
  if (room.phase === 'ended') return { ok: false, error: '该房间的游戏已结束' };
  if (room.players.length >= 2) return { ok: false, error: '房间已满' };

  const playerId = room.players.length + 1;
  room.players.push({ ws, playerId });

  let state = 'joined';
  if (room.players.length === 2) {
    // 两位玩家已就绪，开局
    room.phase = 'playing';
    room.board = createBoard();
    room.turn = 1; // Player 1 (X) 先手
    state = 'started';
  }

  return { ok: true, room, playerId, state };
}

/** 处理落子 */
function handleMove(room, playerId, position) {
  if (room.phase !== 'playing') {
    return { ok: false, error: '游戏未进行中' };
  }
  if (playerId !== room.turn) {
    return { ok: false, error: '还没轮到您' };
  }

  const piece = playerToPiece(playerId);
  const result = applyMove(room.board, position, piece);
  if (!result.ok) return result;

  room.board = result.board;

  const gameResult = checkResult(result.board);
  if (gameResult.winner !== null) {
    room.phase = 'ended';
    room.winner = gameResult.winner;
    room.isDraw = false;
  } else if (gameResult.isDraw) {
    room.phase = 'ended';
    room.winner = null;
    room.isDraw = true;
  } else {
    room.turn = room.turn === 1 ? 2 : 1;
  }

  return {
    ok: true,
    gameOver: room.phase === 'ended',
    winner: room.winner,
    isDraw: room.isDraw,
  };
}

/** 重置游戏（不清除房间和玩家） */
function resetGame(room) {
  room.board = createBoard();
  room.turn = 1;
  room.phase = 'playing';
  room.winner = null;
  room.isDraw = false;
}

/** 获取房间 */
function getRoom(roomId) {
  return rooms.get(roomId);
}

/** 从房间移除玩家 */
function removePlayer(roomId, playerId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const idx = room.players.findIndex(p => p.playerId === playerId);
  if (idx !== -1) {
    room.players.splice(idx, 1);
  }

  // 如果房间空了，60 秒后清理
  if (room.players.length === 0) {
    setTimeout(() => {
      if (rooms.has(roomId) && rooms.get(roomId).players.length === 0) {
        rooms.delete(roomId);
      }
    }, 60000);
  }
}

module.exports = {
  createRoom,
  joinRoom,
  handleMove,
  resetGame,
  getRoom,
  removePlayer,
};
