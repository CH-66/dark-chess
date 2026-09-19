import { randomUUID } from 'node:crypto';
import { SIDE } from '../src/game.js';
import { filterForPlayer } from './visibility.js';
import { AuthoritativeGame } from './authoritative-game.js';

export class Room {
  constructor(roomId = randomUUID().slice(0, 8).toUpperCase()) {
    this.roomId = roomId;
    this.players = new Map();
    this.game = null;
    this.commandResults = new Map();
    this.createdAt = Date.now();
  }

  playerView(side) {
    if (!this.game) return null;
    return filterForPlayer(this.game.getState(), side);
  }

  join({ playerId = null, sessionToken = null }) {
    if (playerId && sessionToken) {
      const existing = this.players.get(playerId);
      if (existing && existing.sessionToken === sessionToken) {
        existing.connected = true;
        return { player: { ...existing }, status: 'reconnected', started: Boolean(this.game) };
      }
    }

    if (this.players.size >= 2) {
      throw new Error('房间已满');
    }

    const side = this.players.size === 0 ? SIDE.RED : SIDE.BLACK;
    const player = {
      playerId: playerId || randomUUID(),
      sessionToken: sessionToken || randomUUID(),
      side,
      connected: true,
    };
    this.players.set(player.playerId, player);

    if (this.players.size === 2 && !this.game) {
      this.game = new AuthoritativeGame(randomUUID());
    }

    return {
      player: { ...player },
      status: 'joined',
      started: Boolean(this.game),
    };
  }

  getPlayer(playerId, sessionToken) {
    const player = this.players.get(playerId);
    if (!player || player.sessionToken !== sessionToken) throw new Error('会话无效');
    return player;
  }

  setConnected(playerId, connected) {
    const player = this.players.get(playerId);
    if (player) player.connected = connected;
  }

  isStarted() {
    return Boolean(this.game);
  }

  command(playerId, sessionToken, message) {
    const player = this.getPlayer(playerId, sessionToken);
    if (message.roomId !== this.roomId) throw new Error('房间不匹配');
    if (!this.game) throw new Error('等待第二名玩家加入');

    const commandId = message.commandId;
    if (typeof commandId !== 'string' || commandId.length === 0) {
      throw new Error('commandId 无效');
    }

    const cached = this.commandResults.get(playerId + ':' + commandId);
    if (cached) return { ...cached, duplicate: true };

    if (!Number.isInteger(message.expectedRevision) || message.expectedRevision !== this.game.revision) {
      throw new Error('revision_conflict');
    }

    const result = this.game.apply(player.side, message.command);
    const eventType = result.commandType === 'game.reveal'
      ? 'game.piece.revealed'
      : 'game.move.accepted';

    const base = {
      type: eventType,
      roomId: this.roomId,
      commandId,
      revision: result.revision,
      gameOver: result.state.gameOver,
      winner: result.state.winner,
      actor: result.actor,
      captured: result.captured,
      view: null,
    };

    const responses = {};
    for (const p of this.players.values()) {
      responses[p.playerId] = {
        ...base,
        view: filterForPlayer(result.state, p.side),
      };
    }

    const cachedResult = { responses, event: base };
    this.commandResults.set(playerId + ':' + commandId, cachedResult);
    return { ...cachedResult, duplicate: false };
  }

  snapshotFor(playerId, sessionToken) {
    const player = this.getPlayer(playerId, sessionToken);
    if (!this.game) {
      return {
        roomId: this.roomId,
        playerId: player.playerId,
        side: player.side,
        started: false,
        revision: 0,
        view: null,
      };
    }
    return {
      roomId: this.roomId,
      playerId: player.playerId,
      side: player.side,
      started: true,
      revision: this.game.revision,
      view: this.playerView(player.side),
    };
  }
}
