export const PROTOCOL_VERSION = 1;
export const GAME_VERSION = '0.4';

export const COMMANDS = Object.freeze({
  CREATE: 'room.create',
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
  return { protocolVersion: PROTOCOL_VERSION, gameVersion: GAME_VERSION, roomId, commandId, expectedRevision, command };
}

export function createRoomCreateCommand(commandId) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    gameVersion: GAME_VERSION,
    roomId: null,
    commandId,
    expectedRevision: 0,
    command: { type: COMMANDS.CREATE },
  };
}

export function createJoinCommand({ roomId, commandId, playerId = null, sessionToken = null }) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    gameVersion: GAME_VERSION,
    roomId,
    commandId,
    expectedRevision: 0,
    command: { type: COMMANDS.JOIN, playerId, sessionToken },
  };
}

export function createResyncRequest(roomId, lastRevision, sessionToken, commandId = null) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    gameVersion: GAME_VERSION,
    roomId,
    commandId: commandId ?? String(lastRevision),
    expectedRevision: lastRevision,
    type: COMMANDS.RESYNC,
    lastRevision,
    command: { type: COMMANDS.RESYNC, lastRevision, sessionToken },
  };
}

export function isValidCommandEnvelope(message) {
  if (!message ||
      message.protocolVersion !== PROTOCOL_VERSION ||
      message.gameVersion !== GAME_VERSION ||
      typeof message.commandId !== 'string' ||
      !message.command ||
      typeof message.command.type !== 'string') return false;

  if (message.command.type === COMMANDS.CREATE) {
    return (message.roomId === null || typeof message.roomId === 'string') &&
      Number.isInteger(message.expectedRevision);
  }

  if (message.command.type === COMMANDS.RESYNC) {
    return typeof message.roomId === 'string' &&
      Number.isInteger(message.expectedRevision) &&
      Number.isInteger(message.command.lastRevision) &&
      typeof message.command.sessionToken === 'string';
  }

  return typeof message.roomId === 'string' &&
    Number.isInteger(message.expectedRevision);
}
