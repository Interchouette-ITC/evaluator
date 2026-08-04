import type { Message } from '@evaluator/shared-types';
import type { Observable } from 'rxjs';
import type { ConsoleHit } from './console-hit';

export interface EvaluateSession {
  goto(message: Message): Promise<string | undefined>;
  close(): Promise<void>;
  readonly results: Observable<ConsoleHit>;
}

export const CHROMIUM_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
] as const;

export const EVALUATE_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36';

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
