'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { MergeQcSummary } from '@/lib/merge-qc';
import { formatCount } from '@/lib/map-format';
import { DuplicateGroupCard } from './DuplicateGroupCard';
import { KeptApartCard } from './KeptApartCard';
import { MergeQcSummaryView, QcTotalsTiles } from './MergeQcSummaryView';
import {
  countOf, groupCatalogueIds, groupDiscrepancy, groupOriginEpoch, isFlagged, isKeptApart, plural, splitUnits,
  unitDiscrepancy, unitEntryCount, unitOriginEpoch,
  type PreviewEntry, type PreviewGroup, type SplitUnit,
} from './qc-format';

// Dynamically import the map to avoid SSR issues with Leaflet.
const DuplicateGroupMap = dynamic(
  () => import('./DuplicateGroupMap').then(mod => mod.DuplicateGroupMap),
  { ssr: false }
);

/** Groups per page of the list: rendering thousands of cards at once froze the page. */
export const QC_PAGE_SIZE = 50;

/**
 * The preview as the panel reads it (POST /api/merge/preview, MergePreviewPayload). The QC
 * fields are optional so a response from a server that predates them still renders.
 */
export interface PreviewData {
  duplicateGroups: PreviewGroup[];
  matchedListed?: number;
  matchedTotal?: number;
  statistics: {
    totalEventsBefore: number;
    totalEventsAfter: number;
    duplicateGroupsCount: number;
    duplicatesRemoved: number;
    suspiciousGroupsCount: number;
    heldForReviewCount?: number;
    supersededReportsCount?: number;
    separatedReportsCount?: number;
  };
  catalogueColors: Record<string, string>;
  qc?: MergeQcSummary | null;
}

export interface MergePreviewQCProps {
  previewData: PreviewData;
  /** True when the merge will hold flagged groups for review (config.onConflict 'hold'). */
  holdForReview?: boolean;
  /** The merge strategy and source priority, to say why each published solution won. */
  strategy?: string;
  priority?: string;
}

type QcView = 'flagged' | 'kept-apart' | 'matched';
type SortOrder = 'discrepancy' | 'time-asc' | 'time-desc';
const ALL_CATALOGUES = '__all__';

type ListItem =
  | { kind: 'group'; key: string; group: PreviewGroup; index: number; discrepancy: number; epoch: number; catalogues: string[] }
  | { kind: 'unit'; key: string; unit: SplitUnit; discrepancy: number; epoch: number; catalogues: string[] };

const VIEW_LABELS: Record<QcView, string> = { flagged: 'Flagged', 'kept-apart': 'Kept apart', matched: 'Matched' };

const EMPTY_TEXT: Record<QcView, string> = {
  flagged: 'No matched group was flagged.',
  'kept-apart': 'No matched group failed the consistency checks, so no entries were kept apart.',
  matched: 'No entries were matched across catalogues.',
};

/** What the map shows: a group, or a kept-apart cluster drawn as one group. */
interface MapTarget {
  title: string;
  description: string;
  group: PreviewGroup & { publishedEventIndexes?: number[] };
}

/** A kept-apart cluster as one map group: every split-off event's solution is ringed. */
function unitMapGroup(unit: SplitUnit): MapTarget['group'] {
  const events: PreviewEntry[] = [];
  const published: number[] = [];
  const superseded: number[] = [];
  for (const { group } of unit.groups) {
    const offset = events.length;
    group.events.forEach(entry => events.push(entry));
    if (group.selectedEventIndex >= 0) published.push(offset + group.selectedEventIndex);
    (group.supersededEventIndexes ?? []).forEach(index => superseded.push(offset + index));
  }
  return {
    id: unit.key, events, selectedEventIndex: -1, isSuspicious: false, validationWarnings: [],
    supersededEventIndexes: superseded, publishedEventIndexes: published, computedEpicentre: null,
  };
}

function compareItems(order: SortOrder) {
  const byTime = (a: ListItem, b: ListItem) => (order === 'time-desc' ? b.epoch - a.epoch : a.epoch - b.epoch);
  if (order !== 'discrepancy') return (a: ListItem, b: ListItem) => byTime(a, b) || a.key.localeCompare(b.key);
  return (a: ListItem, b: ListItem) => b.discrepancy - a.discrepancy || a.epoch - b.epoch || a.key.localeCompare(b.key);
}

/**
 * The merge QC preview: the QC summary of the merge the current settings would produce, and
 * the groups to check, in three lists (Flagged, Kept apart, Matched), ranked by the largest
 * disagreement with the published solution, filterable by catalogue and paged. The merge
 * itself is started from the wizard footer; this panel has no actions of its own.
 */
export function MergePreviewQC({ previewData, holdForReview = false, strategy, priority }: MergePreviewQCProps) {
  const { duplicateGroups, statistics, catalogueColors, qc } = previewData;
  const [mapTarget, setMapTarget] = useState<MapTarget | null>(null);
  const mapCardRef = useRef<HTMLDivElement>(null);
  const listTopRef = useRef<HTMLDivElement>(null);
  const sortId = useId();
  const catalogueId = useId();

  // The map card opens below the list: bring it into view.
  useEffect(() => {
    if (mapTarget) mapCardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [mapTarget]);

  // Classify once per preview: O(n), then each view sorts and pages its own list.
  const lists = useMemo(() => {
    const flagged: ListItem[] = [];
    const matched: ListItem[] = [];
    const apart: Array<{ group: PreviewGroup; index: number }> = [];
    duplicateGroups.forEach((group, index) => {
      if (isKeptApart(group)) {
        apart.push({ group, index });
        return;
      }
      if (!isFlagged(group) && group.events.length < 2) return;
      const item: ListItem = {
        kind: 'group', key: group.id, group, index,
        discrepancy: groupDiscrepancy(group), epoch: groupOriginEpoch(group), catalogues: groupCatalogueIds(group),
      };
      (isFlagged(group) ? flagged : matched).push(item);
    });
    const keptApart: ListItem[] = splitUnits(apart).map(unit => ({
      kind: 'unit', key: unit.key, unit,
      discrepancy: unitDiscrepancy(unit), epoch: unitOriginEpoch(unit),
      catalogues: unit.groups.reduce<string[]>((ids, { group }) => {
        groupCatalogueIds(group).forEach(id => { if (!ids.includes(id)) ids.push(id); });
        return ids;
      }, []),
    }));
    return { flagged, 'kept-apart': keptApart, matched } as Record<QcView, ListItem[]>;
  }, [duplicateGroups]);

  const catalogueOptions = useMemo(() => {
    const names = new Map<string, string>();
    (qc?.sourceCatalogues ?? []).forEach(catalogue => names.set(catalogue.id, catalogue.name));
    duplicateGroups.forEach(group => group.events.forEach(entry => {
      if (!names.has(entry.catalogueId)) names.set(entry.catalogueId, entry.catalogueName || entry.catalogueId);
    }));
    return Array.from(names.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [duplicateGroups, qc]);

  const defaultView: QcView = lists.flagged.length > 0 ? 'flagged' : lists['kept-apart'].length > 0 ? 'kept-apart' : 'matched';
  const [view, setView] = useState<QcView>(defaultView);
  const [sortOrder, setSortOrder] = useState<SortOrder>('discrepancy');
  const [catalogue, setCatalogue] = useState<string>(ALL_CATALOGUES);
  const [page, setPage] = useState(1);

  const visible = useMemo(() => {
    const items = catalogue === ALL_CATALOGUES ? lists[view] : lists[view].filter(item => item.catalogues.includes(catalogue));
    return items.slice().sort(compareItems(sortOrder));
  }, [lists, view, sortOrder, catalogue]);

  const pageCount = Math.max(1, Math.ceil(visible.length / QC_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const first = (currentPage - 1) * QC_PAGE_SIZE;
  const pageItems = visible.slice(first, first + QC_PAGE_SIZE);

  const goToPage = (next: number) => {
    setPage(Math.min(Math.max(1, next), pageCount));
    listTopRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  // The tiles and alerts: the QC summary when the server sent one, else the statistics.
  const flaggedCount = qc?.totals.flaggedGroups ?? statistics.suspiciousGroupsCount;
  const keptApartEntries = qc?.totals.keptApartEntries ?? statistics.separatedReportsCount ?? 0;
  const matchedGroups = qc?.totals.matchedGroups ?? statistics.duplicateGroupsCount;
  const matchedTotal = previewData.matchedTotal ?? lists.matched.length;
  const matchedListed = previewData.matchedListed ?? lists.matched.length;
  const truncated = matchedTotal > matchedListed;
  const tabCounts: Record<QcView, number> = {
    flagged: lists.flagged.length,
    'kept-apart': lists['kept-apart'].length,
    matched: matchedTotal,
  };

  const alerts = (
    <>
      {flaggedCount > 0 && (
        <Alert className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="text-amber-900 dark:text-amber-100">
            {countOf(flaggedCount, 'flagged group', 'flagged groups')} {plural(flaggedCount, 'needs', 'need')} review
          </AlertTitle>
          <AlertDescription className="text-amber-900 dark:text-amber-100">
            A group is flagged when its magnitudes or solved depths differ by more than the tolerance, when it was
            formed by splitting a larger group that failed the consistency checks, or when its association is ambiguous; the
            reason is given on {flaggedCount === 1 ? 'the group' : 'each group'} under Flagged.
            {holdForReview
              ? ` The merge will write ${flaggedCount === 1 ? 'it' : 'them'} with a provisional solution and list ${flaggedCount === 1 ? 'it' : 'them'} for review on the catalogue page.`
              : ` The merge will publish the strategy's solution for ${flaggedCount === 1 ? 'it' : 'each'}; choose Hold for review in the configuration to have a reviewer decide instead.`}
          </AlertDescription>
        </Alert>
      )}
      {flaggedCount === 0 && keptApartEntries === 0 && matchedGroups > 0 && (
        <Alert className="border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/40">
          <CheckCircle2 className="h-4 w-4 text-green-700 dark:text-green-400" />
          <AlertTitle className="text-green-900 dark:text-green-100">All matched groups passed the consistency checks.</AlertTitle>
        </Alert>
      )}
    </>
  );

  const supersededCount = statistics.supersededReportsCount ?? 0;

  const listBody = (
    <div className="space-y-3">
      {view === 'matched' && truncated && (
        <p className="text-sm text-muted-foreground" data-testid="matched-truncation">
          Showing the {formatCount(matchedListed)} largest disagreements of {countOf(matchedTotal, 'matched group', 'matched groups')}.
        </p>
      )}
      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {catalogue !== ALL_CATALOGUES && lists[view].length > 0 ? 'No group in this list has an entry from the selected catalogue.' : EMPTY_TEXT[view]}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite" data-testid="qc-page-range">
            {view === 'kept-apart' ? 'Clusters' : 'Groups'} {formatCount(first + 1)}–{formatCount(first + pageItems.length)} of {formatCount(visible.length)}
          </p>
          <ol className="space-y-3" aria-label={`${VIEW_LABELS[view]} groups`}>
            {pageItems.map(item => (
              <li key={item.key}>
                {item.kind === 'group' ? (
                  <DuplicateGroupCard
                    group={item.group}
                    groupIndex={item.index}
                    catalogueColors={catalogueColors}
                    strategy={strategy}
                    priority={priority}
                    onViewOnMap={group => setMapTarget({
                      title: `Group #${item.index + 1} on the map`,
                      description: `${countOf(group.events.length, 'entry', 'entries')} from ${countOf(groupCatalogueIds(group).length, 'catalogue', 'catalogues')}. Click an entry for its offset from the published solution.`,
                      group,
                    })}
                  />
                ) : (
                  <KeptApartCard
                    unit={item.unit}
                    catalogueColors={catalogueColors}
                    strategy={strategy}
                    priority={priority}
                    onViewOnMap={unit => setMapTarget({
                      title: 'Kept-apart cluster on the map',
                      description: `${countOf(unitEntryCount(unit), 'entry', 'entries')} published as ${countOf(unit.groups.length, 'separate event', 'separate events')}; each ringed entry is a published solution.`,
                      group: unitMapGroup(unit),
                    })}
                  />
                )}
              </li>
            ))}
          </ol>
          {pageCount > 1 && (
            <nav aria-label="Group list pages" className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>
                <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
                Previous
              </Button>
              <span className="text-sm tabular-nums text-muted-foreground">Page {currentPage} of {pageCount}</span>
              <Button variant="outline" size="sm" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === pageCount}>
                Next
                <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Merge QC preview</CardTitle>
          <CardDescription>
            What the merge would produce with the current settings. Review the flagged and kept-apart groups, then start the merge below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {qc ? (
            <MergeQcSummaryView summary={qc} showHeldTile={holdForReview} fileBaseName="merge_preview" afterTotals={alerts} />
          ) : (
            <div className="space-y-3">
              <QcTotalsTiles
                showHeld={holdForReview}
                totals={{
                  entriesBefore: statistics.totalEventsBefore,
                  eventsAfter: statistics.totalEventsAfter,
                  matchedGroups: statistics.duplicateGroupsCount,
                  entriesCombined: statistics.duplicatesRemoved,
                  flaggedGroups: statistics.suspiciousGroupsCount,
                  heldForReview: statistics.heldForReviewCount ?? 0,
                }}
              />
              {(keptApartEntries > 0 || supersededCount > 0) && (
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {keptApartEntries > 0 && (
                    <li>
                      {countOf(keptApartEntries, 'entry was', 'entries were')} matched but kept apart because{' '}
                      {keptApartEntries === 1 ? 'its group' : 'their groups'} failed the consistency checks; each is published on its own (see Kept apart).
                    </li>
                  )}
                  {supersededCount > 0 && (
                    <li>
                      {countOf(supersededCount, 'superseded entry', 'superseded entries')} (older vintages of one agency&apos;s solution, kept as provenance).
                    </li>
                  )}
                </ul>
              )}
              {alerts}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Groups to review</CardTitle>
          <CardDescription>
            The largest disagreement is the greatest offset of an entry from the published solution, in units of its matching window.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={view} onValueChange={value => { setView(value as QcView); setPage(1); }}>
            <div ref={listTopRef} className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <TabsList className="h-auto flex-wrap justify-start">
                {(Object.keys(VIEW_LABELS) as QcView[]).map(key => (
                  <TabsTrigger key={key} value={key}>
                    {VIEW_LABELS[key]} ({formatCount(tabCounts[key])})
                  </TabsTrigger>
                ))}
              </TabsList>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="space-y-1">
                  <Label htmlFor={sortId} className="text-xs text-muted-foreground">Sort</Label>
                  <Select value={sortOrder} onValueChange={value => { setSortOrder(value as SortOrder); setPage(1); }}>
                    <SelectTrigger id={sortId} className="w-full sm:w-[220px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="discrepancy">Largest disagreement first</SelectItem>
                      <SelectItem value="time-asc">Origin time, earliest first</SelectItem>
                      <SelectItem value="time-desc">Origin time, latest first</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={catalogueId} className="text-xs text-muted-foreground">Catalogue</Label>
                  <Select value={catalogue} onValueChange={value => { setCatalogue(value); setPage(1); }}>
                    <SelectTrigger id={catalogueId} className="w-full sm:w-[240px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_CATALOGUES}>All catalogues</SelectItem>
                      {catalogueOptions.map(option => (
                        <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            {(Object.keys(VIEW_LABELS) as QcView[]).map(key => (
              <TabsContent key={key} value={key} className="mt-4">
                {key === view ? listBody : null}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* The selected group on the map: the map fills the card below its header. */}
      {mapTarget && (
        <Card ref={mapCardRef} role="region" aria-label="Matched group map" className="overflow-hidden">
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 pb-4">
            <div className="space-y-1">
              <CardTitle className="text-base">{mapTarget.title}</CardTitle>
              <CardDescription>{mapTarget.description}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setMapTarget(null)}>
              <X className="mr-1 h-4 w-4" aria-hidden="true" />
              Close map
            </Button>
          </CardHeader>
          <DuplicateGroupMap
            group={mapTarget.group}
            catalogueColors={catalogueColors}
            height="500px"
            className="border-t"
          />
        </Card>
      )}
    </div>
  );
}
