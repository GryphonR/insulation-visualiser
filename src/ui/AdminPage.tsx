import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

// Shapes returned by worker/admin.ts.
interface Me { email: string; role: 'owner' | 'admin' }
interface Stats { users: number; new7: number; new30: number; active7: number; active30: number; projects: number; bytes: number; optedIn: number }
interface User { id: string; email: string; name: string; createdAt: string; providers: string | null; lastSeen: string | null; termsAt: number | null; updates: number; projects: number; bytes: number }
interface Admins { owners: string[]; admins: { email: string; addedBy: string; addedAt: number }[] }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { credentials: 'same-origin', ...init, headers: init?.body ? { 'Content-Type': 'application/json' } : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error ?? `Failed (${r.status})`);
  return d as T;
}

const day = (t: string | number | null) => t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const size = (b: number) => b < 1e3 ? `${b} B` : b < 1e6 ? `${(b / 1e3).toFixed(1)} kB` : `${(b / 1e6).toFixed(1)} MB`;
const via = (p: string | null) => p ? p.split(',').map((x) => x === 'google' ? 'Google' : x).join(', ') : 'Email link';

/** #/admin: users and app housekeeping. The worker checks who may see it; this page only hides itself from others. */
export function AdminPage() {
  const [me, setMe] = useState<Me | null | 'no'>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [admins, setAdmins] = useState<Admins | null>(null);
  const [q, setQ] = useState('');
  const [newAdmin, setNewAdmin] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { call<Me>('/api/admin/me').then(setMe, () => setMe('no')); }, []);
  const load = useCallback(() => {
    call<Stats>('/api/admin/stats').then(setStats, (e) => setMsg(e.message));
    call<Admins>('/api/admin/admins').then(setAdmins, (e) => setMsg(e.message));
  }, []);
  useEffect(() => { if (me && me !== 'no') load(); }, [me, load]);
  useEffect(() => {
    if (!me || me === 'no') return;
    const t = setTimeout(() => call<User[]>(`/api/admin/users?q=${encodeURIComponent(q)}`).then(setUsers, (e) => setMsg(e.message)), 250);
    return () => clearTimeout(t);
  }, [me, q]);

  // Runs an action, then reloads everything it could have changed.
  const act = async (f: () => Promise<unknown>, done: string) => {
    try { await f(); setMsg(done); } catch (e) { setMsg((e as Error).message); }
    load();
    call<User[]>(`/api/admin/users?q=${encodeURIComponent(q)}`).then(setUsers, () => {});
  };

  if (me === null) return <p className="muted small">Loading…</p>;
  if (me === 'no') return <section className="card panel"><h2>Admin</h2><p>This page is for admins. Sign in with an admin account to use it.</p></section>;
  const owner = me.role === 'owner';

  const addAdmin = (e: FormEvent) => {
    e.preventDefault();
    const email = newAdmin.trim();
    void act(() => call('/api/admin/admins', { method: 'POST', body: JSON.stringify({ email }) }).then(() => setNewAdmin('')), `${email} is now an admin.`);
  };

  return (
    <>
      <div className="page-title"><h1>Admin</h1><span className="small muted">Signed in as {me.email} ({me.role})</span></div>
      {msg && <p role="status">{msg}</p>}

      <section className="card panel">
        <h2>App</h2>
        {stats && <div className="kpis">
          <div className="kpi"><span className="eb">Users</span><span className="v">{stats.users}</span><span className="small muted">{stats.new7} new in 7 days, {stats.new30} in 30</span></div>
          <div className="kpi"><span className="eb">Active</span><span className="v">{stats.active7}</span><span className="small muted">in 7 days, {stats.active30} in 30</span></div>
          <div className="kpi"><span className="eb">Projects</span><span className="v">{stats.projects}</span><span className="small muted">synced</span></div>
          <div className="kpi"><span className="eb">Stored</span><span className="v">{size(stats.bytes)}</span><span className="small muted">project and library data</span></div>
          <div className="kpi"><span className="eb">Updates opt-in</span><span className="v">{stats.optedIn}</span><span className="small muted">users</span></div>
        </div>}
        <div className="chips">
          <a className="btn-secondary as-btn" href="/api/admin/updates.csv" download>Download updates opt-in list (CSV)</a>
          <button type="button" className="btn-secondary" onClick={() => void act(async () => {
            const r = await call<{ sessions: number; links: number }>('/api/admin/cleanup', { method: 'POST' });
            setMsg(`Cleared ${r.sessions} expired sessions and ${r.links} expired sign-in links.`);
          }, '')}>Clear expired sessions and sign-in links</button>
        </div>
      </section>

      <section className="card panel">
        <h2>Users</h2>
        <label className="hf"><span className="eyebrow">Search by email</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <div className="h-table-wrap"><table className="h-table">
          <thead><tr><th>Email</th><th>Name</th><th>Signed up</th><th>Last seen</th><th>Sign-in</th><th>Terms</th><th>Updates</th><th className="n">Projects</th><th className="n">Stored</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td><td>{u.name || '—'}</td><td>{day(u.createdAt)}</td><td>{day(u.lastSeen)}</td><td>{via(u.providers)}</td>
                <td>{u.termsAt ? day(u.termsAt) : 'Not accepted'}</td><td>{u.updates ? 'Yes' : 'No'}</td>
                <td className="n mono">{u.projects}</td><td className="n mono">{size(u.bytes)}</td>
                <td><div className="chips">
                  <button type="button" className="btn-secondary" disabled={u.email === me.email}
                    onClick={() => void act(() => call(`/api/admin/users/${u.id}/signout`, { method: 'POST' }), `Signed ${u.email} out everywhere.`)}>Sign out</button>
                  <button type="button" className="btn-danger" disabled={u.email === me.email} onClick={() => {
                    if (prompt(`Delete ${u.email} and every project they have in the cloud? This can't be undone. Type their email to confirm.`)?.trim().toLowerCase() !== u.email.toLowerCase()) return;
                    void act(() => call(`/api/admin/users/${u.id}`, { method: 'DELETE' }), `Deleted ${u.email}.`);
                  }}>Delete…</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {users.length === 0 && <p className="small muted">No users match.</p>}
        {users.length === 200 && <p className="small muted">Showing the newest 200. Search to find others.</p>}
      </section>

      {admins && <section className="card panel">
        <h2>Admins</h2>
        <p className="small muted">Owners are set by the ADMIN_EMAILS secret and can only be changed there. {owner ? 'You can add and remove admins.' : 'Only an owner can add or remove admins.'}</p>
        <table className="h-table">
          <thead><tr><th>Email</th><th>Role</th><th>Added</th><th /></tr></thead>
          <tbody>
            {admins.owners.map((e) => <tr key={e}><td>{e}</td><td>Owner</td><td>—</td><td /></tr>)}
            {admins.admins.map((a) => (
              <tr key={a.email}><td>{a.email}</td><td>Admin</td><td>{day(a.addedAt)} by {a.addedBy}</td>
                <td>{owner && <button type="button" className="btn-secondary" onClick={() => {
                  if (confirm(`Remove ${a.email} as an admin? They'll be signed out.`)) void act(() => call(`/api/admin/admins/${encodeURIComponent(a.email)}`, { method: 'DELETE' }), `${a.email} is no longer an admin.`);
                }}>Remove</button>}</td></tr>
            ))}
          </tbody>
        </table>
        {owner && <form className="chips" onSubmit={addAdmin}>
          <label className="hf"><span className="eyebrow">Add an admin by email</span>
            <input type="email" required value={newAdmin} onChange={(e) => setNewAdmin(e.target.value)} /></label>
          <button type="submit" className="btn-primary">Add admin</button>
        </form>}
        {owner && <p className="small muted">They become an admin when they sign in with that address. Admins can sign out and delete any user except owners and other admins.</p>}
      </section>}
    </>
  );
}
