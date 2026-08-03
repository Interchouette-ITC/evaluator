import type { WebSocket } from 'ws';

import { usePlaywright, type EvaluateSession } from './browser-engine';
import { PlaywrightEngine } from './playwright.engine';
import { PuppeteerEngine } from './puppeteer.engine';

export function createEvaluateSession(ws?: WebSocket): EvaluateSession {
  if (usePlaywright()) {
    return new PlaywrightEngine(ws);
  }
  return new PuppeteerEngine(ws);
}
