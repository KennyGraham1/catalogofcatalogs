'use client';

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, CircleHelp, SlidersHorizontal } from 'lucide-react';
import { MAP_OVERLAY_CLASS } from '@/lib/map-style';
import { cn } from '@/lib/utils';

/** Default position: top-right, under the 32 px layers button (8 + 32 + 8 px). */
export const MAP_STYLE_PANEL_POSITION = 'top-12 right-2';

/** Maps narrower than this start with the Style panel closed. */
export const STYLE_PANEL_AUTO_OPEN_MIN_WIDTH = 1600;

export interface MapStylePanelProps {
  /** Panel sections (<StylePanelSection>): colour-by, overlays, map detail... */
  children: ReactNode;
  /** Button / header text. */
  title?: string;
  /** Explanation shown from the single (?) in the header - no per-option help icons. */
  info?: ReactNode;
  /**
   * 'auto' (default): open on maps at least STYLE_PANEL_AUTO_OPEN_MIN_WIDTH px wide, closed
   * on narrower ones (a map not laid out yet counts as wide).
   */
  defaultOpen?: boolean | 'auto';
  className?: string;
}

/**
 * The one "Style" button and collapsible options panel of a map (spec S3): top-right under
 * the layer button, <= 240 px wide, and capped at 55% of the map height minus the chrome
 * so it scrolls rather than reaching the legend (which is capped at 45%). Place it
 * as a sibling of <MapContainer> inside the map's `relative` wrapper.
 */
export function MapStylePanel({ children, title = 'Style', info, defaultOpen = 'auto', className }: MapStylePanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(defaultOpen !== false);
  const [showInfo, setShowInfo] = useState(false);
  const panelId = useId();

  // Decide the 'auto' default from the map's width before the first paint. Open only on a
  // very wide map: an open panel over a typical map covered part of the data on load.
  useLayoutEffect(() => {
    if (defaultOpen !== 'auto') return;
    const width = rootRef.current?.parentElement?.getBoundingClientRect().width ?? 0;
    if (width > 0 && width < STYLE_PANEL_AUTO_OPEN_MIN_WIDTH) setOpen(false);
    // Only the initial state is automatic; afterwards the user decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // z-[990]: over the map panes (<= 700) but under Leaflet's control corners (1000), so
  // the expanded base-layer menu opens over the panel rather than behind it.
  return (
    <div
      ref={rootRef}
      className={cn(
        'pointer-events-none absolute z-[990] flex max-h-[calc(55%-80px)] min-h-0 w-[240px] max-w-[calc(100%-16px)] flex-col items-end [&>*]:pointer-events-auto',
        MAP_STYLE_PANEL_POSITION, className,
      )}
    >
      {!open ? (
        <button
          type="button"
          aria-expanded={false}
          aria-controls={panelId}
          onClick={() => setOpen(true)}
          className={cn('inline-flex h-8 items-center gap-1.5 px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent', MAP_OVERLAY_CLASS)}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          {title}
        </button>
      ) : (
        <div id={panelId} role="region" aria-label={`${title} options`} className={cn('flex min-h-0 w-full flex-col text-xs text-foreground', MAP_OVERLAY_CLASS)}>
          <div className="flex h-8 flex-shrink-0 items-center gap-1 border-b pl-2.5 pr-1">
            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <span className="flex-1 font-medium">{title}</span>
            {info && (
              <button
                type="button"
                aria-expanded={showInfo}
                aria-label={`About ${title.toLowerCase()} options`}
                onClick={() => setShowInfo((value) => !value)}
                className={cn('inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground', showInfo && 'text-foreground')}
              >
                <CircleHelp className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
            <button
              type="button"
              aria-expanded
              aria-controls={panelId}
              aria-label={`Hide ${title.toLowerCase()} options`}
              onClick={() => setOpen(false)}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ChevronDown className="h-3.5 w-3.5 rotate-180" aria-hidden />
            </button>
          </div>
          <div className="min-h-0 space-y-3 overflow-y-auto p-2.5">
            {info && showInfo && <div className="rounded bg-muted/60 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">{info}</div>}
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

/** A titled group inside the Style panel. */
export function StylePanelSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      {title && <div className="text-[11px] font-semibold text-muted-foreground">{title}</div>}
      {children}
    </div>
  );
}

export interface RadioOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

/**
 * Native radio group for the Style panel (e.g. colour-by). Labels only - explanations go
 * in the panel's single (?).
 */
export function StyleRadioGroup<T extends string>({
  name, legend, value, onChange, options,
}: { name: string; legend: string; value: T; onChange: (value: T) => void; options: ReadonlyArray<RadioOption<T>> }) {
  const idPrefix = useId();
  return (
    <fieldset className="space-y-1">
      <legend className="mb-1.5 text-[11px] font-semibold text-muted-foreground">{legend}</legend>
      {options.map((option) => {
        const id = `${idPrefix}-${option.value}`;
        return (
          <div key={option.value} className="flex items-center gap-2">
            <input
              type="radio"
              id={id}
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
              className="h-3.5 w-3.5 cursor-pointer accent-foreground disabled:cursor-not-allowed"
            />
            <label htmlFor={id} className={cn('cursor-pointer text-xs leading-4', option.disabled && 'cursor-not-allowed text-muted-foreground')}>
              {option.label}
            </label>
          </div>
        );
      })}
    </fieldset>
  );
}
