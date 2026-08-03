#!/usr/bin/env node
/**
 * Thin MCP for evaluator: proxies to EVALUATOR_URL (web gateway).
 *   node server.mjs              # stdio (default)
 *   node server.mjs --http       # Streamable HTTP on EVALUATOR_MCP_ADDR (:8788)
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { randomUUID } from 'node:crypto';
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
      const qs = new URLSearchParams({ url });
      if (fn) qs.set('function', fn);
      const target = `${gateway}/evaluate?${qs.toString()}`;
      try {
        const res = await fetch(target);
        const body = await res.text();
        if (!res.ok) {
          return {
            content: [
              {
                type: 'text',
                text: `HTTP ${res.status}: ${body.slice(0, 4000)}`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: body.slice(0, 100_000) }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `evaluate failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
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
          return {
            content: [
              {
                type: 'text',
                text: `HTTP ${res.status}: ${body.slice(0, 4000)}`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: body.slice(0, 100_000) }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `list_functions failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
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
    console.error(`evaluator MCP HTTP on http://${host}:${port}/mcp (gateway=${gateway})`);
  });
}

if (httpMode) {
  await runHttp();
} else {
  await runStdio();
}
