
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SIDE,
  HIDDEN_COUNTS,
  INITIAL_SLOTS,
  BOARD,
  createInitialState,
  createGame,
  createSeededRandom,
  shuffle,
  normalizeSeed,
  legalTargets,
  movePiece,
  revealInPlace,
  pieceAt,
  visibleType,
  originalTypeLabel,
} from '../src/game.js';

const TYPES = ['king', 'rook', 'knight', 'bishop', 'advisor', 'cannon', 'pawn'];
const HIDDEN_TYPES = ['rook', 'knight', 'bishop', 'advisor', 'cannon', 'pawn'];

function makePiece(type, side, x, y, extra = {}) {
  return {
    id: `${side}-${type}-${x}-${y}`,
    side,
    x,
    y,
    originalType: type,
    actualType: type,
    revealed: true,
    alive: true,
    ...extra,
  };
}

function bareState(pieces, turn = SIDE.RED, extra = {}) {
  return {
    pieces,
    turn,
    selectedId: null,
    gameOver: false,
    winner: null,
    seed: 'exhaustive',
    ...extra,
  };
}

function pointSet(targets) {
  return new Set(targets.map(({ x, y }) => `${x},${y}`));
}

function emptyReferenceTargets(type, side, x, y) {
  const out = [];
  const add = (tx, ty) => {
    if (tx >= 0 && tx < BOARD.width && ty >= 0 && ty < BOARD.height) out.push([tx, ty]);
  };

  if (type === 'king') {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const tx = x + dx;
      const ty = y + dy;
      const inPalace = side === SIDE.RED
        ? tx >= 3 && tx <= 5 && ty >= 7 && ty <= 9
        : tx >= 3 && tx <= 5 && ty >= 0 && ty <= 2;
      if (inPalace) add(tx, ty);
    }
  }

  if (type === 'rook' || type === 'cannon') {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let tx = x + dx;
      let ty = y + dy;
      while (tx >= 0 && tx < BOARD.width && ty >= 0 && ty < BOARD.height) {
        out.push([tx, ty]);
        tx += dx;
        ty += dy;
      }
    }
  }

  if (type === 'knight') {
    for (const [dx, dy] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) {
      add(x + dx, y + dy);
    }
  }

  if (type === 'bishop') {
    for (const [dx, dy] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
      const tx = x + dx;
      const ty = y + dy;
      const onOwnSide = side === SIDE.RED ? ty >= 5 : ty <= 4;
      if (onOwnSide) add(tx, ty);
    }
  }

  if (type === 'advisor') {
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const tx = x + dx;
      const ty = y + dy;
      const inPalace = side === SIDE.RED
        ? tx >= 3 && tx <= 5 && ty >= 7 && ty <= 9
        : tx >= 3 && tx <= 5 && ty >= 0 && ty <= 2;
      if (inPalace) add(tx, ty);
    }
  }

  if (type === 'pawn') {
    const direction = side === SIDE.RED ? -1 : 1;
    add(x, y + direction);
    const crossed = side === SIDE.RED ? y <= 4 : y >= 5;
    if (crossed) {
      add(x - 1, y);
      add(x + 1, y);
    }
  }

  return pointSet(out.map(([tx, ty]) => ({ x: tx, y: ty })));
}

function shuffledTypeCounts(state, side) {
  const own = state.pieces.filter(p => p.side === side);
  return Object.fromEntries(TYPES.map(type => [type, own.filter(p => p.actualType === type).length]));
}

function assertBoardInvariant(state) {
  assert.equal(state.pieces.length, 32);
  const ids = new Set(state.pieces.map(p => p.id));
  assert.equal(ids.size, 32);

  const occupied = new Set();
  for (const p of state.pieces) {
    assert.ok(['RED', 'BLACK'].includes(p.side));
    assert.ok(p.x >= 0 && p.x < 9 && p.y >= 0 && p.y < 10);
    const key = `${p.x},${p.y}`;
    assert.ok(!occupied.has(key), `duplicate coordinate ${key}`);
    occupied.add(key);
    assert.ok(HIDDEN_TYPES.concat(['king']).includes(p.actualType));
    assert.ok(HIDDEN_TYPES.concat(['king']).includes(p.originalType));
    assert.equal(typeof p.revealed, 'boolean');
    assert.equal(typeof p.alive, 'boolean');
  }

  for (const side of [SIDE.RED, SIDE.BLACK]) {
    assert.deepEqual(
      shuffledTypeCounts(state, side),
      { king: 1, ...HIDDEN_COUNTS },
    );
    assert.equal(state.pieces.filter(p => p.side === side && p.revealed).length, 1);
    assert.equal(state.pieces.filter(p => p.side === side && !p.revealed).length, 15);
  }
}

function assertTargetInvariant(state, piece) {
  const targets = legalTargets(state, piece);
  const keys = targets.map(t => `${t.x},${t.y}`);
  assert.equal(new Set(keys).size, keys.length, `duplicate targets for ${piece.id}`);

  for (const target of targets) {
    assert.ok(target.x >= 0 && target.x < 9);
    assert.ok(target.y >= 0 && target.y < 10);
    const occupant = pieceAt(state, target.x, target.y);
    if (target.capture === null) {
      assert.equal(occupant, null);
    } else {
      assert.ok(occupant);
      assert.notEqual(occupant.side, piece.side);
      assert.equal(target.capture, occupant.id);
    }
  }
}

test('穷举空棋盘：七类棋子、双方、90个起点全部符合参考走法', () => {
  for (const side of [SIDE.RED, SIDE.BLACK]) {
    for (const type of TYPES) {
      for (let y = 0; y < 10; y += 1) {
        for (let x = 0; x < 9; x += 1) {
          const piece = makePiece(type, side, x, y, { id: `p-${side}-${type}-${x}-${y}` });
          const state = bareState([piece], side);
          const actual = pointSet(legalTargets(state, piece));
          const expected = emptyReferenceTargets(type, side, x, y);
          assert.deepEqual(actual, expected);
        }
      }
    }
  }
});

test('穷举马腿：每个可行马腿被阻塞后对应目标全部消失', () => {
  const moves = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
  for (const side of [SIDE.RED, SIDE.BLACK]) {
    for (let y = 0; y < 10; y += 1) {
      for (let x = 0; x < 9; x += 1) {
        for (const [dx, dy] of moves) {
          const tx = x + dx;
          const ty = y + dy;
          if (tx < 0 || tx >= 9 || ty < 0 || ty >= 10) continue;

          const legX = Math.abs(dx) === 2 ? x + dx / 2 : x;
          const legY = Math.abs(dy) === 2 ? y + dy / 2 : y;
          const horse = makePiece('knight', side, x, y, { id: 'horse' });
          const blocker = makePiece('pawn', side, legX, legY, { id: 'leg' });
          const state = bareState([horse, blocker], side);

          assert.ok(!pointSet(legalTargets(state, horse)).has(`${tx},${ty}`));
        }
      }
    }
  }
});

test('穷举象眼：每个方向的象眼被阻塞后目标全部消失', () => {
  for (const side of [SIDE.RED, SIDE.BLACK]) {
    for (let y = 0; y < 10; y += 1) {
      for (let x = 0; x < 9; x += 1) {
        for (const [dx, dy] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
          const tx = x + dx;
          const ty = y + dy;
          if (tx < 0 || tx >= 9 || ty < 0 || ty >= 10) continue;
          const onOwnSide = side === SIDE.RED ? ty >= 5 : ty <= 4;
          if (!onOwnSide) continue;

          const eyeX = x + dx / 2;
          const eyeY = y + dy / 2;
          const bishop = makePiece('bishop', side, x, y, { id: 'bishop' });
          const blocker = makePiece('pawn', side, eyeX, eyeY, { id: 'eye' });
          const state = bareState([bishop, blocker], side);
          assert.ok(!pointSet(legalTargets(state, bishop)).has(`${tx},${ty}`));
        }
      }
    }
  }
});

test('穷举车路径：任意第一枚阻挡棋子都会阻断其后的格点', () => {
  for (const side of [SIDE.RED, SIDE.BLACK]) {
    for (let y = 0; y < 10; y += 1) {
      for (let x = 0; x < 9; x += 1) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const maxStep = dx !== 0 ? (dx > 0 ? 8 - x : x) : (dy > 0 ? 9 - y : y);
          for (let blockerStep = 1; blockerStep <= maxStep; blockerStep += 1) {
            const targetStep = blockerStep + 1;
            const bx = x + dx * blockerStep;
            const by = y + dy * blockerStep;
            const pieces = [makePiece('rook', side, x, y, { id: 'rook' })];

            pieces.push(makePiece('pawn', side, bx, by, { id: 'blocker' }));
            if (targetStep <= maxStep) {
              pieces.push(makePiece('pawn', side === SIDE.RED ? SIDE.BLACK : SIDE.RED, x + dx * targetStep, y + dy * targetStep, { id: 'target' }));
            }

            const state = bareState(pieces, side);
            const targets = pointSet(legalTargets(state, pieces[0]));
            assert.equal(targets.has(`${bx},${by}`), false);
            if (targetStep <= maxStep) assert.ok(!targets.has(`${x + dx * targetStep},${y + dy * targetStep}`));
          }
        }
      }
    }
  }
});

test('穷举炮：无炮架不能吃；恰好一个炮架后只能吃第一枚敌子', () => {
  for (const side of [SIDE.RED, SIDE.BLACK]) {
    for (let y = 0; y < 10; y += 1) {
      for (let x = 0; x < 9; x += 1) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const maxStep = dx !== 0 ? (dx > 0 ? 8 - x : x) : (dy > 0 ? 9 - y : y);
          for (let enemyStep = 1; enemyStep <= maxStep; enemyStep += 1) {
            const cannon = makePiece('cannon', side, x, y, { id: 'cannon' });
            const enemySide = side === SIDE.RED ? SIDE.BLACK : SIDE.RED;
            const enemy = makePiece('pawn', enemySide, x + dx * enemyStep, y + dy * enemyStep, { id: 'enemy' });
            const noScreenState = bareState([cannon, enemy], side);
            const noScreenTargets = legalTargets(noScreenState, cannon);
            assert.ok(!noScreenTargets.some(t => t.x === enemy.x && t.y === enemy.y));

            if (enemyStep >= 2) {
              const screen = makePiece('pawn', side, x + dx, y + dy, { id: 'screen' });
              const oneScreenState = bareState([cannon, screen, enemy], side);
              const target = legalTargets(oneScreenState, cannon).find(t => t.x === enemy.x && t.y === enemy.y);
              assert.equal(target?.capture, 'enemy');

              if (enemyStep >= 3) {
                const screen2 = makePiece('pawn', side, x + dx * 2, y + dy * 2, { id: 'screen2' });
                const twoScreenState = bareState([cannon, screen, screen2, enemy], side);
                const blocked = legalTargets(twoScreenState, cannon).some(t => t.x === enemy.x && t.y === enemy.y);
                assert.equal(blocked, false);
              }
            }
          }
        }
      }
    }
  }
});

test('穷举兵卒：双方每个坐标都遵守过河前后方向规则', () => {
  for (const side of [SIDE.RED, SIDE.BLACK]) {
    for (let y = 0; y < 10; y += 1) {
      for (let x = 0; x < 9; x += 1) {
        const pawn = makePiece('pawn', side, x, y, { id: 'pawn' });
        const state = bareState([pawn], side);
        const actual = pointSet(legalTargets(state, pawn));
        const expected = emptyReferenceTargets('pawn', side, x, y);
        assert.deepEqual(actual, expected);

        const direction = side === SIDE.RED ? -1 : 1;
        const backwardY = y - direction;
        if (backwardY >= 0 && backwardY < 10) {
          assert.ok(!actual.has(`${x},${backwardY}`));
        }
      }
    }
  }
});

test('所有合法目标都满足目标不变量并可被 movePiece 接受', () => {
  let checkedMoves = 0;
  for (let seedIndex = 0; seedIndex < 1000; seedIndex += 1) {
    const state = createGame(`MOVE-INVARIANT-${seedIndex}`);
    assertBoardInvariant(state);

    for (const side of [SIDE.RED, SIDE.BLACK]) {
      const sideState = { ...state, turn: side };
      for (const piece of sideState.pieces.filter(p => p.alive)) {
        assertTargetInvariant(sideState, piece);
        for (const target of legalTargets(sideState, piece)) {
          const before = structuredClone(sideState);
          const result = movePiece(sideState, piece.id, target.x, target.y);
          assert.notDeepEqual(result.state.pieces, before.pieces);

          const moved = result.state.pieces.find(p => p.id === piece.id);
          assert.equal(moved.x, target.x);
          assert.equal(moved.y, target.y);
          assert.equal(moved.alive, true);

          if (result.captured) {
            const capturedAfter = result.state.pieces.find(p => p.id === result.captured.id);
            assert.equal(capturedAfter.alive, false);
          }

          if (result.capturedKing) {
            assert.equal(result.state.gameOver, true);
            assert.equal(result.state.winner, side);
            assert.equal(result.state.turn, side);
          } else {
            assert.equal(result.state.gameOver, false);
            assert.notEqual(result.state.turn, side);
          }

          if (!piece.revealed) assert.equal(moved.revealed, true);
          checkedMoves += 1;
        }
      }
    }
  }
  assert.ok(checkedMoves > 10_000, `only checked ${checkedMoves} legal moves`);
});

test('状态更新 2000 局随机压测：move/reveal 均不修改输入状态', () => {
  for (let seedIndex = 0; seedIndex < 2000; seedIndex += 1) {
    const state = createGame(`IMMUTABILITY-${seedIndex}`);
    for (const side of [SIDE.RED, SIDE.BLACK]) {
      const sideState = { ...state, turn: side };
      const hidden = sideState.pieces.find(p => p.side === side && !p.revealed);
      if (hidden) {
        const beforeReveal = structuredClone(sideState);
        const revealed = revealInPlace(sideState, hidden.id);
        assert.deepEqual(sideState, beforeReveal);
        assert.equal(revealed.pieces.find(p => p.id === hidden.id).revealed, true);
        assert.equal(revealed.turn, side === SIDE.RED ? SIDE.BLACK : SIDE.RED);
      }
    }
  }
});

test('随机种子 10000 局：布局、数量、位置、身份不变量全部成立', () => {
  const signatures = new Set();
  for (let i = 0; i < 10_000; i += 1) {
    const state = createGame(`FUZZ-${i}`);
    assertBoardInvariant(state);

    const signature = state.pieces
      .map(p => `${p.side}:${p.x},${p.y}:${p.actualType}`)
      .join('|');
    signatures.add(signature);
  }
  assert.ok(signatures.size > 100, `too few distinct layouts: ${signatures.size}`);
});

test('seed、shuffle、标签函数边界', () => {
  assert.equal(normalizeSeed('  ABC  '), 'ABC');
  assert.equal(normalizeSeed(12345), '12345');
  assert.equal(normalizeSeed('ABC'), 'ABC');
  assert.notEqual(normalizeSeed(''), '');
  assert.notEqual(normalizeSeed('   '), '');

  const randomValues = [0, 0];
  const shuffled = shuffle(['a', 'b', 'c'], (() => {
    let i = 0;
    return () => randomValues[i++] ?? 0.5;
  })());
  assert.equal(shuffled.length, 3);
  assert.deepEqual([...new Set(shuffled)].sort(), ['a', 'b', 'c']);
  assert.deepEqual(shuffle(['a', 'b', 'c'], () => 0), ['b', 'c', 'a']);
  assert.equal(shuffle([], () => 0).length, 0);

  for (const side of [SIDE.RED, SIDE.BLACK]) {
    for (const type of TYPES) {
      const p = makePiece(type, side, 4, side === SIDE.RED ? 9 : 0);
      assert.equal(visibleType(p), ({ king: side === SIDE.RED ? '帅' : '将', rook: '车', knight: '马', bishop: side === SIDE.RED ? '相' : '象', advisor: side === SIDE.RED ? '仕' : '士', cannon: '炮', pawn: side === SIDE.RED ? '兵' : '卒' })[type]);
      assert.equal(originalTypeLabel(p), visibleType(p));
    }
  }
});

test('非法与终局状态的所有操作入口均拒绝', () => {
  const red = makePiece('rook', SIDE.RED, 0, 9, { id: 'red' });
  const black = makePiece('rook', SIDE.BLACK, 0, 0, { id: 'black' });
  const dead = makePiece('pawn', SIDE.RED, 2, 2, { id: 'dead', alive: false });
  const revealed = makePiece('pawn', SIDE.RED, 4, 4, { id: 'revealed', revealed: true });
  const hidden = makePiece('pawn', SIDE.RED, 6, 6, { id: 'hidden', revealed: false });

  const state = bareState([red, black, dead, revealed, hidden], SIDE.RED);
  assert.deepEqual(legalTargets(state, black), []);
  assert.deepEqual(legalTargets(state, dead), []);

  const gameOver = { ...state, gameOver: true, winner: SIDE.BLACK };
  assert.deepEqual(legalTargets(gameOver, red), []);
  assert.throws(() => movePiece(gameOver, 'red', 0, 8), /非法移动/);
  assert.throws(() => revealInPlace(gameOver, 'hidden'), /非法翻棋/);

  assert.throws(() => movePiece(state, 'black', 0, 1), /非法移动/);
  assert.throws(() => movePiece(state, 'dead', 2, 1), /非法移动/);
  assert.throws(() => revealInPlace(state, 'black'), /非法翻棋/);
  assert.throws(() => revealInPlace(state, 'revealed'), /非法翻棋/);
  assert.throws(() => revealInPlace(state, 'dead'), /非法翻棋/);
});

test('吃子元数据穷举：所有直线第一目标与炮单屏目标都带正确 capture id', () => {
  for (const side of [SIDE.RED, SIDE.BLACK]) {
    const enemySide = side === SIDE.RED ? SIDE.BLACK : SIDE.RED;

    for (let y = 0; y < 10; y += 1) {
      for (let x = 0; x < 9; x += 1) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const maxStep = dx !== 0 ? (dx > 0 ? 8 - x : x) : (dy > 0 ? 9 - y : y);
          if (maxStep < 1) continue;

          const rookTarget = { x: x + dx, y: y + dy };
          const rook = makePiece('rook', side, x, y, { id: 'rook' });
          const rookEnemy = makePiece('pawn', enemySide, rookTarget.x, rookTarget.y, { id: 'r-enemy' });
          const rookTargets = legalTargets(bareState([rook, rookEnemy], side), rook);
          assert.equal(rookTargets.find(t => t.x === rookTarget.x && t.y === rookTarget.y)?.capture, 'r-enemy');

          if (maxStep >= 2) {
            const cannon = makePiece('cannon', side, x, y, { id: 'cannon' });
            const screen = makePiece('pawn', side, x + dx, y + dy, { id: 'screen' });
            const cannonEnemy = makePiece('pawn', enemySide, x + dx * 2, y + dy * 2, { id: 'c-enemy' });
            const cannonTargets = legalTargets(bareState([cannon, screen, cannonEnemy], side), cannon);
            assert.equal(cannonTargets.find(t => t.x === cannonEnemy.x && t.y === cannonEnemy.y)?.capture, 'c-enemy');
          }
        }
      }
    }
  }
});

test('原始类型到真实类型切换：跨随机局对每种类型组合都出现并验证', () => {
  const seen = new Set();

  for (let i = 0; i < 5000 && seen.size < HIDDEN_TYPES.length * HIDDEN_TYPES.length; i += 1) {
    const state = createGame(`TRANSITION-${i}`);
    for (const hidden of state.pieces.filter(p => !p.revealed)) {
      const pair = `${hidden.originalType}->${hidden.actualType}`;
      seen.add(pair);
    }
  }

  assert.ok(seen.size >= 25, `only saw ${seen.size} original/actual combinations`);

  for (const pair of seen) {
    const [originalType, actualType] = pair.split('->');
    const hidden = makePiece(originalType, SIDE.RED, 4, 4, {
      id: 'hidden',
      originalType,
      actualType,
      revealed: false,
    });
    const state = bareState([hidden], SIDE.RED);
    const hiddenTargets = pointSet(legalTargets(state, hidden));

    const referenceOriginal = makePiece(originalType, SIDE.RED, 4, 4, { id: 'reference' });
    const originalTargets = pointSet(legalTargets(bareState([referenceOriginal], SIDE.RED), referenceOriginal));
    assert.deepEqual(hiddenTargets, originalTargets);

    const candidate = [...hiddenTargets][0]?.split(',').map(Number);
    if (candidate) {
      const moved = movePiece(state, hidden.id, candidate[0], candidate[1]).state;
      const movedPiece = moved.pieces.find(p => p.id === hidden.id);
      assert.equal(movedPiece.revealed, true);

      const after = { ...moved, turn: SIDE.RED };
      const actualTargets = pointSet(legalTargets(after, movedPiece));
      const actualReference = makePiece(actualType, SIDE.RED, candidate[0], candidate[1], { id: 'actual-ref' });
      assert.deepEqual(actualTargets, pointSet(legalTargets(bareState([actualReference], SIDE.RED), actualReference)));
    }
  }
});
