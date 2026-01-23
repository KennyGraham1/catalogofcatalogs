'use client';

import { memo, useState, useEffect, useCallback, Suspense } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, Ruler, Calendar, MapPin, AlertTriangle, Radio, Target } from 'lucide-react';
import { getQualityColor } from '@/lib/quality-scoring';
import { InfoTooltip, TechnicalTermTooltip } from '@/components/ui/info-tooltip';

interface EarthquakeEvent {
  id: number | string;
  latitude: number;
  longitude: number;
  magnitude: number;
  depth: number | null;
  time: string;
  region?: string;
  catalogue?: string;
  magnitude_type?: string | null;
  event_type?: string | null;
  azimuthal_gap?: number | null;
  used_station_count?: number | null;
  quality_score?: number | null;
}

interface QualityScore {
  eventId: string | number;
  score: {
    overall: number;
    grade: string;
  };
}

interface OptimizedEventPopupProps {
  event: EarthquakeEvent;
  qualityScores?: QualityScore[];
  showFaults?: boolean;
  onClose?: () => void;
}

/**
 * Lightweight popup content that shows immediately
 */
const QuickPopupContent = memo(function QuickPopupContent({
  event,
  qualityScore,
}: {
  event: EarthquakeEvent;
  qualityScore?: QualityScore;
}) {
  return (
    <div className="p-2 min-w-[240px] max-w-[300px]">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-sm truncate flex-1">{event.region || 'Earthquake'}</h3>
        <Badge
          variant="outline"
          className="ml-2 text-xs"
          style={
            qualityScore
              ? { backgroundColor: getQualityColor(qualityScore.score.overall), color: 'white' }
              : {}
          }
        >
          {qualityScore ? qualityScore.score.grade : `M${event.magnitude.toFixed(1)}`}
        </Badge>
      </div>

      <div className="space-y-1.5 text-sm">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          <div className="flex items-center gap-1.5">
            <span className="font-medium">
              M {event.magnitude.toFixed(1)}
              {event.magnitude_type ? ` ${event.magnitude_type}` : ''}
            </span>
            <TechnicalTermTooltip term="magnitude" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Ruler className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          <div className="flex items-center gap-1.5">
            <span>{event.depth !== null ? `${event.depth.toFixed(1)} km depth` : 'Depth N/A'}</span>
            <TechnicalTermTooltip term="depth" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs">{new Date(event.time).toLocaleString('en-GB', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}</span>
            <InfoTooltip content="Event origin time in local timezone." />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs">
              {event.latitude.toFixed(4)}°, {event.longitude.toFixed(4)}°
            </span>
            <InfoTooltip content="Epicenter coordinates in decimal degrees." />
          </div>
        </div>
      </div>
    </div>
  );
});

/**
 * Extended details that load lazily
 */
const ExtendedDetails = memo(function ExtendedDetails({
  event,
}: {
  event: EarthquakeEvent;
}) {
  const hasQualityData =
    (event.azimuthal_gap != null) ||
    (event.used_station_count != null);

  if (!hasQualityData) return null;

  return (
    <div className="mt-2 pt-2 border-t space-y-1.5 text-xs">
      {event.azimuthal_gap != null && (
        <div className="flex items-center gap-2">
          <Target className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          <div className="flex items-center gap-1.5">
            <span>Azimuthal gap: {event.azimuthal_gap.toFixed(1)}°</span>
            <TechnicalTermTooltip term="azimuthalGap" />
          </div>
        </div>
      )}
      {event.used_station_count != null && (
        <div className="flex items-center gap-2">
          <Radio className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          <div className="flex items-center gap-1.5">
            <span>Stations: {event.used_station_count}</span>
            <TechnicalTermTooltip term="stationCount" />
          </div>
        </div>
      )}
      {event.catalogue && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span>Source: {event.catalogue}</span>
          <InfoTooltip content="Catalogue or agency that reported the event." />
        </div>
      )}
    </div>
  );
});

/**
 * Nearby faults section (loaded on demand)
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
      } catch (err) {
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
      <div className="mt-2 pt-2 border-t">
        <Skeleton className="h-4 w-24 mb-1" />
        <Skeleton className="h-3 w-full" />
      </div>
    );
  }

  if (error || !faults || faults.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 pt-2 border-t">
      <div className="flex items-center gap-1 text-xs font-medium mb-1">
        <AlertTriangle className="h-3 w-3 text-red-500" />
        <div className="flex items-center gap-1.5">
          <span>Nearby Faults ({faults.length})</span>
          <InfoTooltip content="Closest faults within 50 km of the epicenter." />
        </div>
      </div>
      <div className="space-y-0.5 text-xs text-muted-foreground">
        {faults.map((fault, idx) => (
          <div key={idx} className="truncate">
            {fault.name || fault.properties?.name || `Fault ${idx + 1}`}
            {fault.distance && ` (${fault.distance.toFixed(1)} km)`}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Optimized Event Popup Component
 *
 * Uses React.memo to prevent unnecessary re-renders and
 * lazy loads extended content for better performance.
 */
export const OptimizedEventPopup = memo(function OptimizedEventPopup({
  event,
  qualityScores = [],
  showFaults = false,
}: OptimizedEventPopupProps) {
  const qualityScore = qualityScores.find(q => q.eventId === event.id);

  return (
    <div className="optimized-popup">
      {/* Quick content - renders immediately */}
      <QuickPopupContent event={event} qualityScore={qualityScore} />

      {/* Extended details */}
      <ExtendedDetails event={event} />

      {/* Nearby faults - loaded lazily */}
      {showFaults && (
        <Suspense
          fallback={
            <div className="mt-2 pt-2 border-t">
              <Skeleton className="h-4 w-24" />
            </div>
          }
        >
          <NearbyFaultsSection latitude={event.latitude} longitude={event.longitude} />
        </Suspense>
      )}
    </div>
  );
});

/**
 * Simple popup for basic use cases (no quality scores or faults)
 */
export const SimpleEventPopup = memo(function SimpleEventPopup({
  event,
}: {
  event: EarthquakeEvent;
}) {
  return (
    <div className="p-2 min-w-[200px]">
      <div className="flex items-center justify-between mb-2">
        <Badge variant="outline" className="text-xs">
          {event.magnitude >= 6.0
            ? 'Major'
            : event.magnitude >= 5.0
            ? 'Moderate'
            : event.magnitude >= 4.0
            ? 'Light'
            : 'Minor'}
        </Badge>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold">M {event.magnitude.toFixed(1)}</span>
          <TechnicalTermTooltip term="magnitude" />
        </div>
      </div>

      <div className="space-y-1 text-sm">
        <div className="flex items-center gap-2">
          <Calendar className="h-3 w-3 text-muted-foreground" />
          <div className="flex items-center gap-1.5">
            <span>{new Date(event.time).toLocaleString('en-GB', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}</span>
            <InfoTooltip content="Event origin time in local timezone." />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="h-3 w-3 text-muted-foreground" />
          <div className="flex items-center gap-1.5">
            <span>
              {event.latitude.toFixed(3)}°, {event.longitude.toFixed(3)}°
            </span>
            <InfoTooltip content="Epicenter coordinates in decimal degrees." />
          </div>
        </div>
        {event.depth !== null && (
          <div className="flex items-center gap-2">
            <Ruler className="h-3 w-3 text-muted-foreground" />
            <div className="flex items-center gap-1.5">
              <span>{event.depth.toFixed(1)} km depth</span>
              <TechnicalTermTooltip term="depth" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default OptimizedEventPopup;
