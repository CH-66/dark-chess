import { createGameServer } from './ws-server.js';

const requestedPort = Number(process.env.PORT ?? 8080);
const server = createGameServer({ port: requestedPort });
const actualPort = await server.start();
console.log('dark-chess server listening on http://127.0.0.1:' + actualPort);
