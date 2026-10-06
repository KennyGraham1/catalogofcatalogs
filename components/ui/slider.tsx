'use client';

import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

import { cn } from '@/lib/utils';

type SliderRootProps = React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>;

export interface SliderProps extends SliderRootProps {
  /**
   * The complete accessible name of each thumb, e.g. ['Minimum magnitude', 'Maximum magnitude'].
   * When given it is the name, and `aria-label` / `aria-labelledby` are not applied to that thumb.
   */
  thumbLabels?: string[];
  /** The text read for one thumb's value, e.g. `M 4.5` or `no upper bound`. */
  getAriaValueText?: (value: number, index: number) => string | undefined;
  /** Value text of a single-thumb slider. A range's thumbs each need their own: use getAriaValueText. */
  'aria-valuetext'?: string;
}

/** Endpoint word of thumb `index` among `count` (Radix's own wording). */
function endpointName(index: number, count: number): string {
  if (count === 2) return index === 0 ? 'Minimum' : 'Maximum';
  return `Value ${index + 1} of ${count}`;
}

function isSorted(values: number[]): boolean {
  for (let i = 1; i < values.length; i++) if (values[i] < values[i - 1]) return false;
  return true;
}

/**
 * One focusable thumb per value, so a range shows and can be keyboard-operated at both
 * ends (a two-value slider with a single thumb let a track click move the hidden upper
 * bound). The accessible name goes on each thumb (role="slider"), where screen readers
 * look for it - on the Root alone it names nothing:
 *
 * - `thumbLabels[i]`, when given, is thumb i's whole name.
 * - A single thumb takes `aria-label` / `aria-labelledby` as given.
 * - A range named by `aria-labelledby` (a visible label) labels each thumb with itself
 *   and that label, so the thumbs read "Minimum <label>" and "Maximum <label>" and stay
 *   distinct; named by `aria-label`, they read "Minimum <aria-label>" / "Maximum ...".
 *
 * Works controlled (`value`) and uncontrolled (`defaultValue`); a controlled value
 * passed out of order is drawn sorted, so the lower thumb is always the minimum.
 */
const Slider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, SliderProps>(
  (
    {
      className,
      thumbLabels,
      getAriaValueText,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
      'aria-valuetext': ariaValuetext,
      value,
      defaultValue,
      onValueChange,
      min = 0,
      ...rootProps
    },
    ref
  ) => {
    const baseId = React.useId();
    const controlled = value !== undefined;
    // Mirror of the uncontrolled value: Radix keeps the live value internally, but the
    // per-thumb value text and the thumb count are rendered here.
    const [uncontrolledValue, setUncontrolledValue] = React.useState<number[]>(() => defaultValue ?? [min]);
    const sortedValue = React.useMemo(
      () => (value && !isSorted(value) ? [...value].sort((a, b) => a - b) : value),
      [value]
    );
    const values = controlled ? sortedValue ?? [] : uncontrolledValue;

    const handleValueChange = React.useCallback(
      (next: number[]) => {
        if (!controlled) setUncontrolledValue(next);
        onValueChange?.(next);
      },
      [controlled, onValueChange]
    );

    return (
      <SliderPrimitive.Root
        ref={ref}
        className={cn('relative flex w-full touch-none select-none items-center', className)}
        min={min}
        value={controlled ? sortedValue : undefined}
        defaultValue={controlled ? undefined : defaultValue}
        onValueChange={handleValueChange}
        {...rootProps}
      >
        <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
          <SliderPrimitive.Range className="absolute h-full bg-primary" />
        </SliderPrimitive.Track>
        {values.map((thumbValue, index) => {
          const thumbId = `${baseId}-thumb-${index}`;
          const range = values.length > 1;
          const explicit = thumbLabels?.[index];
          let label: string | undefined;
          let labelledby: string | undefined;
          if (explicit) {
            label = explicit;
          } else if (!range) {
            label = ariaLabel;
            labelledby = ariaLabelledby;
          } else if (ariaLabelledby) {
            // Self-reference first: the thumb's own aria-label supplies the endpoint word.
            label = endpointName(index, values.length);
            labelledby = `${thumbId} ${ariaLabelledby}`;
          } else {
            label = `${endpointName(index, values.length)} ${ariaLabel ?? 'value'}`;
          }
          const valueText = getAriaValueText?.(thumbValue, index) ?? (range ? undefined : ariaValuetext);
          return (
            <SliderPrimitive.Thumb
              key={index}
              id={thumbId}
              aria-label={label}
              aria-labelledby={labelledby}
              aria-valuetext={valueText}
              className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            />
          );
        })}
      </SliderPrimitive.Root>
    );
  }
);
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
