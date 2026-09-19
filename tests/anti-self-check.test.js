import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SIDE,
  isSquareAttacked,
  isKingInCheck,
  legalTargets,
  movePiece,
  revealInPlace,
  hasAnyLegalAction,
} from '../src/game.js';

function stateWith(pieces, turn = SIDE.RED) {
  return {
    pieces: pieces.map((p, index) => ({
      id: p.id ?? `p${index}`,
      alive: true,
      revealed: true,
      originalType: p.actualType ?? p.type,
      actualType: p.actualType ?? p.type,
      ...p,
    })),
    turn,
    selectedId: null,
    gameOver: false,
    winner: null,
    seed: 'test',
  };
}

function piece(type, side, x, y, extra = {}) {
  return {
    type,
    actualType: type,
    side,
    x,
    y,
    alive: true,
    revealed: true,
    ...extra,
  };
}

test('车线攻击：移走护将棋子造成自将时，目标不再是合法走法', () => {
  const redKing = piece('king', SIDE.RED, 4, 9, { id: 'red-king' });
  const redBlocker = piece('rook', SIDE.RED, 4, 8, { id: 'blocker' });
  const blackRook = piece('rook', SIDE.BLACK, 4, 0, { id: 'black-rook' });
  const state = stateWith([redKing, redBlocker, blackRook]);

  assert.equal(isKingInCheck(state, SIDE.RED), false);
  const targets = legalTargets(state, redBlocker).map(({ x, y }) => [x, y]);
  assert.ok(!targets.some(([x, y]) => x === 3 && y === 8));
  assert.throws(() => movePiece(state, 'blocker', 3, 8), /不合法/);
  assert.equal(state.pieces.find(p => p.id === 'blocker').x, 4);
});

test('炮线攻击：移走炮架导致己方帅被攻击时，走法非法', () => {
  const redKing = piece('king', SIDE.RED, 4, 9, { id: 'red-king' });
  const redScreen = piece('pawn', SIDE.RED, 4, 7, { id: 'screen' });
  const blackCannon = piece('cannon', SIDE.BLACK, 4, 3, { id: 'black-cannon' });
  const state = stateWith([redKing, redScreen, blackCannon]);

  assert.equal(isSquareAttacked(state, 4, 9, SIDE.BLACK), false);
  const targets = legalTargets(state, redScreen).map(({ x, y }) => [x, y]);
  assert.ok(!targets.some(([x, y]) => x === 3 && y === 7));
  assert.throws(() => movePiece(state, 'screen', 3, 7), /不合法/);
});

test('将帅照面：移走唯一遮挡棋子会被禁止', () => {
  const redKing = piece('king', SIDE.RED, 4, 9, { id: 'red-king' });
  const blackKing = piece('king', SIDE.BLACK, 4, 0, { id: 'black-king' });
  const blocker = piece('rook', SIDE.RED, 4, 7, { id: 'blocker' });
  const state = stateWith([redKing, blackKing, blocker]);

  assert.equal(isKingInCheck(state, SIDE.RED), false);
  const targets = legalTargets(state, blocker).map(({ x, y }) => [x, y]);
  assert.ok(!targets.some(([x, y]) => x === 3 && y === 7));

  const clear = structuredClone(state);
  clear.pieces.find(p => p.id === 'blocker').alive = false;
  assert.equal(isKingInCheck(clear, SIDE.RED), true);
  assert.equal(isKingInCheck(clear, SIDE.BLACK), true);
});

test('帅不能进入相邻敌将攻击范围', () => {
  const redKing = piece('king', SIDE.RED, 4, 9, { id: 'red-king' });
  const blackKing = piece('king', SIDE.BLACK, 4, 7, { id: 'black-king' });
  const state = stateWith([redKing, blackKing]);

  assert.equal(isSquareAttacked(state, 4, 8, SIDE.BLACK), true);
  assert.ok(!legalTargets(state, redKing).some(({ x, y }) => x === 4 && y === 8));
});

test('将帅同列无棋子阻挡时互相攻击，有棋子阻挡时不攻击', () => {
  const redKing = piece('king', SIDE.RED, 4, 9, { id: 'red-king' });
  const blackKing = piece('king', SIDE.BLACK, 4, 0, { id: 'black-king' });
  const state = stateWith([redKing, blackKing]);

  assert.equal(isSquareAttacked(state, 4, 9, SIDE.BLACK), true);
  assert.equal(isSquareAttacked(state, 4, 0, SIDE.RED), true);

  const blocked = structuredClone(state);
  blocked.pieces.push(piece('pawn', SIDE.RED, 4, 5, { id: 'blocker' }));
  assert.equal(isSquareAttacked(blocked, 4, 9, SIDE.BLACK), false);
});

test('已经被将军时，无关棋子不能继续走，帅的合法逃离可以走', () => {
  const redKing = piece('king', SIDE.RED, 4, 9, { id: 'red-king' });
  const blackRook = piece('rook', SIDE.BLACK, 4, 0, { id: 'black-rook' });
  const mover = piece('rook', SIDE.RED, 0, 6, { id: 'mover' });
  const state = stateWith([redKing, blackRook, mover]);

  assert.equal(isKingInCheck(state, SIDE.RED), true);
  assert.deepEqual(legalTargets(state, mover), []);

  const kingTargets = legalTargets(state, redKing).map(({ x, y }) => [x, y]);
  assert.ok(kingTargets.some(([x, y]) => x === 3 && y === 9));
});

test('未翻开暗棋的攻击使用originalType，不读取隐藏actualType', () => {
  const redKing = piece('king', SIDE.RED, 4, 9, { id: 'red-king' });
  const hiddenEnemy = piece('knight', SIDE.BLACK, 4, 6, {
    id: 'hidden-enemy',
    originalType: 'rook',
    actualType: 'knight',
    revealed: false,
  });
  const mover = piece('pawn', SIDE.RED, 0, 6, { id: 'mover' });
  const state = stateWith([redKing, hiddenEnemy, mover]);

  assert.equal(isSquareAttacked(state, 4, 9, SIDE.BLACK), true);
  assert.ok(!legalTargets(state, mover).some(({ x, y }) => x === 0 && y === 5));
});

test('已翻开暗棋的攻击使用actualType', () => {
  const redKing = piece('king', SIDE.RED, 4, 9, { id: 'red-king' });
  const revealedEnemy = piece('knight', SIDE.BLACK, 3, 7, {
    id: 'revealed-enemy',
    originalType: 'rook',
    actualType: 'knight',
    revealed: true,
  });
  const state = stateWith([redKing, revealedEnemy]);

  assert.equal(isSquareAttacked(state, 4, 9, SIDE.BLACK), true);
});

test('被将状态下原地翻棋不能代替解除将军', () => {
  const redKing = piece('king', SIDE.RED, 4, 9, { id: 'red-king' });
  const blackRook = piece('rook', SIDE.BLACK, 4, 0, { id: 'black-rook' });
  const hiddenOwn = piece('pawn', SIDE.RED, 2, 8, {
    id: 'hidden-own',
    originalType: 'pawn',
    actualType: 'cannon',
    revealed: false,
  });
  const state = stateWith([redKing, blackRook, hiddenOwn]);

  assert.equal(isKingInCheck(state, SIDE.RED), true);
  assert.throws(() => revealInPlace(state, 'hidden-own'), /当前被将军/);
});

test('合法解除将军后，落子成功并换手', () => {
  const redKing = piece('king', SIDE.RED, 4, 9, { id: 'red-king' });
  const blackRook = piece('rook', SIDE.BLACK, 4, 0, { id: 'black-rook' });
  const state = stateWith([redKing, blackRook]);

  assert.equal(isKingInCheck(state, SIDE.RED), true);
  const result = movePiece(state, 'red-king', 3, 9);

  assert.equal(result.capturedKing, false);
  assert.equal(result.state.turn, SIDE.BLACK);
  assert.equal(result.state.gameOver, false);
  assert.equal(isKingInCheck(result.state, SIDE.RED), false);
});


test('兵/卒攻击规则与中国象棋走法一致：前方可攻击，过河后左右也可攻击', () => {
  const redKing = piece('king', SIDE.RED, 4, 9, { id: 'red-king' });
  const redPawn = piece('pawn', SIDE.RED, 4, 5, { id: 'red-pawn' });
  const blackKing = piece('king', SIDE.BLACK, 4, 4, { id: 'black-king' });
  const state = stateWith([redKing, redPawn, blackKing]);

  assert.equal(isSquareAttacked(state, 4, 4, SIDE.RED), true);

  const crossed = stateWith([
    piece('king', SIDE.RED, 4, 9, { id: 'red-king' }),
    piece('pawn', SIDE.RED, 4, 4, { id: 'red-pawn' }),
    piece('king', SIDE.BLACK, 3, 4, { id: 'black-king' }),
  ]);
  assert.equal(isSquareAttacked(crossed, 3, 4, SIDE.RED), true);
});

test('被将军且无合法行动时判定为将死并由攻击方获胜', () => {
  const pieces = [
    piece('king', SIDE.RED, 4, 9, { id: 'red-king' }),
    piece('rook', SIDE.RED, 0, 1, { id: 'mover' }),
    piece('pawn', SIDE.RED, 4, 2, { id: 'protector' }),
    piece('rook', SIDE.RED, 3, 2, { id: 'left-control' }),
    piece('rook', SIDE.RED, 5, 2, { id: 'right-control' }),
    piece('king', SIDE.BLACK, 4, 0, { id: 'black-king' }),
  ];
  const state = stateWith(pieces);

  assert.equal(isKingInCheck(state, SIDE.BLACK), false);

  const result = movePiece(state, 'mover', 4, 1);

  assert.equal(result.capturedKing, false);
  assert.equal(result.state.gameOver, true);
  assert.equal(result.state.outcome, 'CHECKMATE');
  assert.equal(result.state.winner, SIDE.RED);
});

test('未被将军且无合法行动时判和棋', () => {
  const state = stateWith([
    piece('king', SIDE.RED, 4, 9, { id: 'red-king' }),
    piece('king', SIDE.BLACK, 4, 0, { id: 'black-king' }),
    piece('rook', SIDE.RED, 3, 2, { id: 'left-control' }),
    piece('rook', SIDE.RED, 5, 2, { id: 'right-control' }),
    piece('pawn', SIDE.RED, 4, 2, { id: 'center-control' }),
  ], SIDE.BLACK);

  assert.equal(isKingInCheck(state, SIDE.BLACK), false);
  assert.equal(hasAnyLegalAction(state, SIDE.BLACK), false);
});

test('红方一步后使黑方进入无将且无合法行动的局面，判和棋', () => {
  const state = stateWith([
    piece('king', SIDE.RED, 4, 9, { id: 'red-king' }),
    piece('pawn', SIDE.RED, 4, 3, { id: 'center-control' }),
    piece('rook', SIDE.RED, 3, 2, { id: 'left-control' }),
    piece('rook', SIDE.RED, 5, 2, { id: 'right-control' }),
    piece('king', SIDE.BLACK, 4, 0, { id: 'black-king' }),
  ]);

  assert.equal(isKingInCheck(state, SIDE.BLACK), false);
  assert.equal(hasAnyLegalAction(state, SIDE.BLACK), true);

  const result = movePiece(state, 'center-control', 4, 2);

  assert.equal(result.state.gameOver, true);
  assert.equal(result.state.outcome, 'STALEMATE');
  assert.equal(result.state.winner, null);
});

test('hasAnyLegalAction：将军状态不能靠原地翻棋解除', () => {
  const redKing = piece('king', SIDE.RED, 4, 9, { id: 'red-king' });
  const blackRook = piece('rook', SIDE.BLACK, 4, 0, { id: 'black-rook' });
  const hidden = piece('pawn', SIDE.RED, 2, 8, {
    id: 'hidden',
    originalType: 'pawn',
    actualType: 'cannon',
    revealed: false,
  });
  const state = stateWith([redKing, blackRook, hidden]);

  assert.equal(hasAnyLegalAction(state, SIDE.RED), false);
});
test('hasAnyLegalAction：将军状态不能靠原地翻棋解除', async () => {
  const module = await import('../src/game.js');
  const redKing = piece('king', SIDE.RED, 4, 9, { id: 'red-king' });
  const blackRook = piece('rook', SIDE.BLACK, 4, 0, { id: 'black-rook' });
  const hidden = piece('pawn', SIDE.RED, 2, 8, {
    id: 'hidden',
    originalType: 'pawn',
    actualType: 'cannon',
    revealed: false,
  });
  const state = stateWith([redKing, blackRook, hidden]);

  assert.equal(module.hasAnyLegalAction(state, SIDE.RED), false);
});
