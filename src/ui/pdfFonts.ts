import type { jsPDF } from 'jspdf';
import sans400 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff?url';
import sans600 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff?url';
import mono400 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff?url';
import mono500 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff?url';

/**
 * WOFF 1.0 to the TrueType font inside it: the same tables, each inflated if it was compressed. jsPDF embeds TrueType only,
 * and the app ships IBM Plex as WOFF, so this lets the PDF use the app's own type.
 */
export async function woffToTtf(woff: ArrayBuffer): Promise<Uint8Array> {
  const v = new DataView(woff);
  if (v.getUint32(0) !== 0x774f4646) throw new Error('not a WOFF file');
  const n = v.getUint16(12);
  const tables = await Promise.all(Array.from({ length: n }, async (_, i) => {
    const e = 44 + i * 20, off = v.getUint32(e + 4), comp = v.getUint32(e + 8), orig = v.getUint32(e + 12);
    const raw = new Uint8Array(woff, off, comp);
    const data = comp < orig ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()) : raw;
    return { tag: v.getUint32(e), checksum: v.getUint32(e + 16), data };
  }));
  const pad = (x: number) => (x + 3) & ~3;
  const out = new Uint8Array(12 + 16 * n + tables.reduce((t, x) => t + pad(x.data.length), 0)), o = new DataView(out.buffer);
  const pow = 2 ** Math.floor(Math.log2(n));
  o.setUint32(0, v.getUint32(4)); o.setUint16(4, n); o.setUint16(6, pow * 16); o.setUint16(8, Math.log2(pow)); o.setUint16(10, n * 16 - pow * 16);
  let at = 12 + 16 * n;
  tables.forEach((t, i) => {
    const e = 12 + i * 16;
    o.setUint32(e, t.tag); o.setUint32(e + 4, t.checksum); o.setUint32(e + 8, at); o.setUint32(e + 12, t.data.length);
    out.set(t.data, at); at += pad(t.data.length);
  });
  return out;
}

const base64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

/** Embed IBM Plex Sans and Mono as 'sans' and 'mono' (normal and bold). False when they can't be fetched (outside a browser): use Helvetica and Courier. */
export async function addPlexFonts(doc: jsPDF): Promise<boolean> {
  try {
    const files: Array<[string, string, 'normal' | 'bold']> = [[sans400, 'sans', 'normal'], [sans600, 'sans', 'bold'], [mono400, 'mono', 'normal'], [mono500, 'mono', 'bold']];
    const ttfs = await Promise.all(files.map(async ([url]) => woffToTtf(await (await fetch(url)).arrayBuffer())));
    files.forEach(([, name, style], i) => { const f = `${name}-${style}.ttf`; doc.addFileToVFS(f, base64(ttfs[i])); doc.addFont(f, name, style); });
    return true;
  } catch {
    return false;
  }
}
