export const SIDE = { RED: 'RED', BLACK: 'BLACK' };

export const TYPES = {
  king:   { red: '帅', black: '将' },
  rook:   { red: '车', black: '车' },
  knight: { red: '马', black: '马' },
  bishop: { red: '相', black: '象' },
  advisor:{ red: '仕', black: '士' },
  cannon: { red: '炮', black: '炮' },
  pawn:   { red: '兵', black: '卒' },
};

export const HIDDEN_COUNTS = {
  rook: 2, knight: 2, bishop: 2, advisor: 2, cannon: 2, pawn: 5
};

export const BOARD = { width: 9, height: 10 };

export const INITIAL_SLOTS = [
  { x:0, y:9, type:'rook' }, { x:1, y:9, type:'knight' },
  { x:2, y:9, type:'bishop' }, { x:3, y:9, type:'advisor' },
  { x:4, y:9, type:'king' }, { x:5, y:9, type:'advisor' },
  { x:6, y:9, type:'bishop' }, { x:7, y:9, type:'knight' },
  { x:8, y:9, type:'rook' },
  { x:1, y:7, type:'cannon' }, { x:7, y:7, type:'cannon' },
  { x:0, y:6, type:'pawn' }, { x:2, y:6, type:'pawn' },
  { x:4, y:6, type:'pawn' }, { x:6, y:6, type:'pawn' }, { x:8, y:6, type:'pawn' },
];

export function sideName(side) { return side === SIDE.RED ? '红方' : '黑方'; }
export function opposite(side) { return side === SIDE.RED ? SIDE.BLACK : SIDE.RED; }
export function inBounds(x, y) { return x >= 0 && x < BOARD.width && y >= 0 && y < BOARD.height; }

export function shuffle(array, random = Math.random) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createSeededRandom(seed) {
  let t = String(seed ?? '').split('').reduce((a,ch)=>(Math.imul(a,31)+ch.charCodeAt(0))>>>0, 2166136261);
  return () => { t += 0x6D2B79F5; let r=Math.imul(t^(t>>>15),1|t); r^=r+Math.imul(r^(r>>>7),61|r); return ((r^(r>>>14))>>>0)/4294967296; };
}
export function normalizeSeed(seed) { const value=String(seed ?? '').trim(); return value || Math.floor(Math.random()*0xFFFFFFFF).toString(36).toUpperCase(); }

export function buildPiecePool() {
  return Object.entries(HIDDEN_COUNTS).flatMap(([type, count]) => Array(count).fill(type));
}

export function createInitialState(random = Math.random, seed = null) {
  const pieces = [];
  for (const side of [SIDE.RED, SIDE.BLACK]) {
    const slots = side === SIDE.RED
      ? INITIAL_SLOTS
      : INITIAL_SLOTS.map(slot => ({ ...slot, y: 9 - slot.y }));

    const shuffled = shuffle(buildPiecePool(), random);
    let hiddenIndex = 0;

    for (const slot of slots) {
      const actualType = slot.type === 'king' ? 'king' : shuffled[hiddenIndex++];
      pieces.push({
        id: `${side}-${slot.x}-${slot.y}`,
        side,
        x: slot.x,
        y: slot.y,
        originalType: slot.type,
        actualType,
        revealed: slot.type === 'king',
        alive: true,
      });
    }
  }

  return {
    pieces,
    turn: SIDE.RED,
    selectedId: null,
    gameOver: false,
    winner: null,
    seed,
  };
}

export function createGame(seed = null) { const actualSeed=normalizeSeed(seed); return createInitialState(createSeededRandom(actualSeed), actualSeed); }

export function pieceAt(state, x, y) {
  return state.pieces.find(piece => piece.alive && piece.x === x && piece.y === y) ?? null;
}

function addTarget(state, piece, out, x, y) {
  if (!inBounds(x, y)) return false;
  const target = pieceAt(state, x, y);
  if (!target) {
    out.push({ x, y, capture: null });
    return true;
  }
  if (target.side !== piece.side) {
    out.push({ x, y, capture: target.id });
  }
  return false;
}

function slide(state, piece, out, dirs) {
  for (const [dx, dy] of dirs) {
    let x = piece.x + dx;
    let y = piece.y + dy;
    while (inBounds(x, y)) {
      if (!addTarget(state, piece, out, x, y)) break;
      x += dx;
      y += dy;
    }
  }
}

function palaceContains(side, x, y) {
  return side === SIDE.RED
    ? x >= 3 && x <= 5 && y >= 7 && y <= 9
    : x >= 3 && x <= 5 && y >= 0 && y <= 2;
}

export function legalTargets(state, piece) {
  if (!piece || !piece.alive || state.gameOver || piece.side !== state.turn) return [];

  const movementType = piece.revealed ? piece.actualType : piece.originalType;
  const out = [];

  if (movementType === 'king') {
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const x = piece.x + dx;
      const y = piece.y + dy;
      if (palaceContains(piece.side, x, y)) addTarget(state, piece, out, x, y);
    }
  }

  if (movementType === 'rook') {
    slide(state, piece, out, [[1,0],[-1,0],[0,1],[0,-1]]);
  }

  if (movementType === 'knight') {
    const moves = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
    for (const [dx, dy] of moves) {
      const legX = Math.abs(dx) === 2 ? piece.x + dx / 2 : piece.x;
      const legY = Math.abs(dy) === 2 ? piece.y + dy / 2 : piece.y;
      if (!pieceAt(state, legX, legY)) addTarget(state, piece, out, piece.x + dx, piece.y + dy);
    }
  }

  if (movementType === 'bishop') {
    const moves = [[2,2],[2,-2],[-2,2],[-2,-2]];
    for (const [dx, dy] of moves) {
      const x = piece.x + dx;
      const y = piece.y + dy;
      const crossedRiver = piece.side === SIDE.RED ? y < 5 : y > 4;
      if (!crossedRiver && inBounds(x, y) && !pieceAt(state, piece.x + dx / 2, piece.y + dy / 2)) {
        addTarget(state, piece, out, x, y);
      }
    }
  }

  if (movementType === 'advisor') {
    for (const [dx, dy] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const x = piece.x + dx;
      const y = piece.y + dy;
      if (palaceContains(piece.side, x, y)) addTarget(state, piece, out, x, y);
    }
  }

  if (movementType === 'cannon') {
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      let x = piece.x + dx;
      let y = piece.y + dy;
      let screen = false;
      while (inBounds(x, y)) {
        const target = pieceAt(state, x, y);
        if (!screen) {
          if (!target) {
            out.push({ x, y, capture: null });
          } else {
            screen = true;
          }
        } else if (target) {
          if (target.side !== piece.side) out.push({ x, y, capture: target.id });
          break;
        }
        x += dx;
        y += dy;
      }
    }
  }

  if (movementType === 'pawn') {
    const direction = piece.side === SIDE.RED ? -1 : 1;
    addTarget(state, piece, out, piece.x, piece.y + direction);
    const crossed = piece.side === SIDE.RED ? piece.y <= 4 : piece.y >= 5;
    if (crossed) {
      addTarget(state, piece, out, piece.x - 1, piece.y);
      addTarget(state, piece, out, piece.x + 1, piece.y);
    }
  }

  return out;
}

export function isLegalTarget(state, piece, x, y) {
  return legalTargets(state, piece).some(target => target.x === x && target.y === y);
}

export function revealInPlace(state, pieceId) {
  const next = structuredClone(state);
  const piece = next.pieces.find(p => p.id === pieceId && p.alive);
  if (!piece || piece.side !== next.turn || piece.revealed || next.gameOver) {
    throw new Error('非法翻棋');
  }
  piece.revealed = true;
  next.selectedId = null;
  next.turn = opposite(next.turn);
  return next;
}

export function movePiece(state, pieceId, x, y) {
  const next = structuredClone(state);
  const piece = next.pieces.find(p => p.id === pieceId && p.alive);
  if (!piece || piece.side !== next.turn || next.gameOver) throw new Error('非法移动');
  if (!isLegalTarget(state, piece, x, y)) throw new Error('目标位置不合法');

  const captured = pieceAt(next, x, y);
  piece.x = x;
  piece.y = y;

  let capturedKing = false;
  if (captured) {
    captured.alive = false;
    capturedKing = captured.actualType === 'king';
  }

  if (!piece.revealed) piece.revealed = true;
  next.selectedId = null;

  if (capturedKing) {
    next.gameOver = true;
    next.winner = piece.side;
  } else {
    next.turn = opposite(next.turn);
  }

  return { state: next, captured, capturedKing };
}

export function visibleType(piece) {
  return TYPES[piece.actualType][piece.side.toLowerCase()];
}

export function originalTypeLabel(piece) {
  return TYPES[piece.originalType][piece.side.toLowerCase()];
}
