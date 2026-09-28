'use client';

import { useState, useMemo } from 'react';
import { sortTableEvents } from '@/lib/event-table-sort';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { VirtualizedEventTable } from './VirtualizedEventTable';
import { resolveEventQuality } from './event-quality';
import { getQualityBadgeVariant, type QualityGrade } from '@/lib/quality-scoring';
import { InfoTooltip, TechnicalTermTooltip } from '@/components/ui/info-tooltip';

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

interface EventTableProps {
  events: Event[];
  onEventClick?: (event: Event) => void;
  className?: string;
  defaultSortField?: SortField;
  defaultSortDirection?: SortDirection;
  virtualizationThreshold?: number; // Use virtualization if events > this number
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

export function EventTable({
  events,
  onEventClick,
  className,
  defaultSortField = 'time',
  defaultSortDirection = 'desc',
  virtualizationThreshold = 100
}: EventTableProps) {
  // Hooks must be called unconditionally (React rules of hooks)
  const [sortField, setSortField] = useState<SortField>(defaultSortField);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);

  // Resolve Quality once per event list: prefer the stored quality_score/quality_grade (C1)
  // and fall back to computing Q client-side for legacy rows that lack it, so the Quality
  // column and quality sort always have a real number to work with, on one 0-100 scale.
  const displayEvents = useMemo(() => events.map(event => {
    const { score, grade } = resolveEventQuality(event);
    return event.quality_score === score && event.quality_grade === grade
      ? event
      : { ...event, quality_score: score, quality_grade: grade };
  }), [events]);

  // Sort events
  const sortedEvents = useMemo(() => {
    if (displayEvents.length > virtualizationThreshold) return displayEvents;
    return sortTableEvents(displayEvents, sortField, sortDirection);
  }, [displayEvents, sortField, sortDirection, virtualizationThreshold]);

  // Use virtualized table for large datasets (after hooks are called)
  if (displayEvents.length > virtualizationThreshold) {
    return (
      <VirtualizedEventTable
        events={displayEvents}
        onEventClick={onEventClick}
        className={className}
        defaultSortField={defaultSortField}
        defaultSortDirection={defaultSortDirection}
      />
    );
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new field with default direction
      setSortField(field);
      setSortDirection(field === 'time' ? 'desc' : 'asc');
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="ml-1 h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3" />
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
    return 'text-muted-foreground';
  };

  // One 0-100 scale, shared with VirtualizedEventTable via getQualityBadgeVariant: a Q of 45
  // must read the same "needs review" way regardless of which table renders it.
  const getQualityBadge = (score?: number | null, grade?: string | null) => {
    if (score == null || !grade) return null;

    return (
      <Badge variant={getQualityBadgeVariant(grade as QualityGrade)} className="text-xs">
        {`${score.toFixed(0)} ${grade}`}
      </Badge>
    );
  };

  return (
    <div className={cn('rounded-md border', className)}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  onClick={() => handleSort('time')}
                  className="h-auto p-0 font-medium hover:bg-transparent"
                >
                  Time
                  {renderSortIcon('time')}
                </Button>
                <InfoTooltip content="Origin time of the event." />
              </div>
            </TableHead>
            <TableHead>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  onClick={() => handleSort('magnitude')}
                  className="h-auto p-0 font-medium hover:bg-transparent"
                >
                  Magnitude
                  {renderSortIcon('magnitude')}
                </Button>
                <TechnicalTermTooltip term="magnitude" />
              </div>
            </TableHead>
            <TableHead>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  onClick={() => handleSort('depth')}
                  className="h-auto p-0 font-medium hover:bg-transparent"
                >
                  Depth (km)
                  {renderSortIcon('depth')}
                </Button>
                <TechnicalTermTooltip term="depth" />
              </div>
            </TableHead>
            <TableHead>Location</TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort('latitude')}
                className="h-auto p-0 font-medium hover:bg-transparent"
              >
                Coordinates
                {renderSortIcon('latitude')}
              </Button>
            </TableHead>
            <TableHead>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  onClick={() => handleSort('quality')}
                  className="h-auto p-0 font-medium hover:bg-transparent"
                >
                  Quality
                  {renderSortIcon('quality')}
                </Button>
                <TechnicalTermTooltip term="qualityScore" />
              </div>
            </TableHead>
            <TableHead>
              <div className="flex items-center gap-1.5">
                <span>Type</span>
                <InfoTooltip content="Event classification (e.g., earthquake, quarry blast)." />
              </div>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedEvents.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                No events found
              </TableCell>
            </TableRow>
          ) : (
            sortedEvents.map((event) => (
              <TableRow
                key={event.id}
                onClick={() => onEventClick?.(event)}
                className={cn(
                  onEventClick && 'cursor-pointer hover:bg-muted/50'
                )}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{formatDate(event.time)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Activity className={cn('h-4 w-4', getMagnitudeColor(event.magnitude))} />
                    <span className={cn('font-medium', getMagnitudeColor(event.magnitude))}>
                      {event.magnitude.toFixed(1)}
                      {event.magnitude_type && (
                        <span className="text-xs text-muted-foreground ml-1">
                          {event.magnitude_type}
                        </span>
                      )}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    <span>{event.depth?.toFixed(1) ?? '—'}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm">
                    {event.location_name || 'Unknown location'}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-mono">
                      {event.latitude.toFixed(3)}, {event.longitude.toFixed(3)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {getQualityBadge(event.quality_score, event.quality_grade)}
                </TableCell>
                <TableCell>
                  {event.event_type && (
                    <Badge variant="outline" className="text-xs">
                      {event.event_type}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
