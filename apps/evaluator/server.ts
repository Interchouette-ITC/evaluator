import * as dotenv from 'dotenv';
import { join } from 'path';
import express, { type Request, type Response } from 'express';
import { WebSocketServer } from 'ws';
import * as http from 'http';
import { createProxyMiddleware as proxy } from 'http-proxy-middleware';
import { Message } from '@evaluator/shared-types';
import { PuppeteerResolver } from '@evaluator/util-puppeteer';
import basicAuth from 'express-basic-auth';

dotenv.config({ override: true });

const user = process.env['DB_USER'] || 'user';
const pwd = process.env['DB_PWD'] || 'pwd';
const users = { [user]: pwd };
const auth = basicAuth({
  users,
  challenge: true,
});

const apiProxy = proxy({
  target: 'http://127.0.0.1:3333',
  changeOrigin: true,
});

export function createApp(): express.Express {
  const app = express();
  const distFolder = join(process.cwd(), 'dist/evaluator/browser');

  app.get(/^\/evaluate(\/.*)?$/, PuppeteerResolver.resolve);

  app.use('/db', auth);
  app.get('/db/database.db', (_req: Request, res: Response) => {
    res.sendFile(join(process.cwd(), 'database.db'), {
      headers: { 'Cache-Control': 'no-cache' },
    });
  });

  app.use('/api', apiProxy);

  app.use(express.static(distFolder, { maxAge: '1y', index: false }));

  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(join(distFolder, 'index.html'));
  });

  return app;
}

function attachWebSocket(server: http.Server) {
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    ws.send(JSON.stringify('connection'));
    ws.on('message', async (message_raw) => {
      ws.send(JSON.stringify('message'));
      const message: Message = JSON.parse(message_raw.toString());
      ws.send(JSON.stringify('message url ' + message.url));
      await PuppeteerResolver.resolveWs(message, ws);
      ws.send(JSON.stringify('resolved'));
    });
  });
}

function run(): void {
  const port = Number(process.env['PORT'] || 4000);
  const app = createApp();
  const server = http.createServer(app);
  attachWebSocket(server);
  server.listen(port, () => {
    console.log(`Node Express app listening on http://localhost:${port}`);
  });
}

run();
