'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Filter, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { resolveEventQuality } from '@/components/events/event-quality';
import type { EventFilters as C4EventFilters } from '@/lib/event-filter-params';

/**
 * Extends the shared C4 filter contract (lib/event-filter-params.ts, owner H2a: magnitude,
 * depth, time, event/magnitude type, evaluation status/mode, azimuthal gap, station/phase
 * counts, standard error, per-field uncertainty maxima, minQuality, geographic bounds) with
 * two filters this component has always offered that C4 does not cover, because they need
 * the fault layer rather than anything stored on the event row.
 */
export interface EventFilterValues extends C4EventFilters {
  maxFaultDistance?: number; // Maximum distance from nearest fault (km)
  nearFaultsOnly?: boolean; // Only show events near known faults
}

interface EventFiltersProps {
  onFilterChange: (filters: EventFilterValues) => void;
  activeFilters: EventFilterValues;
}

export function EventFilters({ onFilterChange, activeFilters }: EventFiltersProps) {
  const [filters, setFilters] = useState<EventFilterValues>(activeFilters);
  const [isOpen, setIsOpen] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);

  const handleApply = () => {
    onFilterChange(filters);
    setIsOpen(false);
  };

  const confirmReset = () => {
    const emptyFilters: EventFilterValues = {};
    setFilters(emptyFilters);
    onFilterChange(emptyFilters);
    setShowResetDialog(false);
  };

  const handleRemoveFilter = (key: keyof EventFilterValues) => {
    const newFilters = { ...filters };
    delete newFilters[key];
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const activeFilterCount = Object.keys(activeFilters).length;

  const filterLabels: Record<keyof EventFilterValues, string> = {
    minMagnitude: 'Min Magnitude',
    maxMagnitude: 'Max Magnitude',
    minDepth: 'Min Depth',
    maxDepth: 'Max Depth',
    startTime: 'Start Time',
    endTime: 'End Time',
    eventType: 'Event Type',
    magnitudeType: 'Magnitude Type',
    evaluationStatus: 'Evaluation Status',
    evaluationMode: 'Evaluation Mode',
    maxAzimuthalGap: 'Max Azimuthal Gap',
    minUsedPhaseCount: 'Min Phase Count',
    minUsedStationCount: 'Min Station Count',
    maxStandardError: 'Max Standard Error',
    maxFaultDistance: 'Max Fault Distance',
    nearFaultsOnly: 'Near Faults Only',
    minQuality: 'Min Quality (Q)',
    maxHorizontalUncertainty: 'Max Horizontal Uncertainty',
    maxDepthUncertainty: 'Max Depth Uncertainty',
    maxTimeUncertainty: 'Max Time Uncertainty',
    maxMagnitudeUncertainty: 'Max Magnitude Uncertainty',
    // Geographic bounds (C4): no input in this panel yet (map-bounds filtering lives on the
    // map view), but a saved filter or a future caller can still set them, so the active
    // filter badges need a label rather than showing "undefined".
    minLatitude: 'Min Latitude',
    maxLatitude: 'Max Latitude',
    minLongitude: 'Min Longitude',
    maxLongitude: 'Max Longitude',
  };

  return (
    <div className="flex items-center gap-2">
      {/* Active filter badges */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(activeFilters).map(([key, value]) => (
          <Badge key={key} variant="secondary" className="gap-1">
            {filterLabels[key as keyof EventFilterValues]}: {value}
            <button
              onClick={() => handleRemoveFilter(key as keyof EventFilterValues)}
              className="ml-1 hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>

      {/* Filter button */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="default" className="ml-1 h-5 w-5 rounded-full p-0 text-xs">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Filter Events</SheetTitle>
            <SheetDescription>
              Filter events by quality metrics and other criteria
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Magnitude filters */}
            <div className="space-y-4">
              <h3 className="font-semibold">Magnitude</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="minMagnitude">Minimum</Label>
                  <Input
                    id="minMagnitude"
                    type="number"
                    step="0.1"
                    placeholder="e.g., 3.0"
                    value={filters.minMagnitude ?? ''}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        minMagnitude: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxMagnitude">Maximum</Label>
                  <Input
                    id="maxMagnitude"
                    type="number"
                    step="0.1"
                    placeholder="e.g., 7.0"
                    value={filters.maxMagnitude ?? ''}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        maxMagnitude: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                  />
                </div>
              </div>
            </div>

            {/* Depth filters */}
            <div className="space-y-4">
              <h3 className="font-semibold">Depth (km)</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="minDepth">Minimum</Label>
                  <Input
                    id="minDepth"
                    type="number"
                    step="1"
                    placeholder="e.g., 0"
                    value={filters.minDepth ?? ''}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        minDepth: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxDepth">Maximum</Label>
                  <Input
                    id="maxDepth"
                    type="number"
                    step="1"
                    placeholder="e.g., 100"
                    value={filters.maxDepth ?? ''}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        maxDepth: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                  />
                </div>
              </div>
            </div>

            {/* Time filters */}
            <div className="space-y-4">
              <h3 className="font-semibold">Time Range</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startTime">Start Time</Label>
                  <Input
                    id="startTime"
                    type="datetime-local"
                    value={filters.startTime ?? ''}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        startTime: e.target.value || undefined,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endTime">End Time</Label>
                  <Input
                    id="endTime"
                    type="datetime-local"
                    value={filters.endTime ?? ''}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        endTime: e.target.value || undefined,
                      })
                    }
                  />
                </div>
              </div>
            </div>

            {/* Event type */}
            <div className="space-y-2">
              <Label htmlFor="eventType">Event Type</Label>
              <Select
                // Radix Select.Item forbids value="" (reserved to mean "cleared"); "all" is
                // the sentinel for "no eventType filter" and is translated back to undefined.
                value={filters.eventType ?? 'all'}
                onValueChange={(value) =>
                  setFilters({
                    ...filters,
                    eventType: value === 'all' ? undefined : value,
                  })
                }
              >
                <SelectTrigger id="eventType">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="earthquake">Earthquake</SelectItem>
                  <SelectItem value="quarry blast">Quarry Blast</SelectItem>
                  <SelectItem value="explosion">Explosion</SelectItem>
                  <SelectItem value="induced or triggered event">Induced/Triggered</SelectItem>
                  <SelectItem value="other event">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Magnitude type */}
            <div className="space-y-2">
              <Label htmlFor="magnitudeType">Magnitude Type</Label>
              <Select
                value={filters.magnitudeType ?? 'all'}
                onValueChange={(value) =>
                  setFilters({
                    ...filters,
                    magnitudeType: value === 'all' ? undefined : value,
                  })
                }
              >
                <SelectTrigger id="magnitudeType">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="ML">ML (Local)</SelectItem>
                  <SelectItem value="Mw">Mw (Moment)</SelectItem>
                  <SelectItem value="mb">mb (Body wave)</SelectItem>
                  <SelectItem value="Ms">Ms (Surface wave)</SelectItem>
                  <SelectItem value="Md">Md (Duration)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Evaluation status */}
            <div className="space-y-2">
              <Label htmlFor="evaluationStatus">Evaluation Status</Label>
              <Select
                value={filters.evaluationStatus ?? 'all'}
                onValueChange={(value) =>
                  setFilters({
                    ...filters,
                    evaluationStatus: value === 'all' ? undefined : value,
                  })
                }
              >
                <SelectTrigger id="evaluationStatus">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="preliminary">Preliminary</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="reviewed">Reviewed</SelectItem>
                  <SelectItem value="final">Final</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Quality metrics */}
            <div className="space-y-4">
              <h3 className="font-semibold">Quality Metrics</h3>

              <div className="space-y-2">
                <Label htmlFor="minQuality">Minimum Quality Score (Q)</Label>
                <Input
                  id="minQuality"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  placeholder="e.g., 70"
                  value={filters.minQuality ?? ''}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      minQuality: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Only show events with a quality score of at least this value (0-100)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxAzimuthalGap">Max Azimuthal Gap (degrees)</Label>
                <Input
                  id="maxAzimuthalGap"
                  type="number"
                  step="1"
                  placeholder="e.g., 180"
                  value={filters.maxAzimuthalGap ?? ''}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      maxAzimuthalGap: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="minUsedPhaseCount">Min Used Phase Count</Label>
                <Input
                  id="minUsedPhaseCount"
                  type="number"
                  step="1"
                  placeholder="e.g., 10"
                  value={filters.minUsedPhaseCount ?? ''}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      minUsedPhaseCount: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="minUsedStationCount">Min Used Station Count</Label>
                <Input
                  id="minUsedStationCount"
                  type="number"
                  step="1"
                  placeholder="e.g., 5"
                  value={filters.minUsedStationCount ?? ''}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      minUsedStationCount: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxStandardError">Max Standard Error (km)</Label>
                <Input
                  id="maxStandardError"
                  type="number"
                  step="0.1"
                  placeholder="e.g., 5.0"
                  value={filters.maxStandardError ?? ''}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      maxStandardError: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                />
              </div>
            </div>

            {/* Per-field uncertainty maxima (C4). horizontal_uncertainty covers the QuakeML
                OriginUncertainty error ellipse (and the plain circular column); GeoNet and
                USGS imports only ever populate that and depth_uncertainty, never a
                latitude/longitude uncertainty pair - see the map page's "With Uncertainty"
                stat (#57) for the same convention. */}
            <div className="space-y-4">
              <h3 className="font-semibold">Location Uncertainty</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="maxHorizontalUncertainty">Max Horizontal (km)</Label>
                  <Input
                    id="maxHorizontalUncertainty"
                    type="number"
                    step="0.1"
                    placeholder="e.g., 5"
                    value={filters.maxHorizontalUncertainty ?? ''}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        maxHorizontalUncertainty: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxDepthUncertainty">Max Depth (km)</Label>
                  <Input
                    id="maxDepthUncertainty"
                    type="number"
                    step="0.1"
                    placeholder="e.g., 5"
                    value={filters.maxDepthUncertainty ?? ''}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        maxDepthUncertainty: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxTimeUncertainty">Max Time (s)</Label>
                  <Input
                    id="maxTimeUncertainty"
                    type="number"
                    step="0.1"
                    placeholder="e.g., 1"
                    value={filters.maxTimeUncertainty ?? ''}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        maxTimeUncertainty: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxMagnitudeUncertainty">Max Magnitude</Label>
                  <Input
                    id="maxMagnitudeUncertainty"
                    type="number"
                    step="0.01"
                    placeholder="e.g., 0.2"
                    value={filters.maxMagnitudeUncertainty ?? ''}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        maxMagnitudeUncertainty: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                  />
                </div>
              </div>
            </div>

            {/* Fault proximity filters */}
            <div className="space-y-4">
              <h3 className="font-semibold">Fault Proximity</h3>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="nearFaultsOnly">Show only events near faults</Label>
                  <input
                    id="nearFaultsOnly"
                    type="checkbox"
                    checked={filters.nearFaultsOnly ?? false}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        nearFaultsOnly: e.target.checked || undefined,
                      })
                    }
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Filter events within 50 km of known active faults
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxFaultDistance">Max Distance from Fault (km)</Label>
                <Input
                  id="maxFaultDistance"
                  type="number"
                  step="1"
                  placeholder="e.g., 50"
                  value={filters.maxFaultDistance ?? ''}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      maxFaultDistance: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Only show events within this distance from nearest fault
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-4">
              <Button onClick={handleApply} className="flex-1">
                Apply Filters
              </Button>
              <Button onClick={() => setShowResetDialog(true)} variant="outline">
                Reset
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all filters?</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear all active filters and reset them to their default values. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReset}>
              Reset Filters
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Minimal shape `applyEventFilters` reads; a real event row (EventTable's Event, an API
 *  EventSummary, ...) carries more fields than this and satisfies it structurally. */
export interface FilterableEvent {
  time: string;
  latitude: number;
  longitude: number;
  magnitude: number;
  depth: number | null;
  event_type?: string | null;
  magnitude_type?: string | null;
  evaluation_status?: string | null;
  evaluation_mode?: string | null;
  azimuthal_gap?: number | null;
  used_phase_count?: number | null;
  used_station_count?: number | null;
  standard_error?: number | null;
  quality_score?: number | null;
  quality_grade?: string | null;
  horizontal_uncertainty?: number | null;
  min_horizontal_uncertainty?: number | null;
  max_horizontal_uncertainty?: number | null;
  depth_uncertainty?: number | null;
  time_uncertainty?: number | null;
  magnitude_uncertainty?: number | null;
}

/**
 * Apply EventFilterValues to an already-loaded event array. Mirrors the semantics
 * lib/event-filter-params.ts / getFilteredEvents define for the server (C4), so the table a
 * user is looking at and the file "Export filtered events" downloads (C12, built with that
 * module's own eventFiltersToSearchParams) cover the same events even before every page
 * calls the server-side filtered-events route for its main event list.
 *
 * maxFaultDistance/nearFaultsOnly are intentionally not applied here: fault proximity needs
 * the fault layer the map view loads, which this module does not have.
 */
export function applyEventFilters<T extends FilterableEvent>(events: T[], filters: EventFilterValues): T[] {
  const hasStart = typeof filters.startTime === 'string' && filters.startTime.length > 0;
  const hasEnd = typeof filters.endTime === 'string' && filters.endTime.length > 0;
  const start = hasStart ? Date.parse(filters.startTime as string) : NaN;
  const end = hasEnd ? Date.parse(filters.endTime as string) : NaN;

  return events.filter((event) => {
    if (filters.minMagnitude != null && event.magnitude < filters.minMagnitude) return false;
    if (filters.maxMagnitude != null && event.magnitude > filters.maxMagnitude) return false;
    if (filters.minDepth != null && (event.depth == null || event.depth < filters.minDepth)) return false;
    if (filters.maxDepth != null && (event.depth == null || event.depth > filters.maxDepth)) return false;

    if (hasStart && !Number.isNaN(start)) {
      const eventTime = Date.parse(event.time);
      if (Number.isNaN(eventTime) || eventTime < start) return false;
    }
    if (hasEnd && !Number.isNaN(end)) {
      const eventTime = Date.parse(event.time);
      if (Number.isNaN(eventTime) || eventTime > end) return false;
    }

    if (filters.eventType && (event.event_type ?? '').toLowerCase() !== filters.eventType.toLowerCase()) return false;
    if (filters.magnitudeType && (event.magnitude_type ?? '').toLowerCase() !== filters.magnitudeType.toLowerCase()) return false;
    if (filters.evaluationStatus && (event.evaluation_status ?? '').toLowerCase() !== filters.evaluationStatus.toLowerCase()) return false;
    if (filters.evaluationMode && (event.evaluation_mode ?? '').toLowerCase() !== filters.evaluationMode.toLowerCase()) return false;

    if (filters.maxAzimuthalGap != null && (event.azimuthal_gap == null || event.azimuthal_gap > filters.maxAzimuthalGap)) return false;
    if (filters.minUsedPhaseCount != null && (event.used_phase_count == null || event.used_phase_count < filters.minUsedPhaseCount)) return false;
    if (filters.minUsedStationCount != null && (event.used_station_count == null || event.used_station_count < filters.minUsedStationCount)) return false;
    if (filters.maxStandardError != null && (event.standard_error == null || event.standard_error > filters.maxStandardError)) return false;

    // Horizontal uncertainty: the error-ellipse semi-major axis when present, else the plain
    // circular column - the same precedence metricsFromEvent uses for Q's location dimension.
    if (filters.maxHorizontalUncertainty != null) {
      const horizontal = event.max_horizontal_uncertainty ?? event.horizontal_uncertainty;
      if (horizontal == null || horizontal > filters.maxHorizontalUncertainty) return false;
    }
    if (filters.maxDepthUncertainty != null && (event.depth_uncertainty == null || event.depth_uncertainty > filters.maxDepthUncertainty)) return false;
    if (filters.maxTimeUncertainty != null && (event.time_uncertainty == null || event.time_uncertainty > filters.maxTimeUncertainty)) return false;
    if (filters.maxMagnitudeUncertainty != null && (event.magnitude_uncertainty == null || event.magnitude_uncertainty > filters.maxMagnitudeUncertainty)) return false;

    if (filters.minQuality != null) {
      const { score } = resolveEventQuality(event);
      if (score < filters.minQuality) return false;
    }

    if (filters.minLatitude != null && event.latitude < filters.minLatitude) return false;
    if (filters.maxLatitude != null && event.latitude > filters.maxLatitude) return false;
    if (filters.minLongitude != null && filters.maxLongitude != null) {
      // minLongitude > maxLongitude is a box crossing the antimeridian (RFC 7946 S5.2,
      // matching lib/event-filter-params.ts), e.g. 177..-178 for the Kermadec arc.
      const crossesAntimeridian = filters.minLongitude > filters.maxLongitude;
      const inBounds = crossesAntimeridian
        ? event.longitude >= filters.minLongitude || event.longitude <= filters.maxLongitude
        : event.longitude >= filters.minLongitude && event.longitude <= filters.maxLongitude;
      if (!inBounds) return false;
    } else {
      if (filters.minLongitude != null && event.longitude < filters.minLongitude) return false;
      if (filters.maxLongitude != null && event.longitude > filters.maxLongitude) return false;
    }

    return true;
  });
}

