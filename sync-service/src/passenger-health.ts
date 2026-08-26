import { createServer } from 'node:http';

const port = Number.parseInt(process.env.PORT ?? '8080', 10) || 8080;

createServer((request, response) => {
  const path = request.url?.split('?', 1)[0];
  if (request.method === 'GET' && (path === '/' || path === '/health')) {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ok: true, service: 'frimps-mail-sync-control' }));
    return;
  }
  response.writeHead(404).end();
}).listen(port);
