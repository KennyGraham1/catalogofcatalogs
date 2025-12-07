'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import dynamic from 'next/dynamic';
import { MergeActions } from '@/components/merge/MergeActions';
import { MergeMetadataForm, MergeMetadata } from '@/components/merge/MergeMetadataForm';
import { MergeProgressIndicator, MergeStep } from '@/components/merge/MergeProgressIndicator';
import { useCatalogues } from '@/contexts/CatalogueContext';

// Dynamically import MergePreviewQC to avoid SSR issues with Leaflet
const MergePreviewQC = dynamic(
  () => import('@/components/merge/MergePreviewQC').then(mod => mod.MergePreviewQC),
  { ssr: false }
);
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Layers,
  Settings,
  Tag,
  ArrowRight,
  AlertTriangle,
  ArrowRightLeft,
  Save,
  Clock,
  MapPin,
  Loader2,
  FileDown
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { GeographicSearchPanel, GeographicBounds } from '@/components/catalogues/GeographicSearchPanel';

type CatalogueStatus = 'all' | 'complete' | 'processing' | 'incomplete';
type SortField = 'name' | 'date' | 'events' | 'source';
type SortDirection = 'asc' | 'desc';
type MergeStatus = 'idle' | 'merging' | 'complete' | 'error';

// Type that supports API data with optional legacy field names
type CatalogueItem = {
  id: number | string;
  name: string;
  events?: number;      // Legacy field name
  event_count?: number; // API field name
  source?: string;
};

// Status labels for merge status
const statusLabels: Record<MergeStatus, string> = {
  idle: 'Ready',
  merging: 'Merging...',
  complete: 'Complete',
  error: 'Error'
};

// Helper function to get status color
const getStatusColor = (status: MergeStatus): string => {
  switch (status) {
    case 'idle':
      return 'bg-blue-500';
    case 'merging':
      return 'bg-yellow-500';
    case 'complete':
      return 'bg-green-500';
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
};

export default function MergePage() {
  // Use global catalogue context
  const { catalogues: realCatalogues, loading: cataloguesLoading, invalidateCache } = useCatalogues();

  const [activeTab, setActiveTab] = useState('select');
  const [selectedCatalogues, setSelectedCatalogues] = useState<(number | string)[]>([]);
  const [mergedName, setMergedName] = useState('Merged NZ Catalogue');
  const [timeThreshold, setTimeThreshold] = useState(60);
  const [distanceThreshold, setDistanceThreshold] = useState(10);
  const [priority, setPriority] = useState('newest');
  const [mergeStrategy, setMergeStrategy] = useState('priority');
  const [mergeStatus, setMergeStatus] = useState<MergeStatus>('idle');
  const [mergedEvents, setMergedEvents] = useState<any[]>([]);
  const [geoSearchActive, setGeoSearchActive] = useState(false);
  const [geoSearching, setGeoSearching] = useState(false);
  const [geoSearchBounds, setGeoSearchBounds] = useState<GeographicBounds | null>(null);
  const [filteredCatalogues, setFilteredCatalogues] = useState<CatalogueItem[]>([]);

  // New state for metadata and export-only mode
  const [mergeMetadata, setMergeMetadata] = useState<MergeMetadata>({});
  const [exportOnly, setExportOnly] = useState(false);
  const [mergeProgress, setMergeProgress] = useState(0);
  const [mergeSteps, setMergeSteps] = useState<MergeStep[]>([
    { id: 'fetch-1', label: 'Fetching first catalogue events', status: 'pending' },
    { id: 'fetch-2', label: 'Fetching second catalogue events', status: 'pending' },
    { id: 'match', label: 'Matching duplicate events', status: 'pending' },
    { id: 'merge', label: 'Merging events', status: 'pending' },
    { id: 'bounds', label: 'Calculating geographic bounds', status: 'pending' },
    { id: 'save', label: 'Saving merged catalogue', status: 'pending' }
  ]);
  const [previewData, setPreviewData] = useState<any>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Initialize filtered catalogues with real data from context
  useEffect(() => {
    if (!geoSearchActive && realCatalogues.length > 0) {
      setFilteredCatalogues(realCatalogues);
    }
  }, [realCatalogues, geoSearchActive]);

  // Memoized catalogue selection handler
  const handleCatalogueSelect = useCallback((id: number | string) => {
    setSelectedCatalogues(prev => {
      if (prev.includes(id)) {
        return prev.filter(catalogueId => catalogueId !== id);
      } else {
        return [...prev, id];
      }
    });
  }, []);

  // Memoized navigation handlers
  const handleNextStep = useCallback(() => {
    if (activeTab === 'select') {
      setActiveTab('configure');
    } else if (activeTab === 'configure') {
      setActiveTab('preview');
    }
  }, [activeTab]);

  const handlePreviousStep = useCallback(() => {
    if (activeTab === 'configure') {
      setActiveTab('select');
    } else if (activeTab === 'preview') {
      setActiveTab('configure');
    }
  }, [activeTab]);

  const handleGeneratePreview = async () => {
    if (selectedCatalogues.length < 2) {
      toast({
        title: "Not enough catalogues selected",
        description: "Please select at least two catalogues to merge.",
        variant: "destructive"
      });
      return;
    }

    setIsLoadingPreview(true);

    try {
      const selectedCatalogueData = getSelectedCatalogues;

      // Transform catalogue data to match validation schema
      // Keep this in sync with the payload used for the real /api/merge call
      const sourceCatalogues = selectedCatalogueData.map(cat => ({
        id: cat.id,
        name: cat.name,
        // Prefer exact events count if available, fall back to event_count
        events: (cat as any).events || (cat as any).event_count || 0,
        source: (cat as any).source || cat.name || 'unknown',
      }));

      const requestBody = {
        // Validation schema requires a "name" field, even for preview
        name: mergedName || 'Preview Only',
        sourceCatalogues,
        config: {
          timeThreshold,
          distanceThreshold,
          mergeStrategy,
          priority,
        },
      };

      console.log('Sending preview request:', requestBody);

      const response = await fetch('/api/merge/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Preview API error:', errorData);
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      setPreviewData(result);

      toast({
        title: "Preview Generated",
        description: `Found ${result.statistics.duplicateGroupsCount} duplicate groups`,
      });
    } catch (error) {
      console.error('Preview generation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: "Preview Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleStartMerge = async () => {
    if (selectedCatalogues.length < 2) {
      toast({
        title: "Not enough catalogues selected",
        description: "Please select at least two catalogues to merge.",
        variant: "destructive"
      });
      return;
    }

    setMergeStatus('merging');
    setMergeProgress(0);

    // Reset all steps to pending
    setMergeSteps(steps => steps.map(s => ({ ...s, status: 'pending' as const })));

    // Simulate progress updates (in real implementation, this would come from the API)
    const progressInterval = setInterval(() => {
      setMergeProgress(prev => {
        if (prev >= 95) {
          clearInterval(progressInterval);
          return prev;
        }
        return prev + 5;
      });
    }, 300);

    try {
      const selectedCatalogueData = getSelectedCatalogues;

      // Transform catalogue data to match validation schema
      const sourceCatalogues = selectedCatalogueData.map(cat => ({
        id: cat.id,
        name: cat.name,
        events: cat.event_count || 0,
        source: cat.name || 'unknown'
      }));

      // Update step 1
      setMergeSteps(steps => steps.map(s =>
        s.id === 'fetch-1' ? { ...s, status: 'in-progress' as const } : s
      ));

      const response = await fetch('/api/merge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: mergedName,
          sourceCatalogues,
          config: {
            timeThreshold,
            distanceThreshold,
            mergeStrategy,
            priority
          },
          metadata: mergeMetadata,
          exportOnly
        }),
      });

      // Mark all fetch steps as complete
      setMergeSteps(steps => steps.map(s =>
        s.id.startsWith('fetch') || s.id === 'match' || s.id === 'merge' || s.id === 'bounds'
          ? { ...s, status: 'complete' as const }
          : s
      ));

      if (!response.ok) {
        throw new Error('Failed to merge catalogues');
      }

      const result = await response.json();

      // Update save step
      if (!exportOnly) {
        setMergeSteps(steps => steps.map(s =>
          s.id === 'save' ? { ...s, status: 'in-progress' as const } : s
        ));
      }

      // Fetch the actual merged events from the newly created catalogue
      if (result.catalogueId && !exportOnly) {
        try {
          const eventsResponse = await fetch(`/api/catalogues/${result.catalogueId}/events`);
          if (eventsResponse.ok) {
            const eventsData = await eventsResponse.json();
            const events = Array.isArray(eventsData) ? eventsData : eventsData.data || [];
            setMergedEvents(events);
          } else {
            // Fallback to empty array if fetch fails
            console.warn('Failed to fetch merged events');
            setMergedEvents([]);
          }
        } catch (error) {
          console.error('Error fetching merged events:', error);
          setMergedEvents([]);
        }
      } else if (result.events && exportOnly) {
        // For export-only mode, use the returned events
        setMergedEvents(result.events);
      } else {
        setMergedEvents([]);
      }

      // Mark all steps as complete
      setMergeSteps(steps => steps.map(s => ({ ...s, status: 'complete' as const })));
      setMergeProgress(100);
      clearInterval(progressInterval);

      // Invalidate cache and refresh catalogues across all pages (only if not export-only)
      if (!exportOnly) {
        invalidateCache();
      }

      setMergeStatus('complete');
      toast({
        title: exportOnly ? "Merge Complete (Export Only)" : "Merge Complete",
        description: exportOnly
          ? `Successfully merged ${selectedCatalogues.length} catalogues. Ready for export.`
          : `Successfully merged ${selectedCatalogues.length} catalogues into "${mergedName}"`,
      });
    } catch (error) {
      clearInterval(progressInterval);
      setMergeStatus('error');
      setMergeSteps(steps => steps.map(s =>
        s.status === 'in-progress' ? { ...s, status: 'error' as const } : s
      ));
      toast({
        title: "Merge Failed",
        description: "An error occurred while merging the catalogues. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Memoized selected catalogues
  const getSelectedCatalogues = useMemo(() => {
    return realCatalogues.filter(catalogue => selectedCatalogues.includes(catalogue.id));
  }, [selectedCatalogues, realCatalogues]);

  // Memoized total events calculation
  const getTotalSelectedEvents = useMemo(() => {
    return getSelectedCatalogues.reduce((total, catalogue) => {
      const eventCount = catalogue.event_count || 0;
      return total + eventCount;
    }, 0);
  }, [getSelectedCatalogues]);

  // Memoized estimated merged events calculation
  const estimatedMergedEvents = useMemo(() => {
    const selected = getSelectedCatalogues;
    if (selected.length === 0) return 0;
    if (selected.length === 1) {
      const eventCount = selected[0].event_count || 0;
      return eventCount;
    }

    const totalEvents = getTotalSelectedEvents;
    const overlapFactor = 0.15 * (selected.length - 1);
    return Math.round(totalEvents * (1 - overlapFactor));
  }, [getSelectedCatalogues, getTotalSelectedEvents]);

  // Memoized geographic search handler
  const handleGeoSearch = useCallback(async (bounds: GeographicBounds) => {
    try {
      setGeoSearching(true);
      setGeoSearchBounds(bounds);

      const params = new URLSearchParams({
        minLat: bounds.minLatitude.toString(),
        maxLat: bounds.maxLatitude.toString(),
        minLon: bounds.minLongitude.toString(),
        maxLon: bounds.maxLongitude.toString(),
      });

      const response = await fetch(`/api/catalogues/search/region?${params}`);

      if (!response.ok) {
        throw new Error('Failed to search catalogues by region');
      }

      const data = await response.json();
      setFilteredCatalogues(data.catalogues);
      setGeoSearchActive(true);

      toast({
        title: 'Region Search Complete',
        description: `Found ${data.count} catalogue(s) in the selected region`,
      });
    } catch (error) {
      console.error('Geographic search error:', error);
      toast({
        title: 'Search Failed',
        description: 'Failed to search catalogues by region. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setGeoSearching(false);
    }
  }, []);

  // Memoized clear handler
  const handleGeoClear = useCallback(() => {
    setGeoSearchActive(false);
    setGeoSearchBounds(null);
    setFilteredCatalogues(realCatalogues);
  }, [realCatalogues]);

  const renderMergeButton = () => {
    if (mergeStatus === 'merging') {
      return (
        <Button disabled>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Merging Catalogues...
        </Button>
      );
    }

    if (mergeStatus === 'complete') {
      return (
        <Button onClick={() => {
          setActiveTab('select');
          setMergeStatus('idle');
          setSelectedCatalogues([]);
        }}>
          Start New Merge
        </Button>
      );
    }

    return (
      <Button onClick={handleStartMerge}>
        <Save className="mr-2 h-4 w-4" />
        Start Merge
      </Button>
    );
  };

  return (
    <div className="container py-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Merge Catalogues</h1>
          <p className="text-sm text-muted-foreground">
            Combine multiple earthquake catalogues into a unified dataset
          </p>
        </div>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Catalogue Merging Wizard</CardTitle>
                <CardDescription className="text-xs">
                  Merge multiple earthquake catalogues using configurable rules for matching events
                </CardDescription>
              </div>
              <Badge className={getStatusColor(mergeStatus)}>
                {statusLabels[mergeStatus]}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="select" value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="select">Select Catalogues</TabsTrigger>
                <TabsTrigger 
                  value="configure" 
                  disabled={selectedCatalogues.length < 2}
                >
                  Configure Merge
                </TabsTrigger>
                <TabsTrigger 
                  value="preview" 
                  disabled={selectedCatalogues.length < 2 || activeTab === 'select'}
                >
                  Preview & Merge
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="select" className="pt-6">
                <div className="flex items-center gap-2 bg-muted p-3 rounded-md">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <p className="text-sm">
                    Select at least two catalogues to merge. Catalogues should cover overlapping time periods or regions.
                  </p>
                </div>

                {/* Geographic Search Panel */}
                <div className="mt-4">
                  <GeographicSearchPanel
                    onSearch={handleGeoSearch}
                    onClear={handleGeoClear}
                    isSearching={geoSearching}
                  />
                </div>

                {/* Active Filter Indicator */}
                {geoSearchActive && geoSearchBounds && (
                  <div className="mt-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                          Filtered by geographic region
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleGeoClear}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        Clear Filter
                      </Button>
                    </div>
                  </div>
                )}

                <div className="border rounded-lg overflow-hidden mt-4">
                  <div className="bg-muted/50 px-4 py-2 text-sm font-medium flex items-center justify-between">
                    <span>Available Catalogues</span>
                    {geoSearchActive && (
                      <span className="text-xs text-muted-foreground">
                        Showing {filteredCatalogues.length} of {realCatalogues.length} catalogues
                      </span>
                    )}
                  </div>
                  <div className="divide-y">
                    {cataloguesLoading ? (
                      <div className="p-8 text-center text-muted-foreground">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                        <p>Loading catalogues...</p>
                      </div>
                    ) : filteredCatalogues.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        <Layers className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No catalogues available</p>
                        <p className="text-sm mt-1">Import or create catalogues to merge them</p>
                      </div>
                    ) : (
                      filteredCatalogues.map(catalogue => (
                        <div key={catalogue.id} className="flex items-center space-x-2 p-4">
                          <Checkbox
                            id={`catalogue-${catalogue.id}`}
                            checked={selectedCatalogues.includes(catalogue.id)}
                            onCheckedChange={() => handleCatalogueSelect(catalogue.id)}
                          />
                          <div className="grid gap-1.5 leading-none">
                            <Label
                              htmlFor={`catalogue-${catalogue.id}`}
                              className="text-base font-medium flex items-center gap-1.5"
                            >
                              <Layers className="h-4 w-4 text-muted-foreground" />
                              {catalogue.name}
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              {(catalogue.events || catalogue.event_count || 0).toLocaleString()} events
                              {catalogue.source && ` • Source: ${catalogue.source}`}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                
                {selectedCatalogues.length > 0 && (
                  <div className="bg-muted/30 p-4 rounded-md mt-4">
                    <h3 className="font-medium mb-2">Selection Summary</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Catalogues</p>
                        <p className="text-xl font-semibold">{selectedCatalogues.length}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Events</p>
                        <p className="text-xl font-semibold">{getTotalSelectedEvents.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Est. Merged Events</p>
                        <p className="text-xl font-semibold">{estimatedMergedEvents.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="configure" className="pt-6">
                <div className="space-y-6">
                  <div>
                    <Label htmlFor="merged-name" className="text-base font-medium">
                      Merged Catalogue Name
                    </Label>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <Input
                        id="merged-name"
                        value={mergedName}
                        onChange={e => setMergedName(e.target.value)}
                        placeholder="Enter a name for the merged catalogue"
                      />
                    </div>
                  </div>
                  
                  <Separator className="my-6" />
                  
                  <div>
                    <h3 className="text-base font-medium mb-1">Event Matching Criteria</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Define how to identify the same event across different catalogues
                    </p>

                    <div className="space-y-6">
                      {/* Info Alert about Adaptive Thresholds */}
                      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                        <div className="flex gap-3">
                          <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <h4 className="text-sm font-medium text-blue-900 mb-1">
                              🆕 Adaptive Thresholds Active
                            </h4>
                            <p className="text-xs text-blue-800 leading-relaxed">
                              The merge algorithm automatically adjusts matching thresholds based on event magnitude and depth.
                              Small events (M&lt;4.0) use tighter windows (25 km, 30s), while large events (M&gt;7.0) use wider windows (200 km, 300s).
                              Deep events (&gt;300 km) get 1.5× larger distance thresholds. Your configured values serve as baselines.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <Label>Time Window (seconds)</Label>
                          </div>
                          <span className="text-sm font-medium">{timeThreshold}s</span>
                        </div>
                        <Slider
                          value={[timeThreshold]}
                          min={0}
                          max={300}
                          step={5}
                          onValueChange={values => setTimeThreshold(values[0])}
                        />
                        <p className="text-xs text-muted-foreground">
                          Events within {timeThreshold} seconds of each other may be considered the same event. Automatically adjusted by magnitude.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <Label>Distance Threshold (km)</Label>
                          </div>
                          <span className="text-sm font-medium">{distanceThreshold} km</span>
                        </div>
                        <Slider
                          value={[distanceThreshold]}
                          min={0}
                          max={100}
                          step={1}
                          onValueChange={values => setDistanceThreshold(values[0])}
                        />
                        <p className="text-xs text-muted-foreground">
                          Events within {distanceThreshold} km of each other may be considered the same event. Automatically adjusted by magnitude and depth.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <Separator className="my-6" />
                  
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-base font-medium mb-1">Conflict Resolution</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Choose how to handle conflicting data for the same event
                      </p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="merge-strategy">Merge Strategy</Label>
                          <Select
                            value={mergeStrategy}
                            onValueChange={value => setMergeStrategy(value)}
                          >
                            <SelectTrigger id="merge-strategy">
                              <SelectValue placeholder="Select strategy" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="quality">🆕 Quality-Based (Recommended)</SelectItem>
                              <SelectItem value="priority">Source Priority</SelectItem>
                              <SelectItem value="average">Average Values</SelectItem>
                              <SelectItem value="newest">Newest Data</SelectItem>
                              <SelectItem value="complete">Most Complete Record</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            {mergeStrategy === 'quality' && '🆕 Select events with best quality metrics (station count, azimuthal gap, location error, magnitude uncertainty). Uses seismological best practices.'}
                            {mergeStrategy === 'priority' && 'Use data from higher priority sources when conflicts occur.'}
                            {mergeStrategy === 'average' && 'Average numerical values (magnitude, depth) from all sources. Uses magnitude hierarchy (Mw > Ms > mb > ML).'}
                            {mergeStrategy === 'newest' && 'Prefer the most recently updated event data.'}
                            {mergeStrategy === 'complete' && 'Use the record with the most complete information.'}
                          </p>
                        </div>

                        {mergeStrategy === 'priority' && (
                          <div className="space-y-2">
                            <Label htmlFor="source-priority">Source Priority</Label>
                            <Select
                              value={priority}
                              onValueChange={value => setPriority(value)}
                            >
                              <SelectTrigger id="source-priority">
                                <SelectValue placeholder="Select priority" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="quality">🆕 Quality-Based Fallback</SelectItem>
                                <SelectItem value="newest">Newest First</SelectItem>
                                <SelectItem value="geonet">GeoNet &gt; Others</SelectItem>
                                <SelectItem value="gns">GNS &gt; Others</SelectItem>
                                <SelectItem value="custom">Custom Order</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Define which sources should take precedence when conflicts occur. Falls back to quality-based selection if priority source not found.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Info Alert about Additional Improvements */}
                      <div className="rounded-lg border border-green-200 bg-green-50 p-4 mt-4">
                        <div className="flex gap-3">
                          <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <h4 className="text-sm font-medium text-green-900 mb-1">
                              🆕 Enhanced Merge Algorithm
                            </h4>
                            <ul className="text-xs text-green-800 leading-relaxed space-y-1 list-disc list-inside">
                              <li><strong>Magnitude Hierarchy:</strong> Uses ISC standard (Mw &gt; Ms &gt; mb &gt; ML) to prevent saturation errors</li>
                              <li><strong>Date Line Handling:</strong> Correctly matches events across the International Date Line (Pacific region)</li>
                              <li><strong>Depth Uncertainty:</strong> Selects depths with lower uncertainty and better station coverage</li>
                              <li><strong>Validation:</strong> Prevents merging physically inconsistent events (e.g., M4.0 with M7.0)</li>
                              {/* <li><strong>Performance:</strong> 15-30% faster with latitude-aware spatial indexing</li> */}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator className="my-6" />

                  {/* Merge Metadata Section */}
                  <div className="space-y-4">
                    <MergeMetadataForm
                      metadata={mergeMetadata}
                      onChange={setMergeMetadata}
                    />
                  </div>

                  <Separator className="my-6" />

                  {/* Export-Only Mode */}
                  <div className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <FileDown className="h-5 w-5" />
                          Export Options
                        </CardTitle>
                        <CardDescription>
                          Choose whether to save the merged catalogue or export only
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="export-only"
                            checked={exportOnly}
                            onCheckedChange={(checked) => setExportOnly(checked as boolean)}
                          />
                          <div className="grid gap-1.5 leading-none">
                            <Label
                              htmlFor="export-only"
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              Export only (don't save to database)
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              Perform the merge in memory and prepare for export without saving to the database.
                              Useful for one-time analysis or testing merge parameters.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="preview" className="pt-6">
                {!previewData ? (
                  <div className="space-y-4">
                    <div className="bg-muted/30 p-4 rounded-md">
                      <h3 className="font-medium mb-3">Merge Summary</h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
                        <div>
                          <p className="text-sm text-muted-foreground">Merged Catalogue Name</p>
                          <p className="font-medium">{mergedName}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Estimated Events</p>
                          <p className="font-medium">{estimatedMergedEvents.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Selected Catalogues</p>
                          <p className="font-medium">{selectedCatalogues.length}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Merge Strategy</p>
                          <p className="font-medium capitalize">{mergeStrategy}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Time Threshold</p>
                          <p className="font-medium">{timeThreshold} seconds</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Distance Threshold</p>
                          <p className="font-medium">{distanceThreshold} km</p>
                        </div>
                      </div>
                    </div>

                    <div className="border rounded-md overflow-hidden">
                      <div className="bg-muted/50 px-4 py-2 text-sm font-medium">
                        Catalogues to be Merged
                      </div>
                      <div className="divide-y">
                        {getSelectedCatalogues.map((catalogue, index) => (
                          <div key={catalogue.id} className="flex items-center p-4">
                            <div className="flex-1">
                              <p className="font-medium">{catalogue.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {catalogue.event_count?.toLocaleString() || 0} events
                              </p>
                            </div>
                            {index < getSelectedCatalogues.length - 1 && (
                              <ArrowRightLeft className="h-5 w-5 text-muted-foreground mx-4" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Generate Preview Button */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
                      <h3 className="font-medium text-blue-900 mb-2">Quality Control Preview</h3>
                      <p className="text-sm text-blue-700 mb-4">
                        Generate a preview to review duplicate groups and validate the merge before committing to the database.
                      </p>
                      <Button
                        onClick={handleGeneratePreview}
                        disabled={isLoadingPreview}
                        size="lg"
                      >
                        {isLoadingPreview ? 'Generating Preview...' : 'Generate QC Preview'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <MergePreviewQC
                    previewData={previewData}
                    onProceedWithMerge={handleStartMerge}
                    onCancel={() => setPreviewData(null)}
                  />
                )}

                {/* Progress Indicator */}
                {mergeStatus === 'merging' && (
                  <MergeProgressIndicator
                    steps={mergeSteps}
                    currentStep={mergeSteps.findIndex(s => s.status === 'in-progress')}
                    progress={mergeProgress}
                    estimatedTimeRemaining={mergeProgress < 100 ? ((100 - mergeProgress) / 5) * 0.3 : 0}
                  />
                )}

                {mergeStatus === 'complete' && (
                  <MergeActions
                    events={mergedEvents}
                    onDownload={() => {}}
                    catalogueMetadata={{
                      name: mergedName,
                      ...mergeMetadata
                    }}
                  />
                )}

                {mergeStatus !== 'complete' && !previewData && (
                  <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3 rounded-md">
                    <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                    <p className="text-sm text-amber-800 dark:text-amber-300">
                      Merging multiple catalogues may take several minutes depending on the size of the datasets.
                      The process cannot be interrupted once started.
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
          <CardFooter className="flex justify-between border-t bg-muted/20 px-6 py-4">
            <Button 
              variant="ghost" 
              onClick={handlePreviousStep}
              disabled={activeTab === 'select' || mergeStatus === 'merging'}
            >
              Back
            </Button>
            <div className="flex gap-2">
              {activeTab === 'select' && (
                <Button 
                  onClick={handleNextStep}
                  disabled={selectedCatalogues.length < 2}
                >
                  Configure Merge
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
              {activeTab === 'configure' && (
                <Button 
                  onClick={handleNextStep}
                >
                  Preview Merge
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
              {activeTab === 'preview' && renderMergeButton()}
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}