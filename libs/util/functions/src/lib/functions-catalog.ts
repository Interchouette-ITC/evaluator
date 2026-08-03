import { readFileSync, writeFileSync, existsSync } from 'fs';
import { Fn } from '@evaluator/shared-types';
import { Entries } from './entries';
import { ensureFunctionsDir, resolveFunctionsPath } from './util-functions.token';

let memoryCache: Entries | null = null;

/** Disk / memory only — safe for the Express gateway bundle (no jsdom). */
export function readFunctionsCatalog(
  path: string = resolveFunctionsPath()
): Entries | null {
  if (memoryCache) {
    return memoryCache;
  }
  if (!existsSync(path)) {
    return null;
  }
  try {
    memoryCache = JSON.parse(readFileSync(path, 'utf8')) as Entries;
    return memoryCache;
  } catch (err) {
    console.error('functions catalog parse failed', path, err);
    return null;
  }
}

export function setFunctionsCatalogCache(entries: Entries): void {
  memoryCache = entries;
}

export function persistFunctionsCatalog(
  entries: Entries,
  path: string = resolveFunctionsPath()
): void {
  try {
    ensureFunctionsDir(path);
    writeFileSync(path, JSON.stringify(entries));
    memoryCache = entries;
  } catch (err) {
    console.error('functions catalog write failed', path, err);
  }
}

/**
 * Resolve UI sha256 → `Group.property` (e.g. window.eval).
 * Returns empty string if catalog missing (Nest generates it on /api/functions).
 */
export function resolveFunctionExpression(fnSha256: string): string {
  const functions = readFunctionsCatalog();
  if (!functions || !fnSha256) {
    return '';
  }
  let fnGroup = '';
  const func = Object.values(functions)
    .map((group: Fn[], index: number) => {
      const groupfound = group.find((fn: Fn) => fn.sha256 === fnSha256);
      if (groupfound) {
        fnGroup = Object.keys(functions)[index];
      }
      return groupfound;
    })
    .filter(Boolean)
    .pop();
  if (func?.prototype) {
    fnGroup = fnGroup.replace('String', 'String.prototype');
  }
  return [fnGroup, func?.property].filter(Boolean).join('.');
}
