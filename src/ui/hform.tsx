import { useState } from 'react';
import type { ReactNode } from 'react';

export const fmt = (v: number, d = 0) => (Number.isFinite(v) ? v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
export const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
export const mix = (a: number[], b: number[], f: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * Math.min(1, Math.max(0, f)))).join(',')})`;

/** A small "?" that opens a short explanation of where a figure comes from. Opens in place, so it works on touch and in scrolling tables. */
export function Why({ children, label = 'Where does this figure come from?' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="why">
      <button type="button" className="why-b" aria-label={label} aria-expanded={open} onClick={(e) => { e.preventDefault(); setOpen(!open); }}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>?</button>
      {open && <span className="why-t" role="note">{children}</span>}
    </span>
  );
}

export function Num({ value, onChange, step = 0.1, min, max, label, unit, why }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; label: string; unit?: string; why?: ReactNode }) {
  return (
    <label className="hf">
      <span className="hf-lab"><span className="eyebrow">{label}</span>{why && <Why>{why}</Why>}</span>
      <span className="hf-in">
        <input type="number" className="thk-input" value={Number.isFinite(value) ? +value.toFixed(3) : ''} step={step} min={min} max={max}
          onChange={(e) => { const v = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(v)) onChange(v); }} />
        {unit && <span className="small muted">{unit}</span>}
      </span>
    </label>
  );
}

export function Card({ title, note, children, right }: { title: string; note?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card panel">
      <div className="section-head">
        <div><h2>{title}</h2>{note && <p className="muted small">{note}</p>}</div>
        {right}
      </div>
      {children}
    </section>
  );
}
