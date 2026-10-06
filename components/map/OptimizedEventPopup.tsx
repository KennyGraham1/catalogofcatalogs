'use client';

import { memo, useState, useEffect, type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { scoreToGrade } from '@/lib/quality-scoring';
import {
  formatDepth, formatLatLon, formatMagnitude, formatOriginTimeUtc, formatQuality, isKnownRegion,
} from '@/lib/map-format';
import { useGeoNetLocality } from './use-geonet-locality';

/** Event fields the popup can show; every field but position, magnitude and time is optional. */
export interface PopupEvent {
  id: number | string;
  latitude: number;
  longitude: number;
  magnitude: number | null;
  depth: number | null;
  time: string;
  magnitude_type?: string | null;
  depth_uncertainty?: number | null;
  depth_type?: string | null;
  region?: string | null;
  /** Catalogue name (pooled views stamp every event with it). */
  catalogue?: string | null;
  /** The reporting agency's own event id. */
  source_id?: string | null;
  /** QuakeML event publicID: with source_id, how a GeoNet event is recognised (lib/geonet-locality.ts). */
  event_public_id?: string | null;
  event_type?: string | null;
  azimuthal_gap?: number | null;
  used_station_count?: number | null;
  /** Stored quality score (C1) and grade. */
  quality_score?: number | null;
  quality_grade?: string | null;
}

/** @deprecated Legacy per-map quality lookup; pass `quality` instead. */
interface QualityScore {
  eventId: string | number;
  score: {
    overall: number;
    grade: string;
  };
}

export interface OptimizedEventPopupProps {
  event: PopupEvent;
  /**
   * Quality to show as "Q 67 (B)". Defaults to the event's stored quality_score /
   * quality_grade; pass the value the map coloured the marker with so the two agree.
   */
  quality?: { score: number; grade?: string | null } | null;
  /** @deprecated Legacy lookup, used only when neither `quality` nor a stored score exists. */
  qualityScores?: QualityScore[];
  /** Catalogue display name; defaults to event.catalogue. */
  catalogueName?: string | null;
  /** Load and list active faults within 50 km of the epicentre. */
  showFaults?: boolean;
  /** Links or actions shown under the details (e.g. "Open event"). */
  children?: ReactNode;
  onClose?: () => void;
}

/**
 * Origin times are UTC by definition (QuakeML 1.2 / ISO 8601 "Z"), so they are rendered
 * in UTC with the zone shown - formatting them in the browser's zone puts an event on the
 * wrong calendar day for 13 of every 24 hours under NZDT (UTC+13).
 *
 * Hoisted to module scope on purpose: popups are rebuilt per event over thousands of
 * events, and constructing an Intl.DateTimeFormat per render costs ~82 ms per 1000 rows.
 */
/**
 * An origin time in UTC as ISO 8601 ("2016-11-13 11:02:56 UTC"), the one format every
 * event time on the platform uses (the old "13/11/2016" read as November 13th or the 11th
 * of the 13th month, depending on the reader). Unparseable values are shown verbatim.
 */
export function formatOriginTime(time: string): string {
  return formatOriginTimeUtc(time);
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** QuakeML event types that say nothing beyond "an earthquake". */
const UNREMARKABLE_EVENT_TYPES = new Set(['earthquake', 'not reported', 'unknown', '']);

/** One label/value row of the definition grid. */
function Row({ label, children, title }: { label: ReactNode; children: ReactNode; title?: string }) {
  return (
    <>
      <dt className="whitespace-nowrap text-muted-foreground" title={title}>{label}</dt>
      <dd className="min-w-0 break-words text-right tabular-nums">{children}</dd>
    </>
  );
}

/** The quality to print, in order: explicit prop, stored score, legacy lookup. */
function resolvePopupQuality(
  event: PopupEvent,
  quality: OptimizedEventPopupProps['quality'],
  qualityScores: QualityScore[] | undefined,
): { score: number; grade: string } | null {
  if (quality && finite(quality.score)) return { score: quality.score, grade: quality.grade || scoreToGrade(quality.score) };
  if (finite(event.quality_score)) return { score: event.quality_score, grade: event.quality_grade || scoreToGrade(event.quality_score) };
  const legacy = qualityScores?.find((q) => q.eventId === event.id);
  if (legacy && finite(legacy.score.overall)) return { score: legacy.score.overall, grade: legacy.score.grade };
  return null;
}

/**
 * Nearby faults section (loaded on demand); renders nothing when there are none.
 */
function NearbyFaultsSection({ latitude, longitude }: { latitude: number; longitude: number }) {
  const [faults, setFaults] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchFaults = async () => {
      try {
        const response = await fetch(
          `/api/faults/nearby?lat=${latitude}&lon=${longitude}&radius=50&limit=3`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch nearby faults');
        }

        const data = await response.json();
        if (!cancelled) {
          setFaults(data.faults || []);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('Could not load nearby faults');
          setLoading(false);
        }
      }
    };

    fetchFaults();

    return () => {
      cancelled = true;
    };
  }, [latitude, longitude]);

  if (loading) {
    return (
      <div className="mt-2 border-t pt-2">
        <Skeleton className="mb-1 h-3 w-24" />
        <Skeleton className="h-3 w-full" />
      </div>
    );
  }

  if (error || !faults || faults.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 border-t pt-2">
      <div className="mb-1 font-medium" title="Closest mapped active faults within 50 km of the epicentre.">
        Nearby faults
      </div>
      <ul className="space-y-0.5 text-muted-foreground">
        {faults.map((fault, idx) => (
          <li key={idx} className="flex justify-between gap-3">
            <span className="truncate">{fault.name || fault.properties?.name || `Fault ${idx + 1}`}</span>
            {finite(fault.distance) && <span className="tabular-nums">{fault.distance.toFixed(1)} km</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Event popup shared by every map (spec S5): magnitude as a seismologist writes it
 * ("ML 2.6"), the UTC origin time, then a compact definition grid - location with
 * hemisphere letters, depth (± uncertainty or "fixed"), and region, type, quality, gap,
 * stations, catalogue and agency event id only when the event has them. No empty rows,
 * no "Unknown" placeholders, no descriptor badge. A GeoNet event also gets GeoNet's own
 * locality, credited, when the hover card has already fetched it (the popup never asks
 * GeoNet itself; see useGeoNetLocality).
 *
 * Render inside a react-leaflet <Popup minWidth={260} maxWidth={300}> (or pass its
 * markup to bindPopup via renderToStaticMarkup on imperative maps).
 */
export const OptimizedEventPopup = memo(function OptimizedEventPopup({
  event,
  quality,
  qualityScores,
  catalogueName,
  showFaults = false,
  children,
}: OptimizedEventPopupProps) {
  const depth = formatDepth(event);
  const resolvedQuality = resolvePopupQuality(event, quality, qualityScores);
  const catalogue = catalogueName ?? event.catalogue;
  const geonetLocality = useGeoNetLocality(event);
  const eventType = typeof event.event_type === 'string' && !UNREMARKABLE_EVENT_TYPES.has(event.event_type.trim().toLowerCase())
    ? event.event_type.trim() : null;

  return (
    <div className="event-popup min-w-[240px] max-w-[300px] text-xs leading-4 text-foreground">
      <div className="mb-2">
        <div className="text-sm font-semibold leading-5 tabular-nums">
          {formatMagnitude(event.magnitude, event.magnitude_type)}
        </div>
        <time
          dateTime={event.time}
          title="Event origin time in UTC, the reference frame catalogues report origin times in."
          className="block text-[11px] tabular-nums text-muted-foreground"
        >
          {formatOriginTimeUtc(event.time)}
        </time>
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        {geonetLocality && (
          <Row label="Locality" title="GeoNet's description of where the event is (GeoNet, CC BY 4.0)">
            {geonetLocality} <span className="text-muted-foreground">(GeoNet)</span>
          </Row>
        )}
        <Row label="Location" title="Epicentre, decimal degrees">{formatLatLon(event.latitude, event.longitude)}</Row>
        <Row label="Depth">{depth ?? <span className="text-muted-foreground">not reported</span>}</Row>
        {isKnownRegion(event.region) && <Row label="Region">{event.region}</Row>}
        {eventType && <Row label="Type">{eventType}</Row>}
        {resolvedQuality && (
          <Row label="Quality" title="Location quality score (0-100) and grade">
            {formatQuality(resolvedQuality.score, resolvedQuality.grade)}
          </Row>
        )}
        {finite(event.azimuthal_gap) && (
          <Row label={<abbr title="Azimuthal gap: largest angle between stations seen from the epicentre" className="no-underline">Az. gap</abbr>}>
            {event.azimuthal_gap.toFixed(0)}°
          </Row>
        )}
        {finite(event.used_station_count) && <Row label="Stations">{event.used_station_count}</Row>}
        {catalogue && <Row label="Catalogue">{catalogue}</Row>}
        {event.source_id && (
          <Row label="Event ID"><span className="font-mono text-[11px]">{event.source_id}</span></Row>
        )}
      </dl>

      {showFaults && <NearbyFaultsSection latitude={event.latitude} longitude={event.longitude} />}

      {children && <div className="mt-2 border-t pt-2">{children}</div>}
    </div>
  );
});

/**
 * Simple popup for basic use cases (no quality scores or faults).
 * @deprecated Same as <OptimizedEventPopup event={...} />.
 */
export const SimpleEventPopup = memo(function SimpleEventPopup({ event }: { event: PopupEvent }) {
  return <OptimizedEventPopup event={event} />;
});

export default OptimizedEventPopup;
