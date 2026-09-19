import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { isValidCommandEnvelope } from '../src/protocol.js';
import { Room } from './room.js';
import { assertNoHiddenIdentityLeak } from './visibility.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
});

export function createGameServer({ port = 8080, host = '127.0.0.1' } = {}) {
  const rooms = new Map();
  const httpServer = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/healthz') {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify({ status: 'ok', rooms: rooms.size }));
        return;
      }
      if (pathname === '/') pathname = '/index.html';
      const relative = pathname.replace(/^\/+/, '');
      const file = normalize(join(ROOT, relative));
      if (!file.startsWith(ROOT)) throw new Error('forbidden');
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    }
  });

  const wss = new WebSocketServer({ server: httpServer });
  const sockets = new Map();
  const heartbeatTimer = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.readyState === WebSocket.OPEN) socket.ping();
    }
  }, 10_000);

  function send(socket, message) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  function broadcastRoom(room, builder) {
    for (const player of room.players.values()) {
      const socket = sockets.get(player.playerId);
      if (socket) send(socket, builder(player));
    }
  }

  function roomForSocket(socket) {
    const context = socket.__darkChess;
    if (!context) throw new Error('未加入房间');
    return rooms.get(context.roomId);
  }

  function welcome(socket, room, player, type = 'room.joined', commandId = null) {
    send(socket, {
      type,
      protocolVersion: 1,
      gameVersion: '0.4',
      roomId: room.roomId,
      playerId: player.playerId,
      side: player.side,
      sessionToken: player.sessionToken,
      commandId,
      started: room.isStarted(),
      revision: room.game?.revision ?? 0,
      view: room.playerView(player.side),
    });
  }

  wss.on('connection', socket => {
    socket.on('message', raw => {
      let message = null;
      try {
        message = JSON.parse(String(raw));
        const commandType = message?.command?.type;

        if ((commandType === 'room.create' || commandType === 'room.join' || commandType === 'game.resync') &&
            !isValidCommandEnvelope(message)) {
          throw new Error('invalid_command_envelope');
        }

        if (commandType === 'room.create') {
          const room = new Room();
          rooms.set(room.roomId, room);
          const result = room.join({});
          socket.__darkChess = { roomId: room.roomId, playerId: result.player.playerId };
          sockets.set(result.player.playerId, socket);
          welcome(socket, room, result.player, 'room.created', message.commandId);
          return;
        }

        if (commandType === 'room.join') {
          const room = rooms.get(message.roomId);
          if (!room) throw new Error('房间不存在');
          const result = room.join({
            playerId: message.command.playerId ?? null,
            sessionToken: message.command.sessionToken ?? null,
          });
          socket.__darkChess = { roomId: room.roomId, playerId: result.player.playerId };
          sockets.set(result.player.playerId, socket);
          welcome(socket, room, result.player, result.status === 'reconnected' ? 'player.reconnected' : 'player.joined');

          if (result.started && result.status !== 'reconnected') {
            broadcastRoom(room, player => ({
              type: 'game.started',
              protocolVersion: 1,
              gameVersion: '0.4',
              roomId: room.roomId,
              revision: room.game.revision,
              playerSide: player.side,
              view: room.playerView(player.side),
            }));
          } else if (result.status === 'reconnected') {
            broadcastRoom(room, player => ({
              type: 'player.reconnected',
              protocolVersion: 1,
              gameVersion: '0.4',
              roomId: room.roomId,
              playerId: result.player.playerId,
              playerSide: player.side,
              revision: room.game?.revision ?? 0,
              view: room.playerView(player.side),
            }));
          }
          return;
        }

        if (commandType === 'game.resync') {
          const room = roomForSocket(socket);
          const snapshot = room.snapshotFor(socket.__darkChess.playerId, message.command.sessionToken);
          assertNoHiddenIdentityLeak(snapshot.view);
          send(socket, {
            type: 'game.resync',
            protocolVersion: 1,
            gameVersion: '0.4',
            ...snapshot,
          });
          return;
        }

        if (!isValidCommandEnvelope(message)) throw new Error('invalid_command_envelope');
        const room = roomForSocket(socket);
        const context = socket.__darkChess;
        const player = room.getPlayer(context.playerId, message.sessionToken);
        const result = room.command(context.playerId, player.sessionToken, message);

        if (result.duplicate) {
          send(socket, result.responses[context.playerId]);
          return;
        }

        broadcastRoom(room, p => {
          const response = result.responses[p.playerId];
          assertNoHiddenIdentityLeak(response.view);
          return {
            protocolVersion: 1,
            gameVersion: '0.4',
            ...response,
          };
        });
      } catch (error) {
        const code = error.message === 'revision_conflict' ? 'revision_conflict' : 'command_rejected';
        const context = socket.__darkChess;
        send(socket, {
          type: 'error',
          protocolVersion: 1,
          gameVersion: '0.4',
          code,
          commandId: message?.commandId ?? null,
          message: error.message,
          roomId: context?.roomId ?? null,
          revision: context ? rooms.get(context.roomId)?.game?.revision ?? 0 : 0,
        });
      }
    });

    socket.on('close', () => {
      const context = socket.__darkChess;
      if (!context) return;
      const room = rooms.get(context.roomId);
      if (!room) return;
      const player = room.players.get(context.playerId);
      if (!player) return;
      if (sockets.get(context.playerId) === socket) sockets.delete(context.playerId);
      room.setConnected(context.playerId, false);
      broadcastRoom(room, p => ({
        type: 'player.disconnected',
        protocolVersion: 1,
        gameVersion: '0.4',
        roomId: room.roomId,
        playerId: context.playerId,
        playerSide: p.side,
        revision: room.game?.revision ?? 0,
        view: room.playerView(p.side),
      }));
    });
  });

  return {
    rooms,
    httpServer,
    wss,
    async start() {
      await new Promise(resolve => httpServer.listen(port, host, resolve));
      return httpServer.address().port;
    },
    async stop() {
      clearInterval(heartbeatTimer);
      await new Promise(resolve => wss.close(resolve));
      await new Promise(resolve => httpServer.close(resolve));
    },
  };
}
