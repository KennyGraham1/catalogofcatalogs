'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DuplicateGroupCard } from './DuplicateGroupCard';
import { AlertTriangle, CheckCircle2, Info, TrendingDown, Users } from 'lucide-react';

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

interface DuplicateGroup {
  id: string;
  events: EventData[];
  selectedEventIndex: number;
  isSuspicious: boolean;
  validationWarnings: string[];
}

interface PreviewData {
  duplicateGroups: DuplicateGroup[];
  statistics: {
    totalEventsBefore: number;
    totalEventsAfter: number;
    duplicateGroupsCount: number;
    duplicatesRemoved: number;
    suspiciousGroupsCount: number;
  };
  catalogueColors: Record<string, string>;
}

interface MergePreviewQCProps {
  previewData: PreviewData;
  onProceedWithMerge: () => void;
  onCancel: () => void;
}

export function MergePreviewQC({ previewData, onProceedWithMerge, onCancel }: MergePreviewQCProps) {
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(null);
  const [filterView, setFilterView] = useState<'all' | 'duplicates' | 'suspicious'>('duplicates');

  const { duplicateGroups, statistics, catalogueColors } = previewData;

  // Filter groups based on view
  const filteredGroups = duplicateGroups.filter(group => {
    if (filterView === 'all') return true;
    if (filterView === 'duplicates') return group.events.length > 1;
    if (filterView === 'suspicious') return group.isSuspicious;
    return true;
  });

  const duplicateGroupsOnly = duplicateGroups.filter(g => g.events.length > 1);

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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
          </div>

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
                groupIndex={duplicateGroups.indexOf(group)}
                catalogueColors={catalogueColors}
                onViewOnMap={(g) => setSelectedGroup(g)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Map View Modal */}
      {selectedGroup && (
        <Card className="border-2 border-blue-500">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Map View - Group #{duplicateGroups.indexOf(selectedGroup) + 1}</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setSelectedGroup(null)}>
                Close Map
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <DuplicateGroupMap
              group={selectedGroup}
              catalogueColors={catalogueColors}
              height="500px"
            />
          </CardContent>
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

