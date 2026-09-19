import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalSession, getLegalTargets } from '../src/session.js';
import { SIDE } from '../src/game.js';

test('LocalSession exposes the same rule engine without UI coupling', () => {
  const session = createLocalSession('v04-session');
  const state = session.getState();
  const red = state.pieces.find(p => p.side === SIDE.RED && p.originalType === 'rook');
  assert.ok(red);
  assert.ok(Array.isArray(getLegalTargets(session, red.id)));
  session.dispose();
});

test('LocalSession emits immutable snapshots and supports restart', () => {
  const session = createLocalSession('first');
  let snapshots = 0;
  const unsubscribe = session.subscribe(snapshot => { snapshots += 1; snapshot.selectedId = 'mutated'; });
  const before = session.getState();
  const red = before.pieces.find(p => p.side === SIDE.RED);
  session.select(red.id);
  assert.equal(session.getState().selectedId, red.id);
  assert.equal(before.selectedId, null);
  assert.equal(session.getState().seed, 'first');
  session.restart('second');
  assert.equal(session.getState().seed, 'second');
  assert.equal(snapshots, 2);
  assert.equal(unsubscribe(), true);
  session.dispose();
});


test('LocalSession：当前回合可选择对方暗棋用于翻开，但不能直接移动', () => {
  const session = createLocalSession('flip-opponent');
  const state = session.getState();
  const opponentHidden = state.pieces.find(p => p.side === SIDE.BLACK && !p.revealed);
  assert.ok(opponentHidden);

  session.select(opponentHidden.id);
  assert.equal(session.getState().selectedId, opponentHidden.id);
  assert.deepEqual(getLegalTargets(session, opponentHidden.id), []);

  const revealed = session.reveal(opponentHidden.id);
  assert.equal(revealed.pieces.find(p => p.id === opponentHidden.id).revealed, true);
  assert.equal(revealed.turn, SIDE.BLACK);
  session.dispose();
});
