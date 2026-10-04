'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ChevronDown, ChevronUp, MapPin } from 'lucide-react';
// Origin times are UTC by definition: ISO 8601 date and time with the zone, the string the
// map hover card shows (a day/month order is ambiguous between reviewers).
import { formatDepth, formatLatLon, formatMagnitude, formatOriginTimeUtc } from '@/lib/map-format';
import { QcEntryTable } from './QcEntryTable';
import {
  countOf, groupCatalogueIds, groupSpread, publishedEntry, publishedSolution, selectionReason, spreadParts,
  type PreviewGroup,
} from './qc-format';

export interface DuplicateGroupCardProps {
  group: PreviewGroup;
  /** Position of the group in the preview response; shown as "Group #n". */
  groupIndex: number;
  catalogueColors: Record<string, string>;
  /** The merge strategy and source priority, to say why the published solution won. */
  strategy?: string;
  priority?: string;
  onViewOnMap: (group: PreviewGroup) => void;
}

/** A DOM-safe id fragment from a group id. */
export function domId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, '_');
}

/** "2022-04-23 02:16:39 UTC · ML 3.42 · 41.234° S, 174.123° E · 12.0 km": the published solution. */
export function solutionSummary(group: PreviewGroup): string | null {
  const solution = publishedSolution(group);
  if (!solution) return null;
  const parts = [formatOriginTimeUtc(solution.time)];
  const entry = publishedEntry(group);
  if (entry) parts.push(formatMagnitude(entry.magnitude, entry.magnitude_type));
  parts.push(formatLatLon(solution.latitude, solution.longitude));
  if (entry) {
    const depth = formatDepth({ depth: entry.depth, depth_uncertainty: entry.depth_uncertainty, depth_type: entry.depth_type });
    if (depth) parts.push(depth);
  }
  return parts.join(' · ');
}

/** A flag: amber, the only colour on a group card (sizes and roles stay neutral). */
export const FLAG_BADGE = 'border-amber-500 bg-amber-50 text-amber-800 dark:border-amber-600 dark:bg-amber-950/50 dark:text-amber-200';
export const NEUTRAL_BADGE = 'font-normal text-muted-foreground';

/**
 * One matched group of the QC preview: its size, flags, the published solution and why it
 * was chosen, the largest offset of any entry from it, the consistency warnings, and (on
 * demand) the entries.
 */
export function DuplicateGroupCard({ group, groupIndex, catalogueColors, strategy, priority, onViewOnMap }: DuplicateGroupCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const size = group.events.length;
  const catalogueCount = groupCatalogueIds(group).length;
  const spread = groupSpread(group);
  const reason = selectionReason(group, strategy, priority);
  const summary = solutionSummary(group);
  const computed = group.selectedEventIndex < 0 && !!group.computedEpicentre;
  const flagged = group.isSuspicious || group.heldForReview === true;
  const entriesId = `qc-group-${domId(group.id)}-entries`;
  const label = `Group #${groupIndex + 1}`;

  return (
    <Card data-group-id={group.id} className={flagged ? 'border-amber-300 dark:border-amber-800' : undefined}>
      <CardHeader className="space-y-3 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold">{label}</h4>
              <Badge variant="outline" className={NEUTRAL_BADGE} data-badge="size">
                {size === 1 ? 'Single entry' : `${countOf(size, 'entry', 'entries')} · ${countOf(catalogueCount, 'catalogue', 'catalogues')}`}
              </Badge>
              {group.isSuspicious && (
                <Badge variant="outline" className={FLAG_BADGE} data-badge="flag">
                  <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
                  Flagged
                </Badge>
              )}
              {group.heldForReview && (
                <Badge
                  variant="outline"
                  className={FLAG_BADGE}
                  data-badge="flag"
                  title="The merged event is written with a provisional solution and listed for review on the catalogue page"
                >
                  Held
                </Badge>
              )}
              {computed && (
                <Badge
                  variant="outline"
                  className={NEUTRAL_BADGE}
                  data-badge="role"
                  title="No single entry's solution is published: the epicentre is computed from all entries"
                >
                  {strategy === 'median' ? 'Median' : 'Averaged'}
                </Badge>
              )}
            </div>
            {summary && <p className="text-xs tabular-nums text-muted-foreground">{summary}</p>}
            {reason && <p className="text-xs" data-testid="selection-reason">{reason}</p>}
            {spread && (
              <p className="text-xs tabular-nums text-muted-foreground" data-testid="group-spread">
                Largest offset from the published solution: {spreadParts(spread).join(' · ')}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onViewOnMap(group)}>
              <MapPin className="mr-1 h-4 w-4" aria-hidden="true" />
              View on map
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={isExpanded}
              aria-controls={isExpanded ? entriesId : undefined}
              onClick={() => setIsExpanded(open => !open)}
            >
              {isExpanded ? 'Hide entries' : 'Show entries'}
              {isExpanded
                ? <ChevronUp className="ml-1 h-4 w-4" aria-hidden="true" />
                : <ChevronDown className="ml-1 h-4 w-4" aria-hidden="true" />}
            </Button>
          </div>
        </div>

        {group.validationWarnings.length > 0 && (
          <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <div>
                <p className="mb-1 font-medium">Consistency checks</p>
                <ul className="list-inside list-disc space-y-0.5">
                  {group.validationWarnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent id={entriesId} className="px-4 pb-4 pt-0">
          <QcEntryTable sections={[{ group }]} catalogueColors={catalogueColors} caption={`Entries of ${label}`} />
        </CardContent>
      )}
    </Card>
  );
}
