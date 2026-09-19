import { createGame, legalTargets, movePiece, revealInPlace } from './game.js';
import { createCommand, createJoinCommand, createRoomCreateCommand, createResyncRequest } from './protocol.js';

const clone = value => structuredClone(value);
const randomId = () => globalThis.crypto?.randomUUID?.() ?? (Date.now() + '-' + Math.random().toString(16).slice(2));

function wsEndpoint(endpoint) {
  if (endpoint) return endpoint;
  const configured = globalThis.__DARK_CHESS_CONFIG__?.wsEndpoint;
  if (configured) return configured;
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
  getStatus() {
    return { status: 'local', connected: true, lastError: null, attempt: 0, maxAttempts: 0 };
  }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  select(pieceId) {
    const piece = this.state.pieces.find(p => p.id === pieceId && p.alive);
    this.state = { ...this.state, selectedId: piece && piece.side === this.state.turn
      ? (this.state.selectedId === pieceId ? null : pieceId) : this.state.selectedId };
    this.#emit({ type: 'selection.changed' });
  }
  move(pieceId, x, y) {
    const result = movePiece(this.state, pieceId, x, y);
    this.state = result.state;
    this.moveCount += 1;
    this.#emit({ type: result.capturedKing ? 'game.finished' : 'game.move.accepted' });
    return result;
  }
  reveal(pieceId) {
    this.state = revealInPlace(this.state, pieceId);
    this.moveCount += 1;
    this.#emit({ type: 'game.piece.revealed' });
    return this.getState();
  }
  restart(seed = null) {
    this.state = createGame(seed);
    this.moveCount = 0;
    this.#emit({ type: 'game.restarted' });
  }
  dispose() { this.listeners.clear(); }
  #emit(event) {
    const snapshot = this.getState();
    const status = this.getStatus();
    for (const listener of this.listeners) listener(snapshot, status, event);
  }
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
    this.connectionState = 'idle';
    this.lastError = null;
    this.listeners = new Set();
    this.pending = new Map();
    this.connectPromise = null;
    this.socket = null;
    this.intentionalClose = false;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
  }

  getView() { return clone(this.state); }
  getState() { return this.getView(); }
  getStatus() {
    return {
      status: this.connectionState,
      connected: this.connected,
      lastError: this.lastError,
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      roomId: this.roomId,
      playerId: this.playerId,
      side: this.side,
    };
  }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  select(pieceId) {
    if (!this.state) return;
    const piece = this.state.pieces.find(p => p.id === pieceId && p.alive);
    if (!piece || piece.side !== this.state.turn || piece.side !== this.side) return;
    this.state = { ...this.state, selectedId: this.state.selectedId === pieceId ? null : pieceId };
    this.#emit({ type: 'selection.changed' });
  }

  getLegalTargets(pieceId) {
    if (!this.state) return [];
    const piece = this.state.pieces.find(p => p.id === pieceId && p.alive);
    return piece ? legalTargets(this.state, piece) : [];
  }

  async connect() {
    if (this.connected && this.connectionState === 'connected') return this;
    if (this.connectPromise) return this.connectPromise;

    this.intentionalClose = false;
    this.connectionState = this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting';
    this.lastError = null;
    this.#emit({ type: 'connection.connecting' });

    this.connectPromise = new Promise((resolve, reject) => {
      const socket = new WebSocket(this.endpoint);
      this.socket = socket;
      let settled = false;

      socket.addEventListener('open', async () => {
        this.connected = true;
        this.connectionState = 'connecting';
        this.lastError = null;
        this.#emit({ type: 'connection.open' });
        try {
          if (this.roomId && this.playerId && this.sessionToken) {
            await this.joinRoom(this.roomId, this.playerId, this.sessionToken);
          } else if (this.roomId) {
            await this.joinRoom(this.roomId);
          } else {
            await this.createRoom();
          }
          this.connectionState = 'connected';
          this.reconnectAttempts = 0;
          this.lastError = null;
          this.#emit({ type: 'connection.ready' });
          settled = true;
          resolve(this);
        } catch (error) {
          this.lastError = error.message;
          this.connectionState = 'error';
          this.#emit({ type: 'connection.error', error });
          settled = true;
          reject(error);
          socket.close();
        } finally {
          this.connectPromise = null;
        }
      });

      socket.addEventListener('message', event => {
        try {
          this.#handleMessage(JSON.parse(event.data));
        } catch (error) {
          this.lastError = error.message || '网络消息解析失败';
          this.#emit({ type: 'connection.error', error });
        }
      });

      socket.addEventListener('close', () => {
        this.connected = false;
        this.connectionState = 'disconnected';
        this.#emit({ type: 'connection.closed' });
        if (!this.intentionalClose) this.#scheduleReconnect();
      });

      socket.addEventListener('error', () => {
        const error = new Error('WebSocket 连接失败');
        this.lastError = error.message;
        if (!settled && !this.connected) reject(error);
        this.#emit({ type: 'connection.error', error });
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

  async move(pieceId, x, y) {
    return this.#sendGameCommand({ type: 'game.move', pieceId, to: { x, y } });
  }

  async reveal(pieceId) {
    return this.#sendGameCommand({ type: 'game.reveal', pieceId });
  }

  async resync() {
    await this.#ensureConnected();
    return this.#waitForCommand(
      createResyncRequest(this.roomId, this.revision, this.sessionToken, randomId()),
      'game.resync',
    );
  }

  async reconnect() {
    this.intentionalClose = false;
    this.reconnectAttempts = 0;
    if (this.connected && this.connectionState === 'connected') return this;
    this.#clearReconnectTimer();
    return this.connect();
  }

  disconnect() {
    this.intentionalClose = true;
    this.#clearReconnectTimer();
    this.socket?.close();
  }

  dispose() {
    this.intentionalClose = true;
    this.#clearReconnectTimer();
    for (const pending of this.pending.values()) pending.reject(new Error('session disposed'));
    this.pending.clear();
    this.listeners.clear();
    this.socket?.close();
  }

  async restart() {
    throw new Error('联网对局不支持客户端重开，请离开房间后重新创建对局');
  }

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

  async #ensureConnected() {
    if (!this.connected) await this.connect();
  }

  #waitForCommand(message, matcher) {
    return new Promise((resolve, reject) => {
      this.pending.set(message.commandId, { resolve, reject, matcher });
      try {
        this.#sendRaw(message);
      } catch (error) {
        this.pending.delete(message.commandId);
        reject(error);
      }
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
    if (message.side ?? message.playerSide) this.side = message.side ?? message.playerSide;
    if (Number.isInteger(message.revision)) this.revision = message.revision;
    if (message.view) this.state = clone(message.view);

    if (message.type === 'error') {
      this.lastError = message.message || '服务端拒绝了请求';
      if (message.commandId && this.pending.has(message.commandId)) {
        const pending = this.pending.get(message.commandId);
        this.pending.delete(message.commandId);
        pending.reject(new Error(this.lastError));
      }
      this.#emit({ type: 'server.error', error: new Error(this.lastError), message });
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

    if (message.type === 'connection.ready' || message.type === 'room.created' ||
        message.type === 'room.joined' || message.type === 'player.joined' ||
        message.type === 'player.reconnected' || message.type === 'game.started') {
      this.lastError = null;
    }
    this.#emit({ type: message.type, message });
  }

  #scheduleReconnect() {
    if (this.intentionalClose || this.reconnectTimer || this.reconnectAttempts >= this.maxReconnectAttempts) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(1000 * (2 ** (this.reconnectAttempts - 1)), 8000);
    this.connectionState = 'reconnecting';
    this.#emit({ type: 'connection.reconnecting' });
    this.reconnectTimer = globalThis.setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch {
        this.#scheduleReconnect();
      }
    }, delay);
  }

  #clearReconnectTimer() {
    if (this.reconnectTimer) globalThis.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  #emit(event) {
    const snapshot = this.getView();
    const status = this.getStatus();
    for (const listener of this.listeners) listener(snapshot, status, event);
  }
}

export const createLocalSession = seed => new LocalSession(seed);
export const createOnlineSession = (endpoint, options) => new OnlineSession(endpoint, options);

export function getLegalTargets(session, pieceId) {
  const state = session.getView();
  const piece = state?.pieces?.find(p => p.id === pieceId && p.alive);
  if (!piece) return [];
  return typeof session.getLegalTargets === 'function'
    ? session.getLegalTargets(pieceId)
    : legalTargets(state, piece);
}
