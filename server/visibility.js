import { visibleType, originalTypeLabel } from '../src/game.js';

export function filterState(state) {
  return {
    turn: state.turn,
    selectedId: state.selectedId,
    gameOver: state.gameOver,
    winner: state.winner,
    revision: state.revision ?? 0,
    pieces: state.pieces
      .filter(piece => piece.alive)
      .map(piece => {
        const next = {
          id: piece.id,
          side: piece.side,
          x: piece.x,
          y: piece.y,
          originalType: piece.originalType,
          revealed: piece.revealed,
          alive: piece.alive,
        };
        if (piece.revealed) {
          next.actualType = piece.actualType;
          next.visibleType = visibleType(piece);
        }
        if (!piece.revealed) {
          next.visibleType = '暗';
        }
        next.originalTypeLabel = originalTypeLabel(piece);
        return next;
      }),
  };
}

export function filterForPlayer(state, playerSide) {
  const view = filterState(state);
  view.playerSide = playerSide;
  return view;
}

export function assertNoHiddenIdentityLeak(view) {
  for (const piece of view.pieces) {
    if (!piece.revealed && Object.prototype.hasOwnProperty.call(piece, 'actualType')) {
      throw new Error('hidden actualType leaked');
    }
  }
  return true;
}
