'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import { formatOriginTimeUtc } from '@/lib/map-format';
import { FLAG_BADGE, NEUTRAL_BADGE, domId } from './DuplicateGroupCard';
import { QcEntryTable } from './QcEntryTable';
import {
  countOf, publishedEntry, selectionReason, splitReasons, unitEntryCount, unitOriginEpoch, unitSeparation,
  type SplitUnit,
} from './qc-format';

export interface KeptApartCardProps {
  unit: SplitUnit;
  catalogueColors: Record<string, string>;
  strategy?: string;
  priority?: string;
  onViewOnMap: (unit: SplitUnit) => void;
}

/**
 * One failed cluster: entries the matching windows grouped but the consistency checks split,
 * published as separate events. Shown as one unit (the groups share a splitKey), with the
 * reason and how far apart the published solutions are, so the split does not read as
 * unrelated single entries.
 */
export function KeptApartCard({ unit, catalogueColors, strategy, priority, onViewOnMap }: KeptApartCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const events = unit.groups.length;
  const entries = unitEntryCount(unit);
  const catalogueNames: string[] = [];
  for (const { group } of unit.groups) {
    for (const entry of group.events) {
      const name = entry.catalogueName || entry.catalogueId;
      if (!catalogueNames.includes(name)) catalogueNames.push(name);
    }
  }
  const reasons = splitReasons(unit);
  const separation = unitSeparation(unit);
  const held = unit.groups.some(({ group }) => group.heldForReview);
  const flagged = unit.groups.some(({ group }) => group.isSuspicious);
  const firstEpoch = unitOriginEpoch(unit);
  const entriesId = `qc-split-${domId(unit.key)}-entries`;

  return (
    <Card data-split-key={unit.key} className="border-amber-300 dark:border-amber-800">
      <CardHeader className="space-y-3 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                Kept apart
              </h4>
              <Badge variant="outline" className={NEUTRAL_BADGE} data-badge="size">
                {countOf(entries, 'entry', 'entries')} · {countOf(catalogueNames.length, 'catalogue', 'catalogues')}
              </Badge>
              {flagged && (
                <Badge variant="outline" className={FLAG_BADGE} data-badge="flag">Flagged</Badge>
              )}
              {held && (
                <Badge
                  variant="outline"
                  className={FLAG_BADGE}
                  data-badge="flag"
                  title="Written with a provisional solution and listed for review on the catalogue page"
                >
                  Held
                </Badge>
              )}
            </div>
            <p className="text-sm font-medium" data-testid="split-outcome">
              {events === 1 ? 'Published on its own' : `Published as ${countOf(events, 'separate event', 'separate events')}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {Number.isFinite(firstEpoch) ? `${formatOriginTimeUtc(firstEpoch)} · ` : ''}
              {catalogueNames.join(', ')}
            </p>
            {reasons.length > 0 && (
              <p className="text-xs" data-testid="split-reason">
                Kept apart because: {reasons.join('; ')}
              </p>
            )}
            {separation && (
              <p className="text-xs tabular-nums text-muted-foreground" data-testid="split-separation">
                The published solutions differ by up to Δt {separation.timeS.toFixed(1)} s · Δd {separation.distanceKm.toFixed(1)} km
                {separation.magnitude !== null ? ` · ΔM ${separation.magnitude.toFixed(2)}` : ''}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onViewOnMap(unit)}>
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
      </CardHeader>

      {isExpanded && (
        <CardContent id={entriesId} className="px-4 pb-4 pt-0">
          <QcEntryTable
            catalogueColors={catalogueColors}
            caption="Entries of the kept-apart cluster, by published event"
            sections={unit.groups.map(({ group }, position) => {
              const size = group.events.length;
              const published = publishedEntry(group);
              const reason = size > 1 ? selectionReason(group, strategy, priority) : null;
              return {
                group,
                heading: (
                  <span>
                    Event {position + 1} of {events}
                    <span className="font-normal text-muted-foreground">
                      {' · '}
                      {size === 1
                        ? `single entry${published ? ` (${published.catalogueName})` : ''}`
                        : `${countOf(size, 'entry', 'entries')}${reason ? ` · ${reason}` : ''}`}
                    </span>
                  </span>
                ),
              };
            })}
          />
        </CardContent>
      )}
    </Card>
  );
}
