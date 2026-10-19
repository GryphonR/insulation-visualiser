import type { ReactNode } from 'react';

export function Chip({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button type="button" className={on ? 'chip on' : 'chip'} aria-pressed={on} aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

export function ChipGroup<T extends { id: string }>({
  label, items, value, onPick, text, className,
}: {
  label: string;
  items: T[];
  value: string;
  onPick: (id: string) => void;
  text: (item: T) => string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={className ?? 'chips'}>
      {items.map((it) => (
        <Chip key={it.id} on={value === it.id} onClick={() => onPick(it.id)}>{text(it)}</Chip>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="eyebrow">{label}</span>
      {children}
    </label>
  );
}

export function Slider({
  id, label, value, min, max, step, unit, onChange,
}: {
  id: string; label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void;
}) {
  return (
    <div className="slider">
      <div className="slider-head">
        <label htmlFor={id}>{label}</label>
        <span className="mono">{value} {unit}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="eyebrow">{children}</div>;
}
