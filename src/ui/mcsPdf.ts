import type { jsPDF } from 'jspdf';
import { centroid } from '../engine/geom';
import type { Pt } from '../engine/geom';
import { SOURCE_LABEL, buildupU, dhwDemand, isHeatPump, mcsHouse, mcsOf, onStorey, roomPoly } from '../engine/house';
import type { House, HouseResult } from '../engine/house';
import { emitterPose } from '../engine/house-draw';
import { EMITTER_NAME, emitterOut, given } from '../engine/house-heating';
import { addPlexFonts } from './pdfFonts';
import { planBounds, planOpenings } from './HousePlan';
import { coverText, emitterText, layersText, reportBuildups, heatPaths, methodRows } from './reportText';
import { fmt } from './hform';

// A4 portrait, mm. Colours from the app's drafting theme (drafting.css); emitters, windows and doors as the layout editor draws them.
const W = 210, H = 297, M = 16, INK = '#1b2a3a', MUTED = '#55626e', LINE = '#d3d8dc', ACCENT = '#c2410c', CARD = '#fffefb';
const ROOM_FILL = '#fbf7f1', UNHEATED_FILL = '#eceae4', EMITTER = '#9a3412', FANCOIL = '#155e75', UFH_FILL = '#f3c9a2', WINDOW = '#1f6fb5', DOOR = '#55626e';

type Text = (s: string, x: number, y: number, o?: { size?: number; bold?: boolean; mono?: boolean; color?: string; align?: 'left' | 'right' | 'center'; maxWidth?: number; space?: number }) => void;

/**
 * The PDF's built-in Helvetica only has Windows-1252 glyphs: spell out the few symbols outside it.
 * shortcut: embed a Unicode TTF (IBM Plex Sans) if the report ever needs more than these.
 */
export const pdfText = (s: string) => s.replace(/ΔT K/g, 'Temp. diff. K').replace(/Δ/g, 'delta ').replace(/Ψ/g, 'psi').replace(/−/g, '-').replace(/≥/g, '>=').replace(/≤/g, '<=')
  .replace(/→/g, '->').replace(/₂/g, '2').replace(/[‘’]/g, "'").replace(/[^\x20-\x7e\xa0-\xff–—‘-”•…€\n]/g, '');

/** Build the MCS heat loss assessment PDF and hand it to the browser as a download. */
export async function downloadMcsPdf(house: House, res: HouseResult, scenarioName: string): Promise<void> {
  (await buildMcsPdf(house, res, scenarioName)).save(`${(house.name || 'house').replace(/[^\w-]+/g, '_')}-heat-loss-assessment.pdf`);
}

/** The MCS heat loss assessment: cover with the installer's details, whole house with plans, room by room, design summary. */
export async function buildMcsPdf(drawn: House, both: HouseResult, scenarioName: string): Promise<jsPDF> {
  // MCS design throughout: the house with its MCS conventions, and its MCS result.
  const house = mcsHouse(drawn), res = mcsOf(both);
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const plex = await addPlexFonts(doc), SANS = plex ? 'sans' : 'helvetica', MONO = plex ? 'mono' : 'courier';
  const d = house.mcs ?? {}, date = new Date().toLocaleDateString('en-GB');
  const heated = res.rooms.filter((r) => r.room.heated), flow = res.heat.designFlow;
  const T = (s: string) => pdfText(s);
  let y = M;

  const text: Text = (s, x, yy, o = {}) => {
    doc.setFont(o.mono ? MONO : SANS, o.bold ? 'bold' : 'normal').setFontSize(o.size ?? 9).setTextColor(o.color ?? INK);
    doc.text(T(s), x, yy, { align: o.align, maxWidth: o.maxWidth, charSpace: o.space });
  };
  // A label in the app's style: mono, upper case, spaced out, muted.
  const eyebrow = (s: string, x: number, yy: number, o: { align?: 'left' | 'right' } = {}) => text(s.toUpperCase(), x, yy, { size: 6.5, mono: true, bold: true, color: MUTED, space: 0.25, align: o.align });
  const after = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const room = (need: number) => { if (y + need > H - M - 8) { doc.addPage(); y = M + 10; } };
  const heading = (s: string, size = 13) => { room(16); text(s, M, y, { size, bold: true }); y += size * 0.5; };
  const table = (head: string[] | null, body: Array<Array<string | number>>, o: { first?: number; num?: number[]; foot?: Array<string | number> } = {}) => {
    autoTable(doc, {
      startY: y, margin: { left: M, right: M, top: M + 10, bottom: M + 8 },
      head: head ? [head.map(T)] : undefined, body: body.map((r) => r.map((c) => T(String(c)))), foot: o.foot ? [o.foot.map((c) => T(String(c)))] : undefined,
      theme: 'plain', showFoot: 'lastPage',
      styles: { font: SANS, fontSize: 8.5, textColor: INK, cellPadding: { top: 1.4, bottom: 1.4, left: 1.6, right: 1.6 }, lineColor: LINE, lineWidth: { bottom: 0.2 } },
      headStyles: { font: MONO, fontStyle: 'bold', textColor: MUTED, fontSize: 6.5, lineWidth: { bottom: 0.4 }, lineColor: INK },
      footStyles: { fontStyle: 'bold', lineWidth: { top: 0.4 }, lineColor: INK },
      columnStyles: Object.fromEntries([...(o.first ? [[0, { cellWidth: o.first, textColor: MUTED }]] : []), ...(o.num ?? []).map((i) => [i, { halign: 'right' }])]),
      // Figures in mono, as in the app; column heads in upper case.
      didParseCell: (c) => {
        if (o.num?.includes(c.column.index)) { c.cell.styles.halign = 'right'; if (c.section !== 'head') c.cell.styles.font = MONO; }
        if (c.section === 'head') c.cell.text = c.cell.text.map((t) => t.toUpperCase());
      },
    });
    y = after() + 7;
  };

  // The Insuliser mark, as in the app: an ink-bordered square of three bars, ink, accent and card.
  const logo = (x: number, yy: number, sz: number) => {
    doc.setFillColor(CARD).rect(x, yy, sz, sz, 'F');
    doc.setFillColor(INK).rect(x, yy, sz / 3, sz, 'F');
    doc.setFillColor(ACCENT).rect(x + sz / 3, yy, sz / 3, sz, 'F');
    doc.setDrawColor(INK).setLineWidth(Math.max(0.3, sz / 12)).rect(x, yy, sz, sz, 'S');
  };

  // ---- Cover ----
  // The start screen's lockup: the mark as tall as the title and tagline together (cap height to baseline), the title in
  // Plex Sans, the tagline in accent mono with its letters spread to span exactly the word "Insuliser".
  const titleSize = 30, tag = "It's not all about U", PT = 0.3528, CAP = 0.7;
  doc.setFont(SANS, 'bold').setFontSize(titleSize);
  const titleW = doc.getTextWidth('Insuliser'), tagSize = titleSize * 0.29;
  const top = M + 2, base = top + titleSize * PT * CAP, tagBase = base + titleSize * PT * 0.12 + tagSize * PT * CAP, mark = tagBase - top, tx = M + mark + 4.5;
  logo(M, top, mark);
  text('Insuliser', tx, base, { size: titleSize, bold: true });
  doc.setFont(MONO, 'normal').setFontSize(tagSize);
  const chars = [...tag], widths = chars.map((c) => doc.getTextWidth(c)), gap = (titleW - widths.reduce((t, w) => t + w, 0)) / (chars.length - 1);
  let cx = tx;
  chars.forEach((c, i) => { if (c !== ' ') text(c, cx, tagBase, { size: tagSize, mono: true, color: ACCENT }); cx += widths[i] + gap; });
  doc.setDrawColor(INK).setLineWidth(0.5).line(M, tagBase + 5, W - M, tagBase + 5);
  y = 62;
  text('Heat loss assessment', M, y, { size: 26, bold: true }); y += 9;
  text('Room-by-room design heat loss to BS EN 12831-1:2017, for MIS 3005-D Issue 3.0', M, y, { size: 11, color: MUTED }); y += 14;
  text(house.name, M, y, { size: 15, bold: true }); y += 6;
  text(scenarioName, M, y, { size: 10, color: MUTED }); y += 8;
  const missing = 'Not entered';
  table(null, [
    ['Client', d.client || missing], ['Site address', d.site || missing], ['Postcode', house.climate.postcode || missing],
    ['MCS contractor', d.contractor || missing], ['Certification body and number', d.certNo || missing], ['Designer', d.designer || missing], ['Date', date],
  ], { first: 62 });

  // Key figures, four boxes.
  const kf: Array<[string, string, string]> = [
    ['Design heat loss', fmt(res.peakW / 1000, 2), 'kW, whole house'],
    ['Outside design temperature', fmt(res.Tout, 1), '°C'],
    [SOURCE_LABEL[house.hp.source], given(house.hp.capacity) ? fmt(house.hp.capacity, 1) : '—', given(house.hp.capacity) ? `kW at ${fmt(res.Tout, 1)} °C` : 'kW, output not entered'],
    ['Design flow temperature', fmt(flow, 0), '°C'],
  ];
  const bw = (W - 2 * M - 9) / 4;
  kf.forEach(([l, v, u], i) => {
    const x = M + i * (bw + 3);
    doc.setFillColor(CARD).setDrawColor(INK).setLineWidth(0.4).rect(x, y, bw, 26, 'FD');
    doc.setFont(MONO, 'bold').setFontSize(6.5);
    (doc.splitTextToSize(T(l.toUpperCase()), bw - 8) as string[]).slice(0, 2).forEach((ln, k) => eyebrow(ln, x + 3, y + 5.5 + k * 3));
    text(v, x + 3, y + 18, { size: 17, mono: true });
    text(u, x + 3, y + 23, { size: 7, color: MUTED, maxWidth: bw - 6 });
  });
  y += 40;
  eyebrow('Designer’s declaration', M, y); y += 5;
  text('This heat loss calculation was carried out for the property above to BS EN 12831-1:2017 and MIS 3005-D.', M, y, { size: 9, color: MUTED }); y += 16;
  doc.setDrawColor(INK).setLineWidth(0.3).line(M, y, M + 80, y).line(M + 100, y, M + 140, y);
  eyebrow('Signature', M, y + 4); eyebrow('Date', M + 100, y + 4);

  // ---- Whole house ----
  doc.addPage(); y = M + 10;
  heading('Whole house');
  const spare = res.hp.spare;
  table(null, [
    ['Design heat loss, whole house', `${fmt(res.peakW)} W`],
    ['Rooms added up, each in its own worst case', `${fmt(res.roomSumW)} W`],
    ['Heated floor area / volume', `${fmt(res.heatedA, 1)} m² / ${fmt(res.heatedV)} m³`],
    ['Heat loss per m² of floor', `${fmt(res.heatedA ? res.peakW / res.heatedA : 0)} W/m²`],
    ['Heat source', `${SOURCE_LABEL[house.hp.source]}${given(house.hp.capacity) ? `, ${fmt(house.hp.capacity, 1)} kW at ${fmt(res.Tout, 1)} °C (${spare >= 0 ? `${fmt(spare * 100)}% above` : `${fmt(-spare * 100)}% below`} the design heat loss)` : ', output not entered'}`],
  ], { first: 70 });
  text('The rooms are each sized for the wind on their own side and their full fresh air, which sets the emitters. Across the whole house that air comes in once and passes from room to room, so the heat source is sized on the lower whole-house figure (BS EN 12831-1 eq. 16 and 17).', M, y - 3, { size: 7.5, color: MUTED, maxWidth: W - 2 * M });
  y += 8;

  heading('Where the heat goes', 11);
  const paths = heatPaths(res), pTot = paths.reduce((t, [, w]) => t + w, 0) || 1;
  table(['Path', 'W', 'Share'], paths.map(([l, w]) => [l, fmt(w), `${fmt((w / pTot) * 100)}%`]), { num: [1, 2], foot: ['Whole house', fmt(res.peakW), '100%'] });

  heading('Method and design conditions', 11);
  table(null, methodRows(house, res), { first: 46 });

  // ---- Plans ----
  const b = planBounds(house), pw = b.maxX - b.minX, ph = b.maxY - b.minY;
  const storeys = house.storeys.map((_, i) => i).filter((i) => house.rooms.some((r) => onStorey(r, i)));
  for (const s of storeys) {
    const S = Math.min((W - 2 * M - 12) / pw, 92 / ph); // two storeys to a page
    if (y + ph * S + 26 > H - M - 8) { doc.addPage(); y = M + 10; }
    heading(`Plan: ${house.storeys[s].name}`, 11);
    drawPlan(doc, house, res, s, M, y + 4, S, text, eyebrow);
    y += ph * S + 20;
  }

  // ---- Room by room ----
  doc.addPage(); y = M + 10;
  heading('Room by room');
  table(['Room', '°C', 'Floor m²', 'Fabric W', 'Vent. W', 'ACH', 'Heat loss W', 'W/m²', 'Emitter W', 'Cover'],
    heated.map((r) => {
      const c = res.heat.rooms.find((x) => x.id === r.room.id);
      return [r.room.name, fmt(r.room.setpoint), fmt(r.area, 1), fmt(r.fabricW), fmt(r.ventW), fmt(r.n, 2), fmt(r.totalW), fmt(r.perM2), c?.has ? fmt(c.out) : '—', c?.has ? coverText(c.out, r.totalW) : '—'];
    }), { num: [1, 2, 3, 4, 5, 6, 7, 8, 9], foot: ['Rooms added up', '', '', '', '', '', fmt(heated.reduce((t, r) => t + r.totalW, 0)), '', '', ''] });
  text(`Emitter output at the design flow temperature of ${fmt(flow, 1)} °C (${fmt(flow - house.heating.dT, 1)} °C return).${res.rooms.some((r) => !r.room.heated) ? ` Unheated: ${res.rooms.filter((r) => !r.room.heated).map((r) => `${r.room.name} ${fmt(r.T, 1)} °C`).join(', ')}${res.loft ? `; loft ${fmt(res.loft.T, 1)} °C` : ''}.` : ''}`, M, y - 3, { size: 7.5, color: MUTED, maxWidth: W - 2 * M });
  y += 6;

  for (const r of heated) {
    room(50);
    text(r.room.name, M, y, { size: 11, bold: true });
    text(`${fmt(r.room.setpoint)} °C · ${fmt(r.area, 1)} m² · ${fmt(r.V, 1)} m³ · ${fmt(r.n, 2)} ACH · ${fmt(r.totalW)} W (${fmt(r.perM2)} W/m²)`, W - M, y, { size: 8.5, color: MUTED, align: 'right' });
    y += 3;
    table(['Element', 'To', 'Build-up', 'm²', 'U', 'ΔT K', 'W'],
      r.rows.map((x) => [x.label, x.to, x.buildup, x.kind === 'vent' ? '' : fmt(x.area, 2), x.kind === 'vent' ? '' : fmt(x.U, 2), fmt(x.dT, 1), fmt(x.W)]),
      { num: [3, 4, 5, 6], foot: ['Room heat loss', '', '', '', '', '', fmt(r.totalW)] });
    const ems = house.heating.emitters.filter((e) => e.room === r.room.id);
    if (ems.length) {
      y -= 4;
      const c = res.heat.rooms.find((x) => x.id === r.room.id);
      table(['Emitter', 'Size', `Output at ${fmt(flow)} °C, W`],
        ems.map((e) => [EMITTER_NAME[e.kind], emitterText(e), fmt(emitterOut(e, flow, r.room.setpoint, house))]),
        { num: [2], foot: ['Emitters', c ? `${coverText(c.out, r.totalW)} of the heat loss` : '', fmt(c?.out ?? 0)] });
    } else { text('No emitter in this room.', M, y - 3, { size: 8, color: '#b42318' }); y += 4; }
  }

  // ---- Design summary for the customer, build-ups, checks ----
  doc.addPage(); y = M + 10;
  heading('Design summary (MIS 3005-D 5.9.2)');
  const dhw = dhwDemand(house), gov = res.heat.gov ? house.rooms.find((r) => r.id === res.heat.gov!.id)?.name : undefined;
  table(null, [
    ['a) Heat loss of each room', 'W/m² in the room-by-room table'],
    ['b) Daily hot water demand', `${dhw.litres} litres (45 × ${dhw.n}: the greater of ${dhw.bedrooms} bedrooms + 1 and ${house.gains.people} occupants, clause 5.6.2)`],
    ['c) Emitters', 'Type and size in the room-by-room pages'],
    ['d) Design emitter temperature', `${fmt(flow, 1)} °C flow, ${fmt(flow - house.heating.dT, 1)} °C return${gov ? `, set by ${gov}` : ''}`],
    ['e) Hot water cylinder', `${d.cylinder || missing}${given(d.recovery) ? `, recovers in ${fmt(d.recovery)} min` : ', recovery time not entered'}`],
    ['f) Design flow temperature leaving the heat source', `${fmt(flow, 1)} °C`],
    ...(isHeatPump(house.hp.source) ? [['g) SCoP from the MCS listing', given(d.scop) ? `${fmt(d.scop, 2)} at ${fmt(flow)} °C flow` : missing]] : []),
    ['h) Metering', d.metering || missing],
  ], { first: 70 });

  heading('Build-ups', 11);
  const usedB = reportBuildups(house, res);
  table(['Build-up', 'Layers (outside to inside)', 'U W/m²K'], usedB.map((bu) => [bu.name, layersText(bu), fmt(buildupU(bu), 2)]), { num: [2] });
  text(`U-values of the construction alone; each element in the room pages adds the ΔU ${res.tb} W/m²K thermal bridging allowance where it bounds the heated space.`, M, y - 3, { size: 7.5, color: MUTED, maxWidth: W - 2 * M });
  y += 6;

  if (res.checks.length) {
    heading('Checks', 11);
    table(null, res.checks.map((c) => [c.level === 'error' ? 'Error' : 'Note', c.text]), { first: 16 });
  }

  // Running header and footer on every page but the cover.
  const n = doc.getNumberOfPages();
  for (let i = 2; i <= n; i++) {
    doc.setPage(i);
    logo(M, 8, 5);
    text('Insuliser', M + 7, 12, { size: 8.5, bold: true });
    eyebrow(`Heat loss assessment · ${house.name}`, M + 23, 11.8);
    eyebrow(date, W - M, 11.8, { align: 'right' });
    doc.setDrawColor(INK).setLineWidth(0.4).line(M, 15, W - M, 15);
    eyebrow(`Page ${i} of ${n}`, W - M, H - 8, { align: 'right' });
    eyebrow(d.contractor ? `Prepared for ${d.contractor}` : 'Prepared with Insuliser', M, H - 8);
  }
  doc.setProperties({ title: `Heat loss assessment, ${house.name}`, creator: 'Insuliser' });
  return doc;
}

/**
 * One storey's plan at S mm per metre from (x0, y0): rooms with their heat loss, windows, doors and every emitter where the
 * layout editor draws it (placed, else along the room's longest outside wall), a compass rose and a scale bar with a key.
 */
function drawPlan(doc: jsPDF, house: House, res: HouseResult, storey: number, x0: number, y0: number, S: number, text: Text, eyebrow: (s: string, x: number, y: number) => void) {
  const b = planBounds(house), to = (p: Pt): Pt => [x0 + (p[0] - b.minX) * S, y0 + (p[1] - b.minY) * S];
  const shape = (q: Pt[], style: 'S' | 'F' | 'FD') => doc.lines(q.slice(1).map((p, i) => [p[0] - q[i][0], p[1] - q[i][1]]), q[0][0], q[0][1], [1, 1], style, true);
  // A window: a white gap in the wall with a blue frame line either side and the glass down the middle.
  const windowAt = (a: Pt, z: Pt) => {
    const len = Math.hypot(z[0] - a[0], z[1] - a[1]) || 1, nx = (-(z[1] - a[1]) / len) * 0.55, ny = ((z[0] - a[0]) / len) * 0.55;
    doc.setDrawColor('#ffffff').setLineWidth(1.4).line(a[0], a[1], z[0], z[1]);
    doc.setDrawColor(WINDOW).setLineWidth(0.3).line(a[0] + nx, a[1] + ny, z[0] + nx, z[1] + ny).line(a[0] - nx, a[1] - ny, z[0] - nx, z[1] - ny).line(a[0], a[1], z[0], z[1]);
  };
  // A door: a white gap with jambs at each end and a grey leaf across it.
  const doorAt = (a: Pt, z: Pt) => {
    const len = Math.hypot(z[0] - a[0], z[1] - a[1]) || 1, nx = (-(z[1] - a[1]) / len) * 0.8, ny = ((z[0] - a[0]) / len) * 0.8;
    doc.setDrawColor('#ffffff').setLineWidth(1.4).line(a[0], a[1], z[0], z[1]);
    doc.setDrawColor(DOOR).setLineWidth(0.5).line(a[0], a[1], z[0], z[1]);
    doc.setLineWidth(0.3).line(a[0] - nx, a[1] - ny, a[0] + nx, a[1] + ny).line(z[0] - nx, z[1] - ny, z[0] + nx, z[1] + ny);
  };
  // An emitter as the layout editor draws it: a bar its own length along the wall (fan coils teal); a loop a dashed box.
  const barAt = (c: Pt, ang: number, len: number, th: number, fill: string) => {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    doc.setFillColor(fill).setDrawColor(INK).setLineWidth(0.15);
    shape([[-len / 2, -th / 2], [len / 2, -th / 2], [len / 2, th / 2], [-len / 2, th / 2]].map(([u, w]): Pt => [c[0] + u * ca - w * sa, c[1] + u * sa + w * ca]), 'FD');
  };
  const loopAt = (a: Pt, w: number, h: number) => {
    doc.setFillColor(UFH_FILL).setDrawColor(EMITTER).setLineWidth(0.3).setLineDashPattern([1.2, 0.8], 0).rect(a[0], a[1], w, h, 'FD').setLineDashPattern([], 0);
  };

  const rooms = house.rooms.filter((r) => onStorey(r, storey));
  for (const r of rooms) {
    doc.setFillColor(r.heated ? ROOM_FILL : UNHEATED_FILL).setDrawColor(INK).setLineWidth(0.4);
    shape(roomPoly(r).map(to), 'FD');
  }
  for (const r of rooms.filter((x) => x.storey === storey)) for (const o of planOpenings(house, r)) (o.door ? doorAt : windowAt)(to(o.a), to(o.z));
  for (const e of house.heating.emitters) {
    if (!rooms.some((x) => x.id === e.room && x.storey === storey)) continue;
    if (e.kind === 'ufh' && e.rect) { loopAt(to([e.rect.x, e.rect.y]), e.rect.w * S, e.rect.h * S); continue; }
    const ps = emitterPose(house, e);
    if (!ps) continue;
    const c = to(ps.at);
    if (e.kind === 'ufh') { loopAt([c[0] - 0.45 * S, c[1] - 0.45 * S], 0.9 * S, 0.9 * S); continue; }
    barAt(c, (ps.ang * Math.PI) / 180, (e.kind === 'fancoil' ? 0.9 : e.kind === 'towel' ? 0.5 : e.len / 1000) * S, Math.max(1, 0.12 * S), e.kind === 'fancoil' ? FANCOIL : EMITTER);
  }
  for (const r of rooms) {
    const c = to(centroid(roomPoly(r))), rr = res.rooms.find((x) => x.room.id === r.id);
    text(r.name, c[0], c[1] - 0.5, { size: 7, bold: true, align: 'center' });
    if (r.storey !== storey) continue;
    text(r.heated && rr ? `${fmt(rr.totalW)} W · ${fmt(r.setpoint)} °C` : rr ? `unheated, ${fmt(rr.T, 1)} °C` : '', c[0], c[1] + 3, { size: 6.5, mono: true, color: MUTED, align: 'center' });
    const ems = house.heating.emitters.filter((e) => e.room === r.id).map(emitterText).join(', ');
    if (ems) text(ems, c[0], c[1] + 6.2, { size: 6, color: EMITTER, align: 'center' });
  }

  // Compass rose at the plan's top right: "up" on the plan faces house.north degrees clockwise of true north.
  const R = 6, cx = Math.min(W - M - R - 3, x0 + (b.maxX - b.minX) * S + R + 6), cy = y0 + R + 2, rot = (-(house.north ?? 0) * Math.PI) / 180;
  const at = (ang: number, r: number): Pt => [cx + Math.sin(ang + rot) * r, cy - Math.cos(ang + rot) * r];
  doc.setDrawColor(INK).setLineWidth(0.25).setFillColor(CARD).circle(cx, cy, R, 'FD');
  for (let k = 0; k < 8; k++) { const p = at((k * Math.PI) / 4, R), q = at((k * Math.PI) / 4, R - (k % 2 ? 0.8 : 1.4)); doc.line(p[0], p[1], q[0], q[1]); }
  const point = (ang: number, side: number, fill: string) => { doc.setFillColor(fill).setDrawColor(INK).setLineWidth(0.15); shape([at(ang, R - 1), at(ang + side * Math.PI / 2, 1.1), [cx, cy]], 'FD'); };
  point(0, 1, ACCENT); point(0, -1, INK); point(Math.PI, 1, CARD); point(Math.PI, -1, CARD);
  ([['N', 0], ['E', Math.PI / 2], ['S', Math.PI], ['W', -Math.PI / 2]] as Array<[string, number]>).forEach(([l, ang]) => {
    const p = at(ang, R + 2.3);
    text(l, p[0], p[1] + 1, { size: l === 'N' ? 7.5 : 6, bold: l === 'N', mono: true, color: l === 'N' ? ACCENT : MUTED, align: 'center' });
  });

  // Scale bar, then the key: each symbol drawn by the same code as the plan, only the kinds this house has.
  const by = y0 + (b.maxY - b.minY) * S + 6;
  doc.setDrawColor(INK).setLineWidth(0.4).line(x0, by, x0 + 5 * S, by).line(x0, by - 1, x0, by + 1).line(x0 + 5 * S, by - 1, x0 + 5 * S, by + 1);
  text('5 m', x0 + 5 * S + 2, by + 1, { size: 7, mono: true, color: MUTED });
  let kx = x0 + 5 * S + 14;
  const key = (label: string, draw: (x: number) => void) => { draw(kx); eyebrow(label, kx + 7, by + 1); kx += 7 + doc.getTextWidth(label.toUpperCase()) + label.length * 0.25 + 5; };
  const kinds = new Set(house.heating.emitters.map((e) => e.kind));
  if (kinds.has('radiator') || kinds.has('towel')) key('Radiator', (x) => barAt([x + 2.5, by], 0, 5, 1.2, EMITTER));
  if (kinds.has('fancoil')) key('Fan coil', (x) => barAt([x + 2.5, by], 0, 5, 1.2, FANCOIL));
  if (kinds.has('ufh')) key('Underfloor', (x) => loopAt([x, by - 1.5], 5, 3));
  key('Window', (x) => windowAt([x, by], [x + 5, by]));
  key('Door', (x) => doorAt([x, by], [x + 5, by]));
}
