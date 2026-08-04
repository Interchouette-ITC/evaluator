import type { WebSocket } from 'ws';

import { usePuppeteer, type EvaluateSession } from './browser-engine';
import { PlaywrightEngine } from './playwright.engine';
import { PuppeteerEngine } from './puppeteer.engine';

export function createEvaluateSession(ws?: WebSocket): EvaluateSession {
  if (usePuppeteer()) {
    return new PuppeteerEngine(ws);
  }
  return new PlaywrightEngine(ws);
}
