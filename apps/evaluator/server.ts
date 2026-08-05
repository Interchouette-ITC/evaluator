import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
import express, { type Request, type Response } from 'express';
import { WebSocketServer } from 'ws';
import * as http from 'http';
import { createProxyMiddleware as proxy } from 'http-proxy-middleware';
import { Message } from '@evaluator/shared-types';
import {
  PuppeteerResolver,
  isValidHttpUrl,
  runBatch,
  runEvaluate,
} from '@evaluator/util-puppeteer';
import basicAuth from 'express-basic-auth';

dotenv.config({ override: true });

const user = process.env['DB_USER'] || 'user';
const pwd = process.env['DB_PWD'] || 'pwd';
const users = { [user]: pwd };
const auth = basicAuth({
  users,
  challenge: true,
});

const mcpUser = process.env['MCP_USER'] || 'mcp';
const mcpPwd = process.env['MCP_PWD'] || 'mcp';
const mcpAuth = basicAuth({
  users: { [mcpUser]: mcpPwd },
  challenge: true,
});

const enableMcpProxy = (() => {
  const v = process.env['ENABLE_MCP_PROXY'];
  if (v === undefined || v === '') return true;
  return v === '1' || v === 'true';
})();

function proxyOnError(label: string) {
  return (err: Error, _req: unknown, res: unknown) => {
    console.error(`[${label}]`, err.message);
    if (
      res &&
      typeof res === 'object' &&
      'writeHead' in res &&
      typeof (res as { writeHead: unknown }).writeHead === 'function' &&
      'headersSent' in res &&
      !(res as { headersSent: boolean }).headersSent
    ) {
      (res as http.ServerResponse).writeHead(502, {
        'Content-Type': 'application/json',
      });
      (res as http.ServerResponse).end(
        JSON.stringify({
          error: `${label}_unavailable`,
          detail: err.message,
        })
      );
    }
  };
}

const apiProxy = proxy({
  target: 'http://127.0.0.1:3333',
  changeOrigin: true,
  pathRewrite: (path) => `/api${path}`,
  proxyTimeout: 30_000,
  timeout: 30_000,
  on: {
    error: proxyOnError('api-proxy'),
  },
});

const mcpProxy = proxy({
  target: 'http://127.0.0.1:9788',
  changeOrigin: true,
  pathRewrite: (path) => (path === '/' || path === '' ? '/mcp' : `/mcp${path}`),
  proxyTimeout: 120_000,
  timeout: 120_000,
  on: {
    error: proxyOnError('mcp-proxy'),
  },
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

  if (enableMcpProxy) {
    app.use('/mcp', mcpAuth, mcpProxy);
  }

  app.use(express.static(distFolder, { maxAge: '1y', index: false }));

  app.get('/{*path}', (_req: Request, res: Response) => {
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

function runServe(): void {
  const port = Number(process.env['PORT'] || 4000);
  const app = createApp();
  const server = http.createServer(app);
  attachWebSocket(server);
  server.listen(port, () => {
    console.log(`Node Express app listening on http://localhost:${port}`);
  });
}

function normalizeSite(raw: string): string | null {
  const site = raw.trim().replace(/^["']|["']$/g, '');
  if (!site) return null;
  if (/^https?:\/\//i.test(site)) return site;
  if (
    site.includes('.') ||
    site.startsWith('localhost') ||
    site.startsWith('127.')
  ) {
    return `https://${site}`;
  }
  return null;
}

function loadCsvUrls(path: string): string[] {
  const text = readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const splitCols = (line: string) =>
    line.split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
  const header = splitCols(lines[0]).map((h) => h.toLowerCase());
  let col = header.findIndex((h) => h === 'domain' || h === 'url');
  if (col < 0) col = 0;
  const urls: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCols(lines[i]);
    const site = normalizeSite(cols[col] ?? '');
    if (site) urls.push(site);
  }
  return urls;
}

function argValue(argv: string[], name: string): string | undefined {
  const long = `--${name}`;
  const short = name === 'url' ? '-u' : name === 'fn' || name === 'function' ? '-f' : name === 'path' ? '-p' : name === 'nb_threads' || name === 'concurrency' ? '-n' : '';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === long || (short && a === short)) {
      return argv[i + 1];
    }
    if (a.startsWith(`${long}=`)) {
      return a.slice(long.length + 1);
    }
  }
  return undefined;
}

async function runEvaluateCli(argv: string[]): Promise<void> {
  const url = argValue(argv, 'url');
  const fn = argValue(argv, 'fn') || argValue(argv, 'function') || '';
  if (!url) {
    console.error('usage: evaluate --url URL [--fn FUNCTION]');
    process.exit(2);
  }
  const normalized = isValidHttpUrl(url) ? url : normalizeSite(url);
  if (!normalized) {
    console.error('not a valid url?');
    process.exit(2);
  }
  const outcome = await runEvaluate({ url: normalized, fn, clearFn: !!fn });
  console.log(
    JSON.stringify({
      url: normalized,
      results: outcome.results,
      screenshot: outcome.screenshot,
    })
  );
}

async function runBatchCli(argv: string[]): Promise<void> {
  const path = argValue(argv, 'path');
  const fn = argValue(argv, 'fn') || argValue(argv, 'function') || '';
  const concRaw = argValue(argv, 'nb_threads') || argValue(argv, 'concurrency');
  const concurrency = Math.max(1, Number(concRaw) || 1);
  if (!path) {
    console.error('usage: batch -p CSV [--fn FUNCTION] [-n N]');
    process.exit(2);
  }
  const urls = loadCsvUrls(path);
  if (urls.length === 0) {
    console.error('batch: no valid URLs in CSV');
    process.exit(2);
  }
  void concurrency; // one browser, sequential (plan)
  const outcomes = await runBatch({
    urls,
    fn,
    onSite: (site, outcome) => {
      console.log(
        JSON.stringify({
          url: site,
          results: outcome.results,
          screenshot: outcome.screenshot,
        })
      );
    },
  });
  console.error(`[evaluate] batch done count=${outcomes.length}`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = (argv[0] || 'serve').toLowerCase();

  if (cmd === 'evaluate') {
    await runEvaluateCli(argv.slice(1));
    return;
  }
  if (cmd === 'batch') {
    await runBatchCli(argv.slice(1));
    return;
  }
  if (cmd === 'serve' || cmd === '--serve') {
    runServe();
    return;
  }
  if (cmd.startsWith('-')) {
    // legacy: node server.js with no subcommand always served
    runServe();
    return;
  }
  if (!argv[0]) {
    runServe();
    return;
  }
  console.error(`unknown command: ${cmd} (expected serve|evaluate|batch)`);
  process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
