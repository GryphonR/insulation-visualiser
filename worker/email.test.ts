import { describe, expect, it } from 'vitest';
import { signInEmail } from './email';

describe('sign-in email', () => {
  it('puts the link in both versions, escaped in the HTML', () => {
    const url = 'https://app.example/api/auth/magic-link/verify?token=abc&callbackURL=%2F';
    const { text, html } = signInEmail(url);
    expect(text).toContain(url);
    expect(html).toContain('href="https://app.example/api/auth/magic-link/verify?token=abc&amp;callbackURL=%2F"');
    expect(html).not.toContain('token=abc&callbackURL');
    expect(signInEmail('https://x/"><script>').html).not.toContain('<script>');
  });
});
