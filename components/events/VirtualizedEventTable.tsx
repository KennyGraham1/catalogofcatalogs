'use client';

import { useState, useMemo } from 'react';
import { sortTableEvents } from '@/lib/event-table-sort';
import { List } from 'react-window';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Activity,
  MapPin,
  Calendar,
  Layers
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveEventQuality } from './event-quality';
import { getQualityBadgeVariant, type QualityGrade } from '@/lib/quality-scoring';

interface Event {
  id: string | number;
  time: string;
  latitude: number;
  longitude: number;
  depth: number | null;
  magnitude: number;
  magnitude_type?: string | null;
  location_name?: string | null;
  event_type?: string | null;
  quality_score?: number | null;
  quality_grade?: string | null;
  azimuthal_gap?: number | null;
  used_station_count?: number | null;
  public_id?: string | null;
  // Extended QuakeML 1.2 fields
  horizontal_uncertainty?: number | null;
  depth_type?: string | null;
  agency_id?: string | null;
  author?: string | null;
  evaluation_mode?: string | null;
  evaluation_status?: string | null;
}

type SortField = 'time' | 'magnitude' | 'depth' | 'quality' | 'latitude' | 'longitude';
type SortDirection = 'asc' | 'desc';

interface VirtualizedEventTableProps {
  events: Event[];
  onEventClick?: (event: Event) => void;
  className?: string;
  defaultSortField?: SortField;
  defaultSortDirection?: SortDirection;
  rowHeight?: number;
  height?: number;
}

/**
 * Origin times are UTC by definition (QuakeML 1.2 / ISO 8601 "Z"), so they are rendered
 * in UTC with the zone shown - formatting them in the browser's zone puts an event on the
 * wrong calendar day for 13 of every 24 hours under NZDT (UTC+13).
 *
 * Hoisted to module scope on purpose: this renders once per row over thousands of events,
 * and constructing an Intl.DateTimeFormat per row costs ~82 ms per 1000 rows.
 */
const UTC_MINUTE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
  timeZoneName: 'short',
});

export function VirtualizedEventTable({
  events,
  onEventClick,
  className,
  defaultSortField = 'time',
  defaultSortDirection = 'desc',
  rowHeight = 60,
  height = 600
}: VirtualizedEventTableProps) {
  const [sortField, setSortField] = useState<SortField>(defaultSortField);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);

  // Resolve Quality once per event list (idempotent if EventTable already resolved it before
  // delegating here): prefer stored quality_score/quality_grade (C1), else compute Q
  // client-side for legacy rows, so this table is correct even when used on its own.
  const displayEvents = useMemo(() => events.map(event => {
    const { score, grade } = resolveEventQuality(event);
    return event.quality_score === score && event.quality_grade === grade
      ? event
      : { ...event, quality_score: score, quality_grade: grade };
  }), [events]);

  // Sort events
  const sortedEvents = useMemo(() => {
    return sortTableEvents(displayEvents, sortField, sortDirection);
  }, [displayEvents, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="ml-2 h-4 w-4" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4" />
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return UTC_MINUTE_FORMAT.format(date);
  };

  const getMagnitudeColor = (magnitude: number) => {
    if (magnitude >= 7) return 'text-red-600 dark:text-red-400';
    if (magnitude >= 6) return 'text-orange-600 dark:text-orange-400';
    if (magnitude >= 5) return 'text-yellow-600 dark:text-yellow-400';
    if (magnitude >= 4) return 'text-blue-600 dark:text-blue-400';
    return 'text-gray-600 dark:text-gray-400';
  };

  // Same 0-100 scale and grade->variant mapping as EventTable's getQualityBadge (both read
  // getQualityBadgeVariant from lib/quality-scoring): the table that appears above 100 events
  // must not silently switch scales from the one below it.
  const getQualityBadge = (score: number | null | undefined, grade: string | null | undefined) => {
    if (score == null || !grade) {
      return <Badge variant="outline" className="text-xs">N/A</Badge>;
    }

    return (
      <Badge variant={getQualityBadgeVariant(grade as QualityGrade)} className="text-xs">
        {`${score.toFixed(0)} ${grade}`}
      </Badge>
    );
  };

  // Row renderer for react-window (new API)
  const RowComponent = ({ index, style, ariaAttributes }: {
    index: number;
    style: React.CSSProperties;
    ariaAttributes: any;
  }) => {
    const event = sortedEvents[index];

    return (
      <div
        {...ariaAttributes}
        style={style}
        onClick={() => onEventClick?.(event)}
        className={cn(
          'flex items-center border-b px-4 hover:bg-muted/50 transition-colors',
          onEventClick && 'cursor-pointer'
        )}
      >
        {/* Time */}
        <div className="flex-[2] min-w-0 pr-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm truncate">{formatDate(event.time)}</span>
          </div>
        </div>

        {/* Magnitude */}
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-2">
            <Activity className={cn('h-4 w-4 flex-shrink-0', getMagnitudeColor(event.magnitude))} />
            <span className={cn('font-medium', getMagnitudeColor(event.magnitude))}>
              {event.magnitude.toFixed(1)}
              {event.magnitude_type && (
                <span className="text-xs text-muted-foreground ml-1">
                  {event.magnitude_type}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Depth */}
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm">{event.depth?.toFixed(1) ?? '—'} km</span>
          </div>
        </div>

        {/* Location */}
        <div className="flex-[2] min-w-0 pr-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm truncate">
              {event.location_name || `${event.latitude.toFixed(3)}°, ${event.longitude.toFixed(3)}°`}
            </span>
          </div>
        </div>

        {/* Coordinates */}
        <div className="flex-[1.5] min-w-0 pr-4">
          <span className="text-xs text-muted-foreground">
            {event.latitude.toFixed(2)}°, {event.longitude.toFixed(2)}°
          </span>
        </div>

        {/* Quality */}
        <div className="flex-1 min-w-0 pr-4">
          {getQualityBadge(event.quality_score, event.quality_grade)}
        </div>

        {/* Type */}
        <div className="flex-1 min-w-0">
          {event.event_type && (
            <Badge variant="outline" className="text-xs truncate max-w-full">
              {event.event_type}
            </Badge>
          )}
        </div>
      </div>
    );
  };

  if (sortedEvents.length === 0) {
    return (
      <div className={cn('rounded-md border', className)}>
        <div className="text-center text-muted-foreground py-8">
          No events found
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-md border', className)}>
      {/* Header */}
      <div className="flex items-center border-b bg-muted/50 px-4 py-3 font-medium text-sm">
        <div className="flex-[2] pr-4">
          <Button
            variant="ghost"
            onClick={() => handleSort('time')}
            className="h-auto p-0 font-medium hover:bg-transparent"
          >
            Time
            {renderSortIcon('time')}
          </Button>
        </div>
        <div className="flex-1 pr-4">
          <Button
            variant="ghost"
            onClick={() => handleSort('magnitude')}
            className="h-auto p-0 font-medium hover:bg-transparent"
          >
            Magnitude
            {renderSortIcon('magnitude')}
          </Button>
        </div>
        <div className="flex-1 pr-4">
          <Button
            variant="ghost"
            onClick={() => handleSort('depth')}
            className="h-auto p-0 font-medium hover:bg-transparent"
          >
            Depth (km)
            {renderSortIcon('depth')}
          </Button>
        </div>
        <div className="flex-[2] pr-4">Location</div>
        <div className="flex-[1.5] pr-4">
          <Button
            variant="ghost"
            onClick={() => handleSort('latitude')}
            className="h-auto p-0 font-medium hover:bg-transparent"
          >
            Coordinates
            {renderSortIcon('latitude')}
          </Button>
        </div>
        <div className="flex-1 pr-4">
          <Button
            variant="ghost"
            onClick={() => handleSort('quality')}
            className="h-auto p-0 font-medium hover:bg-transparent"
          >
            Quality
            {renderSortIcon('quality')}
          </Button>
        </div>
        <div className="flex-1">Type</div>
      </div>

      {/* Virtualized List */}
      <List<Record<string, never>>
        style={{ height }}
        rowCount={sortedEvents.length}
        rowHeight={rowHeight}
        rowComponent={RowComponent}
        rowProps={{}}
        className="scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700"
      />
    </div>
  );
}
