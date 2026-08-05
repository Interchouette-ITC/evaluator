import * as sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { Message } from '@evaluator/shared-types';

const DEFAULT_DB_PATH = resolve(
  process.env['SQLITE_PATH'] || 'db/database.db'
);

export class SqliteService {
  private db!: Database<sqlite3.Database, sqlite3.Statement>;

  private async open() {
    mkdirSync(dirname(DEFAULT_DB_PATH), { recursive: true });
    this.db = await open({
      filename: DEFAULT_DB_PATH,
      driver: sqlite3.Database,
    });
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS message (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT,
        function TEXT
      )
    `);
  }

  private async close() {
    if (this.db) {
      await this.db.close();
    }
  }

  async insert(message: Message) {
    console.error('insert', message.url);
    try {
      await this.open();
    } catch (error) {
      console.error('sqlite open failed', DEFAULT_DB_PATH, error);
      return;
    }
    try {
      const stmt = await this.db.prepare(
        'INSERT INTO message (url, function) VALUES (?, ?)'
      );
      await stmt.run(message.url, message.fn);
      await stmt.finalize();
    } catch (error) {
      console.error('sqlite insert failed', error);
    } finally {
      await this.close().catch((error) => console.error(error));
    }
  }
}
