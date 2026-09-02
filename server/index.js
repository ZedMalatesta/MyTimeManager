import http from 'node:http';

import { serveStatic } from './static.js';
import { DATA_FILE } from './storage.js';

const PORT = Number(process.env.PORT ?? 4321);
const HOST = process.env.HOST ?? '127.0.0.1'; // personal tool: loopback only

const server = http.createServer(async (req, res) => {
  try {
    if (await serveStatic(req, res)) return;
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Internal server error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`MyTimeManager  →  http://${HOST}:${PORT}`);
  console.log(`board file      ${DATA_FILE}`);
});
