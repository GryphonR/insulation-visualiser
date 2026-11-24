// Tests only: Node's built-in SQLite behind the bits of the D1 API the worker uses, with the real migrations applied.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Required, not imported: Vite 5 doesn't know node:sqlite as a builtin.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

export function testDb(): D1Database {
  const db = new DatabaseSync(':memory:');
  for (const f of ['0001_init.sql', '0002_consent.sql', '0003_admins.sql']) db.exec(readFileSync(new URL(`./migrations/${f}`, import.meta.url), 'utf8'));
  const stmt = (sql: string, args: any[] = []): any => ({
    bind: (...a: any[]) => stmt(sql, a),
    first: async () => { const r = db.prepare(sql).get(...args); return r ? { ...r } : null; },
    all: async () => ({ results: db.prepare(sql).all(...args).map((r: object) => ({ ...r })) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  });
  return { prepare: (sql: string) => stmt(sql), batch: async (ss: any[]) => Promise.all(ss.map((s) => s.run())) } as unknown as D1Database;
}
