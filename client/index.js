#!/usr/bin/env node

/**
 * client/index.js — 终端双人井字棋客户端
 *
 * 使用:
 *   node client/index.js                          (连接本地 ws://localhost:8080)
 *   node client/index.js --server wss://xxx.com   (连接远程服务器)
 *
 * 操作:
 *   主菜单: 1 创建房间 | 2 加入房间 | q 退出
 *   游戏中: ↑↓←→ 移动光标 | Space/Enter 落子 | q 退出
 *   结束后: r 重新开始 | q 退出
 */

const WebSocket = require('ws');

// ── CLI 参数 ──────────────────────────────────────────
const SERVER_URL = (() => {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--server' && args[i + 1]) return args[i + 1];
  }
  return 'ws://localhost:8080';
})();

// ── ANSI 转义码 ──────────────────────────────────────
const ESC = '\x1b';
const RESET    = `${ESC}[0m`;
const REVERSE  = `${ESC}[7m`;
const BOLD     = `${ESC}[1m`;
const DIM      = `${ESC}[2m`;
const RED      = `${ESC}[31m`;
const GREEN    = `${ESC}[32m`;
const YELLOW   = `${ESC}[33m`;
const BLUE     = `${ESC}[34m`;
const CYAN     = `${ESC}[36m`;

// ── 全局状态 ──────────────────────────────────────────
const G = {
  // UI 阶段
  phase: 'menu',        // menu | enter_room | waiting | playing | ended
  // 游戏
  board: Array(9).fill(null),
  cursor: 4,
  myPlayerId: null,     // 1=先手(X)  2=后手(O)
  turn: null,           // 当前轮到谁 (1|2)
  winner: null,
  isDraw: false,
  // 房间
  roomId: null,
  roomIdInput: '',      // 输入中的房间号
  // 连接
  ws: null,
  pendingAction: null,  // 连接成功后自动执行的动作
  statusMsg: '',
};

// ── 渲染 ──────────────────────────────────────────────

function render() {
  process.stdout.write(`${ESC}[2J${ESC}[H`);

  // 标题
  process.stdout.write(`\n`);
  process.stdout.write(`  ${BOLD}${CYAN}══════════════════════════${RESET}\n`);
  process.stdout.write(`  ${BOLD}${CYAN}   井 字 棋 · 双 人 对 战  ${RESET}\n`);
  process.stdout.write(`  ${BOLD}${CYAN}══════════════════════════${RESET}\n\n`);

  // 内容区
  switch (G.phase) {
    case 'menu':
      renderMenu();
      break;
    case 'enter_room':
      renderEnterRoom();
      break;
    case 'waiting':
      renderWaiting();
      break;
    case 'playing':
    case 'ended':
      renderBoard();
      break;
  }

  // 状态栏
  process.stdout.write('\n');
  if (G.statusMsg) process.stdout.write(`  ${G.statusMsg}\n`);
}

function renderMenu() {
  process.stdout.write(`  ${BOLD}1${RESET})  创建新房间\n`);
  process.stdout.write(`  ${BOLD}2${RESET})  加入已有房间\n`);
  process.stdout.write(`  ${BOLD}q${RESET})  退出游戏\n\n`);
  process.stdout.write(`  请选择: `);
}

function renderEnterRoom() {
  const input = G.roomIdInput;
  const cursor = input.length;
  const display = input.padEnd(6, DIM + '_' + RESET);
  process.stdout.write(`  输入房间号: ${BOLD}${CYAN}${input}${RESET}${cursor < 6 ? DIM + '_' + RESET : ''}\n\n`);
  process.stdout.write(`  按 Enter 加入 | Backspace 删除 | q 取消\n`);
}

function renderWaiting() {
  process.stdout.write(`  ${YELLOW}⏳ 等待对手加入...${RESET}\n\n`);
  process.stdout.write(`  房间号: ${BOLD}${CYAN}${G.roomId}${RESET}\n\n`);
  process.stdout.write(`  ${DIM}请将房间号告诉您的对手${RESET}\n\n`);
  process.stdout.write(`  按 ${BOLD}q${RESET} 返回\n`);
}

function renderBoard() {
  const me = G.myPlayerId;
  const mySymbol = me === 1 ? 'X' : 'O';
  const myColor = mySymbol === 'X' ? YELLOW : BLUE;

  // 头部信息
  process.stdout.write(`  你: ${BOLD}${myColor}${mySymbol}${RESET}`);
  if (G.phase === 'playing') {
    if (G.turn === me) {
      process.stdout.write(`  ← ${GREEN}你的回合${RESET}`);
    } else {
      process.stdout.write(`  ← ${RED}对手思考中...${RESET}`);
    }
  } else {
    if (G.isDraw) {
      process.stdout.write(`  ← ${YELLOW}🤝 平局${RESET}`);
    } else if (G.winner === me) {
      process.stdout.write(`  ← ${GREEN}🎉 你赢了！${RESET}`);
    } else {
      process.stdout.write(`  ← ${RED}你输了${RESET}`);
    }
  }
  process.stdout.write('\n\n');

  // 棋盘
  const cellStyles = { 1: YELLOW, 2: BLUE };
  for (let r = 0; r < 3; r++) {
    process.stdout.write('      ');
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c;
      const val = G.board[idx];
      const isCursor = (G.phase === 'playing' && G.turn === me && idx === G.cursor);

      let ch, color;
      if (val === null) { ch = ' '; color = DIM; }
      else { ch = val === 1 ? 'X' : 'O'; color = cellStyles[val]; }

      if (isCursor) {
        process.stdout.write(`${REVERSE} ${color}${ch}${RESET}${REVERSE} ${RESET}`);
      } else {
        process.stdout.write(` ${color}${ch}${RESET} `);
      }
      if (c < 2) process.stdout.write(`${DIM}│${RESET}`);
    }
    process.stdout.write('\n');
    if (r < 2) process.stdout.write(`      ${DIM}───┼───┼───${RESET}\n`);
  }

  process.stdout.write('\n');
  if (G.phase === 'playing') {
    process.stdout.write(`  ${DIM}↑↓←→ 移动光标 | Space/Enter 落子 | q 退出${RESET}\n`);
  } else {
    process.stdout.write(`  ${DIM}按 r 重新开始 | q 退出${RESET}\n`);
  }
}

// ── 网络 ──────────────────────────────────────────────

function ensureConnected(callback) {
  if (G.ws && G.ws.readyState === WebSocket.OPEN) {
    callback();
    return;
  }
  G.pendingAction = callback;
  connect();
}

function connect() {
  G.ws = new WebSocket(SERVER_URL);

  G.ws.on('open', () => {
    setStatus(`${GREEN}✅ 已连接到服务器${RESET}`);
    render();
    if (G.pendingAction) {
      const action = G.pendingAction;
      G.pendingAction = null;
      action();
    }
  });

  G.ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      onServerMsg(msg);
    } catch (e) {
      setStatus(`${RED}消息解析错误${RESET}`);
      render();
    }
  });

  G.ws.on('close', () => {
    if (G.phase !== 'menu') {
      setStatus(`${RED}与服务器断开连接${RESET}`);
      G.phase = 'menu';
      G.roomId = null;
      G.myPlayerId = null;
      render();
    }
    G.ws = null;
  });

  G.ws.on('error', (err) => {
    setStatus(`${RED}连接失败: ${err.message}${RESET}`);
    render();
    G.ws = null;
  });
}

function send(msg) {
  if (G.ws && G.ws.readyState === WebSocket.OPEN) {
    G.ws.send(JSON.stringify(msg));
  } else {
    setStatus(`${RED}未连接到服务器${RESET}`);
    render();
  }
}

// ── 服务器消息处理 ────────────────────────────────────

function onServerMsg(msg) {
  switch (msg.type) {
    case 'room_created':
      G.roomId = msg.roomId;
      G.myPlayerId = msg.playerId;
      G.phase = 'waiting';
      setStatus(`房间 ${CYAN}${msg.roomId}${RESET} 已创建，等待对手...`);
      break;

    case 'room_joined':
      G.roomId = msg.roomId;
      G.myPlayerId = msg.playerId;
      setStatus(`✅ 已加入房间 ${CYAN}${msg.roomId}${RESET}`);
      break;

    case 'game_start':
      G.board = msg.board || Array(9).fill(null);
      G.turn = msg.turn;
      G.myPlayerId = msg.you;
      G.cursor = 4;
      G.winner = null;
      G.isDraw = false;
      G.phase = 'playing';
      setStatus(`${GREEN}🎮 游戏开始！${RESET}`);
      break;

    case 'state':
      G.board = msg.board;
      G.turn = msg.turn;
      G.winner = msg.winner;
      G.isDraw = msg.isDraw;
      G.phase = msg.phase;
      if (msg.phase === 'ended') {
        if (msg.isDraw) setStatus(`${YELLOW}🤝 平局！${RESET}`);
        else if (msg.winner === G.myPlayerId) setStatus(`${GREEN}🎉 你赢了！${RESET}`);
        else setStatus(`${RED}你输了${RESET}`);
      } else {
        setStatus('');
      }
      break;

    case 'opponent_left':
      G.phase = 'menu';
      G.roomId = null;
      G.myPlayerId = null;
      setStatus(`${RED}⚠️ 对手已离开游戏${RESET}`);
      break;

    case 'error':
      setStatus(`${RED}${msg.message}${RESET}`);
      break;
  }
  render();
}

// ── 工具 ──────────────────────────────────────────────

function setStatus(msg) {
  G.statusMsg = msg;
}

function cleanupAndExit() {
  process.stdout.write(`${ESC}[2J${ESC}[H`);
  process.stdout.write(`\n  再见！\n\n`);
  process.exit(0);
}

// ── 键盘输入 ──────────────────────────────────────────

let inputBuf = '';

function setupInput() {
  const stdin = process.stdin;
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  stdin.on('data', (chunk) => {
    inputBuf += chunk;
    consumeInput();
  });
}

/** 消耗输入缓冲区 */
function consumeInput() {
  while (inputBuf.length > 0) {
    // Escape 序列（箭头键）
    if (inputBuf[0] === '\x1b') {
      if (inputBuf.length < 3) break;
      const seq = inputBuf.slice(0, 3);
      inputBuf = inputBuf.slice(3);
      if (seq === '\x1b[A')       handleKey('↑');
      else if (seq === '\x1b[B')  handleKey('↓');
      else if (seq === '\x1b[C')  handleKey('→');
      else if (seq === '\x1b[D')  handleKey('←');
      continue;
    }

    const ch = inputBuf[0];
    inputBuf = inputBuf.slice(1);

    if (ch === ' ')               handleKey('SPACE');
    else if (ch === '\r' || ch === '\n') handleKey('ENTER');
    else if (ch === '\x7f' || ch === '\b') handleKey('BACKSPACE');
    else if (ch === 'q' || ch === 'Q') handleKey('q');
    else if (ch === 'r' || ch === 'R') handleKey('r');
    else if (ch === '1')          handleKey('1');
    else if (ch === '2')          handleKey('2');
    else if (/^[A-Z0-9]$/i.test(ch)) handleKey(ch.toUpperCase());
    // 忽略其他
  }
}

function handleKey(k) {
  // ── 房间号输入模式 ──
  if (G.phase === 'enter_room') {
    if (k === 'q') {
      G.roomIdInput = '';
      G.phase = 'menu';
      setStatus('');
      render();
      return;
    }
    if (k === 'BACKSPACE') {
      G.roomIdInput = G.roomIdInput.slice(0, -1);
      render();
      return;
    }
    if (k === 'ENTER') {
      if (G.roomIdInput.length >= 4) {
        const roomId = G.roomIdInput;
        G.roomIdInput = '';
        send({ type: 'join_room', roomId });
      }
      return;
    }
    // 只允许字母数字，最多 6 位
    if (/^[A-Z0-9]$/.test(k) && G.roomIdInput.length < 6) {
      G.roomIdInput += k;
      render();
    }
    return;
  }

  // ── 菜单模式 ──
  if (G.phase === 'menu') {
    switch (k) {
      case '1':
        ensureConnected(() => send({ type: 'create_room' }));
        return;
      case '2':
        ensureConnected(() => { G.phase = 'enter_room'; setStatus(''); render(); });
        return;
      case 'q':
        cleanupAndExit();
        return;
    }
    return;
  }

  // ── 等待模式 ──
  if (G.phase === 'waiting') {
    if (k === 'q') {
      G.phase = 'menu';
      G.roomId = null;
      G.myPlayerId = null;
      setStatus('');
      render();
    }
    return;
  }

  // ── 游戏模式 ──
  if (G.phase === 'playing') {
    if (G.turn === G.myPlayerId) {
      switch (k) {
        case '↑': G.cursor = Math.max(0, G.cursor - 3); render(); return;
        case '↓': G.cursor = Math.min(8, G.cursor + 3); render(); return;
        case '←': if (G.cursor % 3 > 0) G.cursor--; render(); return;
        case '→': if (G.cursor % 3 < 2) G.cursor++; render(); return;
        case 'SPACE': case 'ENTER':
          send({ type: 'move', position: G.cursor });
          return;
      }
    }
    if (k === 'q') cleanupAndExit();
    return;
  }

  // ── 结束模式 ──
  if (G.phase === 'ended') {
    if (k === 'r') send({ type: 'restart' });
    if (k === 'q') cleanupAndExit();
    return;
  }
}

// ── 启动 ──────────────────────────────────────────────

setupInput();
render();
setStatus(`${DIM}按 1 创建房间 或 2 加入房间${RESET}`);
render();
