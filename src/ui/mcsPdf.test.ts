import { describe, expect, it } from 'vitest';
import { calcBoth } from '../engine/house';
import { DEMOS } from '../engine/house-demos';
import { buildMcsPdf, pdfText } from './mcsPdf';

describe('MCS PDF', () => {
  it('spells out symbols the built-in PDF font lacks', () => {
    expect(pdfText('ΔU 0.15 W/m²K, Ψ −0.2 °C → ok')).toBe('delta U 0.15 W/m²K, psi -0.2 °C -> ok');
  });

  it('builds for every demo: cover, whole house, plans, rooms, summary', async () => {
    for (const d of DEMOS) {
      const h = d.make().scenarios[0].house;
      h.mcs = { client: 'A Client', contractor: 'Heat Co', scop: 3.4 };
      const doc = await buildMcsPdf(h, calcBoth(h), 'As built');
      expect(doc.getNumberOfPages(), d.label).toBeGreaterThanOrEqual(4);
      expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(5000);
    }
  });
});

describe('PDF fonts', () => {
  it('turns the app’s IBM Plex WOFF into a TrueType font jsPDF can embed', async () => {
    const { woffToTtf } = await import('./pdfFonts');
    // node:fs by a computed name: the app's TypeScript config has no Node types, and only this test needs them.
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync: (p: string) => Uint8Array };
    const woff = fs.readFileSync('node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff');
    const ttf = await woffToTtf(woff.buffer.slice(woff.byteOffset, woff.byteOffset + woff.byteLength) as ArrayBuffer);
    const v = new DataView(ttf.buffer), n = v.getUint16(4), tags = Array.from({ length: n }, (_, i) => String.fromCharCode(...ttf.subarray(12 + i * 16, 16 + i * 16)));
    expect(v.getUint32(0)).toBe(0x00010000);
    expect(tags).toEqual(expect.arrayContaining(['cmap', 'glyf', 'head', 'hmtx', 'name']));
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    doc.addFileToVFS('t.ttf', btoa(Array.from(ttf, (c) => String.fromCharCode(c)).join(''))); doc.addFont('t.ttf', 't', 'normal');
    doc.setFont('t', 'normal');
    expect(doc.getTextWidth('Insuliser')).toBeGreaterThan(0);
  });
});

describe('build-ups table', () => {
  it('leaves out the open stairwell and doorway: gaps, not constructions', async () => {
    const { calcBoth } = await import('../engine/house');
    const { OPEN_STAIRWELL } = await import('../engine/house-draw');
    const { reportBuildups } = await import('./reportText');
    const h = DEMOS.find((d) => d.id === '1950s')!.make().scenarios[0].house, res = calcBoth(h);
    expect(res.rooms.some((r) => r.faces.some((f) => f.buildup.id === OPEN_STAIRWELL))).toBe(true);
    const ids = reportBuildups(h, res).map((b) => b.id);
    expect(ids).not.toContain(OPEN_STAIRWELL);
    expect(ids.length).toBeGreaterThan(3);
  });
});
