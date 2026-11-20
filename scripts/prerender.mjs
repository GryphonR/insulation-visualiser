// After `vite build`: render the public site's pages (landing, Learn, 404) into dist/ as static HTML,
// using dist/index.html (which carries the built CSS) as the template. Also writes robots.txt and, if
// VITE_SITE_URL is set, a sitemap and canonical links.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const mode = process.argv[2] ?? 'production';
const vite = await createServer({ mode, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const base = vite.config.base;
  const env = vite.config.env;
  const site = (env.VITE_SITE_URL ?? '').replace(/\/$/, '');
  const { sitePages } = await vite.ssrLoadModule('/src/site/pages.tsx');
  const template = readFileSync('dist/index.html', 'utf8');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const clip = (s, n = 158) => (s.length <= n ? s : `${s.slice(0, s.lastIndexOf(' ', n - 1))}…`);

  const pages = sitePages(base, !!env.VITE_CLOUD);
  const urls = [];
  for (const p of pages) {
    const body = renderToStaticMarkup(p.body);
    // A Learn page's description is its opening paragraph.
    const description = p.description ?? clip(text(body.match(/class="learn-section"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/)?.[1] ?? ''));
    const url = site && p.path !== '404' ? `${site}${base}${p.path}` : '';
    const head = [
      `<title>${esc(p.title)}</title>`,
      description && `<meta name="description" content="${esc(description)}" />`,
      `<meta property="og:title" content="${esc(p.title)}" />`,
      description && `<meta property="og:description" content="${esc(description)}" />`,
      `<meta property="og:type" content="${p.path === '' ? 'website' : 'article'}" />`,
      `<meta property="og:site_name" content="Insuliser" />`,
      url && `<meta property="og:url" content="${url}" />`,
      url && `<link rel="canonical" href="${url}" />`,
      p.path === '404' && '<meta name="robots" content="noindex" />',
    ].filter(Boolean).join('\n    ');
    const html = template.replace('<!--site-head-->', head).replace('<!--site-body-->', body);
    const file = p.path === '404' ? 'dist/404.html' : `dist/${p.path}index.html`;
    mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
    writeFileSync(file, html);
    if (url) urls.push(url);
  }
  writeFileSync('dist/robots.txt', `User-agent: *\nDisallow: ${base}app/\nDisallow: ${base}api/\n${site ? `Sitemap: ${site}${base}sitemap.xml\n` : ''}`);
  if (site) writeFileSync('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`);
  console.log(`Prerendered ${pages.length} pages${site ? ' and a sitemap' : ''}.`);
} finally {
  await vite.close();
}
