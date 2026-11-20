// The public site's only script: its styles. Pages arrive as static HTML; in `vite` dev they don't exist yet, so render here instead.
import '../styles.css';
import '../drafting.css';
import '../ui/shell.css';
import './site.css';

if (!document.getElementById('site')?.firstElementChild) void import('./dev-render');
