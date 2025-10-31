'use client';

import { useState, useMemo } from 'react';
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

interface Event {
  id: string | number;
  time: string;
  latitude: number;
  longitude: number;
  depth: number;
  magnitude: number;
  magnitude_type?: string | null;
  location_name?: string | null;
  event_type?: string | null;
  quality_score?: number | null;
  azimuthal_gap?: number | null;
  used_station_count?: number | null;
  public_id?: string | null;
}

type SortField = 'time' | 'magnitude' | 'depth' | 'quality' | 'latitude' | 'longitude';
type SortDirection = 'asc' | 'desc';

interface EventTableProps {
  events: Event[];
  onEventClick?: (event: Event) => void;
  className?: string;
  defaultSortField?: SortField;
  defaultSortDirection?: SortDirection;
}

export function EventTable({ 
  events, 
  onEventClick,
  className,
  defaultSortField = 'time',
  defaultSortDirection = 'desc'
}: EventTableProps) {
  const [sortField, setSortField] = useState<SortField>(defaultSortField);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);

  // Sort events
  const sortedEvents = useMemo(() => {
    const sorted = [...events].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'time':
          aValue = new Date(a.time).getTime();
          bValue = new Date(b.time).getTime();
          break;
        case 'magnitude':
          aValue = a.magnitude || 0;
          bValue = b.magnitude || 0;
          break;
        case 'depth':
          aValue = a.depth || 0;
          bValue = b.depth || 0;
          break;
        case 'quality':
          aValue = a.quality_score || 0;
          bValue = b.quality_score || 0;
          break;
        case 'latitude':
          aValue = a.latitude;
          bValue = b.latitude;
          break;
        case 'longitude':
          aValue = a.longitude;
          bValue = b.longitude;
          break;
        default:
          return 0;
      }

      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });

    return sorted;
  }, [events, sortField, sortDirection]);

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
    return date.toLocaleString('en-NZ', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getMagnitudeColor = (magnitude: number) => {
    if (magnitude >= 7) return 'text-red-600 dark:text-red-400';
    if (magnitude >= 6) return 'text-orange-600 dark:text-orange-400';
    if (magnitude >= 5) return 'text-yellow-600 dark:text-yellow-400';
    if (magnitude >= 4) return 'text-blue-600 dark:text-blue-400';
    return 'text-muted-foreground';
  };

  const getQualityBadge = (score?: number | null) => {
    if (!score) return null;
    
    let variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'secondary';
    if (score >= 80) variant = 'default';
    else if (score >= 60) variant = 'secondary';
    else variant = 'destructive';

    return (
      <Badge variant={variant} className="text-xs">
        {score.toFixed(0)}
      </Badge>
    );
  };

  return (
    <div className={cn('rounded-md border', className)}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">
              <Button
                variant="ghost"
                onClick={() => handleSort('time')}
                className="h-auto p-0 font-medium hover:bg-transparent"
              >
                Time
                {renderSortIcon('time')}
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort('magnitude')}
                className="h-auto p-0 font-medium hover:bg-transparent"
              >
                Magnitude
                {renderSortIcon('magnitude')}
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort('depth')}
                className="h-auto p-0 font-medium hover:bg-transparent"
              >
                Depth (km)
                {renderSortIcon('depth')}
              </Button>
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
              <Button
                variant="ghost"
                onClick={() => handleSort('quality')}
                className="h-auto p-0 font-medium hover:bg-transparent"
              >
                Quality
                {renderSortIcon('quality')}
              </Button>
            </TableHead>
            <TableHead>Type</TableHead>
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
                    <span>{event.depth.toFixed(1)}</span>
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
                  {getQualityBadge(event.quality_score)}
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

