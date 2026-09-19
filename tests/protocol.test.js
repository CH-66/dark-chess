import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommand, createResyncRequest, isValidCommandEnvelope, PROTOCOL_VERSION, GAME_VERSION } from '../src/protocol.js';

test('command envelope is versioned and idempotency-ready', () => {
  const message = createCommand({
    roomId: 'room-1',
    commandId: 'cmd-1',
    expectedRevision: 7,
    command: { type: 'move', pieceId: 'RED-0-9', to: { x: 0, y: 8 } },
  });
  assert.equal(message.protocolVersion, PROTOCOL_VERSION);
  assert.equal(message.gameVersion, GAME_VERSION);
  assert.equal(isValidCommandEnvelope(message), true);
});

test('invalid command envelope is rejected', () => {
  assert.equal(isValidCommandEnvelope({}), false);
  assert.equal(isValidCommandEnvelope({ protocolVersion: 99 }), false);
});

test('resync request carries lastRevision', () => {
  const message = createResyncRequest('room-1', 18);
  assert.equal(message.type, 'game.resync');
  assert.equal(message.lastRevision, 18);
});
