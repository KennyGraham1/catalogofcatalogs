'use client';

import { formatCount } from '@/lib/map-format';
import { cn } from '@/lib/utils';

/** Default position: bottom-left, just above the scale bar. */
export const MAP_STATUS_POSITION = 'bottom-8 left-2';

export interface MapStatusChipProps {
  /** Events drawn on the map now (useMapEventSelection().displayCount). */
  shown: number;
  /** Events in the viewport the budget chose from (useMapEventSelection().visibleCount). */
  total: number;
  /** Trailing hint; default "zoom in for more". */
  hint?: string;
  className?: string;
}

/**
 * How many events are drawn: "3,319 of 4,907 events shown · zoom in for more". A small
 * muted chip, hidden when every event is drawn. Place it inside the map's `relative`
 * wrapper, as a sibling of <MapContainer>.
 */
export function MapStatusChip({ shown, total, hint = 'zoom in for more', className }: MapStatusChipProps) {
  if (!(shown < total)) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-none absolute z-[1000] max-w-[calc(100%-16px)] truncate rounded-md border bg-background/85 px-2 py-0.5 text-[11px] leading-4 text-muted-foreground shadow-sm backdrop-blur-sm tabular-nums',
        MAP_STATUS_POSITION, className,
      )}
    >
      {formatCount(shown)} of {formatCount(total)} events shown{hint ? ` · ${hint}` : ''}
    </div>
  );
}
