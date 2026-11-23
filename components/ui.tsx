'use client';

import { useEffect } from 'react';
import { pct } from '@/lib/scoring';

export function NumberChips({
  max,
  value,
  onChange,
  min = 0,
}: {
  max: number;
  value: number | null;
  onChange: (v: number) => void;
  min?: number;
}) {
  const nums: number[] = [];
  for (let i = min; i <= max; i++) nums.push(i);
  return (
    <div className="chips" role="radiogroup">
      {nums.map((n) => (
        <button type="button" key={n} role="radio" aria-checked={value === n} className={`chip${value === n ? ' on' : ''}`} onClick={() => onChange(n)}>
          {n}
        </button>
      ))}
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 100,
  label,
}: {
  value: number | null;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label?: string;
}) {
  const v = value ?? 0;
  return (
    <div className="stepper" aria-label={label}>
      <button type="button" aria-label="decrease" disabled={v <= min} onClick={() => onChange(Math.max(min, v - 1))}>
        −
      </button>
      <input
        inputMode="numeric"
        value={value ?? ''}
        placeholder="0"
        onChange={(e) => {
          const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
          onChange(Number.isFinite(n) ? Math.min(Math.max(n, min), max) : min);
        }}
      />
      <button type="button" aria-label="increase" disabled={v >= max} onClick={() => onChange(Math.min(max, v + 1))}>
        +
      </button>
    </div>
  );
}

export function Seg<T extends string | number | boolean>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button type="button" key={String(o.value)} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ChoiceChips<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button type="button" key={String(o.value)} className={`chip${value === o.value ? ' on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A question with one-tap Yes / No buttons. Tapping the chosen answer again clears it. */
export function YesNo({ label, value, onChange }: { label: string; value: 'yes' | 'no' | undefined; onChange: (v: 'yes' | 'no' | undefined) => void }) {
  return (
    <div className="between" style={{ flexWrap: 'nowrap', gap: 10 }}>
      <span className="small" style={{ fontWeight: 600 }}>
        {label}
      </span>
      <div className="row" style={{ gap: 6, flexWrap: 'nowrap', flex: 'none' }}>
        {(['yes', 'no'] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            className={`chip${value === v ? ' on' : ''}`}
            style={{ minWidth: 54, minHeight: 40 }}
            onClick={() => onChange(value === v ? undefined : v)}
          >
            {v === 'yes' ? 'Yes' : 'No'}
          </button>
        ))}
      </div>
    </div>
  );
}

export function StatusBadge({ status, tone, rate }: { status: string; tone: number; rate?: number | null }) {
  if (!status) return <span className="badge neutral">–</span>;
  return (
    <span className={`badge tone-${Math.max(0, Math.min(6, tone))}`}>
      {rate !== undefined && rate !== null ? `${pct(rate)} · ` : ''}
      {status}
    </span>
  );
}

export function Bar({ value }: { value: number | null }) {
  return (
    <div className="bar">
      <span style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="x-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Loading() {
  return (
    <div className="loading">
      <div className="spinner" />
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="alert error stack">
      <span>{error}</span>
      {onRetry && (
        <button className="btn sm" onClick={onRetry} style={{ alignSelf: 'flex-start' }}>
          Try again
        </button>
      )}
    </div>
  );
}
