/**
 * 协议集成测试 — 模拟两个客户端完整对局
 * 运行: node tictactoe/test-protocol.js
 */

const WebSocket = require('ws');
const SERVER = 'ws://localhost:8080';
const assert = (cond, msg) => { if (!cond) throw new Error(`FAIL: ${msg}`); console.log(`  ✅ ${msg}`); };

function createClient(name) {
  return new Promise((resolve) => {
    const ws = new WebSocket(SERVER);
    const queue = [];
    let onMessage = null;

    ws.on('open', () => {
      const client = {
        ws, name, queue,
        send(msg) { ws.send(JSON.stringify(msg)); },
        waitFor(type) {
          return new Promise((res) => {
            const idx = queue.findIndex(m => m.type === type);
            if (idx !== -1) return res(queue.splice(idx, 1)[0]);
            onMessage = (msg) => { if (msg.type === type) res(msg); else queue.push(msg); };
          });
        },
        close() { ws.close(); },
      };
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        const tag = msg.type + (msg.roomId ? ' r='+msg.roomId : '') + (msg.position !== undefined ? ' pos='+msg.position : '') + (msg.phase === 'ended' ? ' END' : '');
        console.log(`  [${name}] ← ${tag}`);
        if (onMessage) { const cb = onMessage; onMessage = null; cb(msg); }
        else queue.push(msg);
      });
      ws.on('error', (e) => console.error(`  [${name}] 错误:`, e.message));
      resolve(client);
    });
  });
}

async function main() {
  console.log('\n═══ 井字棋协议测试 ═══\n');

  const p1 = await createClient('P1');
  const p2 = await createClient('P2');

  // ── 1. 创建房间 ──
  console.log('── 1. P1 创建房间 ──');
  p1.send({ type: 'create_room' });
  const created = await p1.waitFor('room_created');
  assert(created.type === 'room_created', '收到 room_created');
  assert(created.playerId === 1, 'P1 是 Player 1');
  const roomId = created.roomId;

  // ── 2. P2 加入 ──
  console.log('\n── 2. P2 加入 ──');
  p2.send({ type: 'join_room', roomId });
  const joined = await p2.waitFor('room_joined');
  assert(joined.playerId === 2, 'P2 是 Player 2');

  // ── 3. 开局 ──
  console.log('\n── 3. 开局 ──');
  const start1 = await p1.waitFor('game_start');
  await p2.waitFor('game_start');
  assert(start1.turn === 1, 'P1 先手');

  // ── 4. 对局: P1 赢 ──
  console.log('\n── 4. 对局 → P1 获胜 ──');
  p1.send({ type: 'move', position: 4 }); await p1.waitFor('state'); await p2.waitFor('state');
  console.log('  P1 下 4');
  p2.send({ type: 'move', position: 0 }); await p2.waitFor('state'); await p1.waitFor('state');
  console.log('  P2 下 0');
  p1.send({ type: 'move', position: 1 }); await p1.waitFor('state'); await p2.waitFor('state');
  console.log('  P1 下 1');
  p2.send({ type: 'move', position: 3 }); await p2.waitFor('state'); await p1.waitFor('state');
  console.log('  P2 下 3');
  p1.send({ type: 'move', position: 7 });
  const end = await p1.waitFor('state'); await p2.waitFor('state');
  assert(end.phase === 'ended', '游戏结束');
  assert(end.winner === 1, 'P1 获胜');
  console.log('  🎉 P1 (X) 连成竖线!');

  // ── 5. 重新开始 ──
  console.log('\n── 5. 重新开始 ──');
  p1.send({ type: 'restart' });
  const r1 = await p1.waitFor('game_start');
  await p2.waitFor('game_start');
  assert(r1.turn === 1, 'P1 先手');
  assert(r1.board.every(c => c === 0), '棋盘清零');

  // ── 6. 错误处理 ──
  console.log('\n── 6. 错误处理 ──');

  // 6a. 占已被占的位置
  // 当前: 轮到 P1
  p1.send({ type: 'move', position: 4 });  // P1 下 4 ✅ → 轮到 P2
  await p1.waitFor('state'); await p2.waitFor('state');
  p2.send({ type: 'move', position: 4 });  // P2 想占 4 — 已被占（但此时是 P2 回合）
  const errOcc = await p2.waitFor('error');
  assert(errOcc.message.includes('占用') || errOcc.message.includes('已被'), `占位错误: ${errOcc.message}`);

  // 仍轮到 P2，先让 P2 下一个有效位置
  p2.send({ type: 'move', position: 8 });  // P2 下 8 ✅ → 轮到 P1
  await p2.waitFor('state'); await p1.waitFor('state');

  // 6b. 非当前玩家落子（现在轮到 P1，P2 越权）
  p2.send({ type: 'move', position: 5 });  // P2 越权
  const errTurn = await p2.waitFor('error');
  assert(errTurn.message.includes('轮到'), `轮次错误: ${errTurn.message}`);

  // 6c. 加入不存在房间
  const p3 = await createClient('P3');
  p3.send({ type: 'join_room', roomId: 'ZZZZZZ' });
  const errNoRoom = await p3.waitFor('error');
  assert(errNoRoom.message.includes('不存在'), `房间不存在错误: ${errNoRoom.message}`);
  p3.close();

  p1.close(); p2.close();
  console.log('\n══════════════════════════════');
  console.log('  所有测试通过 ✅');
  console.log('══════════════════════════════\n');
}

main().catch((e) => {
  console.error(`\n❌ 测试失败:`, e.message);
  process.exit(1);
});
