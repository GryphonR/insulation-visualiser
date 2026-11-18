// The signed-in user's synced items. `userId` always comes from the session, never from the request.
// Every write names the rev it was based on (If-Match); a stale one gets 409 and the server's copy, so nothing is overwritten unseen.

// D1 rows cap at 2 MB. Traced plan images are kept off the server by the client (see withoutImages in src/engine/sync.ts).
export const MAX_BODY = 1_900_000;
export const DATA_KEYS = ['materials', 'library', 'favorites'];

export interface Row { id: string; rev: number; updated: number; deleted: number; body?: string }

const json = (v: unknown, status = 200) => Response.json(v, { status });

export async function api(req: Request, db: D1Database, userId: string, path: string): Promise<Response> {
  if (path === '/api/account' && req.method === 'DELETE') {
    await db.batch([
      db.prepare('DELETE FROM items WHERE user_id = ?').bind(userId),
      db.prepare('DELETE FROM session WHERE userId = ?').bind(userId),
      db.prepare('DELETE FROM account WHERE userId = ?').bind(userId),
      db.prepare('DELETE FROM user WHERE id = ?').bind(userId),
    ]);
    return json({ ok: true });
  }
  const m = path.match(/^\/api\/(projects|data)(?:\/([\w-]{1,64}))?$/);
  if (!m) return json({ error: 'not found' }, 404);
  const [, kind, id] = m;
  if (kind === 'data' && id && !DATA_KEYS.includes(id)) return json({ error: 'not found' }, 404);

  if (!id) {
    if (req.method !== 'GET') return json({ error: 'method' }, 405);
    const { results } = await db.prepare('SELECT id, rev, updated, deleted FROM items WHERE user_id = ? AND kind = ?').bind(userId, kind).all<Row>();
    return json(results);
  }

  const current = () => db.prepare('SELECT id, body, rev, updated, deleted FROM items WHERE user_id = ? AND kind = ? AND id = ?').bind(userId, kind, id).first<Row>();
  if (req.method === 'GET') {
    const r = await current();
    return r ? json(r) : json({ error: 'not found' }, 404);
  }
  if (req.method !== 'PUT' && !(req.method === 'DELETE' && kind === 'projects')) return json({ error: 'method' }, 405);

  const base = Number(req.headers.get('If-Match'));
  if (!req.headers.has('If-Match') || !Number.isInteger(base) || base < 0) return json({ error: 'If-Match rev required' }, 428);
  let body = '';
  if (req.method === 'PUT') {
    body = await req.text();
    if (body.length > MAX_BODY) return json({ error: 'too large' }, 413);
    try {
      const v = JSON.parse(body);
      if (!v || typeof v !== 'object') throw new Error();
    } catch {
      return json({ error: 'body must be a JSON object or array' }, 400);
    }
  }
  const now = Date.now(), deleted = req.method === 'DELETE' ? 1 : 0;
  const res = base === 0
    ? await db.prepare('INSERT INTO items (user_id, kind, id, body, rev, updated, deleted) VALUES (?, ?, ?, ?, 1, ?, ?) ON CONFLICT DO NOTHING')
      .bind(userId, kind, id, body, now, deleted).run()
    : await db.prepare('UPDATE items SET body = ?, rev = rev + 1, updated = ?, deleted = ? WHERE user_id = ? AND kind = ? AND id = ? AND rev = ?')
      .bind(body, now, deleted, userId, kind, id, base).run();
  if (!res.meta.changes) return json(await current(), 409);
  return json({ id, rev: base + 1, updated: now, deleted });
}
