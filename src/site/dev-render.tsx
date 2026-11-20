// Dev only (production pages are prerendered): render the page for this path, as the build would.
import { createRoot } from 'react-dom/client';
import { sitePages } from './pages';

const base = import.meta.env.BASE_URL;
const rel = location.pathname.startsWith(base) ? location.pathname.slice(base.length) : '';
const pages = sitePages(base, !!import.meta.env.VITE_CLOUD);
const page = pages.find((p) => p.path === rel || p.path === `${rel}/`) ?? pages.find((p) => p.path === '404')!;
document.title = page.title;
createRoot(document.getElementById('site')!).render(page.body);
