import * as puppeteer from 'puppeteer';
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

export class PuppeteerEngine implements EvaluateSession {
  private readonly result$ = new Subject<ConsoleHit>();
  private readonly browser: Promise<puppeteer.Browser>;
  private readonly sqliteService = new SqliteService();

  constructor(private readonly ws?: WebSocket) {
    this.browser = this.getBrowser();
  }

  private async getBrowser(): Promise<puppeteer.Browser> {
    const executablePath = chromiumExecutablePath();
    return puppeteer.launch({
      timeout: 3 * 30000,
      ...(executablePath ? { executablePath } : {}),
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
    console.error(getHostname(message.url.trim()));
    page.on('request', (req) => {
      if (
        req.isNavigationRequest() &&
        req.frame() === page.mainFrame() &&
        !req.url().includes(getHostname(message.url.trim()))
      ) {
        aborted = true;
        url = req.url();
        console.error(req.url(), message.url);
        this.ws?.send(JSON.stringify('aborted before redirection to ' + req.url()));
        req.abort('aborted');
      } else {
        req.continue();
      }
    });
    this.ws?.send(JSON.stringify('set request interception'));
    await page.setRequestInterception(true);
    this.ws?.send(JSON.stringify('server message.url ' + message.url.trim()));
    console.error('server message.url', message.url.trim());
    let error = false;
    await page
      .goto(message.url.trim(), {
        timeout: EVALUATE_TIMEOUT_MS,
        waitUntil: ['domcontentloaded', 'networkidle0'],
      })
      .catch((err) => {
        this.ws?.send(JSON.stringify('error ' + err.toString()));
        console.error(message.url, url, err);
        error = true;
      });
    if (!aborted && !error) {
      this.ws?.send(JSON.stringify('server tries screenshot'));
      console.error('server tries screenshot', message.url.trim());
      const base64 = (await page.screenshot({ encoding: 'base64' })) as string;
      this.ws?.send(JSON.stringify('screenshot done'));
      console.error('server screenshot');
      if (base64) {
        return JSON.stringify(`data:image/png;base64,${base64}`);
      }
    }
    return;
  }

  private async getNewPage(message: Message) {
    this.ws?.send(JSON.stringify('get new page'));
    const browser = await this.browser.catch((err) => {
      console.error(err);
      this.ws?.send(JSON.stringify('browser err ' + err.toString()));
    });
    if (!browser) {
      return browser;
    }
    this.ws?.send(JSON.stringify('get browser'));
    const page = await browser.newPage();
    this.ws?.send(JSON.stringify('new page done'));
    const tpl = buildEvalTemplate(message);
    await this.sqliteService.insert(message);
    this.ws?.send(JSON.stringify('evaluate Document'));
    await page.evaluateOnNewDocument(tpl);
    await page.setUserAgent(EVALUATE_USER_AGENT);
    return page;
  }

  async close() {
    const browser = await this.browser;
    await browser?.close();
  }

  private setListener(page: puppeteer.Page) {
    page.on('console', (consoleObj: puppeteer.ConsoleMessage) => {
      const execution = consoleObj.text();
      if (!execution.includes(START)) {
        return;
      }
      this.result$.next({
        text: execution,
        stackTrace: consoleObj.stackTrace().map((trace) => ({
          url: trace.url,
          lineNumber: trace.lineNumber,
          columnNumber: trace.columnNumber,
        })),
      });
    });
  }

  get results() {
    return this.result$.asObservable();
  }
}
