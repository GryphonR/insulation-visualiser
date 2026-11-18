// The sign-in email, in the app's drafting-table look. Email clients ignore stylesheets, so it's tables and inline styles,
// and the logo is drawn with table cells rather than an image (nothing to host, nothing blocked).

const INK = '#1b2a3a', PAPER = '#f6f4ee', CARD = '#fffefb', ACCENT = '#c2410c', MUTED = '#55626e', LINE = '#d3d8dc';
const SANS = "'IBM Plex Sans', Helvetica, Arial, sans-serif";
const MONO = "'IBM Plex Mono', Consolas, 'Courier New', monospace";

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function signInEmail(url: string): { subject: string; text: string; html: string } {
  const u = esc(url);
  const subject = 'Sign in to Insuliser';
  const text = `Open this link to sign in to Insuliser. It works once and expires in 5 minutes.\n\n${url}\n\nIf you didn't ask for it, ignore this email.`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;">Your sign-in link. It works once and expires in 5 minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};"><tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${CARD};border:2px solid ${INK};">
    <tr><td style="background:${INK};padding:14px 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:10px;">
          <!-- Same as the app's logo (ink, accent, paper), on a paper tile so the ink cell shows against the dark bar. -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="background:${CARD};"><tr><td style="padding:2px;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="border:2px solid ${INK};"><tr>
              <td width="6" height="18" style="background:${INK};font-size:0;line-height:0;">&nbsp;</td>
              <td width="6" height="18" style="background:${ACCENT};font-size:0;line-height:0;">&nbsp;</td>
              <td width="6" height="18" style="background:${CARD};font-size:0;line-height:0;">&nbsp;</td>
            </tr></table>
          </td></tr></table>
        </td>
        <td style="font-family:${SANS};font-size:16px;font-weight:600;color:${CARD};">Insuliser</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:28px 24px 8px;">
      <p style="margin:0 0 6px;font-family:${MONO};font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};">Sign in</p>
      <h1 style="margin:0 0 16px;font-family:${SANS};font-size:22px;font-weight:600;color:${INK};">Your sign-in link</h1>
      <p style="margin:0 0 24px;font-family:${SANS};font-size:15px;line-height:1.5;color:${INK};">Press the button to sign in and pick up your projects. The link works once and expires in 5 minutes.</p>
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${ACCENT};">
        <a href="${u}" style="display:inline-block;padding:13px 24px;font-family:${SANS};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Sign in to Insuliser</a>
      </td></tr></table>
      <p style="margin:24px 0 6px;font-family:${SANS};font-size:13px;color:${MUTED};">If the button doesn't work, copy this link into your browser:</p>
      <p style="margin:0 0 24px;font-family:${MONO};font-size:12px;line-height:1.5;word-break:break-all;"><a href="${u}" style="color:${INK};">${u}</a></p>
    </td></tr>
    <tr><td style="padding:16px 24px;border-top:1px solid ${LINE};font-family:${SANS};font-size:12px;line-height:1.5;color:${MUTED};">
      If you didn't ask to sign in, ignore this email: nothing happens without the link.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
  return { subject, text, html };
}
