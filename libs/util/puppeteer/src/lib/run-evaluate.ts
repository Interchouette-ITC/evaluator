import * as Crypto from 'crypto';
import type { WebSocket } from 'ws';
import { filter, map, pipe, take, type Subscription } from 'rxjs';

import { Message, MessageResult, Result, StackFrame } from '@evaluator/shared-types';

import { isValidHttpUrl } from './browser-engine';
import type { ConsoleHit } from './console-hit';
import { createEvaluateSession } from './engine.factory';
import { START } from './eval.template';

const RESULT_MAX = 1000;

export type RunEvaluateOpts = {
  url: string;
  fn?: string;
  clearFn?: boolean;
  ws?: WebSocket;
  onResult?: (result: MessageResult) => void;
};

export type RunEvaluateOutcome = {
  results: MessageResult[];
  screenshot?: string;
};

export type RunBatchOpts = {
  urls: string[];
  fn?: string;
  /** Reserved; batch uses one browser and processes sites sequentially. */
  concurrency?: number;
  /**
   * Default false. Screenshots are huge base64 strings; enabling them in batch
   * will OOM the host when combined with context leaks.
   */
  screenshot?: boolean;
  onSite?: (site: string, outcome: RunEvaluateOutcome) => void;
};

function dedupAndFilter() {
  const duplicates = new Map<string, MessageResult>();
  return pipe(
    map((message: ConsoleHit) => {
      const result = decorateResult(message);
      const key = result && result?.sha256 + result?.caller;
      if (key && !duplicates.has(key)) {
        duplicates.set(key, result);
        return result;
      }
      return;
    }),
    filter((x: MessageResult | undefined) => !!x?.sha256),
    take(RESULT_MAX)
  );
}

export function decorateResult(message: ConsoleHit): MessageResult {
  const result: Result[] = JSON.parse(message.text.replace(START, '').trim()).map(
    (entry: Result) =>
      typeof entry === 'string'
        ? (entry as string).trim().replace(/\n/g, ' ').replace(/\s\s+/g, ' ')
        : entry
  );
  const sha256 = Crypto.createHash('sha256').update(message.text).digest('hex');
  let stacktrace: StackFrame[] = message.stackTrace.map((trace) => ({ ...trace }));
  const lastcaller = stacktrace.length ? stacktrace.slice(-1)[0] : undefined;
  stacktrace = stacktrace.filter((trace) => {
    trace.lineNumber = (trace.lineNumber || 0) + 1;
    return !!trace.url;
  });
  if (lastcaller && stacktrace.length === 0) {
    stacktrace.push(lastcaller);
  }
  const firstcaller = stacktrace.length ? stacktrace[0] : undefined;
  const caller =
    firstcaller && [firstcaller.url, firstcaller.lineNumber].join('#L');
  return {
    sha256,
    result,
    stacktrace,
    stacktrace_as_string: '',
    caller: caller || '',
  };
}

/**
 * Run one evaluate on a fresh browser session (one Chromium launch/close).
 */
export async function runEvaluate(opts: RunEvaluateOpts): Promise<RunEvaluateOutcome> {
  const url = opts.url?.trim() || '';
  if (!isValidHttpUrl(url)) {
    throw new Error('not a valid url?');
  }
  const fn = opts.fn || '';
  const clearFn = opts.clearFn ?? !!fn;
  const message: Message = { url, fn, clearFn };
  const session = createEvaluateSession(opts.ws);
  const results: MessageResult[] = [];
  const subscription: Subscription = session.results
    .pipe(dedupAndFilter())
    .subscribe((result: MessageResult | undefined) => {
      if (!result) return;
      results.push(result);
      opts.onResult?.(result);
    });
  try {
    const screenshot = await session.goto(message);
    return { results, screenshot: screenshot || undefined };
  } finally {
    subscription.unsubscribe();
    await session.close();
  }
}

/**
 * Batch evaluate: one Chromium for the whole run (sequential sites).
 * Streams each site via onSite and does not retain outcomes (or screenshots).
 * Returns the number of sites processed.
 */
export async function runBatch(opts: RunBatchOpts): Promise<number> {
  const urls = opts.urls.map((u) => u.trim()).filter(Boolean);
  if (urls.length === 0) {
    return 0;
  }
  for (const url of urls) {
    if (!isValidHttpUrl(url)) {
      throw new Error(`not a valid url?: ${url}`);
    }
  }

  console.error('[evaluate] browser launched once');
  const session = createEvaluateSession();
  const fn = opts.fn || '';
  const clearFn = !!fn;
  const takeScreenshot = opts.screenshot === true;
  let count = 0;

  try {
    for (const url of urls) {
      const results: MessageResult[] = [];
      const subscription: Subscription = session.results
        .pipe(dedupAndFilter())
        .subscribe((result: MessageResult | undefined) => {
          if (result) results.push(result);
        });
      let screenshot: string | undefined;
      try {
        const shot = await session.goto(
          { url, fn, clearFn },
          {
            screenshot: takeScreenshot,
            // Storefronts rarely reach networkidle; that path OOMs / hangs the host.
            waitUntil: 'load',
          }
        );
        if (takeScreenshot) {
          screenshot = shot || undefined;
        }
      } catch (err) {
        console.error(`[evaluate] site failed ${url}`, err);
      } finally {
        subscription.unsubscribe();
      }
      const outcome: RunEvaluateOutcome = takeScreenshot
        ? { results, screenshot }
        : { results };
      count += 1;
      opts.onSite?.(url, outcome);
      // Do not push onto an array — drop outcome after the callback returns.
    }
  } finally {
    await session.close();
    console.error('[evaluate] browser closed');
  }
  return count;
}

export { dedupAndFilter };
