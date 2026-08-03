import { spawn } from 'node:child_process';
import http from 'node:http';

const NEST_URL = process.env.NEST_HEALTH_URL || 'http://127.0.0.1:3333/api/functions';
const NEST_WAIT_MS = Number(process.env.NEST_WAIT_MS || 60_000);
const NEST_POLL_MS = 250;

function spawnNode(script) {
  return spawn(process.execPath, [script], {
    stdio: 'inherit',
    env: process.env,
  });
}

function waitForNest(timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(NEST_URL, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });
      req.on('error', retry);
      req.setTimeout(2000, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Nest not ready at ${NEST_URL} within ${timeoutMs}ms`));
        return;
      }
      setTimeout(tryOnce, NEST_POLL_MS);
    };
    tryOnce();
  });
}

const children = [];

function shutdown(signal) {
  for (const child of children) {
    try {
      child.kill(signal);
    } catch {
      /* ignore */
    }
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

function track(child, name) {
  children.push(child);
  child.on('exit', (code, signal) => {
    console.error(`[serve] ${name} exited code=${code} signal=${signal}`);
    shutdown('SIGTERM');
    process.exit(code ?? (signal ? 1 : 0));
  });
}

const nest = spawnNode('dist/apps/evaluator-backend/main.js');
track(nest, 'nest');

try {
  await waitForNest(NEST_WAIT_MS);
  console.error(`[serve] Nest ready, starting Express gateway`);
} catch (err) {
  console.error(`[serve] ${err instanceof Error ? err.message : err}`);
  shutdown('SIGTERM');
  process.exit(1);
}

const express = spawnNode('dist/evaluator/server/server.js');
track(express, 'express');
