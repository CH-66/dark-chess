import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SIDE,
  HIDDEN_COUNTS,
  INITIAL_SLOTS,
  createInitialState,
  createGame,
  createSeededRandom,
  legalTargets,
  movePiece,
  revealInPlace,
  pieceAt,
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
  return { type, actualType: type, side, x, y, alive: true, ...extra };
}

function targetsAt(state, targetPiece, expected) {
  const current = state.pieces.find(p => p.id === targetPiece.id) ?? targetPiece;
  const actual = legalTargets(state, current).map(t => [t.x, t.y]);
  for (const point of expected) {
    assert.ok(actual.some(([x, y]) => x === point[0] && y === point[1]));
  }
}

function noTargetsAt(state, targetPiece, forbidden) {
  const current = state.pieces.find(p => p.id === targetPiece.id) ?? targetPiece;
  const actual = legalTargets(state, current).map(t => [t.x, t.y]);
  for (const point of forbidden) {
    assert.ok(!actual.some(([x, y]) => x === point[0] && y === point[1]));
  }
}

test('开局：32枚棋子，双方各15枚暗棋+1枚明帅/将', () => {
  const state = createInitialState(() => 0.37);
  assert.equal(state.pieces.length, 32);

  for (const side of [SIDE.RED, SIDE.BLACK]) {
    const own = state.pieces.filter(p => p.side === side);
    assert.equal(own.length, 16);
    assert.equal(own.filter(p => p.revealed).length, 1);
    assert.equal(own.filter(p => p.actualType === 'king').length, 1);
    assert.equal(own.filter(p => !p.revealed).length, 15);
  }
});

test('随机后每方真实棋子数量保持标准数量', () => {
  const state = createInitialState(() => 0.61);

  for (const side of [SIDE.RED, SIDE.BLACK]) {
    const own = state.pieces.filter(p => p.side === side);

    for (const [type, count] of Object.entries({ ...HIDDEN_COUNTS, king: 1 })) {
      assert.equal(own.filter(p => p.actualType === type).length, count);
    }
  }
});

test('随机不改变标准初始位置类型', () => {
  const state = createGame('SLOT-CHECK');

  for (const side of [SIDE.RED, SIDE.BLACK]) {
    for (const slot of INITIAL_SLOTS) {
      const y = side === SIDE.RED ? slot.y : 9 - slot.y;
      const found = state.pieces.find(
        p => p.side === side && p.x === slot.x && p.y === y
      );
      assert.ok(found);
      assert.equal(found.originalType, slot.type);
    }
  }
});

test('暗棋首次移动使用原始位置类型，而不是真实类型', () => {
  const hidden = piece('knight', SIDE.RED, 4, 4, {
    id: 'hidden',
    originalType: 'rook',
    actualType: 'knight',
    revealed: false,
  });
  const state = stateWith([hidden]);

  const targets = legalTargets(state, hidden);
  assert.ok(targets.some(t => t.x === 8 && t.y === 4));
  assert.ok(!targets.some(t => t.x === 6 && t.y === 6));
});

test('暗棋首次移动后立即翻开，并切换回合', () => {
  const hidden = piece('rook', SIDE.RED, 0, 0, {
    id: 'hidden',
    originalType: 'rook',
    actualType: 'cannon',
    revealed: false,
  });

  const result = movePiece(stateWith([hidden]), 'hidden', 0, 3);
  const moved = result.state.pieces[0];

  assert.equal(moved.revealed, true);
  assert.equal(moved.actualType, 'cannon');
  assert.equal(result.state.turn, SIDE.BLACK);
});

test('原地翻棋会公开身份并换手', () => {
  const hidden = piece('rook', SIDE.RED, 0, 0, {
    id: 'hidden',
    revealed: false,
  });

  const next = revealInPlace(stateWith([hidden]), 'hidden');
  assert.equal(next.pieces[0].revealed, true);
  assert.equal(next.turn, SIDE.BLACK);
});

test('翻开后的炮按真实身份行动，并遵守炮架规则', () => {
  const cannon = piece('cannon', SIDE.RED, 0, 5, {
    id: 'cannon',
    originalType: 'rook',
  });
  const screen = piece('pawn', SIDE.RED, 2, 5, { id: 'screen' });
  const enemy = piece('pawn', SIDE.BLACK, 3, 5, { id: 'enemy' });
  const state = stateWith([cannon, screen, enemy]);

  targetsAt(state, cannon, [[1, 5], [3, 5]]);
  assert.equal(
    legalTargets(state, cannon).find(t => t.x === 3 && t.y === 5).capture,
    'enemy'
  );
});

test('马腿受阻不能移动', () => {
  const horse = piece('knight', SIDE.RED, 4, 4, { id: 'horse' });
  const blocker = piece('pawn', SIDE.RED, 5, 4, { id: 'blocker' });
  const state = stateWith([horse, blocker]);

  noTargetsAt(state, horse, [[6, 5]]);
  targetsAt(state, horse, [[2, 3], [3, 2]]);
});

test('象不能过河，并且塞象眼后对应方向不可走', () => {
  const bishop = piece('bishop', SIDE.RED, 2, 4, { id: 'bishop' });
  const state = stateWith([bishop]);

  targetsAt(state, bishop, [[0, 6], [4, 6]]);
  noTargetsAt(state, bishop, [[0, 2], [4, 2]]);

  const start = piece('bishop', SIDE.RED, 2, 6, { id: 'blocked-bishop' });
  const blocker = piece('pawn', SIDE.RED, 3, 5, { id: 'eye-blocker' });
  const blocked = stateWith([start, blocker]);
  noTargetsAt(blocked, start, [[4, 4]]);
});

test('炮必须遵守无炮架不吃子、隔一子才能吃子', () => {
  const cannon = piece('cannon', SIDE.RED, 0, 0, { id: 'cannon' });
  const screen = piece('pawn', SIDE.BLACK, 2, 0, { id: 'screen' });
  const target = piece('pawn', SIDE.BLACK, 4, 0, { id: 'target' });
  const state = stateWith([cannon, screen, target]);

  targetsAt(state, cannon, [[1, 0], [4, 0]]);
  assert.equal(
    legalTargets(state, cannon).find(t => t.x === 4 && t.y === 0).capture,
    'target'
  );
  noTargetsAt(state, cannon, [[3, 0]]);
});

test('兵过河前不能横走，过河后可以横走但不能后退', () => {
  const before = stateWith([piece('pawn', SIDE.RED, 4, 6)]);
  const beforeTargets = legalTargets(before, before.pieces[0]);
  assert.deepEqual(beforeTargets.map(t => [t.x, t.y]), [[4, 5]]);

  const after = stateWith([piece('pawn', SIDE.RED, 4, 4)]);
  const afterTargets = legalTargets(after, after.pieces[0]);
  targetsAt(after, after.pieces[0], [[4, 3], [3, 4], [5, 4]]);
  noTargetsAt(after, after.pieces[0], [[4, 5]]);
  assert.equal(afterTargets.length, 3);
});

test('不能吃自己的棋子', () => {
  const rook = piece('rook', SIDE.RED, 0, 0, { id: 'rook' });
  const own = piece('pawn', SIDE.RED, 2, 0, { id: 'own' });
  noTargetsAt(stateWith([rook, own]), rook, [[2, 0]]);
});

test('炮不能越过多个棋子', () => {
  const cannon = piece('cannon', SIDE.RED, 0, 0, { id: 'cannon' });
  const screen1 = piece('pawn', SIDE.BLACK, 1, 0, { id: 'screen1' });
  const screen2 = piece('pawn', SIDE.BLACK, 2, 0, { id: 'screen2' });
  const target = piece('pawn', SIDE.BLACK, 4, 0, { id: 'target' });

  noTargetsAt(
    stateWith([cannon, screen1, screen2, target]),
    cannon,
    [[4, 0]]
  );
});

test('七类棋子均覆盖基础合法移动', () => {
  const cases = [
    ['king', 4, 8, [[3, 8], [5, 8], [4, 7]]],
    ['rook', 4, 4, [[4, 0], [0, 4], [8, 4]]],
    ['knight', 4, 4, [[2, 3], [3, 2], [5, 2], [6, 3]]],
    ['bishop', 2, 6, [[0, 8], [4, 8]]],
    ['advisor', 4, 8, [[3, 7], [5, 7], [3, 9], [5, 9]]],
    ['cannon', 4, 4, [[4, 0], [0, 4], [8, 4]]],
    ['pawn', 4, 4, [[4, 3], [3, 4], [5, 4]]],
  ];

  for (const [type, x, y, expected] of cases) {
    const p = piece(type, SIDE.RED, x, y, { id: type });
    targetsAt(stateWith([p]), p, expected);
  }
});

test('帅/将只能在九宫内一步移动', () => {
  const king = piece('king', SIDE.RED, 4, 9, { id: 'king' });
  const state = stateWith([king]);

  targetsAt(state, king, [[3, 9], [5, 9], [4, 8]]);
  noTargetsAt(state, king, [[4, 7], [2, 9]]);
});

test('目标格上的己方棋子不能被占据', () => {
  const rook = piece('rook', SIDE.RED, 0, 0, { id: 'rook' });
  const own = piece('pawn', SIDE.RED, 2, 0, { id: 'own' });
  noTargetsAt(stateWith([rook, own]), rook, [[2, 0]]);
});

test('吃帅/将立即结束游戏', () => {
  const rook = piece('rook', SIDE.RED, 0, 0, { id: 'rook' });
  const king = piece('king', SIDE.BLACK, 0, 4, { id: 'king' });
  const result = movePiece(stateWith([rook, king]), 'rook', 0, 4);

  assert.equal(result.capturedKing, true);
  assert.equal(result.state.gameOver, true);
  assert.equal(result.state.winner, SIDE.RED);
  assert.equal(result.state.pieces.find(p => p.id === 'king').alive, false);
});

test('吃掉暗棋不会自动揭示', () => {
  const rook = piece('rook', SIDE.RED, 0, 0, { id: 'rook' });
  const hidden = piece('pawn', SIDE.BLACK, 0, 4, {
    id: 'hidden',
    revealed: false,
  });
  const result = movePiece(stateWith([rook, hidden]), 'rook', 0, 4);

  assert.equal(result.captured.revealed, false);
  assert.equal(result.state.pieces.find(p => p.id === 'hidden').alive, false);
});

test('非回合方不能移动', () => {
  const rook = piece('rook', SIDE.BLACK, 0, 0, { id: 'rook' });
  assert.deepEqual(legalTargets(stateWith([rook], SIDE.RED), rook), []);
});

test('非法目标与非法翻棋会抛出错误', () => {
  const rook = piece('rook', SIDE.RED, 0, 0, { id: 'rook' });
  const hidden = piece('pawn', SIDE.RED, 1, 1, {
    id: 'hidden',
    revealed: false,
  });
  const state = stateWith([rook, hidden]);

  assert.throws(() => movePiece(state, 'rook', 8, 8), /不合法/);
  assert.throws(() => revealInPlace(state, 'rook'), /非法翻棋/);
});

test('普通移动后切换回合，原状态不变', () => {
  const rook = piece('rook', SIDE.RED, 0, 8, { id: 'rook' });
  const pawn = piece('pawn', SIDE.RED, 2, 6, { id: 'pawn' });
  const king = piece('king', SIDE.BLACK, 4, 0, { id: 'king' });
  const state = stateWith([rook, pawn, king]);
  const before = structuredClone(state);

  const result = movePiece(state, 'rook', 0, 7);

  assert.equal(result.state.turn, SIDE.BLACK);
  assert.equal(result.captured, null);
  assert.equal(pieceAt(result.state, 0, 7).id, 'rook');
  assert.equal(pieceAt(result.state, 0, 8), null);
  assert.deepEqual(state, before);
});

test('翻棋操作也不会修改原状态', () => {
  const hidden = piece('rook', SIDE.RED, 0, 8, {
    id: 'hidden',
    originalType: 'rook',
    revealed: false,
  });
  const state = stateWith([hidden]);
  const before = structuredClone(state);

  revealInPlace(state, 'hidden');
  assert.deepEqual(state, before);
});

test('固定种子可复现布局', () => {
  const a = createGame('DEMO-20260918');
  const b = createGame('DEMO-20260918');

  assert.deepEqual(
    a.pieces.map(p => [p.side, p.x, p.y, p.actualType]),
    b.pieces.map(p => [p.side, p.x, p.y, p.actualType])
  );
  assert.equal(a.seed, 'DEMO-20260918');
});

test('固定种子随机源连续序列可复现且值域正确', () => {
  const a = createSeededRandom('ABC');
  const b = createSeededRandom('ABC');

  for (let i = 0; i < 100; i += 1) {
    const av = a();
    const bv = b();
    assert.equal(av, bv);
    assert.ok(av >= 0 && av < 1);
  }
});
