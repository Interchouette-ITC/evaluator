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
 * Batch evaluate: one Chromium for the whole run (sequential pages on one session).
 */
export async function runBatch(opts: RunBatchOpts): Promise<RunEvaluateOutcome[]> {
  const urls = opts.urls.map((u) => u.trim()).filter(Boolean);
  if (urls.length === 0) {
    return [];
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
  const all: RunEvaluateOutcome[] = [];

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
        screenshot = (await session.goto({ url, fn, clearFn })) || undefined;
      } finally {
        subscription.unsubscribe();
      }
      const outcome = { results, screenshot };
      all.push(outcome);
      opts.onSite?.(url, outcome);
    }
  } finally {
    await session.close();
    console.error('[evaluate] browser closed');
  }
  return all;
}

export { dedupAndFilter };
