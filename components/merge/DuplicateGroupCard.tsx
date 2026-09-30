'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, MapPin, Clock, Layers } from 'lucide-react';
import { calculateDistance, calculateTimeDifference } from '@/lib/earthquake-utils';
// Origin times are UTC by definition, so they are shown in UTC with the zone: the same
// string as the other map popups and the merge result table (host-zone formatting put NZ
// reviewers on the wrong calendar day).
import { formatOriginTime } from '@/components/map/OptimizedEventPopup';

interface EventData {
  id?: string;
  time: string;
  latitude: number;
  longitude: number;
  depth?: number | null;
  magnitude: number;
  source: string;
  catalogueId: string;
  catalogueName: string;
  magnitude_type?: string | null;
  magnitude_uncertainty?: number | null;
  used_station_count?: number | null;
  azimuthal_gap?: number | null;
  standard_error?: number | null;
  depth_uncertainty?: number | null;
}

interface DuplicateGroup {
  id: string;
  events: EventData[];
  selectedEventIndex: number;
  isSuspicious: boolean;
  validationWarnings: string[];
  // Optional so a preview from a server that predates contract M4 still renders.
  heldForReview?: boolean;
  supersededEventIndexes?: number[];
  /** Matched, then split off by the validity gate: published on its own. */
  separated?: boolean;
}

interface DuplicateGroupCardProps {
  group: DuplicateGroup;
  groupIndex: number;
  catalogueColors: Record<string, string>;
  onViewOnMap: (group: DuplicateGroup) => void;
}

export function DuplicateGroupCard({ group, groupIndex, catalogueColors, onViewOnMap }: DuplicateGroupCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const referenceEvent = group.events[0];
  const groupSize = group.events.length;

  // Calculate max differences
  const timeDiffs = group.events.map(e => calculateTimeDifference(referenceEvent.time, e.time));
  const maxTimeDiff = Math.max(...timeDiffs);

  const distances = group.events.map(e => 
    calculateDistance(referenceEvent.latitude, referenceEvent.longitude, e.latitude, e.longitude)
  );
  const maxDistance = Math.max(...distances);

  const magnitudes = group.events.map(e => e.magnitude);
  const magRange = Math.max(...magnitudes) - Math.min(...magnitudes);

  // Older vintages of one agency's solution (contract M5): listed for provenance, but they
  // took no part in the selection, so they are shown greyed and labelled.
  const superseded = new Set(group.supersededEventIndexes ?? []);

  return (
    <Card className={`${group.isSuspicious || group.separated ? 'border-orange-300 dark:border-orange-900/60 bg-orange-50/30 dark:bg-orange-950/20' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="text-sm font-medium">
                Group #{groupIndex + 1}
              </CardTitle>
              <Badge variant={groupSize === 2 ? 'default' : groupSize === 3 ? 'secondary' : 'destructive'}>
                {groupSize === 1 ? 'Single entry' : groupSize === 2 ? 'Duplicate' : groupSize === 3 ? 'Triplicate' : `${groupSize}× Match`}
              </Badge>
              {group.isSuspicious && (
                <Badge variant="outline" className="border-orange-500 text-orange-700">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Suspicious
                </Badge>
              )}
              {group.separated && (
                <Badge variant="outline" className="border-orange-500 text-orange-700" title="Matched with another entry, then kept apart because the group failed validation">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Separated
                </Badge>
              )}
              {/* The Average Values strategy publishes an epicentre no single report located,
                  so no report is selected (selectedEventIndex -1). */}
              {group.selectedEventIndex < 0 && groupSize > 1 && (
                <Badge variant="outline" title="No single entry's solution is used: the epicentre is computed from all entries">
                  Averaged
                </Badge>
              )}
              {/* Held (M4): the merge writes the strategy's provisional solution and marks
                  the row pending review on the catalogue page. */}
              {group.heldForReview && (
                <Badge variant="outline" className="border-amber-500 text-amber-700" title="The merged row is written with a provisional solution and marked for review on the catalogue page">
                  Held
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Δt: {maxTimeDiff.toFixed(1)}s
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                Δd: {maxDistance.toFixed(1)} km
              </span>
              <span className="flex items-center gap-1">
                <Layers className="h-3 w-3" />
                ΔM: {magRange.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewOnMap(group)}
            >
              <MapPin className="h-4 w-4 mr-1" />
              View on Map
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {group.validationWarnings.length > 0 && (
          <div className="mt-2 p-2 bg-orange-100 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/50 rounded text-xs text-orange-800 dark:text-orange-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium mb-1">Validation Warnings:</div>
                <ul className="list-disc list-inside space-y-0.5">
                  {group.validationWarnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-medium">Source</th>
                  <th className="text-left py-2 px-2 font-medium">Time</th>
                  <th className="text-right py-2 px-2 font-medium">Lat</th>
                  <th className="text-right py-2 px-2 font-medium">Lon</th>
                  <th className="text-right py-2 px-2 font-medium">Depth (km)</th>
                  <th className="text-right py-2 px-2 font-medium">Magnitude</th>
                  <th className="text-right py-2 px-2 font-medium">Stations</th>
                  <th className="text-right py-2 px-2 font-medium">Az Gap</th>
                  <th className="text-center py-2 px-2 font-medium">Selected</th>
                </tr>
              </thead>
              <tbody>
                {group.events.map((event, idx) => {
                  const isSelected = idx === group.selectedEventIndex;
                  const isSuperseded = superseded.has(idx);
                  const timeDiff = idx > 0 ? calculateTimeDifference(referenceEvent.time, event.time) : 0;
                  const distance = idx > 0 ? calculateDistance(
                    referenceEvent.latitude, referenceEvent.longitude,
                    event.latitude, event.longitude
                  ) : 0;

                  return (
                    <tr
                      key={idx}
                      data-superseded={isSuperseded ? 'true' : undefined}
                      className={`border-b ${isSelected ? 'bg-green-50 dark:bg-green-950/40 font-medium' : ''} ${isSuperseded ? 'text-muted-foreground opacity-60' : ''}`}
                    >
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: catalogueColors[event.catalogueId] || '#6b7280' }}
                          />
                          <span className="truncate max-w-[120px]" title={event.catalogueName}>
                            {event.catalogueName}
                          </span>
                          {isSuperseded && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0" title="An older vintage of this agency's solution; a newer one in the group replaces it">
                              superseded
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <div>{formatOriginTime(event.time)}</div>
                        {idx > 0 && <div className="text-muted-foreground">+{timeDiff.toFixed(1)}s</div>}
                      </td>
                      <td className="py-2 px-2 text-right">{event.latitude.toFixed(4)}</td>
                      <td className="py-2 px-2 text-right">{event.longitude.toFixed(4)}</td>
                      <td className="py-2 px-2 text-right">
                        {event.depth != null ? event.depth.toFixed(1) : 'N/A'}
                        {event.depth_uncertainty != null && (
                          <span className="text-muted-foreground"> ±{event.depth_uncertainty.toFixed(1)}</span>
                        )}
                        {idx > 0 && distance > 0 && (
                          <div className="text-muted-foreground">{distance.toFixed(1)} km</div>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {event.magnitude.toFixed(2)}
                        {event.magnitude_type && <span className="text-muted-foreground"> {event.magnitude_type}</span>}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {event.used_station_count != null ? event.used_station_count : 'N/A'}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {event.azimuthal_gap != null ? `${event.azimuthal_gap.toFixed(0)}°` : 'N/A'}
                      </td>
                      <td className="py-2 px-2 text-center">
                        {isSelected && <CheckCircle2 className="h-4 w-4 text-green-600 inline" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
