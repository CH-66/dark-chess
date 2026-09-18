import {
  SIDE,
  createInitialState,
  legalTargets,
  movePiece,
  revealInPlace,
  visibleType,
  originalTypeLabel,
  sideName,
} from './game.js';

const boardEl = document.getElementById('board');
const turnTextEl = document.getElementById('turnText');
const hintTextEl = document.getElementById('hintText');
const phaseTextEl = document.getElementById('phaseText');
const revealBtn = document.getElementById('revealBtn');
const selectedInfoEl = document.getElementById('selectedInfo');
const selectedBadgeEl = document.getElementById('selectedBadge');
const moveCountEl = document.getElementById('moveCount');
const logEl = document.getElementById('log');
const restartBtn = document.getElementById('restartBtn');

const ANIMATION_MS = 360;
const FLIP_MS = 620;

let state = createInitialState();
let busy = false;
let moveCount = 0;

function pointStyle(x, y) {
  return { left: (x / 8) * 100 + '%', top: (y / 9) * 100 + '%' };
}

function drawGrid() {
  for (let y = 0; y < 10; y += 1) {
    const line = document.createElement('div');
    line.className = 'grid-line horizontal';
    line.style.top = (y / 9) * 100 + '%';
    boardEl.appendChild(line);
  }

  for (let x = 0; x < 9; x += 1) {
    const line = document.createElement('div');
    line.className = 'grid-line vertical';
    line.style.left = (4 + (x / 8) * 92) + '%';
    boardEl.appendChild(line);
  }

  const palaceTop = document.createElement('div');
  palaceTop.className = 'palace palace-black';
  boardEl.appendChild(palaceTop);

  const palaceBottom = document.createElement('div');
  palaceBottom.className = 'palace palace-red';
  boardEl.appendChild(palaceBottom);

  const river = document.createElement('div');
  river.className = 'river';
  river.innerHTML = '<span>楚 河</span><span>漢 界</span>';
  boardEl.appendChild(river);

  const axis = document.createElement('div');
  axis.className = 'axis';
  axis.innerHTML = '<span>九</span><span>八</span><span>七</span><span>六</span><span>五</span><span>四</span><span>三</span><span>二</span><span>一</span>';
  boardEl.appendChild(axis);
}

function makePieceEl(piece) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'piece ' + piece.side.toLowerCase() + ' ' + (piece.revealed ? 'revealed' : 'hidden');
  el.dataset.pieceId = piece.id;
  el.setAttribute('aria-label', piece.revealed ? sideName(piece.side) + visibleType(piece) : sideName(piece.side) + '暗棋');
  el.textContent = piece.revealed ? visibleType(piece) : '暗';
  if (piece.revealed && piece.actualType === 'king') el.classList.add('king');
  if (piece.id === state.selectedId) el.classList.add('selected');
  if (piece.side === state.turn && !state.gameOver && !busy) el.classList.add('selectable');

  const p = pointStyle(piece.x, piece.y);
  el.style.left = p.left;
  el.style.top = p.top;
  el.addEventListener('click', () => handlePieceClick(piece.id));
  return el;
}

function render() {
  boardEl.innerHTML = '';
  drawGrid();

  const selected = state.pieces.find(p => p.id === state.selectedId && p.alive) ?? null;
  const targets = selected ? legalTargets(state, selected) : [];

  for (const target of targets) {
    const targetEl = document.createElement('button');
    targetEl.type = 'button';
    targetEl.className = 'target-cell' + (target.capture ? ' capture' : '');
    const p = pointStyle(target.x, target.y);
    targetEl.style.left = p.left;
    targetEl.style.top = p.top;
    targetEl.setAttribute('aria-label', target.capture ? '吃子位置' : '可移动位置');
    targetEl.addEventListener('click', () => handleTargetClick(target));
    boardEl.appendChild(targetEl);
  }

  for (const piece of state.pieces.filter(p => p.alive)) {
    boardEl.appendChild(makePieceEl(piece));
  }

  turnTextEl.textContent = state.gameOver ? sideName(state.winner) + '获胜' : sideName(state.turn) + '回合';
  phaseTextEl.textContent = state.gameOver ? '对局结束' : busy ? '动画播放中' : '对局进行中';
  if (state.gameOver) hintTextEl.textContent = '点击“重新开局”开始下一盘';
  else if (selected) hintTextEl.textContent = selected.revealed ? '请选择一个高亮位置移动' : '按原始位置类型移动，或点击“原地翻开”';
  else hintTextEl.textContent = '选择一枚己方棋子开始行动';

  revealBtn.disabled = !(selected && !selected.revealed && !state.gameOver && !busy);

  if (selected) {
    const stateLabel = selected.revealed ? '真实身份：' + visibleType(selected) : '当前状态：暗棋';
    selectedInfoEl.innerHTML = '<strong>' + sideName(selected.side) + '</strong><br>' +
      stateLabel + '<br>首次行动类型：' + originalTypeLabel(selected);
    selectedBadgeEl.textContent = selected.revealed ? visibleType(selected) : '暗棋';
  } else {
    selectedInfoEl.textContent = '选择己方棋子后，这里会显示它的公开信息。';
    selectedBadgeEl.textContent = '未选择';
  }

  moveCountEl.textContent = moveCount + ' 手';
}

function handlePieceClick(id) {
  if (busy || state.gameOver) return;
  const piece = state.pieces.find(p => p.id === id && p.alive);
  if (!piece) return;

  if (piece.side === state.turn) {
    state.selectedId = state.selectedId === id ? null : id;
    render();
    return;
  }

  const selected = selectedPiece();
  if (selected && legalTargets(state, selected).some(t => t.x === piece.x && t.y === piece.y)) {
    handleTargetClick({ x: piece.x, y: piece.y, capture: piece.id });
  }
}

function handleTargetClick(target) {
  if (busy || state.gameOver) return;
  const selected = selectedPiece();
  if (!selected) return;
  if (!legalTargets(state, selected).some(t => t.x === target.x && t.y === target.y)) return;
  animateMove(selected, target);
}

function selectedPiece() {
  return state.pieces.find(p => p.id === state.selectedId && p.alive) ?? null;
}

async function animateMove(piece, target) {
  busy = true;
  render();

  const result = movePiece(state, piece.id, target.x, target.y);
  const pieceSelector = '[data-piece-id="' + CSS.escape(piece.id) + '"]';
  const pieceEl = boardEl.querySelector(pieceSelector);
  const capturedEl = target.capture
    ? boardEl.querySelector('[data-piece-id="' + CSS.escape(target.capture) + '"]')
    : null;

  if (pieceEl) {
    const p = pointStyle(target.x, target.y);
    requestAnimationFrame(() => {
      pieceEl.classList.add('moving');
      pieceEl.style.left = p.left;
      pieceEl.style.top = p.top;
    });
  }
  if (capturedEl) capturedEl.classList.add('capturing');

  await delay(ANIMATION_MS);

  if (!piece.revealed && pieceEl) {
    pieceEl.classList.add('flipping');
    await delay(FLIP_MS / 2);
  }

  state = result.state;
  moveCount += 1;

  if (result.capturedKing) {
    addLog(sideName(piece.side) + '吃掉了对方帅/将，游戏结束。');
  } else if (!piece.revealed) {
    const revealed = state.pieces.find(p => p.id === piece.id);
    addLog(sideName(piece.side) + '移动并翻开：' + visibleType(revealed) + (result.captured ? '（吃子）' : ''));
  } else {
    addLog(sideName(piece.side) + '移动' + (result.captured ? '并吃子' : '') + '：' + visibleType(piece));
  }

  await delay(FLIP_MS / 2);
  busy = false;
  render();
}

async function animateReveal() {
  if (busy || state.gameOver) return;
  const selected = selectedPiece();
  if (!selected || selected.revealed) return;

  busy = true;
  render();

  const currentEl = boardEl.querySelector('[data-piece-id="' + CSS.escape(selected.id) + '"]');
  currentEl?.classList.add('flipping');

  await delay(FLIP_MS / 2);
  state = revealInPlace(state, selected.id);
  moveCount += 1;

  const revealed = state.pieces.find(p => p.id === selected.id);
  addLog(sideName(selected.side) + '原地翻开：' + visibleType(revealed));

  await delay(FLIP_MS / 2);
  busy = false;
  render();
}

function delay(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function addLog(message) {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = message;
  logEl.prepend(entry);
}

restartBtn.addEventListener('click', () => {
  if (busy) return;
  state = createInitialState();
  moveCount = 0;
  logEl.innerHTML = '';
  addLog('新对局开始：红方先手。');
  render();
});

revealBtn.addEventListener('click', animateReveal);

addLog('新对局开始：红方先手。');
render();
