import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame } from '../src/game.js';
import { AuthoritativeGame } from '../server/authoritative-game.js';
import { Room } from '../server/room.js';
import { filterForPlayer } from '../server/visibility.js';

test('网络视图：隐藏棋子的 actualType 不对客户端暴露', () => {
  const state = createGame('visibility-test');
  const view = filterForPlayer(state, 'RED');

  assert.equal(view.pieces.length, 32);
  assert.ok(view.pieces.every(piece => piece.revealed || !Object.hasOwn(piece, 'actualType')));
  assert.ok(view.pieces.some(piece => piece.revealed && piece.actualType === 'king'));
});

test('服务端权威游戏：revision 单调递增且由服务端执行规则', () => {
  const game = new AuthoritativeGame('authority-test');
  assert.equal(game.revision, 0);

  const red = game.getState().pieces.find(piece => piece.side === 'RED' && piece.originalType === 'pawn');
  const result = game.apply('RED', {
    type: 'game.reveal',
    pieceId: red.id,
  });

  assert.equal(result.revision, 1);
  assert.equal(result.state.revision, 1);
  assert.equal(result.state.turn, 'BLACK');
});

test('Room：两人加入后才创建权威对局，并分别得到角色', () => {
  const room = new Room('ROOM-TEST');
  const a = room.join({});
  assert.equal(a.player.side, 'RED');
  assert.equal(room.isStarted(), false);

  const b = room.join({});
  assert.equal(b.player.side, 'BLACK');
  assert.equal(room.isStarted(), true);
  assert.equal(room.game.revision, 0);
});

test('Room：过期 revision 被拒绝，重复 commandId 幂等', () => {
  const room = new Room('ROOM-TEST');
  const a = room.join({});
  room.join({});

  const first = room.command(a.player.playerId, a.player.sessionToken, {
    protocolVersion: 1,
    gameVersion: '0.4',
    roomId: room.roomId,
    commandId: 'cmd-1',
    expectedRevision: 0,
    command: { type: 'game.reveal', pieceId: room.game.getState().pieces.find(p => p.side === 'RED' && p.originalType !== 'king').id },
  });
  assert.equal(first.duplicate, false);
  assert.equal(room.game.revision, 1);

  const duplicate = room.command(a.player.playerId, a.player.sessionToken, {
    protocolVersion: 1,
    gameVersion: '0.4',
    roomId: room.roomId,
    commandId: 'cmd-1',
    expectedRevision: 0,
    command: { type: 'game.reveal', pieceId: 'different-command-payload' },
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(room.game.revision, 1);

  assert.throws(() => room.command(a.player.playerId, a.player.sessionToken, {
    protocolVersion: 1,
    gameVersion: '0.4',
    roomId: room.roomId,
    commandId: 'cmd-2',
    expectedRevision: 0,
    command: { type: 'game.reveal', pieceId: room.game.getState().pieces.find(p => p.side === 'BLACK' && p.alive).id },
  }), /revision_conflict/);
});

test('隐藏身份不会通过 snapshot 或事件 view 泄漏 seed / actualType', () => {
  const room = new Room('ROOM-SEC');
  const a = room.join({});
  const b = room.join({});

  const snapshot = room.snapshotFor(a.player.playerId, a.player.sessionToken);
  assert.equal(snapshot.view.seed, undefined);
  assert.ok(snapshot.view.pieces.every(piece => piece.revealed || !Object.hasOwn(piece, 'actualType')));

  const hidden = room.game.getState().pieces.find(p => p.side === 'RED' && !p.revealed);
  const accepted = room.command(a.player.playerId, a.player.sessionToken, {
    protocolVersion: 1,
    gameVersion: '0.4',
    roomId: room.roomId,
    commandId: 'cmd-sec',
    expectedRevision: 0,
    command: { type: 'game.reveal', pieceId: hidden.id },
  });
  assert.ok(accepted.responses[b.player.playerId].view.pieces.every(piece => piece.revealed || !Object.hasOwn(piece, 'actualType')));

  assert.ok(b.player.side === 'BLACK');
});

test('Room：房间最多容纳两名玩家，第三人无法加入', () => {
  const room = new Room('ROOM-FULL');
  room.join({});
  room.join({});
  assert.throws(() => room.join({}), /房间已满/);
});

test('Room：非法 session 不能执行游戏命令', () => {
  const room = new Room('ROOM-SESSION');
  const a = room.join({});
  room.join({});
  const piece = room.game.getState().pieces.find(p => p.side === 'RED' && !p.revealed);
  assert.throws(() => room.command(a.player.playerId, 'bad-token', {
    commandId: 'bad-session',
    expectedRevision: 0,
    command: { type: 'game.reveal', pieceId: piece.id },
  }), /会话无效/);
});

test('Room：玩家可以断线后使用同一 session 恢复原角色', () => {
  const room = new Room('ROOM-RECONNECT');
  const a = room.join({});
  room.join({});
  room.setConnected(a.player.playerId, false);

  const reconnected = room.join({
    playerId: a.player.playerId,
    sessionToken: a.player.sessionToken,
  });

  assert.equal(reconnected.status, 'reconnected');
  assert.equal(reconnected.player.side, 'RED');
  assert.equal(reconnected.player.playerId, a.player.playerId);
});
