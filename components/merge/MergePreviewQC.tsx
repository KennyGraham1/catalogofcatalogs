'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DuplicateGroupCard } from './DuplicateGroupCard';
import { AlertTriangle, CheckCircle2, Info, TrendingDown, Users, X } from 'lucide-react';

// Dynamically import map component to avoid SSR issues with Leaflet
const DuplicateGroupMap = dynamic(
  () => import('./DuplicateGroupMap').then(mod => mod.DuplicateGroupMap),
  { ssr: false }
);

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

// heldForReview / supersededEventIndexes and the two counts are optional so a preview from
// a server that predates them (contract M4) still renders.
interface DuplicateGroup {
  id: string;
  events: EventData[];
  selectedEventIndex: number;
  isSuspicious: boolean;
  validationWarnings: string[];
  heldForReview?: boolean;
  supersededEventIndexes?: number[];
  /** A report the association matched but the validity gate split off: published alone. */
  separated?: boolean;
  /** The averaged / median epicentre the merge publishes when no report is selected. */
  computedEpicentre?: { latitude: number; longitude: number; time: string } | null;
}

interface PreviewData {
  duplicateGroups: DuplicateGroup[];
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
}

interface MergePreviewQCProps {
  previewData: PreviewData;
  /** True when the merge will hold flagged groups for review (config.onConflict 'hold'). */
  holdForReview?: boolean;
  onProceedWithMerge: () => void;
  onCancel: () => void;
}

export function MergePreviewQC({ previewData, holdForReview = false, onProceedWithMerge, onCancel }: MergePreviewQCProps) {
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(null);
  const [filterView, setFilterView] = useState<'all' | 'duplicates' | 'suspicious' | 'separated'>('duplicates');
  const mapCardRef = useRef<HTMLDivElement>(null);

  // The map card opens below the (scrolling) group list: bring it into view.
  useEffect(() => {
    if (selectedGroup) mapCardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [selectedGroup]);

  const { duplicateGroups, statistics, catalogueColors } = previewData;

  // Precompute id -> original index once so per-row lookups are O(1) instead of
  // duplicateGroups.indexOf(group) (O(n)) inside the render map, which was O(n²) overall.
  const groupIndexById = useMemo(() => {
    const map = new Map<string, number>();
    duplicateGroups.forEach((g, i) => map.set(g.id, i));
    return map;
  }, [duplicateGroups]);

  // Filter groups based on view
  const filteredGroups = duplicateGroups.filter(group => {
    if (filterView === 'all') return true;
    if (filterView === 'duplicates') return group.events.length > 1;
    if (filterView === 'suspicious') return group.isSuspicious;
    if (filterView === 'separated') return group.separated === true;
    return true;
  });

  const duplicateGroupsOnly = duplicateGroups.filter(g => g.events.length > 1);
  const selectedCatalogueCount = selectedGroup ? new Set(selectedGroup.events.map(event => event.catalogueId)).size : 0;

  return (
    <div className="space-y-6">
      {/* Statistics Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Merge Preview Statistics
          </CardTitle>
          <CardDescription>
            Review the duplicate detection results before committing the merge
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className={`grid grid-cols-2 gap-4 ${holdForReview ? 'md:grid-cols-6' : 'md:grid-cols-5'}`}>
            <div className="text-center p-4 bg-blue-50 dark:bg-blue-950/50 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{statistics.totalEventsBefore.toLocaleString()}</div>
              <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">Events Before</div>
            </div>
            <div className="text-center p-4 bg-green-50 dark:bg-green-950/50 rounded-lg border border-green-200 dark:border-green-800">
              <div className="text-2xl font-bold text-green-700 dark:text-green-300">{statistics.totalEventsAfter.toLocaleString()}</div>
              <div className="text-xs text-green-600 dark:text-green-400 mt-1">Events After</div>
            </div>
            <div className="text-center p-4 bg-purple-50 dark:bg-purple-950/50 rounded-lg border border-purple-200 dark:border-purple-800">
              <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">{statistics.duplicateGroupsCount.toLocaleString()}</div>
              <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">Duplicate Groups</div>
            </div>
            <div className="text-center p-4 bg-orange-50 dark:bg-orange-950/50 rounded-lg border border-orange-200 dark:border-orange-800">
              <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">{statistics.duplicatesRemoved.toLocaleString()}</div>
              <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">Duplicates Removed</div>
            </div>
            <div className="text-center p-4 bg-red-50 dark:bg-red-950/50 rounded-lg border border-red-200 dark:border-red-800">
              <div className="text-2xl font-bold text-red-700 dark:text-red-300">{statistics.suspiciousGroupsCount.toLocaleString()}</div>
              <div className="text-xs text-red-600 dark:text-red-400 mt-1">Suspicious Matches</div>
            </div>
            {/* Only meaningful when the merge holds flagged groups: otherwise the count is 0 by
                construction and the tile would only distract. */}
            {holdForReview && (
              <div className="text-center p-4 bg-amber-50 dark:bg-amber-950/50 rounded-lg border border-amber-200 dark:border-amber-800">
                <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">{(statistics.heldForReviewCount ?? 0).toLocaleString()}</div>
                <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">Held for review</div>
              </div>
            )}
          </div>

          {(statistics.supersededReportsCount ?? 0) > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              {statistics.supersededReportsCount!.toLocaleString()} superseded {statistics.supersededReportsCount === 1 ? 'entry' : 'entries'} (older vintages of one agency&apos;s solution)
            </p>
          )}

          {/* Reports the windows matched but the validity gate split apart are published on
              their own; without this line the split would look like unrelated events. */}
          {(statistics.separatedReportsCount ?? 0) > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              {statistics.separatedReportsCount!.toLocaleString()} {statistics.separatedReportsCount === 1 ? 'entry was' : 'entries were'} matched
              but kept apart because {statistics.separatedReportsCount === 1 ? 'its group' : 'their groups'} failed validation;
              each is published on its own (see Separated).
            </p>
          )}

          {statistics.suspiciousGroupsCount > 0 && (
            <Alert className="mt-4 border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/50">
              <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <AlertTitle className="text-orange-900 dark:text-orange-200">Suspicious Matches Detected</AlertTitle>
              <AlertDescription className="text-orange-800 dark:text-orange-300">
                {statistics.suspiciousGroupsCount} duplicate group(s) have validation warnings.
                Review these carefully before proceeding with the merge.
              </AlertDescription>
            </Alert>
          )}

          {statistics.suspiciousGroupsCount === 0 && statistics.duplicateGroupsCount > 0 && (
            <Alert className="mt-4 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/50">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertTitle className="text-green-900 dark:text-green-200">All Matches Look Good</AlertTitle>
              <AlertDescription className="text-green-800 dark:text-green-300">
                All duplicate groups passed validation checks. The merge appears to be working correctly.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Duplicate Groups List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Duplicate Groups</CardTitle>
              <CardDescription>
                Review each group of matching events
              </CardDescription>
            </div>
            <Tabs value={filterView} onValueChange={(v) => setFilterView(v as any)}>
              <TabsList>
                <TabsTrigger value="duplicates">
                  Duplicates ({duplicateGroupsOnly.length})
                </TabsTrigger>
                <TabsTrigger value="suspicious">
                  Suspicious ({statistics.suspiciousGroupsCount})
                </TabsTrigger>
                {(statistics.separatedReportsCount ?? 0) > 0 && (
                  <TabsTrigger value="separated">
                    Separated ({statistics.separatedReportsCount})
                  </TabsTrigger>
                )}
                <TabsTrigger value="all">
                  All ({duplicateGroups.length})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {filteredGroups.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No groups to display
              </div>
            )}
            {filteredGroups.map((group, idx) => (
              <DuplicateGroupCard
                key={group.id}
                group={group}
                groupIndex={groupIndexById.get(group.id) ?? idx}
                catalogueColors={catalogueColors}
                onViewOnMap={(g) => setSelectedGroup(g)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* The selected group on the map: the map fills the card below its header. */}
      {selectedGroup && (
        <Card ref={mapCardRef} role="region" aria-label="Duplicate group map" className="overflow-hidden">
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 pb-4">
            <div className="space-y-1">
              <CardTitle className="text-base">
                Group #{(groupIndexById.get(selectedGroup.id) ?? 0) + 1} on the map
              </CardTitle>
              <CardDescription>
                {selectedGroup.events.length} {selectedGroup.events.length === 1 ? 'entry' : 'entries'} from{' '}
                {selectedCatalogueCount} {selectedCatalogueCount === 1 ? 'catalogue' : 'catalogues'}.
                Click an entry for its offset from the published solution.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setSelectedGroup(null)}>
              <X className="mr-1 h-4 w-4" aria-hidden />
              Close map
            </Button>
          </CardHeader>
          <DuplicateGroupMap
            group={selectedGroup}
            catalogueColors={catalogueColors}
            height="500px"
            className="border-t"
          />
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>
          Back to Configuration
        </Button>
        <Button onClick={onProceedWithMerge} size="lg">
          Proceed with Merge
        </Button>
      </div>
    </div>
  );
}

