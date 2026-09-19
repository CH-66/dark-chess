import { createGame, legalTargets, movePiece, revealInPlace } from './game.js';

export class LocalSession {
  constructor(seed = null) {
    this.listeners = new Set();
    this.state = createGame(seed);
    this.moveCount = 0;
  }

  getState() { return structuredClone(this.state); }
  getView() { return this.getState(); }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  select(pieceId) {
    const piece = this.state.pieces.find(p => p.id === pieceId && p.alive);
    this.state = { ...this.state, selectedId: piece && piece.side === this.state.turn ? (this.state.selectedId === pieceId ? null : pieceId) : this.state.selectedId };
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

  #emit() {
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot);
  }
}

export function createLocalSession(seed = null) {
  return new LocalSession(seed);
}

export function getLegalTargets(session, pieceId) {
  const state = session.getState();
  const piece = state.pieces.find(p => p.id === pieceId && p.alive);
  return piece ? legalTargets(state, piece) : [];
}
