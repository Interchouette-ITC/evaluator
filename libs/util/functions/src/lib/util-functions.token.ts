import { dirname, join, resolve } from 'path';
import { mkdirSync } from 'fs';

/**
 * Writable catalog path — no __dirname /dist/ string surgery.
 * Priority: FUNCTIONS_PATH → next to SQLITE_PATH → cwd/db/functions.json
 */
export function resolveFunctionsPath(): string {
  const fromEnv = process.env['FUNCTIONS_PATH']?.trim();
  if (fromEnv) {
    return resolve(fromEnv);
  }
  const sqlite = process.env['SQLITE_PATH']?.trim();
  if (sqlite) {
    return join(dirname(resolve(sqlite)), 'functions.json');
  }
  return resolve(process.cwd(), 'db', 'functions.json');
}

/** Ensure parent dir exists (Docker volume /app/db, local ./db). */
export function ensureFunctionsDir(path: string = resolveFunctionsPath()): void {
  mkdirSync(dirname(path), { recursive: true });
}

/** @deprecated use resolveFunctionsPath() */
export const functions_path = resolveFunctionsPath();
