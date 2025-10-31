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

export interface EventFilterValues {
  minMagnitude?: number;
  maxMagnitude?: number;
  minDepth?: number;
  maxDepth?: number;
  startTime?: string;
  endTime?: string;
  eventType?: string;
  magnitudeType?: string;
  evaluationStatus?: string;
  evaluationMode?: string;
  maxAzimuthalGap?: number;
  minUsedPhaseCount?: number;
  minUsedStationCount?: number;
  maxStandardError?: number;
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
                value={filters.eventType ?? ''}
                onValueChange={(value) =>
                  setFilters({
                    ...filters,
                    eventType: value || undefined,
                  })
                }
              >
                <SelectTrigger id="eventType">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All types</SelectItem>
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
                value={filters.magnitudeType ?? ''}
                onValueChange={(value) =>
                  setFilters({
                    ...filters,
                    magnitudeType: value || undefined,
                  })
                }
              >
                <SelectTrigger id="magnitudeType">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All types</SelectItem>
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
                value={filters.evaluationStatus ?? ''}
                onValueChange={(value) =>
                  setFilters({
                    ...filters,
                    evaluationStatus: value || undefined,
                  })
                }
              >
                <SelectTrigger id="evaluationStatus">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All statuses</SelectItem>
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

