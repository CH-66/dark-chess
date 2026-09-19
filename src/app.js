import {
  SIDE,
  createGame,
  visibleType,
  originalTypeLabel,
  sideName,
} from './game.js';
import {
  createLocalSession,
  createOnlineSession,
  getLegalTargets,
} from './session.js';

const boardEl = document.getElementById('board');
const turnTextEl = document.getElementById('turnText');
const hintTextEl = document.getElementById('hintText');
const phaseTextEl = document.getElementById('phaseText');
const revealBtn = document.getElementById('revealBtn');
const selectedInfoEl = document.getElementById('selectedInfo');
const selectedBadgeEl = document.getElementById('selectedBadge');
const moveCountEl = document.getElementById('moveCount');
const logEl = document.getElementById('log');
const seedInputEl = document.getElementById('seedInput');
const seedTextEl = document.getElementById('seedText');
const restartBtn = document.getElementById('restartBtn');

const modeLocalBtn = document.getElementById('modeLocalBtn');
const modeOnlineBtn = document.getElementById('modeOnlineBtn');
const onlinePanelEl = document.getElementById('onlinePanel');
const roomInputEl = document.getElementById('roomInput');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomCodeEl = document.getElementById('roomCode');
const copyRoomBtn = document.getElementById('copyRoomBtn');
const playerSideEl = document.getElementById('playerSide');
const networkStatusEl = document.getElementById('networkStatus');
const reconnectBtn = document.getElementById('reconnectBtn');
const errorTextEl = document.getElementById('networkError');
const waitingTextEl = document.getElementById('waitingText');

const ANIMATION_MS = 360;
const FLIP_MS = 620;

let mode = 'local';
let session = createLocalSession();
let busy = false;
let localMoveCount = 0;
let pendingRender = false;
let lastLoggedRemoteRevision = 0;
let networkStatus = session.getStatus();

function currentState() {
  return session.getView();
}

function getMoveCount(state = currentState()) {
  return mode === 'online' ? (state?.revision ?? 0) : localMoveCount;
}

function pointStyle(x, y) {
  return { left: (4 + (x / 8) * 92) + '%', top: (y / 9) * 100 + '%' };
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

function makePieceEl(piece, state) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'piece ' + piece.side.toLowerCase() + ' ' + (piece.revealed ? 'revealed' : 'hidden');
  el.dataset.pieceId = piece.id;
  el.setAttribute('aria-label', piece.revealed ? sideName(piece.side) + visibleType(piece) : sideName(piece.side) + '暗棋');
  el.textContent = piece.revealed ? visibleType(piece) : '暗';
  if (piece.revealed && piece.actualType === 'king') el.classList.add('king');
  if (piece.id === state?.selectedId) el.classList.add('selected');

  const isOwnTurn = mode === 'local'
    ? piece.side === state?.turn
    : piece.side === state?.turn && piece.side === networkStatus.side;
  if (isOwnTurn && !state?.gameOver && !busy && networkStatus.connected !== false) {
    el.classList.add('selectable');
  }

  const p = pointStyle(piece.x, piece.y);
  el.style.left = p.left;
  el.style.top = p.top;
  el.addEventListener('click', () => handlePieceClick(piece.id));
  return el;
}

function renderEmptyBoard(message) {
  const overlay = document.createElement('div');
  overlay.className = 'board-empty';
  overlay.textContent = message;
  boardEl.appendChild(overlay);
}

function selectedPiece(state = currentState()) {
  return state?.pieces?.find(p => p.id === state.selectedId && p.alive) ?? null;
}

function render() {
  const state = currentState();
  boardEl.innerHTML = '';
  drawGrid();

  if (state?.pieces?.length) {
    const selected = selectedPiece(state);
    const targets = selected ? getLegalTargets(session, selected.id) : [];

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

    for (const piece of state.pieces) {
      if (piece.alive) boardEl.appendChild(makePieceEl(piece, state));
    }
  } else {
    renderEmptyBoard(mode === 'online' ? '等待第二位玩家加入房间…' : '正在加载棋盘…');
  }

  renderStatus(state);
  renderNetworkControls(state);
}

function renderStatus(state) {
  const selected = selectedPiece(state);
  const onlineBlocked = mode === 'online' && !networkStatus.connected;
  const waiting = mode === 'online' && !state;

  if (waiting) {
    turnTextEl.textContent = '等待对手';
    phaseTextEl.textContent = '等待玩家';
    hintTextEl.textContent = networkStatus.status === 'reconnecting'
      ? '网络正在重连，房间信息会保留'
      : '把房间号分享给另一位玩家即可开始';
  } else if (onlineBlocked) {
    turnTextEl.textContent = '网络已断开';
    phaseTextEl.textContent = networkStatus.status === 'reconnecting' ? '重连中' : '已断线';
    hintTextEl.textContent = '棋局不会重置，请恢复网络或点击“重新连接”';
  } else if (state?.gameOver) {
    turnTextEl.textContent = sideName(state.winner) + '获胜';
    phaseTextEl.textContent = '对局结束';
    hintTextEl.textContent = mode === 'online' ? '本局已结束，可重新创建房间开始新对局' : '点击“重新开局”开始下一盘';
  } else if (state) {
    turnTextEl.textContent = sideName(state.turn) + '回合';
    phaseTextEl.textContent = busy ? (mode === 'online' ? '等待服务端确认' : '动画播放中') : '对局进行中';
    if (selected) {
      hintTextEl.textContent = selected.revealed
        ? '请选择一个高亮位置移动'
        : '按原始位置类型移动，或点击“原地翻开”';
    } else if (mode === 'online' && state.turn !== networkStatus.side) {
      hintTextEl.textContent = '等待对方操作';
    } else {
      hintTextEl.textContent = '选择一枚己方棋子开始行动';
    }
  }

  const canReveal = Boolean(
    selected &&
    !selected.revealed &&
    !state?.gameOver &&
    !busy &&
    !onlineBlocked &&
    (mode === 'local' || selected.side === networkStatus.side),
  );
  revealBtn.disabled = !canReveal;

  if (selected) {
    const stateLabel = selected.revealed ? '真实身份：' + visibleType(selected) : '当前状态：暗棋';
    selectedInfoEl.innerHTML = '<strong>' + sideName(selected.side) + '</strong><br>' +
      stateLabel + '<br>首次行动类型：' + originalTypeLabel(selected);
    selectedBadgeEl.textContent = selected.revealed ? visibleType(selected) : '暗棋';
  } else {
    selectedInfoEl.textContent = '选择己方棋子后，这里会显示它的公开信息。';
    selectedBadgeEl.textContent = '未选择';
  }

  moveCountEl.textContent = getMoveCount(state) + ' 手';
  seedTextEl.textContent = mode === 'local' && state?.seed ? '种子：' + state.seed : '服务端随机';
  seedInputEl.value = mode === 'local' ? (state?.seed ?? '') : '';
}

function renderNetworkControls(state) {
  const online = mode === 'online';
  onlinePanelEl.hidden = !online;
  seedInputEl.disabled = online;
  restartBtn.hidden = online;

  modeLocalBtn.classList.toggle('active', mode === 'local');
  modeOnlineBtn.classList.toggle('active', online);
  modeLocalBtn.setAttribute('aria-pressed', String(mode === 'local'));
  modeOnlineBtn.setAttribute('aria-pressed', String(online));

  const statusMap = {
    idle: '未连接',
    connecting: '连接中',
    connected: state ? '已连接 · 对局中' : '已连接 · 等待对手',
    reconnecting: '重连中',
    disconnected: '已断开',
    error: '连接异常',
  };
  networkStatusEl.textContent = online ? (statusMap[networkStatus.status] ?? networkStatus.status) : '本地模式';
  networkStatusEl.className = 'network-badge status-' + (online ? networkStatus.status : 'local');

  const roomId = online ? networkStatus.roomId || '' : '';
  roomCodeEl.textContent = roomId || '未创建';
  playerSideEl.textContent = online && networkStatus.side ? sideName(networkStatus.side) : '—';
  waitingTextEl.hidden = !(online && !state);
  reconnectBtn.hidden = !(online && ['disconnected', 'error'].includes(networkStatus.status));
  createRoomBtn.disabled = busy || (online && ['connecting', 'connected', 'reconnecting'].includes(networkStatus.status) && Boolean(roomId));
  joinRoomBtn.disabled = busy || !roomInputEl.value.trim() || networkStatus.status === 'connecting' || networkStatus.status === 'reconnecting';
  roomInputEl.disabled = busy || networkStatus.status === 'connected';

  const error = online ? networkStatus.lastError : null;
  errorTextEl.textContent = error ? '网络提示：' + error : '';
  errorTextEl.hidden = !error;
}

function handlePieceClick(id) {
  const state = currentState();
  if (busy || !state || state.gameOver) return;
  const piece = state.pieces.find(p => p.id === id && p.alive);
  if (!piece) return;

  const isOwn = mode === 'local' ? piece.side === state.turn : piece.side === state.turn && piece.side === networkStatus.side;
  if (isOwn) {
    session.select(id);
    return;
  }

  const selected = selectedPiece(state);
  if (selected && getLegalTargets(session, selected.id).some(t => t.x === piece.x && t.y === piece.y)) {
    handleTargetClick({ x: piece.x, y: piece.y, capture: piece.id });
  }
}

function handleTargetClick(target) {
  const state = currentState();
  if (busy || !state || state.gameOver) return;
  const selected = selectedPiece(state);
  if (!selected) return;
  if (!getLegalTargets(session, selected.id).some(t => t.x === target.x && t.y === target.y)) return;
  animateMove(selected, target).catch(handleActionError);
}

async function animateMove(piece, target) {
  busy = true;
  render();

  const before = currentState();
  const capturedBefore = target.capture
    ? before.pieces.find(p => p.id === target.capture && p.alive)
    : null;

  try {
    const result = mode === 'local'
      ? session.move(piece.id, target.x, target.y)
      : await session.move(piece.id, target.x, target.y);

    const after = currentState();
    const capturedId = result.captured?.id ?? target.capture;
    const pieceSelector = '[data-piece-id="' + CSS.escape(piece.id) + '"]';
    const pieceEl = boardEl.querySelector(pieceSelector);
    const capturedEl = capturedId
      ? boardEl.querySelector('[data-piece-id="' + CSS.escape(capturedId) + '"]')
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
      const revealed = after?.pieces?.find(p => p.id === piece.id);
      if (revealed) {
        pieceEl.classList.add('flipping');
        await delay(FLIP_MS / 2);
        pieceEl.textContent = visibleType(revealed);
        pieceEl.classList.remove('hidden');
        pieceEl.classList.add('revealed');
      }
    }

    const moved = after?.pieces?.find(p => p.id === piece.id);
    if (result.gameOver || result.capturedKing || after?.gameOver) {
      addLog(sideName(piece.side) + '吃掉了对方帅/将，游戏结束。');
    } else if (!piece.revealed && moved?.revealed) {
      addLog(sideName(piece.side) + '移动并翻开：' + visibleType(moved) + (capturedBefore ? '（吃子）' : ''));
    } else {
      addLog(sideName(piece.side) + '移动' + (capturedBefore ? '并吃子' : '') + '：' + visibleType(moved ?? piece));
    }

    if (mode === 'online') {
      lastLoggedRemoteRevision = after?.revision ?? lastLoggedRemoteRevision;
    } else {
      localMoveCount += 0;
    }

    await delay(FLIP_MS / 2);
  } finally {
    busy = false;
    render();
  }
}

function animateReveal() {
  const state = currentState();
  if (busy || !state || state.gameOver) return;
  const selected = selectedPiece(state);
  if (!selected || selected.revealed) return;

  busy = true;
  render();

  const currentEl = boardEl.querySelector('[data-piece-id="' + CSS.escape(selected.id) + '"]');
  currentEl?.classList.add('flipping');

  Promise.resolve(mode === 'local' ? session.reveal(selected.id) : session.reveal(selected.id))
    .then(async () => {
      const after = currentState();
      await delay(FLIP_MS / 2);
      const revealed = after?.pieces?.find(p => p.id === selected.id);
      if (revealed && currentEl) {
        currentEl.textContent = visibleType(revealed);
        currentEl.classList.remove('hidden');
        currentEl.classList.add('revealed');
      }
      addLog(sideName(selected.side) + '原地翻开：' + (revealed ? visibleType(revealed) : '已翻开'));
      await delay(FLIP_MS / 2);
    })
    .catch(handleActionError)
    .finally(() => {
      busy = false;
      render();
    });
}

function handleActionError(error) {
  addLog('操作失败：' + (error?.message || '网络错误'));
  networkStatus = session.getStatus();
  renderNetworkControls(currentState());
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

function clearAndLog(message) {
  logEl.innerHTML = '';
  addLog(message);
}

function disposeSession() {
  session?.dispose();
}

function attachSession(nextSession, nextMode) {
  disposeSession();
  session = nextSession;
  mode = nextMode;
  networkStatus = session.getStatus();
  lastLoggedRemoteRevision = currentState()?.revision ?? 0;
  session.subscribe((snapshot, status, event) => {
    networkStatus = status;

    if (
      mode === 'online' &&
      event?.message &&
      (event.type === 'game.move.accepted' || event.type === 'game.piece.revealed') &&
      event.message.actor &&
      event.message.actor !== networkStatus.side &&
      Number.isInteger(snapshot?.revision) &&
      snapshot.revision > lastLoggedRemoteRevision
    ) {
      addLog('对方已操作，棋局同步至第 ' + snapshot.revision + ' 手。');
      lastLoggedRemoteRevision = snapshot.revision;
    }

    if (mode === 'online' && event?.type === 'game.started' && snapshot) {
      addLog('第二位玩家已加入，联网对局开始。');
    }

    renderNetworkControls(snapshot);
    if (busy) {
      pendingRender = true;
      return;
    }
    pendingRender = false;
    render();
  });
  clearAndLog(mode === 'local' ? '新对局开始：红方先手。' : '正在准备联网房间…');
  render();
}

async function createRoom() {
  const next = createOnlineSession();
  attachSession(next, 'online');
  busy = true;
  renderNetworkControls(currentState());
  try {
    await session.connect();
    roomInputEl.value = session.roomId ?? '';
    clearAndLog('房间已创建：' + session.roomId + '。等待另一位玩家加入。');
  } catch (error) {
    handleActionError(error);
  } finally {
    busy = false;
    render();
  }
}

async function joinRoom() {
  const roomId = roomInputEl.value.trim().toUpperCase();
  if (!roomId) return;
  const next = createOnlineSession(null, { roomId });
  attachSession(next, 'online');
  busy = true;
  try {
    await session.connect();
    roomInputEl.value = session.roomId ?? roomId;
    clearAndLog('已加入房间：' + session.roomId + '，等待对局同步。');
  } catch (error) {
    handleActionError(error);
  } finally {
    busy = false;
    render();
  }
}

async function switchToOnline() {
  if (mode === 'online') return;
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('room');
  attachSession(createOnlineSession(null, roomId ? { roomId: roomId.toUpperCase() } : {}), 'online');
  roomInputEl.value = roomId ? roomId.toUpperCase() : '';
  if (roomId) {
    busy = true;
    try {
      await session.connect();
    } catch (error) {
      handleActionError(error);
    } finally {
      busy = false;
      render();
    }
  }
}

function switchToLocal() {
  if (mode === 'local') return;
  const requestedSeed = seedInputEl.value.trim() || null;
  attachSession(createLocalSession(requestedSeed), 'local');
}

modeLocalBtn.addEventListener('click', switchToLocal);
modeOnlineBtn.addEventListener('click', switchToOnline);
createRoomBtn.addEventListener('click', createRoom);
joinRoomBtn.addEventListener('click', () => joinRoom().catch(handleActionError));
copyRoomBtn.addEventListener('click', async () => {
  const roomId = session.roomId;
  if (!roomId) return;
  try {
    await navigator.clipboard.writeText(roomId);
    copyRoomBtn.textContent = '已复制';
    window.setTimeout(() => { copyRoomBtn.textContent = '复制'; }, 1200);
  } catch {
    copyRoomBtn.textContent = '复制失败';
  }
});
reconnectBtn.addEventListener('click', async () => {
  if (busy || mode !== 'online') return;
  busy = true;
  render();
  try {
    await session.reconnect();
    addLog('网络已恢复，房间状态已重新同步。');
  } catch (error) {
    handleActionError(error);
  } finally {
    busy = false;
    render();
  }
});
roomInputEl.addEventListener('input', () => renderNetworkControls(currentState()));
roomInputEl.addEventListener('keydown', event => {
  if (event.key === 'Enter') joinRoom().catch(handleActionError);
});

restartBtn.addEventListener('click', () => {
  if (busy || mode !== 'local') return;
  const requestedSeed = seedInputEl.value.trim() || null;
  session.restart(requestedSeed);
  localMoveCount = 0;
  clearAndLog('新对局开始：红方先手。');
  render();
});

revealBtn.addEventListener('click', animateReveal);

attachSession(session, 'local');

const initialParams = new URLSearchParams(window.location.search);
if (initialParams.get('room') || initialParams.get('mode') === 'online') {
  switchToOnline();
}

if (initialParams.get('e2e') === '1') {
  window.__DARK_CHESS_E2E__ = {
    getState: () => structuredClone(currentState()),
    setState: (nextState, nextMoveCount = 0) => {
      busy = false;
      if (mode !== 'local') switchToLocal();
      session = createLocalSession();
      session.state = structuredClone(nextState);
      localMoveCount = nextMoveCount;
      session.subscribe((snapshot, status) => {
        networkStatus = status;
        if (!busy) render();
      });
      clearAndLog('E2E 测试局面已载入。');
      render();
    },
  };
}

if (initialParams.get('e2e') === 'network') {
  window.__DARK_CHESS_E2E_NETWORK__ = {
    ready: false,
  };
  window.setTimeout(() => {
    if (mode === 'online' && session instanceof Object) {
      window.__DARK_CHESS_E2E_NETWORK__.session = session;
      window.__DARK_CHESS_E2E_NETWORK__.ready = true;
      window.__DARK_CHESS_E2E_NETWORK__.info = () => ({
        roomId: session.roomId,
        playerId: session.playerId,
        side: session.side,
        connected: session.connected,
        revision: session.revision,
      });
      window.__DARK_CHESS_E2E_NETWORK__.getView = () => session.getView();
      window.__DARK_CHESS_E2E_NETWORK__.move = (id, x, y) => session.move(id, x, y);
      window.__DARK_CHESS_E2E_NETWORK__.reveal = id => session.reveal(id);
      window.__DARK_CHESS_E2E_NETWORK__.legalTargets = id => session.getLegalTargets(id);
      window.__DARK_CHESS_E2E_NETWORK__.resync = () => session.resync();
      window.__DARK_CHESS_E2E_NETWORK__.disconnect = () => session.disconnect();
      window.__DARK_CHESS_E2E_NETWORK__.reconnect = () => session.reconnect();
      window.__DARK_CHESS_E2E_NETWORK__.connected = session.connected;
      session.subscribe(() => {
        if (window.__DARK_CHESS_E2E_NETWORK__) {
          window.__DARK_CHESS_E2E_NETWORK__.connected = session.connected;
        }
      });
    }
  }, 0);
}
