import test from 'node:test';
import assert from 'node:assert/strict';
import { SIDE, HIDDEN_COUNTS, createInitialState, createGame, createSeededRandom, legalTargets, movePiece, revealInPlace } from '../src/game.js';

function stateWith(pieces, turn = SIDE.RED) {
  return {
    pieces: pieces.map((piece, index) => ({
      id: piece.id ?? `p${index}`,
      alive: true,
      revealed: true,
      originalType: piece.actualType ?? piece.type,
      actualType: piece.actualType ?? piece.type,
      ...piece
    })),
    turn, selectedId:null, gameOver:false, winner:null
  };
}
function piece(type, side, x, y, extra = {}) {
  return {type, actualType:type, side, x, y, ...extra};
}

test('开局：32枚棋子，双方各15枚暗棋+1枚明帅/将', () => {
  const state = createInitialState(() => 0.37);
  assert.equal(state.pieces.length, 32);
  for (const side of [SIDE.RED, SIDE.BLACK]) {
    const own = state.pieces.filter(p => p.side === side);
    assert.equal(own.length, 16);
    assert.equal(own.filter(p => p.revealed).length, 1);
    assert.equal(own.filter(p => p.actualType === 'king').length, 1);
  }
});

test('随机后每方真实棋子数量保持标准数量', () => {
  const state = createInitialState(() => 0.61);
  for (const side of [SIDE.RED, SIDE.BLACK]) {
    const own = state.pieces.filter(p => p.side === side);
    for (const [type, count] of Object.entries({...HIDDEN_COUNTS, king:1})) {
      assert.equal(own.filter(p => p.actualType === type).length, count);
    }
  }
});

test('暗棋首次移动使用原始位置类型，而不是真实类型', () => {
  const hidden = piece('knight', SIDE.RED, 4, 4, {id:'hidden', originalType:'rook', actualType:'knight', revealed:false});
  const state = stateWith([hidden]);
  const targets = legalTargets(state, hidden);
  assert(targets.some(t => t.x === 8 && t.y === 4));
  assert(!targets.some(t => t.x === 6 && t.y === 6));
});

test('暗棋首次移动后立即翻开，并切换回合', () => {
  const hidden = piece('rook', SIDE.RED, 0, 0, {id:'hidden', originalType:'rook', actualType:'cannon', revealed:false});
  const result = movePiece(stateWith([hidden]), 'hidden', 0, 3);
  const moved = result.state.pieces[0];
  assert.equal(moved.revealed, true);
  assert.equal(moved.actualType, 'cannon');
  assert.equal(result.state.turn, SIDE.BLACK);
});

test('原地翻棋会公开身份并换手', () => {
  const hidden = piece('rook', SIDE.RED, 0, 0, {id:'hidden', revealed:false});
  const next = revealInPlace(stateWith([hidden]), 'hidden');
  assert.equal(next.pieces[0].revealed, true);
  assert.equal(next.turn, SIDE.BLACK);
});

test('翻开后的马受蹩马腿限制', () => {
  const horse = piece('knight', SIDE.RED, 4, 4, {id:'horse'});
  const blocker = piece('pawn', SIDE.RED, 4, 5, {id:'blocker'});
  const state = stateWith([horse, blocker]);
  const targets = legalTargets(state, horse);
  assert(!targets.some(t => t.x === 3 && t.y === 2));
  assert(targets.some(t => t.x === 2 && t.y === 3));
});

test('象不能过河，并且塞象眼后对应方向不可走', () => {
  const bishop = piece('bishop', SIDE.RED, 2, 4, {id:'bishop'});
  const state = stateWith([bishop]);
  const targets = legalTargets(state, bishop);
  assert(!targets.some(t => t.x === 0 && t.y === 2));
  assert(!targets.some(t => t.x === 4 && t.y === 6));

  const blocked = stateWith([
    piece('bishop', SIDE.RED, 2, 4, {id:'bishop2'}),
    piece('pawn', SIDE.RED, 1, 3, {id:'eye-blocker'})
  ]);
  assert(!legalTargets(blocked, blocked.pieces[0]).some(t => t.x === 0 && t.y === 2));
});

test('炮必须遵守无炮架不吃子、隔一子才能吃子', () => {
  const cannon = piece('cannon', SIDE.RED, 0, 0, {id:'cannon'});
  const screen = piece('pawn', SIDE.BLACK, 2, 0, {id:'screen'});
  const target = piece('pawn', SIDE.BLACK, 4, 0, {id:'target'});
  const state = stateWith([cannon, screen, target]);
  const targets = legalTargets(state, cannon);
  assert(targets.some(t => t.x === 1 && t.y === 0 && !t.capture));
  assert(targets.some(t => t.x === 4 && t.y === 0 && t.capture === 'target'));
  assert(!targets.some(t => t.x === 3 && t.y === 0));
});

test('兵过河前不能横走，过河后可以横走但不能后退', () => {
  const before = stateWith([piece('pawn', SIDE.RED, 4, 6)]);
  const beforeTargets = legalTargets(before, before.pieces[0]);
  assert(!beforeTargets.some(t => t.x !== 4));
  assert(beforeTargets.some(t => t.x === 4 && t.y === 5));

  const after = stateWith([piece('pawn', SIDE.RED, 4, 4)]);
  const afterTargets = legalTargets(after, after.pieces[0]);
  assert(afterTargets.some(t => t.x === 3 && t.y === 4));
  assert(afterTargets.some(t => t.x === 5 && t.y === 4));
  assert(!afterTargets.some(t => t.y === 5));
});

test('不能吃自己的棋子', () => {
  const rook = piece('rook', SIDE.RED, 0, 0, {id:'rook'});
  const own = piece('pawn', SIDE.RED, 2, 0, {id:'own'});
  assert(!legalTargets(stateWith([rook, own]), rook).some(t => t.x === 2 && t.y === 0));
});

test('炮不能越过多个棋子', () => {
  const cannon = piece('cannon', SIDE.RED, 0, 0, {id:'cannon'});
  const s1 = piece('pawn', SIDE.BLACK, 1, 0, {id:'s1'});
  const s2 = piece('pawn', SIDE.BLACK, 2, 0, {id:'s2'});
  const target = piece('pawn', SIDE.BLACK, 4, 0, {id:'target'});
  assert(!legalTargets(stateWith([cannon, s1, s2, target]), cannon).some(t => t.x === 4 && t.y === 0));
});

test('吃帅/将立即结束游戏', () => {
  const rook = piece('rook', SIDE.RED, 0, 0, {id:'rook'});
  const king = piece('king', SIDE.BLACK, 0, 4, {id:'king'});
  const result = movePiece(stateWith([rook, king]), 'rook', 0, 4);
  assert.equal(result.capturedKing, true);
  assert.equal(result.state.gameOver, true);
  assert.equal(result.state.winner, SIDE.RED);
  assert.equal(result.state.pieces.find(p => p.id === 'king').alive, false);
});

test('吃掉暗棋不会自动揭示', () => {
  const rook = piece('rook', SIDE.RED, 0, 0, {id:'rook'});
  const hidden = piece('pawn', SIDE.BLACK, 0, 4, {id:'hidden', revealed:false});
  const result = movePiece(stateWith([rook, hidden]), 'rook', 0, 4);
  assert.equal(result.captured.revealed, false);
  assert.equal(result.state.pieces.find(p => p.id === 'hidden').alive, false);
});

test('非回合方不能移动', () => {
  const rook = piece('rook', SIDE.BLACK, 0, 0, {id:'rook'});
  assert.deepEqual(legalTargets(stateWith([rook], SIDE.RED), rook), []);
});


test('固定种子可复现布局，不同种子产生不同布局', () => {
  const a=createGame('DEMO-20260918'), b=createGame('DEMO-20260918'), c=createGame('DEMO-OTHER');
  assert.deepEqual(a.pieces.map(p=>p.actualType), b.pieces.map(p=>p.actualType));
  assert.notDeepEqual(a.pieces.map(p=>p.actualType), c.pieces.map(p=>p.actualType));
  assert.equal(a.seed,'DEMO-20260918');
});

test('固定种子随机源连续序列可复现', () => {
  const a=createSeededRandom('ABC'), b=createSeededRandom('ABC');
  assert.equal(a(),b()); assert.equal(a(),b()); assert.equal(a(),b());
});

test('七类棋子均覆盖基础合法移动', () => {
  const cases=[
    ['king',4,8,[[3,8],[5,8],[4,7]]], ['rook',4,4,[[4,0],[0,4],[8,4]]],
    ['knight',4,4,[[2,3],[3,2],[5,2],[6,3]]], ['bishop',2,4,[[0,2],[4,2],[0,6],[4,6]]],
    ['advisor',4,8,[[3,7],[5,7],[3,9],[5,9]]], ['cannon',4,4,[[4,0],[0,4],[8,4]]], ['pawn',4,4,[[4,3],[3,4],[5,4]]]
  ];
  for(const [type,x,y,targets] of cases){const p=piece(type,SIDE.RED,x,y,{id:type});const s=stateWith([p]);targetsAt(s,p,targets);}
});

test('组合局面同时验证马腿、炮架、车阻挡与己方棋子', () => {
  const s=stateWith([
    piece('rook',SIDE.RED,0,4,{id:'r'}),piece('pawn',SIDE.RED,0,2,{id:'own'}),
    piece('knight',SIDE.RED,2,4,{id:'h'}),piece('pawn',SIDE.RED,2,5,{id:'leg'}),
    piece('cannon',SIDE.RED,4,4,{id:'c'}),piece('pawn',SIDE.BLACK,6,4,{id:'screen'}),piece('pawn',SIDE.BLACK,8,4,{id:'target'})
  ]);
  noTargetsAt(s,s.pieces[0],[[0,2]]); noTargetsAt(s,s.pieces[2],[[4,6]]); targetsAt(s,s.pieces[4],[[5,4],[8,4]]);
});
