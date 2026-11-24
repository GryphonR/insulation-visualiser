// The admin page's API. Owners are the emails in the ADMIN_EMAILS secret; admins are rows in the admins table, which only owners change.
// Nothing here returns a project's contents: admins see how much someone stores, never what.

import { deleteUser } from './api';

export type Role = 'owner' | 'admin';

const json = (v: unknown, status = 200) => Response.json(v, { status });
const DAY = 86_400_000;

export const ownerList = (secret = '') => secret.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

export async function roleOf(db: D1Database, owners: string[], email: string): Promise<Role | null> {
  const e = email.toLowerCase();
  if (owners.includes(e)) return 'owner';
  return (await db.prepare('SELECT 1 FROM admins WHERE email = ?').bind(e).first()) ? 'admin' : null;
}

// Spreadsheets run a cell that starts with = + - @ as a formula.
const csvCell = (v: unknown) => { const s = String(v ?? ''); return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`; };

export async function admin(req: Request, db: D1Database, me: { id: string; email: string; role: Role }, owners: string[], path: string): Promise<Response> {
  const url = new URL(req.url), m = req.method;
  const nowIso = (ago = 0) => new Date(Date.now() - ago).toISOString();

  if (path === '/api/admin/me' && m === 'GET') return json({ email: me.email, role: me.role });

  if (path === '/api/admin/stats' && m === 'GET') {
    // Better Auth stores its dates as ISO strings, which sort as text.
    return json(await db.prepare(`SELECT
      (SELECT COUNT(*) FROM user) AS users,
      (SELECT COUNT(*) FROM user WHERE createdAt >= ?1) AS new7,
      (SELECT COUNT(*) FROM user WHERE createdAt >= ?2) AS new30,
      (SELECT COUNT(DISTINCT userId) FROM session WHERE updatedAt >= ?1) AS active7,
      (SELECT COUNT(DISTINCT userId) FROM session WHERE updatedAt >= ?2) AS active30,
      (SELECT COUNT(*) FROM items WHERE kind = 'projects' AND deleted = 0) AS projects,
      (SELECT COALESCE(SUM(length(CAST(body AS BLOB))), 0) FROM items) AS bytes,
      (SELECT COUNT(*) FROM consent WHERE updates = 1) AS optedIn`).bind(nowIso(7 * DAY), nowIso(30 * DAY)).first());
  }

  if (path === '/api/admin/users' && m === 'GET') {
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase().replace(/[\\%_]/g, '\\$&');
    // shortcut: newest 200 only, no paging; add an offset when there are more users than that.
    const { results } = await db.prepare(`SELECT u.id, u.email, u.name, u.createdAt,
      (SELECT group_concat(providerId) FROM account a WHERE a.userId = u.id) AS providers,
      (SELECT MAX(updatedAt) FROM session s WHERE s.userId = u.id) AS lastSeen,
      c.terms_at AS termsAt, COALESCE(c.updates, 0) AS updates,
      (SELECT COUNT(*) FROM items i WHERE i.user_id = u.id AND i.kind = 'projects' AND i.deleted = 0) AS projects,
      (SELECT COALESCE(SUM(length(CAST(body AS BLOB))), 0) FROM items i WHERE i.user_id = u.id) AS bytes
      FROM user u LEFT JOIN consent c ON c.user_id = u.id
      WHERE lower(u.email) LIKE ? ESCAPE '\\' ORDER BY u.createdAt DESC LIMIT 200`).bind(`%${q}%`).all();
    return json(results);
  }

  const um = path.match(/^\/api\/admin\/users\/([\w-]{1,64})(\/signout)?$/);
  if (um && (m === 'DELETE' || (m === 'POST' && um[2]))) {
    const [, id, signout] = um;
    if (id === me.id) return json({ error: 'Use your own account menu for your own account.' }, 400);
    const t = await db.prepare('SELECT email FROM user WHERE id = ?').bind(id).first<{ email: string }>();
    if (!t) return json({ error: 'not found' }, 404);
    // Owners can only be changed by editing the secret; admins only by an owner.
    const tr = await roleOf(db, owners, t.email);
    if (tr === 'owner' || (tr === 'admin' && me.role !== 'owner')) return json({ error: 'Only an owner can do that to an admin, and nobody can to an owner.' }, 403);
    if (signout) await db.prepare('DELETE FROM session WHERE userId = ?').bind(id).run();
    else await deleteUser(db, id);
    return json({ ok: true });
  }

  if (path === '/api/admin/updates.csv' && m === 'GET') {
    const { results } = await db.prepare(`SELECT u.email, u.name, c.updates_at AS since FROM consent c JOIN user u ON u.id = c.user_id
      WHERE c.updates = 1 ORDER BY u.email`).all<{ email: string; name: string; since: number | null }>();
    const rows = [['email', 'name', 'opted_in'], ...results.map((r) => [r.email, r.name, r.since ? new Date(r.since).toISOString() : ''])];
    return new Response(rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n', {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="insuliser-updates-optin.csv"', 'Cache-Control': 'no-store' },
    });
  }

  if (path === '/api/admin/cleanup' && m === 'POST') {
    // Tombstones stay: a device that has been offline a long time needs them to learn a project was deleted.
    const now = nowIso();
    const [s, v] = await db.batch([
      db.prepare('DELETE FROM session WHERE expiresAt < ?').bind(now),
      db.prepare('DELETE FROM verification WHERE expiresAt < ?').bind(now),
    ]);
    return json({ sessions: s.meta.changes, links: v.meta.changes });
  }

  if (path === '/api/admin/admins' && m === 'GET') {
    const { results } = await db.prepare('SELECT email, added_by AS addedBy, added_at AS addedAt FROM admins ORDER BY email').all();
    return json({ owners, admins: results });
  }
  const am = path.match(/^\/api\/admin\/admins(?:\/([^/]+))?$/);
  if (am && (m === 'POST' || m === 'DELETE')) {
    if (me.role !== 'owner') return json({ error: 'Only an owner can change who is an admin.' }, 403);
    if (m === 'POST') {
      const b = await req.json().catch(() => null) as { email?: unknown } | null;
      const email = typeof b?.email === 'string' ? b.email.trim().toLowerCase() : '';
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'That isn\'t an email address.' }, 400);
      if (owners.includes(email)) return json({ error: 'That address is already an owner.' }, 400);
      await db.prepare('INSERT INTO admins (email, added_by, added_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING').bind(email, me.email.toLowerCase(), Date.now()).run();
      return json({ ok: true });
    }
    const email = decodeURIComponent(am[1] ?? '').toLowerCase();
    const r = await db.prepare('DELETE FROM admins WHERE email = ?').bind(email).run();
    if (!r.meta.changes) return json({ error: 'not found' }, 404);
    // Their open sessions would otherwise keep the page open until they expire; signing them out makes the removal take hold now.
    await db.prepare('DELETE FROM session WHERE userId IN (SELECT id FROM user WHERE lower(email) = ?)').bind(email).run();
    return json({ ok: true });
  }

  return json({ error: 'not found' }, 404);
}
