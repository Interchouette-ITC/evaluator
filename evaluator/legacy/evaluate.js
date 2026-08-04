'use strict';

/**
 * Minimal Puppeteer evaluate — teaching sample of the product idea.
 * Production path: Nest gateway + libs/util/puppeteer (Playwright by default).
 *
 * Usage:
 *   node evaluate.js <url> [function] [timeout_ms] [search_pattern]
 */
const puppeteer = require('puppeteer');
const { START, template } = require('./eval.template.js');

/** Keep in sync with libs/util/puppeteer EVALUATE_USER_AGENT when updating. */
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT_MS = 240_000;

function getHostname(urlTest) {
  try {
    return new URL(urlTest).hostname;
  } catch {
    return urlTest;
  }
}

function buildTemplate(fn) {
  if (!fn) {
    return template;
  }
  return template.replace(/window\.eval/gm, fn);
}

function printConsoleHit(text, searchPattern) {
  if (!text.includes(START)) {
    return;
  }
  if (searchPattern && !text.includes(searchPattern)) {
    return;
  }
  const raw = text.replace(START, '');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error('JSON parse error:', err);
    return;
  }
  if (!Array.isArray(parsed)) {
    return;
  }
  for (const element of parsed) {
    if (element) {
      console.log(String(element).trim());
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const url = (
    args[0] ||
    'https://www.w3schools.com/jsref/tryit.asp?filename=tryjsref_eval'
  ).trim();
  const fn = args[1] || 'window.eval';
  const timeout = Number(args[2]) || DEFAULT_TIMEOUT_MS;
  const searchPattern = args[3] || '';
  const hostname = getHostname(url);

  const launchOpts = {
    headless: true,
    acceptInsecureCerts: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  };
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (executablePath) {
    launchOpts.executablePath = executablePath;
  }

  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setRequestInterception(true);
    await page.evaluateOnNewDocument(buildTemplate(fn));

    page.on('request', (request) => {
      if (
        request.isNavigationRequest() &&
        request.frame() === page.mainFrame() &&
        !request.url().includes(hostname)
      ) {
        console.error('aborted', request.url());
        request.abort('aborted');
      } else {
        request.continue();
      }
    });

    page.on('console', (msg) => {
      printConsoleHit(msg.text(), searchPattern);
    });

    await page.goto(url, { timeout, waitUntil: 'domcontentloaded' }).catch((err) => {
      console.error('Error with', url, err);
    });

    await page.close();
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
