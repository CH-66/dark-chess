import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMANDS,
  createCommand,
  createJoinCommand,
  createResyncRequest,
  createRoomCreateCommand,
  isValidCommandEnvelope,
  PROTOCOL_VERSION,
  GAME_VERSION,
} from '../src/protocol.js';

test('command envelope is versioned and idempotency-ready', () => {
  const message = createCommand({
    roomId: 'room-1',
    commandId: 'cmd-1',
    expectedRevision: 7,
    command: { type: COMMANDS.MOVE, pieceId: 'RED-0-9', to: { x: 0, y: 8 } },
  });
  assert.equal(message.protocolVersion, PROTOCOL_VERSION);
  assert.equal(message.gameVersion, GAME_VERSION);
  assert.equal(isValidCommandEnvelope(message), true);
});

test('room creation and join commands are versioned', () => {
  assert.equal(createRoomCreateCommand('create-1').command.type, COMMANDS.CREATE);

  const join = createJoinCommand({
    roomId: 'room-1',
    commandId: 'join-1',
    playerId: 'p1',
    sessionToken: 's1',
  });
  assert.equal(join.command.type, COMMANDS.JOIN);
  assert.equal(join.roomId, 'room-1');
  assert.equal(isValidCommandEnvelope(join), true);
});

test('resync request carries lastRevision in both envelope and command', () => {
  const message = createResyncRequest('room-1', 18, 'session-1', 'resync-1');
  assert.equal(message.type, COMMANDS.RESYNC);
  assert.equal(message.lastRevision, 18);
  assert.equal(message.command.lastRevision, 18);
  assert.equal(isValidCommandEnvelope(message), true);
});

test('invalid command envelope is rejected', () => {
  assert.equal(isValidCommandEnvelope({}), false);
  assert.equal(isValidCommandEnvelope({ protocolVersion: 99 }), false);
  assert.equal(isValidCommandEnvelope({
    protocolVersion: PROTOCOL_VERSION,
    gameVersion: GAME_VERSION,
    roomId: null,
    commandId: 'x',
    expectedRevision: 0,
    command: { type: COMMANDS.MOVE },
  }), false);
});
