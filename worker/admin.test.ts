import { beforeEach, describe, expect, it } from 'vitest';
import { admin, ownerList, roleOf } from './admin';
import type { Role } from './admin';
import { api } from './api';
import { testDb } from './d1-shim';

let db: D1Database;
const owners = ownerList(' Olive@x.uk, ');
const EMAIL: Record<string, string> = { olive: 'olive@x.uk', adam: 'adam@x.uk', bob: 'bob@x.uk', amy: 'amy@x.uk' };

// As index.ts does it: no role, no admin API.
async function call(user: string, method: string, path: string, body?: unknown) {
  const role = await roleOf(db, owners, EMAIL[user]);
  if (!role) return Response.json({ error: 'not found' }, { status: 404 });
  const req = new Request(`http://x${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  return admin(req, db, { id: user, email: EMAIL[user], role: role as Role }, owners, new URL(req.url).pathname);
}
const rows = async (sql: string) => (await db.prepare(sql).all()).results;

describe('admin API', () => {
  beforeEach(async () => {
    db = testDb();
    for (const [id, email] of Object.entries(EMAIL)) {
      await db.prepare("INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, '', ?, 1, ?, '')").bind(id, email, new Date().toISOString()).run();
      await db.prepare("INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES (?, '2999-01-01T00:00:00.000Z', ?, '', ?, ?)").bind(`s-${id}`, `t-${id}`, new Date().toISOString(), id).run();
      await db.prepare('INSERT INTO consent (user_id, terms_at, updates) VALUES (?, 1, ?)').bind(id, id === 'bob' ? 1 : 0).run();
    }
    await db.prepare("INSERT INTO admins (email, added_by, added_at) VALUES ('adam@x.uk', 'olive@x.uk', 1)").run();
    await api(new Request('http://x', { method: 'PUT', body: '{"secret":"walls"}', headers: { 'If-Match': '0' } }), db, 'bob', '/api/projects/p1');
  });

  it('reads owners from the secret and admins from the table, and nobody else', async () => {
    expect(await roleOf(db, owners, 'OLIVE@x.uk')).toBe('owner');
    expect(await roleOf(db, owners, 'adam@x.uk')).toBe('admin');
    expect(await roleOf(db, owners, 'bob@x.uk')).toBeNull();
    expect(ownerList(undefined)).toEqual([]);
    expect((await call('bob', 'GET', '/api/admin/users')).status).toBe(404);
  });

  it('lists users with how much they store, never what', async () => {
    const list = await (await call('adam', 'GET', '/api/admin/users?q=BOB')).json();
    expect(list).toMatchObject([{ id: 'bob', email: 'bob@x.uk', projects: 1, bytes: 18, updates: 1 }]);
    expect(JSON.stringify(list)).not.toContain('walls');
    expect(await (await call('adam', 'GET', '/api/admin/users?q=%25')).json()).toEqual([]); // % is a literal, not a wildcard
    expect(await (await call('adam', 'GET', '/api/admin/stats')).json()).toMatchObject({ users: 4, new7: 4, active7: 4, projects: 1, bytes: 18, optedIn: 1 });
  });

  it('signs a user out and deletes their account', async () => {
    expect((await call('adam', 'POST', '/api/admin/users/bob/signout')).status).toBe(200);
    expect(await rows("SELECT id FROM session WHERE userId = 'bob'")).toEqual([]);
    expect((await call('adam', 'DELETE', '/api/admin/users/bob')).status).toBe(200);
    expect(await rows("SELECT id FROM user WHERE id = 'bob' UNION ALL SELECT user_id FROM items")).toEqual([]);
    expect((await call('adam', 'DELETE', '/api/admin/users/bob')).status).toBe(404);
  });

  it('protects owners from everyone, admins from other admins, and yourself from the admin page', async () => {
    expect((await call('adam', 'DELETE', '/api/admin/users/olive')).status).toBe(403);
    expect((await call('olive', 'POST', '/api/admin/admins', { email: 'amy@x.uk' })).status).toBe(200);
    expect((await call('adam', 'POST', '/api/admin/users/amy/signout')).status).toBe(403);
    expect((await call('olive', 'POST', '/api/admin/users/amy/signout')).status).toBe(200);
    expect((await call('adam', 'DELETE', '/api/admin/users/adam')).status).toBe(400);
  });

  it('lets only owners change admins, and removing one signs them out', async () => {
    expect((await call('adam', 'POST', '/api/admin/admins', { email: 'bob@x.uk' })).status).toBe(403);
    expect((await call('olive', 'POST', '/api/admin/admins', { email: 'not an email' })).status).toBe(400);
    expect((await call('olive', 'POST', '/api/admin/admins', { email: 'olive@x.uk' })).status).toBe(400);
    expect((await call('olive', 'POST', '/api/admin/admins', { email: ' New@X.uk ' })).status).toBe(200); // before they sign up
    expect(await (await call('adam', 'GET', '/api/admin/admins')).json()).toMatchObject({ owners: ['olive@x.uk'], admins: [{ email: 'adam@x.uk' }, { email: 'new@x.uk', addedBy: 'olive@x.uk' }] });
    expect((await call('adam', 'DELETE', '/api/admin/admins/adam%40x.uk')).status).toBe(403);
    expect((await call('olive', 'DELETE', '/api/admin/admins/adam%40x.uk')).status).toBe(200);
    expect(await roleOf(db, owners, 'adam@x.uk')).toBeNull();
    expect(await rows("SELECT id FROM session WHERE userId = 'adam'")).toEqual([]);
    expect((await call('olive', 'DELETE', '/api/admin/admins/adam%40x.uk')).status).toBe(404);
  });

  it('drops admin rights when the account is deleted', async () => {
    await api(new Request('http://x', { method: 'DELETE' }), db, 'adam', '/api/account');
    expect(await roleOf(db, owners, 'adam@x.uk')).toBeNull();
  });

  it('exports the updates opt-in list as CSV with formula cells defused', async () => {
    await db.prepare("UPDATE user SET name = '=HYPERLINK(1)' WHERE id = 'bob'").run();
    const r = await call('olive', 'GET', '/api/admin/updates.csv');
    expect(r.headers.get('Content-Type')).toContain('text/csv');
    expect(await r.text()).toBe(`"email","name","opted_in"\r\n"bob@x.uk","'=HYPERLINK(1)",""\r\n`);
  });

  it('clears expired sessions and sign-in links', async () => {
    await db.prepare("INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES ('old', '2000-01-01T00:00:00.000Z', 'old', '', '', 'bob')").run();
    await db.prepare("INSERT INTO verification (id, identifier, value, expiresAt) VALUES ('v', 'i', '{}', '2000-01-01T00:00:00.000Z')").run();
    expect(await (await call('adam', 'POST', '/api/admin/cleanup')).json()).toEqual({ sessions: 1, links: 1 });
  });
});
