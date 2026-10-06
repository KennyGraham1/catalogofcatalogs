'use client';

import { useEffect, useId, useState } from 'react';
import { Input } from './input';
import { Label } from './label';
import { cn } from '@/lib/utils';

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(upper, Math.max(lower, value));
}

function BoundInput({ label, value, min, max, step, onCommit }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (value: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  // Follow the value when it changes elsewhere (the slider, a reset).
  useEffect(() => setDraft(String(value)), [value]);

  // Typed text is applied on Enter or on leaving the field, clamped to [min, max]; text
  // that is not a number restores the current value. Values between slider steps are
  // kept: the inputs exist for bounds the slider's steps cannot reach.
  const commit = () => {
    const text = draft.trim();
    const parsed = text === '' ? NaN : Number(text);
    const next = Number.isFinite(parsed) ? clamp(parsed, min, max) : value;
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={draft}
        className="h-8 text-xs tabular-nums"
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            setDraft(String(value));
          }
        }}
      />
    </div>
  );
}

/**
 * Exact minimum and maximum inputs for a two-value range, beside its slider. Each input
 * is clamped to the range's ends and to the other bound, so editing can never produce an
 * inverted range (the bounds may meet).
 *
 * `label` is the quantity in running text ("magnitude", "depth") and `unit` its unit
 * ("km"): the inputs are named "Minimum depth (km)" and "Maximum depth (km)".
 */
export function NumericRangeInputs({ label, unit, value, min, max, step, onValueChange, className }: {
  label: string;
  unit?: string;
  value: number[];
  min: number;
  max: number;
  step: number;
  onValueChange: (value: number[]) => void;
  className?: string;
}) {
  const suffix = unit ? ` (${unit})` : '';
  const [lower, upper] = value[0] <= value[1] ? [value[0], value[1]] : [value[1], value[0]];
  return (
    <div className={cn('grid min-w-0 grid-cols-2 gap-2', className)}>
      <BoundInput label={`Minimum ${label}${suffix}`} value={lower} min={min} max={upper} step={step}
        onCommit={next => onValueChange([next, upper])} />
      <BoundInput label={`Maximum ${label}${suffix}`} value={upper} min={lower} max={max} step={step}
        onCommit={next => onValueChange([lower, next])} />
    </div>
  );
}
