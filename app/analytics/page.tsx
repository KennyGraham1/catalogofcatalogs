'use client';

import { useState, useEffect, useMemo, useCallback, useDeferredValue, useTransition, memo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart3,
  Target,
  Radio,
  Award,
  TrendingUp,
  List,
  Activity,
  Clock,
  Zap,
  MapPin,
  Calendar,
  Filter,
  RefreshCw,
  Loader2,
  Info
} from 'lucide-react';
import { QualityScoreCard } from '@/components/advanced-viz/QualityScoreCard';
import { UncertaintyVisualization } from '@/components/advanced-viz/UncertaintyVisualization';
import { FocalMechanismCard } from '@/components/advanced-viz/FocalMechanismCard';
import { StationCoverageCard } from '@/components/advanced-viz/StationCoverageCard';
import { calculateQualityScore, QualityMetrics } from '@/lib/quality-scoring';
import { parseFocalMechanism } from '@/lib/focal-mechanism-utils';
import { parseStationData } from '@/lib/station-coverage-utils';
import { EventTable } from '@/components/events/EventTable';
import { type EarthquakeEvent } from '@/lib/seismological-analysis';
import { useCachedFetch } from '@/hooks/use-cached-fetch';
import { useSeismologicalAnalyses } from '@/hooks/use-seismological-worker';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ZAxis
} from 'recharts';

// Dynamically import unified map component to avoid SSR issues
const UnifiedEarthquakeMap = dynamic(() => import('@/components/visualize/UnifiedEarthquakeMap'), {
  ssr: false,
  loading: () => <div className="h-[600px] w-full bg-muted animate-pulse rounded-lg flex items-center justify-center text-muted-foreground">Loading map...</div>
});

// Performance constants
const MAX_EVENTS_PER_CATALOGUE = 40000; // Limit per catalogue (API max is 40000)
const MAX_CHART_DATA_POINTS = 500; // Limit for scatter plots
const MAX_TIMELINE_POINTS = 365; // Max days for timeline chart
const FILTER_DEBOUNCE_MS = 150; // Debounce delay for filter changes

// Debounce hook for filter updates
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Memoized chart components to prevent unnecessary re-renders
const MagnitudeDistributionChart = memo(function MagnitudeDistributionChart({
  data
}: {
  data: { range: string; count: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="range" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip contentStyle={{ fontSize: 12 }} />
        <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
});

const DepthDistributionChart = memo(function DepthDistributionChart({
  data
}: {
  data: { range: string; count: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="range" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip contentStyle={{ fontSize: 12 }} />
        <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
});

const RegionDistributionChart = memo(function RegionDistributionChart({
  data
}: {
  data: { region: string; count: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis type="number" tick={{ fontSize: 12 }} />
        <YAxis dataKey="region" type="category" width={100} tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={{ fontSize: 12 }} />
        <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
});

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#FF6B9D'];

const CatalogueDistributionChart = memo(function CatalogueDistributionChart({
  data
}: {
  data: { catalogue: string; count: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="catalogue"
          cx="50%"
          cy="50%"
          outerRadius={90}
          label={(entry) => entry.catalogue}
          labelLine={false}
        >
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
});

// Loading skeleton for statistics cards
const StatisticsCardSkeleton = memo(function StatisticsCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4 rounded" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16 mb-2" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
});

// Loading skeleton for charts
const ChartSkeleton = memo(function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div className="w-full animate-pulse" style={{ height }}>
      <div className="h-full bg-muted rounded-lg flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
});

export default function AnalyticsPage() {
  const [catalogues, setCatalogues] = useState<any[]>([]);
  const [selectedCatalogue, setSelectedCatalogue] = useState<string>('all');
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [activeTab, setActiveTab] = useState('map');
  const [isPending, startTransition] = useTransition();

  // Visualize page filters - default to showing ALL events
  const [magnitudeRange, setMagnitudeRange] = useState([-2.0, 10.0]);
  const [depthRange, setDepthRange] = useState([0, 700]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedCataloguesFilter, setSelectedCataloguesFilter] = useState<string[]>([]);
  const [colorBy, setColorBy] = useState<'magnitude' | 'depth'>('magnitude');
  const [timeFilter, setTimeFilter] = useState('all');

  // Debounced filter values for expensive operations
  const debouncedMagnitudeRange = useDebounce(magnitudeRange, FILTER_DEBOUNCE_MS);
  const debouncedDepthRange = useDebounce(depthRange, FILTER_DEBOUNCE_MS);

  // Use deferred value for non-critical UI updates
  const deferredMagnitudeRange = useDeferredValue(debouncedMagnitudeRange);
  const deferredDepthRange = useDeferredValue(debouncedDepthRange);



  // Ref to track mounted state for async operations
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Use cached fetch for catalogues (fetched once and cached)
  const { data: catalogueData, loading: cataloguesLoading } = useCachedFetch<any[]>(
    '/api/catalogues',
    { cacheTime: 10 * 60 * 1000 } // 10 minute cache
  );

  // Update catalogues when data is fetched
  useEffect(() => {
    if (catalogueData) {
      setCatalogues(Array.isArray(catalogueData) ? catalogueData : []);
    }
  }, [catalogueData]);

  // Fetch events with pagination - only loads when catalogues are available
  const fetchCataloguesAndEvents = useCallback(async () => {
    if (!catalogueData || catalogueData.length === 0) return;

    setLoading(true);
    setLoadingProgress(0);
    setLoadingMessage('Loading earthquake data...');

    try {
      const catalogueList = Array.isArray(catalogueData) ? catalogueData : [];
      const allEvents: any[] = [];
      const totalCatalogues = catalogueList.length;

      // Fetch events in parallel with limits using Promise.allSettled
      const eventPromises = catalogueList.map(async (catalogue) => {
        try {
          // Use pagination to limit events per catalogue
          const eventsResponse = await fetch(
            `/api/catalogues/${catalogue.id}/events?limit=${MAX_EVENTS_PER_CATALOGUE}&direction=desc`
          );
          if (eventsResponse.ok) {
            const eventsData = await eventsResponse.json();
            // Handle both array and paginated response formats
            const eventsList = Array.isArray(eventsData) ? eventsData : eventsData.data || [];
            return eventsList.map((event: any) => ({
              ...event,
              catalogue: catalogue.name,
              catalogueId: catalogue.id,
              region: event.region || 'Unknown'
            }));
          }
        } catch (error) {
          console.error(`Failed to fetch events for catalogue ${catalogue.id}:`, error);
        }
        return [];
      });

      // Process results with progress updates
      const results = await Promise.allSettled(eventPromises);
      let processedCount = 0;

      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          allEvents.push(...result.value);
        }
        processedCount++;
        if (mountedRef.current) {
          setLoadingProgress(Math.round((processedCount / totalCatalogues) * 100));
          setLoadingMessage(`Loaded ${processedCount}/${totalCatalogues} catalogues (${allEvents.length.toLocaleString()} events)`);
        }
      });

      if (mountedRef.current) {
        setEvents(allEvents);
        if (allEvents.length > 0) {
          setSelectedEvent(allEvents[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching catalogues and events:', error);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setLoadingProgress(100);
        setLoadingMessage('');
      }
    }
  }, [catalogueData]);

  // Fetch events when catalogues are loaded
  useEffect(() => {
    if (catalogueData && catalogueData.length > 0 && events.length === 0) {
      fetchCataloguesAndEvents();
    }
  }, [catalogueData, fetchCataloguesAndEvents, events.length]);

  // Filter events based on selected catalogue (fast operation)
  const displayEvents = useMemo(() => {
    let filtered = events;

    if (selectedCatalogue !== 'all') {
      filtered = filtered.filter(e => e.catalogueId === selectedCatalogue);
    }

    return filtered;
  }, [events, selectedCatalogue]);

  // Filter events for visualization with debounced values (expensive operation)
  const filteredEarthquakes = useMemo(() => {
    let filtered = events;

    // First, apply the main catalogue dropdown filter
    if (selectedCatalogue !== 'all') {
      filtered = filtered.filter(eq => eq.catalogueId === selectedCatalogue);
    }

    // Magnitude filter (using deferred values)
    filtered = filtered.filter(eq =>
      eq.magnitude >= deferredMagnitudeRange[0] && eq.magnitude <= deferredMagnitudeRange[1]
    );

    // Depth filter (using deferred values)
    filtered = filtered.filter(eq =>
      eq.depth >= deferredDepthRange[0] && eq.depth <= deferredDepthRange[1]
    );

    // Region filter
    if (selectedRegions.length > 0) {
      filtered = filtered.filter(eq => selectedRegions.includes(eq.region || 'Unknown'));
    }

    // Additional catalogue filter
    if (selectedCataloguesFilter.length > 0 && selectedCatalogue === 'all') {
      filtered = filtered.filter(eq => selectedCataloguesFilter.includes(eq.catalogue || 'Unknown'));
    }

    // Time filter
    if (timeFilter !== 'all') {
      const now = new Date();
      const cutoff = new Date();

      switch (timeFilter) {
        case 'week':
          cutoff.setDate(now.getDate() - 7);
          break;
        case 'month':
          cutoff.setMonth(now.getMonth() - 1);
          break;
        case 'year':
          cutoff.setFullYear(now.getFullYear() - 1);
          break;
      }

      filtered = filtered.filter(eq => new Date(eq.time) >= cutoff);
    }

    return filtered;
  }, [events, selectedCatalogue, deferredMagnitudeRange, deferredDepthRange, selectedRegions, selectedCataloguesFilter, timeFilter]);

  // Visualization data calculations (optimized with sampling)
  const availableRegions = useMemo(() => {
    return Array.from(new Set(events.map(e => e.region || 'Unknown'))).sort();
  }, [events]);

  const availableCatalogues = useMemo(() => {
    return Array.from(new Set(events.map(e => e.catalogue || 'Unknown'))).sort();
  }, [events]);

  const magnitudeDistribution = useMemo(() => {
    const bins = [
      { range: '2.0-2.5', min: 2.0, max: 2.5, count: 0 },
      { range: '2.5-3.0', min: 2.5, max: 3.0, count: 0 },
      { range: '3.0-3.5', min: 3.0, max: 3.5, count: 0 },
      { range: '3.5-4.0', min: 3.5, max: 4.0, count: 0 },
      { range: '4.0-4.5', min: 4.0, max: 4.5, count: 0 },
      { range: '4.5-5.0', min: 4.5, max: 5.0, count: 0 },
      { range: '5.0+', min: 5.0, max: 10.0, count: 0 },
    ];

    filteredEarthquakes.forEach(eq => {
      const bin = bins.find(b => eq.magnitude >= b.min && eq.magnitude < b.max);
      if (bin) bin.count++;
    });

    return bins;
  }, [filteredEarthquakes]);

  const depthDistribution = useMemo(() => {
    const bins = [
      { range: '0-10 km', min: 0, max: 10, count: 0 },
      { range: '10-20 km', min: 10, max: 20, count: 0 },
      { range: '20-30 km', min: 20, max: 30, count: 0 },
      { range: '30-40 km', min: 30, max: 40, count: 0 },
      { range: '40+ km', min: 40, max: 1000, count: 0 },
    ];

    filteredEarthquakes.forEach(eq => {
      const bin = bins.find(b => eq.depth >= b.min && eq.depth < b.max);
      if (bin) bin.count++;
    });

    return bins;
  }, [filteredEarthquakes]);

  const regionDistribution = useMemo(() => {
    const regionCounts: Record<string, number> = {};
    filteredEarthquakes.forEach(eq => {
      const region = eq.region || 'Unknown';
      regionCounts[region] = (regionCounts[region] || 0) + 1;
    });

    return Object.entries(regionCounts)
      .map(([region, count]) => ({ region, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filteredEarthquakes]);

  const catalogueDistribution = useMemo(() => {
    const catalogueCounts: Record<string, number> = {};
    filteredEarthquakes.forEach(eq => {
      const catalogue = eq.catalogue || 'Unknown';
      catalogueCounts[catalogue] = (catalogueCounts[catalogue] || 0) + 1;
    });

    return Object.entries(catalogueCounts)
      .map(([catalogue, count]) => ({ catalogue, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredEarthquakes]);

  // Optimized time series data with aggregation for large datasets
  const timeSeriesData = useMemo(() => {
    const dateCounts: Record<string, number> = {};
    filteredEarthquakes.forEach(eq => {
      const date = new Date(eq.time).toISOString().split('T')[0];
      dateCounts[date] = (dateCounts[date] || 0) + 1;
    });

    let timeData = Object.entries(dateCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Aggregate data if too many points (group by week/month)
    if (timeData.length > MAX_TIMELINE_POINTS) {
      const aggregated: Record<string, number> = {};

      timeData.forEach(({ date, count }) => {
        const d = new Date(date);
        const weekStart = new Date(d.getTime() - d.getDay() * 24 * 60 * 60 * 1000);
        const aggregatedDate = weekStart.toISOString().split('T')[0];
        aggregated[aggregatedDate] = (aggregated[aggregatedDate] || 0) + count;
      });

      timeData = Object.entries(aggregated)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
    }

    return timeData;
  }, [filteredEarthquakes]);

  // Sampled scatter data for large datasets
  const magnitudeDepthScatter = useMemo(() => {
    // Sample data if too large
    let dataToPlot = filteredEarthquakes;

    if (filteredEarthquakes.length > MAX_CHART_DATA_POINTS) {
      // Stratified sampling: always include extremes, sample the rest
      const sorted = [...filteredEarthquakes].sort((a, b) => b.magnitude - a.magnitude);
      const topEvents = sorted.slice(0, Math.floor(MAX_CHART_DATA_POINTS * 0.2));
      const remaining = sorted.slice(Math.floor(MAX_CHART_DATA_POINTS * 0.2));

      // Random sample from remaining
      const step = Math.floor(remaining.length / (MAX_CHART_DATA_POINTS * 0.8));
      const sampled = remaining.filter((_, idx) => idx % step === 0);

      dataToPlot = [...topEvents, ...sampled].slice(0, MAX_CHART_DATA_POINTS);
    }

    return dataToPlot.map(eq => ({
      magnitude: eq.magnitude,
      depth: eq.depth,
      region: eq.region || 'Unknown'
    }));
  }, [filteredEarthquakes]);

  const handleResetFilters = useCallback(() => {
    startTransition(() => {
      setMagnitudeRange([-2.0, 10.0]);
      setDepthRange([0, 700]);
      setSelectedRegions([]);
      setSelectedCataloguesFilter([]);
      setTimeFilter('all');
    });
  }, []);

  const handleRegionToggle = useCallback((region: string) => {
    startTransition(() => {
      setSelectedRegions(prev =>
        prev.includes(region)
          ? prev.filter(r => r !== region)
          : [...prev, region]
      );
    });
  }, []);

  const handleCatalogueToggle = useCallback((catalogue: string) => {
    startTransition(() => {
      setSelectedCataloguesFilter(prev =>
        prev.includes(catalogue)
          ? prev.filter(c => c !== catalogue)
          : [...prev, catalogue]
      );
    });
  }, []);

  // Calculate statistics - optimized with single pass and sampling
  const statistics = useMemo(() => {
    if (displayEvents.length === 0) return null;

    const totalEvents = displayEvents.length;

    // Use sampling for quality scores (expensive calculation)
    // Sample size: max 1000 events for quality calculation
    const sampleSize = Math.min(1000, totalEvents);
    const sampleStep = Math.max(1, Math.floor(totalEvents / sampleSize));

    // Single pass for counting and sampling
    let withUncertainty = 0;
    let withFocalMechanism = 0;
    let withStationData = 0;
    const sampledEvents: any[] = [];

    for (let i = 0; i < totalEvents; i++) {
      const e = displayEvents[i];

      // Count uncertainty data
      if (e.latitude_uncertainty || e.longitude_uncertainty || e.depth_uncertainty) {
        withUncertainty++;
      }

      // Fast check for focal mechanism (avoid expensive parsing)
      // Just check if the field exists and is non-empty
      if (e.focal_mechanisms &&
          (typeof e.focal_mechanisms === 'string' ? e.focal_mechanisms.length > 2 :
           Array.isArray(e.focal_mechanisms) ? e.focal_mechanisms.length > 0 :
           typeof e.focal_mechanisms === 'object')) {
        withFocalMechanism++;
      }

      // Count station data
      if (e.used_station_count && e.used_station_count > 0) {
        withStationData++;
      }

      // Sample for quality calculation
      if (i % sampleStep === 0) {
        sampledEvents.push(e);
      }
    }

    // Calculate quality scores only for sampled events
    const qualityScores = sampledEvents.map(e => calculateQualityScore(e as QualityMetrics));
    const avgQuality = qualityScores.length > 0
      ? qualityScores.reduce((sum, s) => sum + s.overall, 0) / qualityScores.length
      : 0;

    const gradeDistribution = qualityScores.reduce((acc, s) => {
      acc[s.grade] = (acc[s.grade] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Scale grade distribution back to full dataset
    const scaleFactor = totalEvents / sampledEvents.length;
    if (scaleFactor > 1) {
      Object.keys(gradeDistribution).forEach(grade => {
        gradeDistribution[grade] = Math.round(gradeDistribution[grade] * scaleFactor);
      });
    }

    return {
      totalEvents,
      avgQuality: avgQuality.toFixed(1),
      gradeDistribution,
      withUncertainty,
      withFocalMechanism,
      withStationData,
      percentageWithUncertainty: ((withUncertainty / totalEvents) * 100).toFixed(1),
      percentageWithFocalMechanism: ((withFocalMechanism / totalEvents) * 100).toFixed(1),
      percentageWithStationData: ((withStationData / totalEvents) * 100).toFixed(1),
    };
  }, [displayEvents]);

  // Use web workers for seismological analysis (non-blocking)
  const {
    grAnalysis: grWorkerResult,
    completeness: completenessWorkerResult,
    temporalAnalysis: temporalWorkerResult,
    momentAnalysis: momentWorkerResult,
    anyLoading: analysisLoading
  } = useSeismologicalAnalyses(displayEvents as EarthquakeEvent[], activeTab);

  // Extract data from worker results
  const grAnalysis = grWorkerResult.data;
  const completeness = completenessWorkerResult.data;
  const temporalAnalysis = temporalWorkerResult.data;
  const momentAnalysis = momentWorkerResult.data;

  // Handle tab change with transition
  const handleTabChange = useCallback((value: string) => {
    startTransition(() => {
      setActiveTab(value);
    });
  }, []);

  // Loading state
  if (loading || cataloguesLoading) {
    return (
      <div className="container py-8">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">{loadingMessage || 'Loading earthquake data...'}</p>
          {loadingProgress > 0 && loadingProgress < 100 && (
            <div className="w-64">
              <Progress value={loadingProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center mt-2">
                {loadingProgress}% complete
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="container py-8">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <MapPin className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-2xl font-bold">No Earthquake Data Available</h2>
          <p className="text-muted-foreground text-center max-w-md">
            Upload catalogues or create merged catalogues to visualize earthquake data.
          </p>
          <Button onClick={() => window.location.href = '/upload'}>
            Upload Catalogue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Visualization & Analytics</h1>
          <p className="text-muted-foreground">
            Comprehensive visualization, quality assessment, and seismological analysis
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Select value={selectedCatalogue} onValueChange={setSelectedCatalogue}>
            <SelectTrigger className="w-[300px]">
              <SelectValue placeholder="Select catalogue" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Catalogues ({events.length.toLocaleString()} events)</SelectItem>
              {catalogues.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name} ({(cat.event_count || 0).toLocaleString()} events)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {['quality', 'gutenberg-richter', 'completeness', 'temporal', 'moment'].includes(activeTab)
              ? 'Filters quality analysis tabs'
              : 'Use filters in Map tab for visualization'}
          </p>
        </div>
      </div>

      {/* Performance indicator */}
      {(isPending || analysisLoading || filteredEarthquakes.length > 5000) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-4 py-2 rounded-lg">
          {(isPending || analysisLoading) && <Loader2 className="h-4 w-4 animate-spin" />}
          {!isPending && !analysisLoading && <Info className="h-4 w-4" />}
          {isPending ? (
            <span>Processing filter changes...</span>
          ) : analysisLoading ? (
            <span>Computing seismological analysis in background...</span>
          ) : (
            <span>
              Displaying {filteredEarthquakes.length.toLocaleString()} events.
              Large datasets may use sampling for optimal performance.
            </span>
          )}
        </div>
      )}

      {/* Statistics Cards */}
      {statistics ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Events</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.totalEvents.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                Avg Quality: {statistics.avgQuality}/100
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">With Uncertainty Data</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.withUncertainty.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {statistics.percentageWithUncertainty}% of events
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">With Focal Mechanisms</CardTitle>
              <Award className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.withFocalMechanism.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {statistics.percentageWithFocalMechanism}% of events
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">With Station Data</CardTitle>
              <Radio className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.withStationData.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {statistics.percentageWithStationData}% of events
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatisticsCardSkeleton />
          <StatisticsCardSkeleton />
          <StatisticsCardSkeleton />
          <StatisticsCardSkeleton />
        </div>
      )}

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5 lg:grid-cols-11 gap-1">
          <TabsTrigger value="map" className="text-xs">
            <MapPin className="h-3 w-3 mr-1" />
            Map
          </TabsTrigger>
          <TabsTrigger value="charts" className="text-xs">
            <BarChart3 className="h-3 w-3 mr-1" />
            Charts
          </TabsTrigger>
          <TabsTrigger value="distribution" className="text-xs">
            <Activity className="h-3 w-3 mr-1" />
            Distribution
          </TabsTrigger>
          <TabsTrigger value="timeline" className="text-xs">
            <Calendar className="h-3 w-3 mr-1" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="event-list" className="text-xs">
            <List className="h-3 w-3 mr-1" />
            Events
          </TabsTrigger>
          <TabsTrigger value="event-details" className="text-xs">
            <Target className="h-3 w-3 mr-1" />
            Details
          </TabsTrigger>
          <TabsTrigger value="quality" className="text-xs">
            <TrendingUp className="h-3 w-3 mr-1" />
            Quality
          </TabsTrigger>
          <TabsTrigger value="gutenberg-richter" className="text-xs">
            <Activity className="h-3 w-3 mr-1" />
            G-R
          </TabsTrigger>
          <TabsTrigger value="completeness" className="text-xs">
            <BarChart3 className="h-3 w-3 mr-1" />
            Mc
          </TabsTrigger>
          <TabsTrigger value="temporal" className="text-xs">
            <Clock className="h-3 w-3 mr-1" />
            Temporal
          </TabsTrigger>
          <TabsTrigger value="moment" className="text-xs">
            <Zap className="h-3 w-3 mr-1" />
            Moment
          </TabsTrigger>
        </TabsList>

        {/* Unified Map Tab */}
        <TabsContent value="map" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Filters Sidebar */}
            <Card className="lg:col-span-1 h-fit">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    Filters
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={handleResetFilters}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                <CardDescription className="text-xs">
                  {filteredEarthquakes.length.toLocaleString()} of {events.length.toLocaleString()} events
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Magnitude Range */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">
                    Magnitude: {magnitudeRange[0].toFixed(1)} - {magnitudeRange[1].toFixed(1)}
                  </Label>
                  <Slider
                    min={-2.0}
                    max={10.0}
                    step={0.1}
                    value={magnitudeRange}
                    onValueChange={setMagnitudeRange}
                    className="w-full"
                  />
                </div>

                {/* Depth Range */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">
                    Depth: {depthRange[0]} - {depthRange[1]} km
                  </Label>
                  <Slider
                    min={0}
                    max={700}
                    step={5}
                    value={depthRange}
                    onValueChange={setDepthRange}
                    className="w-full"
                  />
                </div>

                {/* Time Filter */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Time Period</Label>
                  <Select value={timeFilter} onValueChange={setTimeFilter}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="week">Last Week</SelectItem>
                      <SelectItem value="month">Last Month</SelectItem>
                      <SelectItem value="year">Last Year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Region Filter */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Regions ({selectedRegions.length} selected)</Label>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto border rounded-md p-2">
                    {availableRegions.slice(0, 10).map(region => (
                      <div key={region} className="flex items-center space-x-2">
                        <Checkbox
                          id={`region-${region}`}
                          checked={selectedRegions.includes(region)}
                          onCheckedChange={() => handleRegionToggle(region)}
                        />
                        <label
                          htmlFor={`region-${region}`}
                          className="text-xs cursor-pointer flex-1"
                        >
                          {region}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Catalogue Filter - only show when "All Catalogues" is selected */}
                {selectedCatalogue === 'all' && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Catalogues ({selectedCataloguesFilter.length} selected)</Label>
                    <div className="space-y-1.5 border rounded-md p-2">
                      {availableCatalogues.map(catalogue => (
                        <div key={catalogue} className="flex items-center space-x-2">
                          <Checkbox
                            id={`catalogue-${catalogue}`}
                            checked={selectedCataloguesFilter.includes(catalogue)}
                            onCheckedChange={() => handleCatalogueToggle(catalogue)}
                          />
                          <label
                            htmlFor={`catalogue-${catalogue}`}
                            className="text-xs cursor-pointer flex-1"
                          >
                            {catalogue}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedCatalogue !== 'all' && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Catalogue Filter</Label>
                    <p className="text-xs text-muted-foreground p-2 border rounded-md bg-muted/50">
                      Showing events from: <strong>{catalogues.find(c => c.id === selectedCatalogue)?.name || 'Selected catalogue'}</strong>
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Map View */}
            <div className="lg:col-span-3">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Interactive Earthquake Map</CardTitle>
                  <CardDescription className="text-xs">
                    Explore earthquake locations with advanced visualization options
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <UnifiedEarthquakeMap
                    key={`map-${selectedCatalogue}`}
                    earthquakes={filteredEarthquakes}
                    colorBy={colorBy}
                    showFocalMechanisms={true}
                    showFaultLines={true}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Charts Tab */}
        <TabsContent value="charts" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Magnitude Distribution</CardTitle>
                <CardDescription className="text-xs">Number of events by magnitude range</CardDescription>
              </CardHeader>
              <CardContent>
                <MagnitudeDistributionChart data={magnitudeDistribution} />
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Depth Distribution</CardTitle>
                <CardDescription className="text-xs">Number of events by depth range</CardDescription>
              </CardHeader>
              <CardContent>
                <DepthDistributionChart data={depthDistribution} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Distribution Tab */}
        <TabsContent value="distribution" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Top Regions</CardTitle>
                <CardDescription className="text-xs">Events by region (top 10)</CardDescription>
              </CardHeader>
              <CardContent>
                <RegionDistributionChart data={regionDistribution} />
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Catalogue Distribution</CardTitle>
                <CardDescription className="text-xs">Events by catalogue</CardDescription>
              </CardHeader>
              <CardContent>
                <CatalogueDistributionChart data={catalogueDistribution} />
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Magnitude vs Depth</CardTitle>
                <CardDescription className="text-xs">
                  Scatter plot showing relationship between magnitude and depth
                  {magnitudeDepthScatter.length < filteredEarthquakes.length && (
                    <span className="ml-2 text-amber-600">
                      (Sampled: {magnitudeDepthScatter.length.toLocaleString()} of {filteredEarthquakes.length.toLocaleString()} events)
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="magnitude" name="Magnitude" tick={{ fontSize: 12 }} />
                    <YAxis dataKey="depth" name="Depth (km)" reversed tick={{ fontSize: 12 }} />
                    <ZAxis range={[50, 400]} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Scatter name="Events" data={magnitudeDepthScatter} fill="#8b5cf6" />
                  </ScatterChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Earthquake Timeline</CardTitle>
              <CardDescription className="text-xs">
                Number of events over time
                {timeSeriesData.length < MAX_TIMELINE_POINTS && timeSeriesData.length > 0 && (
                  <span className="ml-2">({timeSeriesData.length} data points)</span>
                )}
                {filteredEarthquakes.length > 40000 && (
                  <span className="ml-2 text-amber-600">(Aggregated by week for performance)</span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    name="Events per Day"
                    dot={timeSeriesData.length < 100 ? { r: 3 } : false}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Event List Tab */}
        <TabsContent value="event-list" className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Event List</CardTitle>
              <CardDescription className="text-xs">
                Sortable table of all events in the selected catalogue. Click column headers to sort.
                {displayEvents.length > 100 && (
                  <span className="ml-2 text-blue-600">(Virtual scrolling enabled for {displayEvents.length.toLocaleString()} events)</span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {displayEvents.length > 0 ? (
                <EventTable
                  events={displayEvents.map(e => ({
                    id: e.id,
                    time: e.time,
                    latitude: e.latitude,
                    longitude: e.longitude,
                    depth: e.depth || 0,
                    magnitude: e.magnitude,
                    magnitude_type: e.magnitude_type || null,
                    location_name: e.region || e.location_name || null,
                    event_type: e.event_type || null,
                    quality_score: e.quality_score || null,
                    azimuthal_gap: e.azimuthal_gap || null,
                    used_station_count: e.used_station_count || null,
                    public_id: e.public_id || null,
                  }))}
                  onEventClick={(event) => {
                    const fullEvent = displayEvents.find(e => e.id === event.id);
                    if (fullEvent) {
                      setSelectedEvent(fullEvent);
                      handleTabChange('event-details');
                    }
                  }}
                />
              ) : (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  No events to display
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Event Details Tab */}
        <TabsContent value="event-details" className="space-y-4">
          {selectedEvent ? (
            <>
              {/* Event Selector */}
              <Card>
                <CardHeader>
                  <CardTitle>Select Event</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select
                    value={selectedEvent.id}
                    onValueChange={(id) => {
                      const event = events.find(e => e.id === id);
                      if (event) setSelectedEvent(event);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Only show first 100 events in dropdown to prevent performance issues */}
                      {events.slice(0, 100).filter((event) => event.id && event.id !== '').map((event) => (
                        <SelectItem key={event.id} value={event.id}>
                          M{event.magnitude.toFixed(1)} - {new Date(event.time).toLocaleString()} - {event.region || 'Unknown'}
                        </SelectItem>
                      ))}
                      {events.length > 100 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground text-center">
                          ... and {(events.length - 100).toLocaleString()} more events (use Events tab to browse all)
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {/* Event Analysis Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <QualityScoreCard score={calculateQualityScore(selectedEvent as QualityMetrics)} />
                <UncertaintyVisualization data={selectedEvent} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {parseFocalMechanism(selectedEvent.focal_mechanisms) && (
                  <FocalMechanismCard
                    mechanism={parseFocalMechanism(selectedEvent.focal_mechanisms)!}
                  />
                )}

                {parseStationData(selectedEvent.picks, selectedEvent.arrivals, selectedEvent.latitude, selectedEvent.longitude) && (
                  <StationCoverageCard
                    coverage={parseStationData(selectedEvent.picks, selectedEvent.arrivals, selectedEvent.latitude, selectedEvent.longitude)!}
                  />
                )}
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No event selected
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Quality Analysis Tab */}
        <TabsContent value="quality" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Catalogue Quality Distribution</CardTitle>
              <CardDescription>
                Distribution of quality grades across all events in the catalogue
              </CardDescription>
            </CardHeader>
            <CardContent>
              {statistics && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {(['A+', 'A', 'B', 'C', 'D', 'F'] as const).map(grade => (
                      <div key={grade} className="text-center p-4 border rounded-lg">
                        <div className="text-3xl font-bold">{(statistics.gradeDistribution[grade] || 0).toLocaleString()}</div>
                        <div className="text-sm text-muted-foreground">Grade {grade}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {((((statistics.gradeDistribution[grade] || 0) / statistics.totalEvents) * 100).toFixed(1))}%
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t">
                    <h4 className="font-semibold mb-2">Data Completeness</h4>
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Events with Uncertainty Data</span>
                          <span>{statistics.percentageWithUncertainty}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${statistics.percentageWithUncertainty}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Events with Focal Mechanisms</span>
                          <span>{statistics.percentageWithFocalMechanism}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-500 h-2 rounded-full"
                            style={{ width: `${statistics.percentageWithFocalMechanism}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Events with Station Data</span>
                          <span>{statistics.percentageWithStationData}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-purple-500 h-2 rounded-full"
                            style={{ width: `${statistics.percentageWithStationData}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Gutenberg-Richter Tab */}
        <TabsContent value="gutenberg-richter" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Gutenberg-Richter Analysis</CardTitle>
              <CardDescription>
                Frequency-magnitude distribution and b-value calculation
              </CardDescription>
            </CardHeader>
            <CardContent>
              {grAnalysis ? (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">b-value</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{grAnalysis.bValue.toFixed(3)}</div>
                        <p className="text-xs text-muted-foreground">
                          {grAnalysis.bValue < 0.8 ? 'Low (stress accumulation)' :
                           grAnalysis.bValue > 1.2 ? 'High (heterogeneous)' : 'Normal'}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">a-value</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{grAnalysis.aValue.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">Productivity</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">R² Fit</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{grAnalysis.rSquared.toFixed(3)}</div>
                        <p className="text-xs text-muted-foreground">
                          {grAnalysis.rSquared > 0.95 ? 'Excellent' :
                           grAnalysis.rSquared > 0.90 ? 'Good' : 'Fair'}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Mc (estimated)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{grAnalysis.completeness.toFixed(1)}</div>
                        <p className="text-xs text-muted-foreground">Completeness</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* G-R Plot */}
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="magnitude"
                          type="number"
                          label={{ value: 'Magnitude', position: 'insideBottom', offset: -10 }}
                        />
                        <YAxis
                          dataKey="logCount"
                          type="number"
                          label={{ value: 'log₁₀(N)', angle: -90, position: 'insideLeft' }}
                        />
                        <Tooltip />
                        <Legend />
                        <Scatter
                          name="Observed"
                          data={grAnalysis.dataPoints}
                          fill="#8884d8"
                        />
                        <Scatter
                          name="G-R Fit"
                          data={grAnalysis.fittedLine}
                          fill="#82ca9d"
                          line
                          shape="cross"
                        />
                        <ReferenceLine
                          x={grAnalysis.completeness}
                          stroke="red"
                          strokeDasharray="3 3"
                          label="Mc"
                        />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  {events.length === 0 ? 'No events available' :
                   displayEvents.length < 10 ? 'Insufficient data (need at least 10 events)' :
                   <div className="flex flex-col items-center gap-2">
                     <Loader2 className="h-8 w-8 animate-spin" />
                     <span>Computing Gutenberg-Richter analysis...</span>
                   </div>}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Completeness Tab */}
        <TabsContent value="completeness" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Completeness Magnitude (Mc)</CardTitle>
              <CardDescription>
                Magnitude above which the catalogue is complete
              </CardDescription>
            </CardHeader>
            <CardContent>
              {completeness ? (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Mc</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{completeness.mc.toFixed(1)}</div>
                        <p className="text-xs text-muted-foreground">{completeness.method} method</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Confidence</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{(completeness.confidence * 100).toFixed(1)}%</div>
                        <p className="text-xs text-muted-foreground">Events above Mc</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Method</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{completeness.method}</div>
                        <p className="text-xs text-muted-foreground">Maximum Curvature</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Magnitude Distribution */}
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={completeness.magnitudeDistribution} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="magnitude"
                          label={{ value: 'Magnitude', position: 'insideBottom', offset: -10 }}
                        />
                        <YAxis label={{ value: 'Event Count', angle: -90, position: 'insideLeft' }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="count" fill="#8884d8" name="Event Count" />
                        <ReferenceLine
                          x={completeness.mc}
                          stroke="red"
                          strokeDasharray="3 3"
                          label="Mc"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  {events.length === 0 ? 'No events available' :
                   displayEvents.length < 50 ? 'Insufficient data (need at least 50 events)' :
                   <div className="flex flex-col items-center gap-2">
                     <Loader2 className="h-8 w-8 animate-spin" />
                     <span>Computing completeness magnitude...</span>
                   </div>}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Temporal Tab */}
        <TabsContent value="temporal" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Temporal Analysis</CardTitle>
              <CardDescription>
                Time series analysis and cluster detection
              </CardDescription>
            </CardHeader>
            <CardContent>
              {temporalAnalysis ? (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Time Span</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{temporalAnalysis.timeSpanDays.toFixed(0)}</div>
                        <p className="text-xs text-muted-foreground">days</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Events/Day</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{temporalAnalysis.eventsPerDay.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">Average rate</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Events/Month</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{temporalAnalysis.eventsPerMonth.toFixed(1)}</div>
                        <p className="text-xs text-muted-foreground">Average rate</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Clusters</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{temporalAnalysis.clusters.length}</div>
                        <p className="text-xs text-muted-foreground">Detected</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Time Series Plot */}
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={temporalAnalysis.timeSeries} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          label={{ value: 'Date', position: 'insideBottom', offset: -10 }}
                        />
                        <YAxis label={{ value: 'Cumulative Count', angle: -90, position: 'insideLeft' }} />
                        <Tooltip />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="cumulativeCount"
                          stroke="#8884d8"
                          name="Cumulative Events"
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Clusters */}
                  {temporalAnalysis.clusters && temporalAnalysis.clusters.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-2">Detected Clusters</h3>
                      <div className="space-y-2">
                        {temporalAnalysis.clusters.map((cluster: { startDate: string; endDate: string; eventCount: number; maxMagnitude: number }, idx: number) => (
                          <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                              <div className="font-medium">
                                {new Date(cluster.startDate).toLocaleDateString()} - {new Date(cluster.endDate).toLocaleDateString()}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {cluster.eventCount} events, Max M{cluster.maxMagnitude.toFixed(1)}
                              </div>
                            </div>
                            <Badge>{cluster.eventCount} events</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  {events.length === 0 ? 'No events available' :
                   <div className="flex flex-col items-center gap-2">
                     <Loader2 className="h-8 w-8 animate-spin" />
                     <span>Computing temporal analysis...</span>
                   </div>}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Seismic Moment Tab */}
        <TabsContent value="moment" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Seismic Moment Analysis</CardTitle>
              <CardDescription>
                Energy release and moment magnitude calculations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {momentAnalysis ? (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Total Moment</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{momentAnalysis.totalMoment.toExponential(2)}</div>
                        <p className="text-xs text-muted-foreground">N⋅m</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Equivalent Mw</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{momentAnalysis.totalMomentMagnitude.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">Moment magnitude</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Largest Event</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">M{momentAnalysis.largestEvent.magnitude.toFixed(1)}</div>
                        <p className="text-xs text-muted-foreground">
                          {momentAnalysis.largestEvent.percentOfTotal.toFixed(1)}% of total
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Moment Distribution */}
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={momentAnalysis.momentByMagnitude} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="magnitude"
                          label={{ value: 'Magnitude', position: 'insideBottom', offset: -10 }}
                        />
                        <YAxis
                          scale="log"
                          domain={['auto', 'auto']}
                          label={{ value: 'Seismic Moment (N⋅m)', angle: -90, position: 'insideLeft' }}
                        />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="moment" fill="#8884d8" name="Seismic Moment" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Key Insights */}
                  <div className="p-4 bg-muted rounded-lg">
                    <h3 className="font-semibold mb-2">Key Insights</h3>
                    <ul className="space-y-1 text-sm">
                      <li>• Total moment release equivalent to a single M{momentAnalysis.totalMomentMagnitude.toFixed(2)} earthquake</li>
                      <li>• Largest event (M{momentAnalysis.largestEvent.magnitude.toFixed(1)}) released {momentAnalysis.largestEvent.percentOfTotal.toFixed(1)}% of total moment</li>
                      <li>• {momentAnalysis.momentByMagnitude.length} magnitude bins analyzed</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  {events.length === 0 ? 'No events available' :
                   <div className="flex flex-col items-center gap-2">
                     <Loader2 className="h-8 w-8 animate-spin" />
                     <span>Computing seismic moment analysis...</span>
                   </div>}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
