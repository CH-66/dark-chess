import { createGame, movePiece, revealInPlace, legalTargets } from '../src/game.js';

export class AuthoritativeGame {
  constructor(seed) {
    this.state = createGame(seed);
    this.revision = 0;
    this.state.revision = this.revision;
  }

  getState() {
    return structuredClone(this.state);
  }

  getLegalTargets(pieceId) {
    const piece = this.state.pieces.find(p => p.id === pieceId && p.alive);
    return piece ? legalTargets(this.state, piece) : [];
  }

  apply(side, command) {
    if (!command || typeof command.type !== 'string') {
      throw new Error('invalid command');
    }

    const pieceId = command.pieceId;
    const piece = this.state.pieces.find(p => p.id === pieceId && p.alive);
    if (!piece) throw new Error('棋子不存在');
    if (piece.side !== side) throw new Error('不能操作对方棋子');
    if (piece.side !== this.state.turn) throw new Error('尚未轮到该方');
    if (this.state.gameOver) throw new Error('对局已结束');

    let result;
    if (command.type === 'game.move') {
      if (!Number.isInteger(command.to?.x) || !Number.isInteger(command.to?.y)) {
        throw new Error('目标位置无效');
      }
      result = movePiece(this.state, pieceId, command.to.x, command.to.y);
      this.state = result.state;
    } else if (command.type === 'game.reveal') {
      this.state = revealInPlace(this.state, pieceId);
      result = { state: this.state, captured: null, capturedKing: false };
    } else {
      throw new Error('不支持的游戏命令');
    }

    this.revision += 1;
    this.state.revision = this.revision;
    return {
      revision: this.revision,
      state: this.getState(),
      captured: result.captured
        ? { id: result.captured.id, side: result.captured.side, revealed: result.captured.revealed }
        : null,
      capturedKing: Boolean(result.capturedKing),
      actor: piece.side,
      commandType: command.type,
    };
  }
}
