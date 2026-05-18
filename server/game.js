/**
 * game.js — 纯游戏逻辑（无副作用，纯函数）
 *
 * 棋盘布局:
 *   0 │ 1 │ 2
 *  ───┼───┼───
 *   3 │ 4 │ 5
 *  ───┼───┼───
 *   6 │ 7 │ 8
 */

const EMPTY = 0;
const X = 1; // Player 1
const O = 2; // Player 2

/** 创建空棋盘 */
function createBoard() {
  return Array(9).fill(EMPTY);
}

/** 检测某步棋是否合法 */
function isValidMove(board, pos) {
  return pos >= 0 && pos < 9 && board[pos] === EMPTY;
}

/** 在棋盘上落子，返回新棋盘（不可变） */
function applyMove(board, pos, player) {
  if (!isValidMove(board, pos)) {
    return { ok: false, error: '无效位置或该位置已被占用' };
  }
  const newBoard = [...board];
  newBoard[pos] = player;
  return { ok: true, board: newBoard };
}

/** 所有获胜线 */
const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // 行
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // 列
  [0, 4, 8], [2, 4, 6],             // 对角线
];

/**
 * 检查游戏结果
 * @returns {{ winner: number|null, isDraw: boolean }}
 *   winner: X=1, O=2, null=无胜者
 *   isDraw: true 表示平局
 */
function checkResult(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] !== EMPTY && board[a] === board[b] && board[b] === board[c]) {
      return { winner: board[a], isDraw: false };
    }
  }
  if (board.every(cell => cell !== EMPTY)) {
    return { winner: null, isDraw: true };
  }
  return { winner: null, isDraw: false };
}

/** 将格子格式化为显示字符 */
function formatSymbol(cell) {
  return cell === EMPTY ? ' ' : cell === X ? 'X' : 'O';
}

/** 玩家代号对应的棋子符号 */
function playerToPiece(playerId) {
  return playerId === 1 ? X : O;
}

module.exports = {
  EMPTY, X, O,
  createBoard,
  isValidMove,
  applyMove,
  checkResult,
  formatSymbol,
  playerToPiece,
  WIN_LINES,
};
