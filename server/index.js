import { createGameServer } from './ws-server.js';

const requestedPort = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '127.0.0.1';
const server = createGameServer({ port: requestedPort, host });
const actualPort = await server.start();
console.log('dark-chess server listening on http://' + host + ':' + actualPort);
