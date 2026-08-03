import { NextFunction, Request, Response } from 'express';
import * as Crypto from 'crypto';
import type { WebSocket } from 'ws';

import { Message, MessageResult, Result, StackFrame } from '@evaluator/shared-types';
import { filter, map, pipe, take } from 'rxjs';

import { isValidHttpUrl } from './browser-engine';
import type { ConsoleHit } from './console-hit';
import { createEvaluateSession } from './engine.factory';
import { START } from './eval.template';

export class PuppeteerResolver {
  private static readonly url_not_valid = 'not a valid url?';
  private static readonly parse_failure = 'parsing failure';
  private static readonly result_max = 1000;

  static async resolve(req: Request, res: Response, next: NextFunction) {
    const url = req.query['url']?.toString() || '';
    const fn = req.query['function']?.toString() || '';
    const clearFn = !!fn;
    if (!isValidHttpUrl(url)) {
      res.status(400).send([PuppeteerResolver.url_not_valid]);
      return;
    } else {
      res.write('[');
    }
    try {
      const session = createEvaluateSession();
      const subscription = session.results
        .pipe(PuppeteerResolver.dedupAndFilter())
        .subscribe((result: MessageResult | undefined) => {
          result && res.write([JSON.stringify(result), ''].join());
        });
      const screenshot = await session.goto({ url, fn, clearFn });
      await session.close();
      res.write(['\n', screenshot, ']'].join(''));
      res.end();
      subscription.unsubscribe();
    } catch (error) {
      res.status(500).send([PuppeteerResolver.parse_failure, error?.toString()]);
      return next(error);
    }
  }

  static async resolveWs(message: Message, ws: WebSocket): Promise<void> {
    ws.send(JSON.stringify('resolve ' + message.url));
    if (!isValidHttpUrl(message.url)) {
      ws.send(JSON.stringify('isValidHttpUrl ? ' + message.url));
      ws.send(JSON.stringify(false));
      return;
    }
    try {
      ws.send(JSON.stringify('try url ' + message.url));
      message.fn && ws.send(JSON.stringify('fn ' + message.fn));
      const session = createEvaluateSession(ws);

      const subscription = session.results
        .pipe(PuppeteerResolver.dedupAndFilter())
        .subscribe((result: MessageResult | undefined) => {
          ws.send(JSON.stringify('result found'));
          result && ws.send(JSON.stringify(result));
        });
      ws.send(JSON.stringify('goto page ' + message.url));
      const screenshot = await session.goto(message);
      if (screenshot) {
        ws.send(JSON.stringify('send screenshot'));
        ws.send(screenshot);
      }
      ws.send(JSON.stringify('close puppet'));
      await session.close();
      ws.send(JSON.stringify('puppet closed'));
      ws.send(JSON.stringify(false));
      ws.send(JSON.stringify('ws closed'));
      ws.close();
      subscription.unsubscribe();
    } catch (error) {
      ws.send(JSON.stringify('error ' + String(error)));
    }
  }

  private static dedupAndFilter() {
    const duplicates = new Map<string, MessageResult>();
    return pipe(
      map((message: ConsoleHit) => {
        const result = PuppeteerResolver.decorateResult(message);
        const key = result && result?.sha256 + result?.caller;
        if (key && !duplicates.has(key)) {
          duplicates.set(key, result);
          return result;
        }
        return;
      }),
      filter((x: MessageResult | undefined) => !!x?.sha256),
      take(PuppeteerResolver.result_max)
    );
  }

  private static decorateResult(message: ConsoleHit): MessageResult {
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
}
