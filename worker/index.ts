// Cloudflare Worker: sign-in (Better Auth: email magic link + Google) and the sync API. The built app itself is served as static assets.
import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins/magic-link';
import { api } from './api';
import { signInEmail } from './email';

export interface Env {
  DB: D1Database;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
}

const isLocal = (env: Env) => /^http:\/\/localhost(:\d+)?$/.test(env.BETTER_AUTH_URL);

async function sendLink(env: Env, email: string, url: string) {
  if (!env.RESEND_API_KEY) {
    // Local dev has no mail sender: the link goes to the wrangler console. Never on a real deployment.
    if (isLocal(env)) { console.log(`Sign-in link for ${email}: ${url}`); return; }
    throw new Error('RESEND_API_KEY is not set');
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: email, ...signInEmail(url) }),
  });
  if (!r.ok) throw new Error(`Sending the sign-in email failed: ${r.status}`);
}

const auth = (env: Env) => betterAuth({
  appName: 'Insuliser',
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: env.DB,
  socialProviders: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
    : {},
  plugins: [magicLink({ storeToken: 'hashed', sendMagicLink: ({ email, url }) => sendLink(env, email, url) })],
});

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const a = auth(env);
    if (url.pathname.startsWith('/api/auth/')) return a.handler(req);
    if (url.pathname === '/api/config') return Response.json({ google: !!env.GOOGLE_CLIENT_ID });
    // Writes must come from the app's own pages (cookies alone would let another site's form try).
    const origin = req.headers.get('Origin');
    if (req.method !== 'GET' && origin && origin !== new URL(env.BETTER_AUTH_URL).origin) return Response.json({ error: 'origin' }, { status: 403 });
    const s = await a.api.getSession({ headers: req.headers });
    if (!s) return Response.json({ error: 'signed out' }, { status: 401 });
    return api(req, env.DB, s.user.id, url.pathname);
  },
} satisfies ExportedHandler<Env>;
