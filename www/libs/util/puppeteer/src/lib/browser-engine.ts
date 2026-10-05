import type { Message } from '@evaluator/shared-types';
import type { Observable } from 'rxjs';
import type { ConsoleHit } from './console-hit';

export type GotoOpts = {
  /** Default true. Batch must pass false — PNG base64 retains hundreds of MB. */
  screenshot?: boolean;
  /**
   * Default `networkidle` (single evaluate / UI). Batch should use `load` —
   * storefronts never go idle and keep Chromium thrashing for minutes.
   */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
};

export interface EvaluateSession {
  goto(message: Message, opts?: GotoOpts): Promise<string | undefined>;
  close(): Promise<void>;
  readonly results: Observable<ConsoleHit>;
}

export const CHROMIUM_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-extensions',
  '--renderer-process-limit=1',
  '--js-flags=--max-old-space-size=128',
] as const;

const DEFAULT_MAX_RSS_MB = 280;

/** When false, evaluate skips PNG capture (saves RAM on small hosts). */
export function screenshotsEnabled(): boolean {
  const v = process.env['EVALUATOR_SCREENSHOT'];
  if (v !== undefined && v !== '') {
    return v === '1' || v === 'true' || v === 'TRUE';
  }
  return process.env['NODE_ENV'] !== 'production';
}

export function maxRssBytes(): number {
  const raw = process.env['EVALUATOR_MAX_RSS_MB'];
  const mb = raw ? Number(raw) : DEFAULT_MAX_RSS_MB;
  if (!Number.isFinite(mb) || mb <= 0) {
    return DEFAULT_MAX_RSS_MB * 1024 * 1024;
  }
  return mb * 1024 * 1024;
}

export const EVALUATE_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

export const EVALUATE_TIMEOUT_MS = 240000;

export function chromiumExecutablePath(): string | undefined {
  return process.env['PUPPETEER_EXECUTABLE_PATH'] || undefined;
}

/** Playwright is the default. Set USE_PUPPETEER=1 (or true) to force Puppeteer. */
export function usePuppeteer(): boolean {
  const v = process.env['USE_PUPPETEER'];
  return v === '1' || v === 'true' || v === 'TRUE';
}

export function isValidHttpUrl(url_test: string): boolean {
  let url: URL;
  try {
    url = new URL(url_test);
  } catch {
    return false;
  }
  return url.protocol === 'http:' || url.protocol === 'https:';
}

export function getHostname(url_test: string): string {
  try {
    return new URL(url_test).hostname;
  } catch {
    return url_test;
  }
}
