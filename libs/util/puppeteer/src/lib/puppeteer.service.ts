import { NextFunction, Request, Response } from 'express';
import * as puppeteer from 'puppeteer';
import template, { START } from "./eval.template";
import * as Crypto from 'crypto';
import type { WebSocket } from 'ws';

import { Message, MessageResult, Result } from '@evaluator/shared-types';
import { filter, map, pipe, Subject, take } from 'rxjs';
import { resolveFunctionExpression } from '@evaluator-backend/util-functions';

import { SqliteService } from '@evaluator/sqlite';

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
      const puppet = new Puppet();
      const subscription = puppet.results.pipe(
        PuppeteerResolver.dedupAndFilter()
      ).subscribe((result: MessageResult | undefined) => {
        result && res.write([JSON.stringify(result), ''].join());
      });
      const screenshot = await puppet.goto({ url, fn, clearFn });
      await puppet.close();
      res.write(['\n', screenshot, ']'].join(''));
      res.end();
      subscription.unsubscribe();
    }
    catch (error) {
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
      const puppet = new Puppet(ws);

      const subscription = puppet.results.pipe(
        PuppeteerResolver.dedupAndFilter()
      ).subscribe((result: MessageResult | undefined) => {
        ws.send(JSON.stringify('result found'));
        result && ws.send(JSON.stringify(result));
      });
      ws.send(JSON.stringify('goto page ' + message.url));
      const screenshot = await puppet.goto(message);
      if (screenshot) {
        ws.send(JSON.stringify('send screenshot'));
        ws.send(screenshot);
      }
      ws.send(JSON.stringify('close puppet'));
      await puppet.close();
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
    return pipe(map((message: puppeteer.ConsoleMessage) => {
      const result = PuppeteerResolver.decorateResult(message);
      const key = result && result?.sha256 + result?.caller;
      if (key && !duplicates.has(key)) {
        duplicates.set(key, result);
        return result;
      }
      return;
    }),
      filter((x: MessageResult | undefined) => !!x?.sha256),
      take(PuppeteerResolver.result_max));
  }

  private static decorateResult(message: puppeteer.ConsoleMessage) {
    const result: Result[] = JSON.parse(message.text().replace(START, '').trim())
      .map((result: Result) =>
        typeof result === 'string' ? (result as string).trim().replace(/\n/g, ' ').replace(/\s\s+/g, ' ') : result
      );
    const sha256 = Crypto.createHash('sha256').update(message.text()).digest('hex');
    let stacktrace = message.stackTrace();
    const lastcaller = stacktrace && stacktrace.slice(-1)[0];
    stacktrace = stacktrace.filter((trace) => {
      trace['lineNumber'] = (trace['lineNumber'] || 0) + 1;
      return !!trace.url;
    });
    lastcaller && stacktrace.length === 0 && stacktrace.push(lastcaller);
    const firstcaller = stacktrace && stacktrace.slice()[0];
    const caller = firstcaller && [firstcaller['url'], firstcaller['lineNumber']].join('#L'),
      messageResult: MessageResult = {
        sha256,
        result,
        stacktrace,
        stacktrace_as_string: '',
        caller
      };
    return messageResult;
  }
}

class Puppet {
  result$: Subject<puppeteer.ConsoleMessage> = new Subject();
  private browser: Promise<puppeteer.Browser>;
  private readonly timeout = 240000;
  private readonly regeXss = /[\w]+\.[\w]+(\.[\w]+)?/;
  private readonly sqliteService: SqliteService;

  constructor(private readonly ws?: WebSocket
  ) {
    this.browser = this.getBrowser();
    ws && (this.ws = ws);
    this.sqliteService = new SqliteService();
  }

  async getBrowser(): Promise<puppeteer.Browser> {
    const executablePath = process.env['PUPPETEER_EXECUTABLE_PATH'];
    return await puppeteer.launch({
      timeout: 3 * 30000,
      ...(executablePath ? { executablePath } : {}),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
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
    page.on('request', req => {
      if (req.isNavigationRequest() && req.frame() === page.mainFrame() && !req.url().includes(getHostname(message.url.trim()))) {
        aborted = true;
        url = req.url();
        console.error(req.url(), message.url);
        this.ws?.send(JSON.stringify('aborted before redirection to ' + req.url()));
        req.abort('aborted');
        // this.ws?.send(JSON.stringify(false));
      } else {
        req.continue();
      }
    });
    this.ws?.send(JSON.stringify('set request interception'));
    await page.setRequestInterception(true);
    this.ws?.send(JSON.stringify('server message.url ' + message.url.trim()));
    console.log('server message.url', message.url.trim());
    let error = false;
    await page.goto(message.url.trim(), { timeout: this.timeout, waitUntil: ['domcontentloaded', 'networkidle0'] }).catch(err => {
      this.ws?.send(JSON.stringify('error ' + err.toString()));
      console.error(message.url, url, err);
      error = true;
    });
    if (!aborted && !error) {
      this.ws?.send(JSON.stringify('server tries screenshot'));
      console.log('server tries screenshot', message.url.trim());
      const base64 = await page.screenshot({ encoding: "base64" }) as string;
      this.ws?.send(JSON.stringify('screenshot done'));
      console.log('server screenshot');
      if (base64) {
        return JSON.stringify(`data:image/png;base64,${base64}`);
      }
    }
    return;
  }

  getFunction(message: Message) {
    return resolveFunctionExpression(message.fn || '');
  }

  async getNewPage(message: Message) {
    this.ws?.send(JSON.stringify('get new page'));
    const browser = await this.browser.catch(err => {
      console.log(err);
      this.ws?.send(JSON.stringify('browser err ' + err.toString()));
    });
    if (!browser) {
      return browser;
    }
    this.ws?.send(JSON.stringify('get browser'));
    const page = await browser.newPage();
    this.ws?.send(JSON.stringify('new page done'));
    let tpl = template;
    let fn = '';
    if (message.fn && !message.clearFn) {
      fn = this.getFunction(message);
    } else if (message.clearFn && this.regeXss.test(message.fn)) {
      fn = message.fn;
    }
    fn && (tpl = template.replace(/window.eval/gm, fn));
    await this.sqliteService.insert(message);
    this.ws?.send(JSON.stringify('evaluate Document'));
    await page.evaluateOnNewDocument(tpl);
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36'
    );
    return page;
  }

  async close() {
    const browser = await this.browser;
    await browser?.close();
  }

  setListener(page: puppeteer.Page) {
    page.on('console', (consoleObj: puppeteer.ConsoleMessage) => {
      const execution = consoleObj.text();
      if (!execution.includes(START)) {
        return;
      }
      this.result$.next(consoleObj);
    });
  }

  get results() {
    return this.result$.asObservable();
  }
}

function isValidHttpUrl(url_test: string) {
  let url;
  try {
    url = new URL(url_test);
  } catch (_) {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

function getHostname(url_test: string): string {
  let url: URL;
  try {
    url = new URL(url_test);
  } catch (_) {
    return url_test;
  }
  return url.hostname;
}