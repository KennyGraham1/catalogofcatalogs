'use client';

import { useMemo, useState } from 'react';
import type { MapDetail } from '@/lib/map-event-selection';
import { EarthquakeCircleMap, type CircleMapEvent } from '@/components/map/EarthquakeCircleMap';

/**
 * A merged event as the merge page holds it: the catalogue summary rows of the saved merge,
 * or the full merged events of an export-only merge (which may carry no id).
 */
export type MergeMapEvent = Omit<CircleMapEvent, 'id' | 'depth'> & {
  id?: string | number | null;
  depth?: number | null;
  /** Agency label of an export-only merged row. */
  source?: string | null;
};

interface MapComponentProps {
  events: MergeMapEvent[];
  /**
   * Optional catalogue id -> name lookup for the source-catalogue colour mode, so a merged
   * row's contributing catalogues (source_catalogue_ids) are labelled by name, not raw id.
   */
  catalogueNames?: Record<string, string>;
}

/**
 * The merge result map: the catalogue map (EarthquakeCircleMap) on the merged events, so
 * it looks and behaves like every other event map - depth colour by default, legend card,
 * status chip and scale bar bottom-left, Style panel, the shared popup, framed to the data.
 * The parent sets the height (MergeActions: h-[600px]); the map fills it.
 */
export default function MapComponent({ events, catalogueNames }: MapComponentProps) {
  const [sampleSize, setSampleSize] = useState<MapDetail>('auto');

  // EarthquakeCircleMap keys markers and the popup by id; an export-only merged row may have
  // none, so it gets a stable positional one. An absent depth is null (unknown), never 0.
  const circleEvents = useMemo<CircleMapEvent[]>(
    () => events.map((event, index) => ({
      ...event,
      id: event.id ?? `merged-${index}`,
      depth: event.depth ?? null,
    })),
    [events]
  );

  return (
    <EarthquakeCircleMap
      events={circleEvents}
      sampleSize={sampleSize}
      onSampleSizeChange={setSampleSize}
      height="100%"
      mapKey="merge-result-map"
      className="rounded-lg border"
      catalogueNames={catalogueNames}
    />
  );
}
