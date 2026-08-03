import { chromium, type Browser, type Page } from 'playwright-core';
import type { WebSocket } from 'ws';
import { Subject } from 'rxjs';

import type { Message } from '@evaluator/shared-types';
import { SqliteService } from '@evaluator/sqlite';

import {
  CHROMIUM_LAUNCH_ARGS,
  EVALUATE_TIMEOUT_MS,
  EVALUATE_USER_AGENT,
  chromiumExecutablePath,
  getHostname,
  type EvaluateSession,
} from './browser-engine';
import type { ConsoleHit } from './console-hit';
import { START } from './eval.template';
import { buildEvalTemplate } from './resolve-fn';

export class PlaywrightEngine implements EvaluateSession {
  private readonly result$ = new Subject<ConsoleHit>();
  private readonly browser: Promise<Browser>;
  private readonly sqliteService = new SqliteService();

  constructor(private readonly ws?: WebSocket) {
    this.browser = this.getBrowser();
  }

  private async getBrowser(): Promise<Browser> {
    const executablePath = chromiumExecutablePath() ?? '/usr/bin/chromium';
    return chromium.launch({
      timeout: 3 * 30000,
      executablePath,
      args: [...CHROMIUM_LAUNCH_ARGS],
    });
  }

  async goto(message: Message): Promise<string | undefined> {
    const page = await this.getNewPage(message);
    if (!page) {
      return;
    }
    this.setListener(page);
    let aborted = false;
    let url = '';
    this.ws?.send(JSON.stringify('request'));
    console.log(getHostname(message.url.trim()));
    const hostname = getHostname(message.url.trim());
    await page.route('**/*', async (route) => {
      const req = route.request();
      if (
        req.isNavigationRequest() &&
        req.frame() === page.mainFrame() &&
        !req.url().includes(hostname)
      ) {
        aborted = true;
        url = req.url();
        console.error(req.url(), message.url);
        this.ws?.send(JSON.stringify('aborted before redirection to ' + req.url()));
        await route.abort();
      } else {
        await route.continue();
      }
    });
    this.ws?.send(JSON.stringify('set request interception'));
    this.ws?.send(JSON.stringify('server message.url ' + message.url.trim()));
    console.log('server message.url', message.url.trim());
    let error = false;
    await page
      .goto(message.url.trim(), {
        timeout: EVALUATE_TIMEOUT_MS,
        waitUntil: 'networkidle',
      })
      .catch((err: Error) => {
        this.ws?.send(JSON.stringify('error ' + err.toString()));
        console.error(message.url, url, err);
        error = true;
      });
    if (!aborted && !error) {
      this.ws?.send(JSON.stringify('server tries screenshot'));
      console.log('server tries screenshot', message.url.trim());
      const buffer = await page.screenshot({ type: 'png' });
      const base64 = buffer.toString('base64');
      this.ws?.send(JSON.stringify('screenshot done'));
      console.log('server screenshot');
      if (base64) {
        return JSON.stringify(`data:image/png;base64,${base64}`);
      }
    }
    return;
  }

  private async getNewPage(message: Message) {
    this.ws?.send(JSON.stringify('get new page'));
    const browser = await this.browser.catch((err: Error) => {
      console.log(err);
      this.ws?.send(JSON.stringify('browser err ' + err.toString()));
    });
    if (!browser) {
      return;
    }
    this.ws?.send(JSON.stringify('get browser'));
    const context = await browser.newContext({ userAgent: EVALUATE_USER_AGENT });
    const page = await context.newPage();
    this.ws?.send(JSON.stringify('new page done'));
    const tpl = buildEvalTemplate(message);
    await this.sqliteService.insert(message);
    this.ws?.send(JSON.stringify('evaluate Document'));
    await page.addInitScript(tpl);
    return page;
  }

  async close() {
    const browser = await this.browser;
    await browser?.close();
  }

  private setListener(page: Page) {
    page.on('console', (consoleObj) => {
      const execution = consoleObj.text();
      if (!execution.includes(START)) {
        return;
      }
      const location = consoleObj.location();
      this.result$.next({
        text: execution,
        stackTrace: [
          {
            url: location.url,
            lineNumber: location.lineNumber,
            columnNumber: location.columnNumber,
          },
        ],
      });
    });
  }

  get results() {
    return this.result$.asObservable();
  }
}
