import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { InputHTMLAttributes, ReactNode } from 'react';

export const fmt = (v: number, d = 0) => (Number.isFinite(v) ? v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
export const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
export const mix = (a: number[], b: number[], f: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * Math.min(1, Math.max(0, f)))).join(',')})`;

/**
 * A small "?" that opens a short explanation of where a figure comes from. The note floats over the page beside the button
 * (drawn at the top level, so scrolling tables and panels can't clip it) and closes on a click elsewhere, Escape, scroll or resize.
 */
export function Why({ children, label = 'Where does this figure come from?' }: { children: ReactNode; label?: string }) {
  const [at, setAt] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null), pop = useRef<HTMLSpanElement>(null), id = useId();
  // Under the button, or above it when there isn't room below; kept inside the window.
  const place = () => {
    const r = btn.current!.getBoundingClientRect(), w = Math.min(320, innerWidth * 0.78), left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
    return innerHeight - r.bottom < 220 && r.top > 220 ? { left, bottom: innerHeight - r.top + 6 } : { left, top: r.bottom + 6 };
  };
  useEffect(() => {
    if (!at) return;
    const shut = () => setAt(null);
    const down = (e: PointerEvent) => { if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) shut(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { shut(); btn.current?.focus(); } };
    document.addEventListener('pointerdown', down, true); document.addEventListener('keydown', key);
    window.addEventListener('scroll', shut, true); window.addEventListener('resize', shut);
    return () => {
      document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', shut, true); window.removeEventListener('resize', shut);
    };
  }, [at]);
  return (
    <span className="why">
      <button ref={btn} type="button" className="why-b" aria-label={label} aria-expanded={!!at} aria-controls={at ? id : undefined}
        onClick={(e) => { e.preventDefault(); setAt(at ? null : place()); }}>?</button>
      {/* Inside a <label> a click on the note would otherwise reach the field. */}
      {at && createPortal(<span ref={pop} id={id} className="why-t why-pop" role="note" style={at} onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>{children}</span>, document.body)}
    </span>
  );
}

/**
 * A number field you can clear and retype: what you type stays in the box, the page only hears about it once it is a
 * number, and leaving the field shows the stored value again (so an empty box never becomes 0).
 */
export function NumInput({ value, onChange, onBlur, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input {...rest} type="number" value={draft ?? value ?? ''}
      onChange={(e) => { setDraft(e.target.value); if (e.target.value.trim() !== '' && Number.isFinite(Number(e.target.value))) onChange?.(e); }}
      onBlur={(e) => { setDraft(null); onBlur?.(e); }} />
  );
}

export function Num({ value, onChange, step = 0.1, min, max, label, unit, why }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; label: string; unit?: string; why?: ReactNode }) {
  return (
    <label className="hf">
      <span className="hf-lab"><span className="eyebrow">{label}</span>{why && <Why>{why}</Why>}</span>
      <span className="hf-in">
        <NumInput className="thk-input" value={Number.isFinite(value) ? +value.toFixed(3) : ''} step={step} min={min} max={max}
          onChange={(e) => onChange(Number(e.target.value))} />
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
