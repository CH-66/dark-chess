export const PROTOCOL_VERSION = 1;
export const GAME_VERSION = '0.4';

export const COMMANDS = Object.freeze({
  JOIN: 'room.join',
  MOVE: 'game.move',
  REVEAL: 'game.reveal',
  RESYNC: 'game.resync',
});

export const EVENTS = Object.freeze({
  ROOM_CREATED: 'room.created',
  PLAYER_JOINED: 'player.joined',
  GAME_STARTED: 'game.started',
  MOVE_ACCEPTED: 'game.move.accepted',
  PIECE_REVEALED: 'game.piece.revealed',
  PIECE_CAPTURED: 'game.piece.captured',
  GAME_FINISHED: 'game.finished',
  RESYNC: 'game.resync',
  PLAYER_DISCONNECTED: 'player.disconnected',
  PLAYER_RECONNECTED: 'player.reconnected',
});

export function createCommand({ roomId, commandId, expectedRevision, command }) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    gameVersion: GAME_VERSION,
    roomId,
    commandId,
    expectedRevision,
    command,
  };
}

export function createResyncRequest(roomId, lastRevision) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    gameVersion: GAME_VERSION,
    roomId,
    type: COMMANDS.RESYNC,
    lastRevision,
  };
}

export function isValidCommandEnvelope(message) {
  return Boolean(
    message &&
    message.protocolVersion === PROTOCOL_VERSION &&
    message.gameVersion === GAME_VERSION &&
    typeof message.roomId === 'string' &&
    typeof message.commandId === 'string' &&
    Number.isInteger(message.expectedRevision) &&
    message.command &&
    typeof message.command.type === 'string',
  );
}
