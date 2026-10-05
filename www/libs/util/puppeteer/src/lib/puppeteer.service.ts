import { NextFunction, Request, Response } from 'express';
import type { WebSocket } from 'ws';

import { Message, MessageResult } from '@evaluator/shared-types';

import { isValidHttpUrl, screenshotsEnabled } from './browser-engine';
import { isEvaluateGuardError, withEvaluateSlot } from './evaluate-guard';
import { createEvaluateSession } from './engine.factory';
import { decorateResult, dedupAndFilter, runEvaluate } from './run-evaluate';

export class PuppeteerResolver {
  private static readonly url_not_valid = 'not a valid url?';
  private static readonly parse_failure = 'parsing failure';

  static async resolve(req: Request, res: Response, next: NextFunction) {
    const url = req.query['url']?.toString() || '';
    const fn = req.query['function']?.toString() || '';
    const clearFn = !!fn;
    if (!isValidHttpUrl(url)) {
      res.status(400).send([PuppeteerResolver.url_not_valid]);
      return;
    }
    let opened = false;
    try {
      const { screenshot } = await runEvaluate({
        url,
        fn,
        clearFn,
        onResult: (result: MessageResult) => {
          if (!opened) {
            res.write('[');
            opened = true;
          }
          res.write([JSON.stringify(result), ''].join());
        },
      });
      if (!opened) {
        res.write('[');
      }
      res.write(['\n', screenshot || '', ']'].join(''));
      res.end();
    } catch (error) {
      if (isEvaluateGuardError(error)) {
        if (!opened) {
          res.status(503).json({ error: error.code, detail: error.message });
          return;
        }
      }
      if (!opened) {
        res.status(500).send([PuppeteerResolver.parse_failure, error?.toString()]);
      } else {
        res.end();
      }
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
      await withEvaluateSlot(async () => {
        ws.send(JSON.stringify('try url ' + message.url));
        message.fn && ws.send(JSON.stringify('fn ' + message.fn));
        const session = createEvaluateSession(ws);

        const subscription = session.results
          .pipe(dedupAndFilter())
          .subscribe((result: MessageResult | undefined) => {
            ws.send(JSON.stringify('result found'));
            result && ws.send(JSON.stringify(result));
          });
        ws.send(JSON.stringify('goto page ' + message.url));
        const screenshot = await session.goto(message, {
          screenshot: screenshotsEnabled(),
        });
        if (screenshot) {
          ws.send(JSON.stringify('send screenshot'));
          ws.send(screenshot);
        }
        ws.send(JSON.stringify('close puppet'));
        await session.close();
        ws.send(JSON.stringify('puppet closed'));
        subscription.unsubscribe();
      });
      ws.send(JSON.stringify(false));
      ws.send(JSON.stringify('ws closed'));
      ws.close();
    } catch (error) {
      if (isEvaluateGuardError(error)) {
        ws.send(JSON.stringify(`error ${error.code}: ${error.message}`));
      } else {
        ws.send(JSON.stringify('error ' + String(error)));
      }
      ws.close();
    }
  }
}

export { decorateResult };
