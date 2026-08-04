#!/usr/bin/env node
/**
 * Thin MCP for evaluator: proxies to EVALUATOR_URL (web gateway).
 *   node server.mjs              # stdio (default)
 *   node server.mjs --http       # Streamable HTTP on EVALUATOR_MCP_ADDR (:8788)
 *
 * Tools: evaluate, list_functions, batch (urls[] and/or CSV path).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const gateway = (process.env.EVALUATOR_URL || 'http://127.0.0.1:4000').replace(
  /\/$/,
  ''
);
const httpMode =
  process.argv.includes('--http') ||
  process.env.EVALUATOR_MCP_HTTP === '1' ||
  process.env.EVALUATOR_MCP_HTTP === 'true';
const listenAddr = process.env.EVALUATOR_MCP_ADDR || '0.0.0.0:8788';

const BODY_CAP = 300_000;
const BATCH_MAX_URLS = 50;
const BATCH_MAX_CONCURRENCY = 8;

/**
 * @param {string} raw
 * @returns {string | null}
 */
function normalizeSite(raw) {
  const s = String(raw ?? '').trim().replace(/^["']|["']$/g, '');
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.includes('.') || s.startsWith('localhost') || s.startsWith('127.')) {
    return `https://${s}`;
  }
  return null;
}

/**
 * Load sites from a CSV. Prefers a `Domain` (or `url`) header column; else column 0.
 * @param {string} path
 * @returns {Promise<string[]>}
 */
async function loadCsvUrls(path) {
  const text = await readFile(path, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const splitCols = (line) =>
    line.split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));

  const header = splitCols(lines[0]).map((h) => h.toLowerCase());
  let col = header.findIndex((h) => h === 'domain' || h === 'url');
  if (col < 0) col = 0;

  /** @type {string[]} */
  const urls = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCols(lines[i]);
    const site = normalizeSite(cols[col] ?? '');
    if (site) urls.push(site);
  }
  return urls;
}

/**
 * @param {string} url
 * @param {string | undefined} fn
 * @returns {Promise<{ ok: boolean, status?: number, body?: string, error?: string }>}
 */
async function evaluateOnce(url, fn) {
  const qs = new URLSearchParams({ url });
  if (fn) qs.set('function', fn);
  const target = `${gateway}/evaluate?${qs.toString()}`;
  try {
    const res = await fetch(target);
    const body = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, error: body.slice(0, 4000) };
    }
    return { ok: true, status: res.status, body };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * @template T
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<unknown>} worker
 */
async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) || 1 },
    async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) break;
        results[i] = await worker(items[i], i);
      }
    }
  );
  await Promise.all(runners);
  return results;
}

/**
 * @param {string} text
 */
function textResult(text, isError = false) {
  return {
    content: [{ type: 'text', text }],
    ...(isError ? { isError: true } : {}),
  };
}

function createServer() {
  const server = new McpServer({
    name: 'evaluator',
    version: '1.0.0',
  });

  server.tool(
    'evaluate',
    'Evaluate a JavaScript function against a page via the evaluator gateway',
    {
      url: z.string().url().describe('Target page URL (http/https)'),
      function: z
        .string()
        .optional()
        .describe('Function expression to evaluate (e.g. window.eval)'),
    },
    async ({ url, function: fn }) => {
      const result = await evaluateOnce(url, fn);
      if (!result.ok) {
        const detail = result.status
          ? `HTTP ${result.status}: ${result.error ?? ''}`
          : `evaluate failed: ${result.error ?? 'unknown'}`;
        return textResult(detail, true);
      }
      return textResult((result.body ?? '').slice(0, BODY_CAP));
    }
  );

  server.tool(
    'list_functions',
    'List known evaluate function groups from the Nest API (/api/functions)',
    {},
    async () => {
      const target = `${gateway}/api/functions`;
      try {
        const res = await fetch(target);
        const body = await res.text();
        if (!res.ok) {
          return textResult(`HTTP ${res.status}: ${body.slice(0, 4000)}`, true);
        }
        return textResult(body.slice(0, BODY_CAP));
      } catch (err) {
        return textResult(
          `list_functions failed: ${err instanceof Error ? err.message : String(err)}`,
          true
        );
      }
    }
  );

  server.tool(
    'batch',
    'Batch-evaluate pages via the gateway. Provide urls[] and/or a local CSV path (`Domain` column, else first column). Max 50 URLs per call.',
    {
      urls: z
        .array(z.string())
        .optional()
        .describe('Target page URLs (http/https or bare domains)'),
      path: z
        .string()
        .optional()
        .describe('Local CSV path; uses Domain (or url) column, else first column'),
      function: z
        .string()
        .optional()
        .describe('Function expression to evaluate (e.g. window.eval)'),
      concurrency: z
        .number()
        .int()
        .min(1)
        .max(BATCH_MAX_CONCURRENCY)
        .optional()
        .describe(`Parallel evaluations (default 1, max ${BATCH_MAX_CONCURRENCY})`),
    },
    async ({ urls, path, function: fn, concurrency }) => {
      if ((!urls || urls.length === 0) && !path) {
        return textResult(
          'batch requires at least one of: urls[] or path (CSV)',
          true
        );
      }

      /** @type {string[]} */
      const collected = [];
      if (urls?.length) {
        for (const raw of urls) {
          const site = normalizeSite(raw);
          if (site) collected.push(site);
        }
      }
      if (path) {
        try {
          const fromCsv = await loadCsvUrls(path);
          collected.push(...fromCsv);
        } catch (err) {
          return textResult(
            `batch CSV error (${path}): ${err instanceof Error ? err.message : String(err)}`,
            true
          );
        }
      }

      const seen = new Set();
      const sites = [];
      for (const u of collected) {
        if (seen.has(u)) continue;
        seen.add(u);
        sites.push(u);
      }

      if (sites.length === 0) {
        return textResult('batch: no valid URLs after normalize', true);
      }
      if (sites.length > BATCH_MAX_URLS) {
        return textResult(
          `batch: ${sites.length} URLs exceeds max ${BATCH_MAX_URLS}; split the call`,
          true
        );
      }

      const conc = Math.min(
        Math.max(concurrency ?? 1, 1),
        BATCH_MAX_CONCURRENCY
      );

      const results = await mapPool(sites, conc, async (url) => {
        const r = await evaluateOnce(url, fn);
        if (r.ok) {
          return { url, ok: true, status: r.status, body: r.body };
        }
        return {
          url,
          ok: false,
          status: r.status,
          error: r.error,
        };
      });

      const okCount = results.filter((r) => r.ok).length;
      const failCount = results.length - okCount;
      const payload = {
        count: results.length,
        ok: okCount,
        fail: failCount,
        concurrency: conc,
        results,
      };
      let text = JSON.stringify(payload);
      if (text.length > BODY_CAP) {
        // Drop bodies first to fit under cap
        const slim = {
          count: results.length,
          ok: okCount,
          fail: failCount,
          concurrency: conc,
          truncated: true,
          results: results.map((r) =>
            r.ok
              ? {
                  url: r.url,
                  ok: true,
                  status: r.status,
                  body: (r.body ?? '').slice(0, 2000),
                }
              : r
          ),
        };
        text = JSON.stringify(slim);
        if (text.length > BODY_CAP) {
          text = JSON.stringify({
            count: results.length,
            ok: okCount,
            fail: failCount,
            truncated: true,
            note: 'results omitted; response exceeded 300k; reduce batch size',
            urls: sites,
          });
        }
      }

      return textResult(text);
    }
  );

  return server;
}

async function runStdio() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function runHttp() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  /** @type {Record<string, StreamableHTTPServerTransport>} */
  const transports = {};

  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    let transport = sessionId ? transports[String(sessionId)] : undefined;

    if (!transport) {
      if (!isInitializeRequest(req.body)) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports[id] = transport;
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) delete transports[transport.sessionId];
      };
      const server = createServer();
      await server.connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  });

  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    const transport = sessionId ? transports[String(sessionId)] : undefined;
    if (!transport) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    await transport.handleRequest(req, res);
  });

  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    const transport = sessionId ? transports[String(sessionId)] : undefined;
    if (!transport) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    await transport.handleRequest(req, res);
  });

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, gateway });
  });

  const [host, portStr] = listenAddr.includes(':')
    ? listenAddr.split(':')
    : ['0.0.0.0', listenAddr];
  const port = Number(portStr) || 8788;
  app.listen(port, host, () => {
    console.error(
      `evaluator MCP HTTP on http://${host}:${port}/mcp (gateway=${gateway})`
    );
  });
}

if (httpMode) {
  await runHttp();
} else {
  await runStdio();
}
