import { beforeEach, describe, expect, it } from 'vitest';
import { api, MAX_BODY, shared } from './api';
import { testDb } from './d1-shim';
import { MAX_PROJECTS, MAX_SCENARIOS } from '../src/engine/limits';

let db: D1Database;
const call = (user: string, method: string, path: string, body?: string, rev?: number) =>
  api(new Request(`http://x${path}`, { method, body, headers: rev != null ? { 'If-Match': String(rev) } : {} }), db, user, path);

describe('sync API', () => {
  beforeEach(async () => {
    db = testDb();
    await db.prepare("INSERT INTO consent (user_id, terms_at) VALUES ('alice', 1), ('bob', 1)").run();
  });

  it('stores nothing until the terms are accepted, and keeps the updates opt-in changeable', async () => {
    const put = (user: string, b: unknown) => api(new Request('http://x/api/consent', { method: 'PUT', body: JSON.stringify(b) }), db, user, '/api/consent');
    expect((await call('carol', 'PUT', '/api/projects/p1', '{}', 0)).status).toBe(403);
    expect(await (await call('carol', 'GET', '/api/consent')).json()).toEqual({});
    expect((await put('carol', { updates: true })).status).toBe(403); // no terms, no account
    expect((await put('carol', { terms: true })).status).toBe(400);
    expect(await (await put('carol', { terms: true, updates: true })).json()).toMatchObject({ updates: 1 });
    expect((await call('carol', 'PUT', '/api/projects/p1', '{}', 0)).status).toBe(200);
    const first = (await (await call('carol', 'GET', '/api/consent')).json()).termsAt;
    expect(await (await put('carol', { updates: false })).json()).toEqual({ termsAt: first, updates: 0 });
  });

  it('keeps each user to their own projects', async () => {
    expect((await call('alice', 'PUT', '/api/projects/p1', '{"a":1}', 0)).status).toBe(200);
    expect((await call('bob', 'GET', '/api/projects/p1')).status).toBe(404);
    expect(await (await call('bob', 'GET', '/api/projects')).json()).toEqual([]);
    // Bob writing the same id makes his own row; Alice's is untouched.
    expect((await call('bob', 'PUT', '/api/projects/p1', '{"b":2}', 0)).status).toBe(200);
    expect((await (await call('alice', 'GET', '/api/projects/p1')).json()).body).toBe('{"a":1}');
    // Bob can't overwrite or delete Alice's by guessing her rev either: he only ever reaches his own row.
    await call('bob', 'PUT', '/api/projects/p1', '{"b":3}', 1);
    await call('bob', 'DELETE', '/api/projects/p1', undefined, 2);
    expect(await (await call('alice', 'GET', '/api/projects/p1')).json()).toMatchObject({ body: '{"a":1}', rev: 1, deleted: 0 });
  });

  it('refuses a write based on an old rev and hands back the current copy', async () => {
    await call('alice', 'PUT', '/api/projects/p1', '{"v":1}', 0);
    expect(await (await call('alice', 'PUT', '/api/projects/p1', '{"v":2}', 1)).json()).toMatchObject({ rev: 2 });
    const stale = await call('alice', 'PUT', '/api/projects/p1', '{"v":"old"}', 1);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ body: '{"v":2}', rev: 2 });
    expect((await call('alice', 'PUT', '/api/projects/p1', '{"v":"new"}', 0)).status).toBe(409); // "new" item that exists
  });

  it('keeps a deleted project as a tombstone', async () => {
    await call('alice', 'PUT', '/api/projects/p1', '{}', 0);
    expect((await call('alice', 'DELETE', '/api/projects/p1', undefined, 1)).status).toBe(200);
    expect(await (await call('alice', 'GET', '/api/projects')).json()).toMatchObject([{ id: 'p1', rev: 2, deleted: 1 }]);
  });

  it('rejects bad writes', async () => {
    expect((await call('alice', 'PUT', '/api/projects/p1', '{}')).status).toBe(428);
    expect((await call('alice', 'PUT', '/api/projects/p1', 'not json', 0)).status).toBe(400);
    expect((await call('alice', 'PUT', '/api/projects/p1', '42', 0)).status).toBe(400);
    expect((await call('alice', 'PUT', '/api/projects/p1', `{"x":"${'a'.repeat(MAX_BODY)}"}`, 0)).status).toBe(413);
    expect((await call('alice', 'PUT', '/api/data/secrets', '{}', 0)).status).toBe(404);
    expect((await call('alice', 'DELETE', '/api/data/library', undefined, 0)).status).toBe(405);
    expect((await call('alice', 'PUT', '/api/projects/../x', '{}', 0)).status).toBe(404);
  });

  it('holds each user to the beta limits on projects and scenarios', async () => {
    for (let i = 1; i <= MAX_PROJECTS; i++) expect((await call('alice', 'PUT', `/api/projects/p${i}`, '{}', 0)).status).toBe(200);
    expect((await call('alice', 'PUT', '/api/projects/extra', '{}', 0)).status).toBe(403);
    expect((await call('alice', 'PUT', '/api/projects/p1', '{"v":2}', 1)).status).toBe(200); // editing one already there is fine
    expect((await call('bob', 'PUT', '/api/projects/p1', '{}', 0)).status).toBe(200); // the limit is per user
    // Deleting one frees its place, and its tombstone doesn't count.
    await call('alice', 'DELETE', '/api/projects/p2', undefined, 1);
    expect((await call('alice', 'PUT', '/api/projects/extra', '{}', 0)).status).toBe(200);
    expect((await call('alice', 'PUT', '/api/projects/p2', '{}', 2)).status).toBe(403); // bringing the deleted one back would make 6
    const scen = JSON.stringify({ scenarios: Array(MAX_SCENARIOS + 1).fill({}) });
    expect((await call('alice', 'PUT', '/api/projects/p1', scen, 2)).status).toBe(403);
  });

  it('measures the size limit in bytes, not characters', async () => {
    expect((await call('alice', 'PUT', '/api/projects/p1', `{"x":"${'°'.repeat(MAX_BODY / 2 + 10)}"}`, 0)).status).toBe(413);
  });

  it('deletes the account and everything with it, including unused sign-in links', async () => {
    await db.prepare("INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('alice', '', 'a@x.uk', 1, '', '')").run();
    await db.prepare(`INSERT INTO verification (id, identifier, value, expiresAt) VALUES ('v1', 'magic-link:t', '{"type":"magic-link","email":"a@x.uk"}', ''), ('v2', 'magic-link:u', '{"type":"magic-link","email":"b@x.uk"}', '')`).run();
    await call('alice', 'PUT', '/api/projects/p1', '{}', 0);
    await call('bob', 'PUT', '/api/projects/p1', '{}', 0);
    expect((await call('alice', 'DELETE', '/api/account')).status).toBe(200);
    expect((await db.prepare("SELECT user_id FROM items UNION ALL SELECT user_id FROM consent").all()).results).toEqual([{ user_id: 'bob' }, { user_id: 'bob' }]);
    expect((await db.prepare('SELECT id FROM verification').all()).results).toEqual([{ id: 'v2' }]);
  });

  it('shares a snapshot by link: anyone reads it, only its owner lists or stops it', async () => {
    const post = (user: string, b: unknown) => api(new Request('http://x/api/shares', { method: 'POST', body: JSON.stringify(b) }), db, user, '/api/shares');
    expect((await post('carol', { project: 'p1', name: 'A', body: '{}' })).status).toBe(403); // no terms
    expect((await post('alice', { project: 'p1', name: ' ', body: '{}' })).status).toBe(400);
    expect((await post('alice', { project: 'p1', name: 'A', body: 'nope' })).status).toBe(400);
    const s = await (await post('alice', { project: 'p1', name: 'House in M14', body: '{"v":1}' })).json();
    expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await (await shared(db, s.id)).json()).toMatchObject({ name: 'House in M14', body: '{"v":1}' });
    const list = (user: string) => api(new Request('http://x/api/shares?project=p1'), db, user, '/api/shares').then((r) => r.json());
    expect(await list('alice')).toEqual([{ id: s.id, name: 'House in M14', created: s.created }]);
    expect(await list('bob')).toEqual([]);
    await call('bob', 'DELETE', `/api/shares/${s.id}`); // not his
    expect((await shared(db, s.id)).status).toBe(200);
    await call('alice', 'DELETE', `/api/shares/${s.id}`);
    expect((await shared(db, s.id)).status).toBe(404);
  });
});
