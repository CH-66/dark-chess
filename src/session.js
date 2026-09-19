import { createGame, legalTargets, movePiece, revealInPlace } from './game.js';
import { createCommand, createJoinCommand, createRoomCreateCommand, createResyncRequest } from './protocol.js';

const clone = value => structuredClone(value);
const randomId = () => globalThis.crypto?.randomUUID?.() ?? (Date.now() + '-' + Math.random().toString(16).slice(2));

function wsEndpoint(endpoint) {
  if (endpoint) return endpoint;
  const protocol = globalThis.location?.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = globalThis.location?.host ?? '127.0.0.1:8080';
  return protocol + '//' + host;
}

export class LocalSession {
  constructor(seed = null) {
    this.listeners = new Set();
    this.state = createGame(seed);
    this.moveCount = 0;
  }
  getState() { return clone(this.state); }
  getView() { return clone(this.state); }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  select(pieceId) {
    const piece = this.state.pieces.find(p => p.id === pieceId && p.alive);
    this.state = { ...this.state, selectedId: piece && piece.side === this.state.turn
      ? (this.state.selectedId === pieceId ? null : pieceId) : this.state.selectedId };
    this.#emit();
  }
  move(pieceId, x, y) {
    const result = movePiece(this.state, pieceId, x, y);
    this.state = result.state;
    this.moveCount += 1;
    this.#emit();
    return result;
  }
  reveal(pieceId) {
    this.state = revealInPlace(this.state, pieceId);
    this.moveCount += 1;
    this.#emit();
    return this.getState();
  }
  restart(seed = null) {
    this.state = createGame(seed);
    this.moveCount = 0;
    this.#emit();
  }
  dispose() { this.listeners.clear(); }
  #emit() { const snapshot = this.getState(); for (const listener of this.listeners) listener(snapshot); }
}

export class OnlineSession {
  constructor(endpoint = null, options = {}) {
    this.endpoint = wsEndpoint(endpoint);
    this.roomId = options.roomId ?? null;
    this.playerId = options.playerId ?? null;
    this.sessionToken = options.sessionToken ?? null;
    this.side = null;
    this.state = null;
    this.revision = 0;
    this.connected = false;
    this.listeners = new Set();
    this.pending = new Map();
    this.connectPromise = null;
    this.socket = null;
  }

  getView() { return clone(this.state); }
  getState() { return this.getView(); }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  select(pieceId) {
    if (!this.state) return;
    const piece = this.state.pieces.find(p => p.id === pieceId && p.alive);
    if (!piece || piece.side !== this.state.turn || piece.side !== this.side) return;
    this.state = { ...this.state, selectedId: this.state.selectedId === pieceId ? null : pieceId };
    this.#emit();
  }

  getLegalTargets(pieceId) {
    if (!this.state) return [];
    const piece = this.state.pieces.find(p => p.id === pieceId && p.alive);
    return piece ? legalTargets(this.state, piece) : [];
  }

  async connect() {
    if (this.connected) return this;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise((resolve, reject) => {
      const socket = new WebSocket(this.endpoint);
      this.socket = socket;
      let settled = false;

      socket.addEventListener('open', async () => {
        this.connected = true;
        try {
          if (this.roomId && this.playerId && this.sessionToken) await this.joinRoom(this.roomId, this.playerId, this.sessionToken);
          else if (this.roomId) await this.joinRoom(this.roomId);
          else await this.createRoom();
          settled = true;
          resolve(this);
        } catch (error) {
          settled = true;
          reject(error);
        } finally {
          this.connectPromise = null;
        }
      });

      socket.addEventListener('message', event => this.#handleMessage(JSON.parse(event.data)));
      socket.addEventListener('close', () => { this.connected = false; this.#emit(); });
      socket.addEventListener('error', () => {
        if (!settled && !this.connected) reject(new Error('WebSocket 连接失败'));
        this.#emit();
      });
    });

    return this.connectPromise;
  }

  async createRoom() {
    await this.#ensureConnected();
    return this.#waitForCommand(createRoomCreateCommand(randomId()), 'room.created');
  }

  async joinRoom(roomId, playerId = null, sessionToken = null) {
    this.roomId = roomId;
    await this.#ensureConnected();
    return this.#waitForCommand(
      createJoinCommand({ roomId, commandId: randomId(), playerId, sessionToken }),
      message => message.type === 'room.joined' || message.type === 'player.joined' || message.type === 'player.reconnected',
    );
  }

  async move(pieceId, x, y) { return this.#sendGameCommand({ type: 'game.move', pieceId, to: { x, y } }); }
  async reveal(pieceId) { return this.#sendGameCommand({ type: 'game.reveal', pieceId }); }

  async resync() {
    await this.#ensureConnected();
    return this.#waitForCommand(
      createResyncRequest(this.roomId, this.revision, this.sessionToken, randomId()),
      'game.resync',
    );
  }

  async reconnect() {
    if (this.connected) return this;
    return this.connect();
  }

  disconnect() { this.socket?.close(); }

  dispose() {
    for (const pending of this.pending.values()) pending.reject(new Error('session disposed'));
    this.pending.clear();
    this.listeners.clear();
    this.socket?.close();
  }

  async restart() { throw new Error('联网对局不支持客户端重开，请由房间服务端发起'); }

  async #sendGameCommand(command) {
    await this.#ensureConnected();
    const envelope = createCommand({
      roomId: this.roomId,
      commandId: randomId(),
      expectedRevision: this.revision,
      command,
    });
    envelope.sessionToken = this.sessionToken;
    return this.#waitForCommand(envelope, message => message.commandId === envelope.commandId);
  }

  async #ensureConnected() { if (!this.connected) await this.connect(); }

  #waitForCommand(message, matcher) {
    return new Promise((resolve, reject) => {
      this.pending.set(message.commandId, { resolve, reject, matcher });
      try { this.#sendRaw(message); }
      catch (error) { this.pending.delete(message.commandId); reject(error); }
    });
  }

  #sendRaw(message) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error('WebSocket 未连接');
    this.socket.send(JSON.stringify(message));
  }

  #handleMessage(message) {
    if (message.roomId) this.roomId = message.roomId;
    if (message.playerId) this.playerId = message.playerId;
    if (message.sessionToken) this.sessionToken = message.sessionToken;
    if (message.side) this.side = message.side;
    if (Number.isInteger(message.revision)) this.revision = message.revision;
    if (message.view) this.state = clone(message.view);

    if (message.type === 'error' && message.commandId && this.pending.has(message.commandId)) {
      const pending = this.pending.get(message.commandId);
      this.pending.delete(message.commandId);
      pending.reject(new Error(message.message));
      this.#emit();
      return;
    }

    for (const [key, pending] of this.pending) {
      if ((typeof pending.matcher === 'string' && message.type === pending.matcher) ||
          (typeof pending.matcher === 'function' && pending.matcher(message))) {
        this.pending.delete(key);
        pending.resolve(message);
        break;
      }
    }
    this.#emit();
  }

  #emit() {
    const snapshot = this.getView();
    for (const listener of this.listeners) listener(snapshot);
  }
}

export const createLocalSession = seed => new LocalSession(seed);
export const createOnlineSession = (endpoint, options) => new OnlineSession(endpoint, options);

export function getLegalTargets(session, pieceId) {
  const state = session.getView();
  const piece = state?.pieces?.find(p => p.id === pieceId && p.alive);
  if (!piece) return [];
  return typeof session.getLegalTargets === 'function' ? session.getLegalTargets(pieceId) : legalTargets(state, piece);
}
