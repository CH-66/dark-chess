import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SIDE,
  createGame,
  legalTargets,
  movePiece,
} from '../src/game.js';

function stateWith(piece, turn = piece.side) {
  return {
    pieces: [piece],
    turn,
    selectedId: null,
    gameOver: false,
    winner: null,
    seed: 'IDENTITY-REGRESSION',
  };
}

function hiddenPiece(originalType, actualType, x, y, id = 'hidden') {
  return {
    id,
    side: SIDE.RED,
    x,
    y,
    originalType,
    actualType,
    revealed: false,
    alive: true,
  };
}

test('随机身份不能退化为“原始位置类型”：1000个固定种子均存在身份错位', () => {
  for (let i = 0; i < 1000; i += 1) {
    const state = createGame(`IDENTITY-RANDOM-${i}`);
    const hidden = state.pieces.filter((piece) => !piece.revealed);
    assert.equal(hidden.length, 30);

    const mismatched = hidden.filter((piece) => piece.originalType !== piece.actualType);
    assert.ok(
      mismatched.length > 0,
      `seed IDENTITY-RANDOM-${i} produced zero original/actual mismatches`,
    );
  }
});

test('暗车按车走后可以翻成炮：移动只改变位置和 revealed，不重算 actualType', () => {
  const piece = hiddenPiece('rook', 'cannon', 0, 0);
  const state = stateWith(piece);
  const targets = legalTargets(state, piece);
  assert.ok(targets.some((target) => target.x === 1 && target.y === 0));

  const result = movePiece(state, piece.id, 1, 0);
  const moved = result.state.pieces[0];

  assert.equal(moved.originalType, 'rook');
  assert.equal(moved.actualType, 'cannon');
  assert.equal(moved.revealed, true);
  assert.equal(moved.x, 1);
  assert.equal(moved.y, 0);
});

test('暗棋首次行动的原始走法与真实身份完全解耦', () => {
  const cases = [
    ['rook', 'pawn', 0, 0, 1, 0],
    ['knight', 'cannon', 4, 4, 6, 5],
    ['bishop', 'rook', 4, 5, 6, 7],
    ['advisor', 'pawn', 4, 8, 5, 9],
    ['cannon', 'knight', 0, 5, 1, 5],
    ['pawn', 'bishop', 4, 5, 4, 4],
  ];

  for (const [originalType, actualType, x, y, tx, ty] of cases) {
    const piece = hiddenPiece(originalType, actualType, x, y, `hidden-${originalType}`);
    const state = stateWith(piece);
    assert.ok(
      legalTargets(state, piece).some((target) => target.x === tx && target.y === ty),
      `${originalType} does not allow expected first move`,
    );

    const result = movePiece(state, piece.id, tx, ty);
    const moved = result.state.pieces[0];

    assert.equal(moved.originalType, originalType);
    assert.equal(moved.actualType, actualType);
    assert.equal(moved.revealed, true);
  }
});
