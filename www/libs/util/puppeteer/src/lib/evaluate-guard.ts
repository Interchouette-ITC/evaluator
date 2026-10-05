import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { maxRssBytes } from './browser-engine';

const DEFAULT_LOCK = '/tmp/evaluator-evaluate.lock';
const DEFAULT_WAIT_MS = 120_000;
const RETRY_MS = 200;

export class EvaluateGuardError extends Error {
  constructor(
    readonly code: 'memory_limit' | 'evaluate_busy',
    message: string
  ) {
    super(message);
    this.name = 'EvaluateGuardError';
  }
}

export function isEvaluateGuardError(err: unknown): err is EvaluateGuardError {
  return err instanceof EvaluateGuardError;
}

function evalLockPath(): string {
  const p = process.env['EVALUATOR_EVAL_LOCK']?.trim();
  return p || DEFAULT_LOCK;
}

function evalWaitMs(): number {
  const raw = process.env['EVALUATOR_EVAL_WAIT_MS'];
  const n = raw ? Number(raw) : DEFAULT_WAIT_MS;
  if (!Number.isFinite(n) || n < 0) {
    return DEFAULT_WAIT_MS;
  }
  return n;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertMemoryWithinCap(): void {
  const cap = maxRssBytes();
  const rss = process.memoryUsage().rss;
  if (rss > cap) {
    const rssMb = Math.round(rss / 1024 / 1024);
    const capMb = Math.round(cap / 1024 / 1024);
    throw new EvaluateGuardError(
      'memory_limit',
      `RSS ${rssMb}MB exceeds cap ${capMb}MB (EVALUATOR_MAX_RSS_MB)`
    );
  }
}

function lockHolderAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function tryRemoveStaleLock(lockPath: string): void {
  try {
    const raw = readFileSync(lockPath, 'utf8').trim();
    const pid = Number(raw.split(/\s/)[0]);
    if (!lockHolderAlive(pid)) {
      unlinkSync(lockPath);
    }
  } catch {
    try {
      unlinkSync(lockPath);
    } catch {
      /* ignore */
    }
  }
}

async function acquireLock(
  lockPath: string,
  waitMs: number
): Promise<{ release: () => void }> {
  mkdirSync(dirname(lockPath), { recursive: true });
  const started = Date.now();
  while (Date.now() - started < waitMs) {
    try {
      const fd = openSync(lockPath, 'wx');
      writeFileSync(fd, `${process.pid}\n`);
      return {
        release: () => {
          try {
            closeSync(fd);
          } catch {
            /* ignore */
          }
          try {
            unlinkSync(lockPath);
          } catch {
            /* ignore */
          }
        },
      };
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
      if (code !== 'EEXIST') {
        throw err;
      }
      tryRemoveStaleLock(lockPath);
    }
    await sleep(RETRY_MS);
  }
  throw new EvaluateGuardError(
    'evaluate_busy',
    `Another evaluate is running (lock ${lockPath}); try again later`
  );
}

/**
 * Serialize Chromium work across Node processes (HTTP, WS, MCP-spawned CLI).
 */
export async function withEvaluateSlot<T>(fn: () => Promise<T>): Promise<T> {
  assertMemoryWithinCap();
  const lockPath = evalLockPath();
  const { release } = await acquireLock(lockPath, evalWaitMs());
  try {
    assertMemoryWithinCap();
    return await fn();
  } finally {
    release();
  }
}
