import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { CLOUD, deleteAccount, sendSignInLink, signInWithGoogle, signOut, syncInfo, syncNow, watchSync } from '../engine/sync';

const LABEL: Record<string, string> = {
  syncing: 'Syncing…', synced: 'Saved to cloud', offline: 'Offline – will sync', error: 'Not synced',
};

/** Sign-in and sync status in the header. Only in the cloud build. */
export function Account() {
  const [info, setInfo] = useState(syncInfo);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [google, setGoogle] = useState(false);
  useEffect(() => watchSync(setInfo), []);
  useEffect(() => {
    if (CLOUD) fetch('/api/config').then((r) => r.json()).then((c) => setGoogle(!!c.google)).catch(() => {});
  }, []);
  if (!CLOUD) return null;

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setMsg('Sending…');
    const err = await sendSignInLink(email.trim());
    setMsg(err ?? `Check ${email.trim()} for a sign-in link.`);
  };

  if (!info.email) {
    return (
      <details className="acct">
        <summary className="btn-secondary">Sign in</summary>
        <div className="acct-pop">
          <p>Sign in to keep your projects in the cloud and open them on any device. Without an account they stay in this browser only.</p>
          <form onSubmit={send}>
            <label>Email<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <button type="submit" className="btn-primary">Email me a sign-in link</button>
          </form>
          {google && <button type="button" className="btn-secondary" onClick={async () => setMsg(await signInWithGoogle())}>Continue with Google</button>}
          <p className="small muted">We keep your email and synced projects. <a href={`${import.meta.env.BASE_URL}privacy/`} target="_blank" rel="noreferrer">Privacy</a></p>
          {msg && <p role="status">{msg}</p>}
        </div>
      </details>
    );
  }

  return (
    <details className="acct">
      <summary className="btn-secondary" title={info.message ?? LABEL[info.status]}>
        <span className={`acct-dot ${info.status}`} aria-hidden="true" />{LABEL[info.status] ?? info.status}
      </summary>
      <div className="acct-pop">
        <p>Signed in as <b>{info.email}</b></p>
        {info.message && <p role="alert">{info.message}</p>}
        <button type="button" className="btn-secondary" onClick={() => void syncNow()}>Sync now</button>
        <button type="button" className="btn-secondary" onClick={() => void signOut(false)}>Sign out</button>
        <button type="button" className="btn-secondary" onClick={() => void signOut(true)} title="For a shared computer">Sign out and remove from this device</button>
        <button type="button" className="btn-danger" onClick={async () => {
          if (!confirm('Delete your account and every project stored in the cloud? Projects on this device stay. This can\'t be undone.')) return;
          if (!(await deleteAccount())) alert('Couldn\'t delete the account. Check your connection and try again.');
        }}>Delete account…</button>
      </div>
    </details>
  );
}
