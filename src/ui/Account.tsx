import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { href } from './route';
import { CLOUD, deleteAccount, sendSignInLink, setConsent, signInWithGoogle, signOut, syncInfo, syncNow, watchSync } from '../engine/sync';

const LABEL: Record<string, string> = {
  terms: 'Finish creating account', syncing: 'Syncing…', synced: 'Saved to cloud', offline: 'Offline – will sync', error: 'Not synced',
};

/** Sign-in and sync status in the header. Only in the cloud build. */
export function Account() {
  const [info, setInfo] = useState(syncInfo);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [google, setGoogle] = useState(false);
  const [signup, setSignup] = useState(false);
  const [terms, setTerms] = useState(false);
  const [updates, setUpdates] = useState(false);
  useEffect(() => watchSync(setInfo), []);
  useEffect(() => {
    if (CLOUD) fetch('/api/config').then((r) => r.json()).then((c) => setGoogle(!!c.google)).catch(() => {});
  }, []);
  // Only shows the link; the worker refuses the admin API to anyone else.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    setIsAdmin(false);
    if (CLOUD && info.email) fetch('/api/admin/me', { credentials: 'same-origin' }).then((r) => setIsAdmin(r.ok)).catch(() => {});
  }, [info.email]);
  if (!CLOUD) return null;

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setMsg('Sending…');
    const err = await sendSignInLink(email.trim(), signup ? { updates } : null);
    setMsg(err ?? `Check ${email.trim()} for a ${signup ? 'link to finish creating your account' : 'sign-in link'}.`);
  };
  const base = import.meta.env.BASE_URL;
  const link = (path: string, text: string) => <a href={`${base}${path}/`} target="_blank" rel="noreferrer">{text}</a>;
  const termsBox = (
    <label className="acct-check"><input type="checkbox" required checked={terms} onChange={(e) => setTerms(e.target.checked)} />
      <span>I agree to the {link('terms', 'terms of use')} and have read the {link('privacy', 'privacy policy')}</span></label>
  );
  const updatesBox = (checked: boolean, set: (v: boolean) => void) => (
    <label className="acct-check"><input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} />
      <span>Email me about new features and updates (optional, unsubscribe any time)</span></label>
  );

  if (!info.email) {
    return (
      <details className="acct">
        <summary className="btn-secondary">Sign in</summary>
        <div className="acct-pop">
          <div className="acct-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={!signup} onClick={() => { setSignup(false); setMsg(null); }}>Sign in</button>
            <button type="button" role="tab" aria-selected={signup} onClick={() => { setSignup(true); setMsg(null); }}>Create account</button>
          </div>
          <p>{signup
            ? 'Create a free account to keep your projects in the cloud and open them on any device.'
            : 'Sign in to sync your projects. Without an account they stay in this browser only.'}</p>
          <form onSubmit={send}>
            <label>Email<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            {signup && termsBox}
            {signup && updatesBox(updates, setUpdates)}
            <button type="submit" className="btn-primary">{signup ? 'Email me a link to create my account' : 'Email me a sign-in link'}</button>
          </form>
          {google && <button type="button" className="btn-secondary" disabled={signup && !terms}
            onClick={async () => setMsg(await signInWithGoogle(signup ? { updates } : null))}>{signup ? 'Create account with Google' : 'Sign in with Google'}</button>}
          <p className="small muted">We keep your email and synced projects. {link('privacy', 'Privacy')}</p>
          {msg && <p role="status">{msg}</p>}
        </div>
      </details>
    );
  }

  if (info.status === 'terms') {
    return (
      <details className="acct" open>
        <summary className="btn-secondary">{LABEL.terms}</summary>
        <form className="acct-pop" onSubmit={async (e) => {
          e.preventDefault();
          if (!(await setConsent(updates, true))) setMsg("Couldn't save that. Check your connection and try again.");
        }}>
          <p>Signed in as <b>{info.email}</b>. To finish creating your account and sync your projects, accept the terms.</p>
          {termsBox}
          {updatesBox(updates, setUpdates)}
          <button type="submit" className="btn-primary">Create account</button>
          <button type="button" className="btn-secondary" onClick={() => void signOut(false)}>Cancel and sign out</button>
          {msg && <p role="alert">{msg}</p>}
        </form>
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
        {updatesBox(!!info.updates, (v) => void setConsent(v).then((ok) => ok || alert("Couldn't save that. Check your connection and try again.")))}
        {isAdmin && <a className="btn-secondary as-btn" href={href('admin')}>Admin</a>}
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
