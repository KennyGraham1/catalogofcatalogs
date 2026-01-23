'use client';

import { useState, useEffect, useMemo, useCallback, useDeferredValue, useTransition, memo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
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
  Info,
  Download,
  Image,
  FileJson,
  ChevronsUpDown,
  Check
} from 'lucide-react';
import { QualityScoreCard } from '@/components/advanced-viz/QualityScoreCard';
import { UncertaintyVisualization } from '@/components/advanced-viz/UncertaintyVisualization';
import { FocalMechanismCard } from '@/components/advanced-viz/FocalMechanismCard';
import { StationCoverageCard } from '@/components/advanced-viz/StationCoverageCard';
import { calculateQualityScore, QualityMetrics } from '@/lib/quality-scoring';
import { parseFocalMechanism } from '@/lib/focal-mechanism-utils';
import { parseStationData } from '@/lib/station-coverage-utils';
import { EventTable } from '@/components/events/EventTable';
import { InfoTooltip, TechnicalTermTooltip } from '@/components/ui/info-tooltip';
import { type EarthquakeEvent, calculateMFDComparison, type MFDComparisonResult } from '@/lib/seismological-analysis';
import { type MergedCatalogue, type MergedEvent } from '@/lib/db';
import { useCachedFetch } from '@/hooks/use-cached-fetch';
import { useSeismologicalAnalyses } from '@/hooks/use-seismological-worker';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  AreaChart,
  Area,
  ComposedChart,
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
  ZAxis,
  Brush
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import {
  SEISMIC_COLORS,
  CATEGORICAL_COLORS,
  CHART_STYLES,
  CHART_CONFIGS,
  TOOLTIP_FORMATTERS,
  AXIS_FORMATTERS,
  getMagnitudeColor,
  getDepthColor,
  getGradeColor,
  exportChartAsPNG,
  exportChartAsSVG,
  exportDataAsJSON,
  exportDataAsCSV,
  MFD_CATALOGUE_COLORS,
} from '@/lib/chart-config';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

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

// Extended event type with catalogue info added during mapping
interface AnalyticsEvent extends MergedEvent {
  catalogue: string;      // Catalogue name
  catalogueId: string;    // Catalogue ID
}

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

// Chart export button component
const ChartExportButton = memo(function ChartExportButton({
  chartRef,
  data,
  filename,
  className = ''
}: {
  chartRef: React.RefObject<HTMLDivElement | null>;
  data?: Record<string, unknown>[];
  filename: string;
  className?: string;
}) {
  const handleExportPNG = async () => {
    if (chartRef.current) {
      await exportChartAsPNG(chartRef.current, filename);
    }
  };

  const handleExportSVG = async () => {
    if (chartRef.current) {
      await exportChartAsSVG(chartRef.current, filename);
    }
  };

  const handleExportJSON = () => {
    if (data) {
      exportDataAsJSON(data, filename);
    }
  };

  const handleExportCSV = () => {
    if (data) {
      exportDataAsCSV(data, filename);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleExportPNG}>
          <Image className="h-4 w-4 mr-2" />
          Export as PNG
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportSVG}>
          <Image className="h-4 w-4 mr-2" />
          Export as SVG
        </DropdownMenuItem>
        {data && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleExportJSON}>
              <FileJson className="h-4 w-4 mr-2" />
              Export Data (JSON)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportCSV}>
              <FileJson className="h-4 w-4 mr-2" />
              Export Data (CSV)
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

const AxisLegendHints = memo(function AxisLegendHints({
  axes,
  legend,
}: {
  axes: string;
  legend?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <span>Axes</span>
        <InfoTooltip content={axes} />
      </div>
      {legend && (
        <div className="flex items-center gap-1.5">
          <span>Legend</span>
          <InfoTooltip content={legend} />
        </div>
      )}
    </div>
  );
});

// Custom tooltip component for professional styling
const CustomTooltip = memo(function CustomTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string; dataKey: string }>;
  label?: string;
  formatter?: (value: number) => string;
  labelFormatter?: (label: string) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-3 min-w-[140px]">
      <p className="font-medium text-sm text-foreground mb-2 border-b pb-1">
        {labelFormatter ? labelFormatter(label || '') : label}
      </p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
          </div>
          <span className="font-mono font-medium tabular-nums">
            {formatter ? formatter(entry.value) : entry.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
});

// Memoized chart components with professional styling
const MagnitudeDistributionChart = memo(function MagnitudeDistributionChart({
  data
}: {
  data: { range: string; count: number }[]
}) {
  // Color bars based on magnitude range
  const getBarColor = (range: string) => {
    if (range.includes('5.0')) return SEISMIC_COLORS.energy.dark;
    if (range.includes('4.5') || range.includes('4.0')) return '#f97316';
    if (range.includes('3.5') || range.includes('3.0')) return '#eab308';
    return SEISMIC_COLORS.magnitude.dark;
  };

  return (
    <ChartContainer config={CHART_CONFIGS.magnitudeDistribution} className="h-[300px] w-full">
      <BarChart data={data} margin={CHART_STYLES.margin.default}>
        <defs>
          <linearGradient id="magnitudeGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SEISMIC_COLORS.magnitude.dark} stopOpacity={1} />
            <stop offset="100%" stopColor={SEISMIC_COLORS.magnitude.dark} stopOpacity={0.6} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray={CHART_STYLES.grid.strokeDasharray}
          className="stroke-muted"
          opacity={CHART_STYLES.grid.opacity}
          vertical={false}
        />
        <XAxis
          dataKey="range"
          tick={{ fontSize: CHART_STYLES.fontSize.tick }}
          tickLine={false}
          axisLine={{ className: 'stroke-muted' }}
          label={{
            value: 'Magnitude Range',
            position: 'insideBottom',
            offset: -10,
            fontSize: CHART_STYLES.fontSize.label,
            className: 'fill-muted-foreground'
          }}
        />
        <YAxis
          tick={{ fontSize: CHART_STYLES.fontSize.tick }}
          tickLine={false}
          axisLine={false}
          tickFormatter={AXIS_FORMATTERS.compact}
          label={{
            value: 'Event Count',
            angle: -90,
            position: 'insideLeft',
            fontSize: CHART_STYLES.fontSize.label,
            className: 'fill-muted-foreground'
          }}
        />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(value) => [value.toLocaleString(), 'Events']} />}
          cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
        />
        <Bar
          dataKey="count"
          fill="url(#magnitudeGradient)"
          radius={CHART_STYLES.bar.radius}
          maxBarSize={60}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={getBarColor(entry.range)} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
});

const DepthDistributionChart = memo(function DepthDistributionChart({
  data
}: {
  data: { range: string; count: number }[]
}) {
  return (
    <ChartContainer config={CHART_CONFIGS.depthDistribution} className="h-[300px] w-full">
      <BarChart data={data} margin={CHART_STYLES.margin.default}>
        <defs>
          <linearGradient id="depthGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SEISMIC_COLORS.depth.dark} stopOpacity={1} />
            <stop offset="100%" stopColor={SEISMIC_COLORS.depth.dark} stopOpacity={0.6} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray={CHART_STYLES.grid.strokeDasharray}
          className="stroke-muted"
          opacity={CHART_STYLES.grid.opacity}
          vertical={false}
        />
        <XAxis
          dataKey="range"
          tick={{ fontSize: CHART_STYLES.fontSize.tick }}
          tickLine={false}
          axisLine={{ className: 'stroke-muted' }}
          label={{
            value: 'Depth Range',
            position: 'insideBottom',
            offset: -10,
            fontSize: CHART_STYLES.fontSize.label,
            className: 'fill-muted-foreground'
          }}
        />
        <YAxis
          tick={{ fontSize: CHART_STYLES.fontSize.tick }}
          tickLine={false}
          axisLine={false}
          tickFormatter={AXIS_FORMATTERS.compact}
          label={{
            value: 'Event Count',
            angle: -90,
            position: 'insideLeft',
            fontSize: CHART_STYLES.fontSize.label,
            className: 'fill-muted-foreground'
          }}
        />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(value) => [value.toLocaleString(), 'Events']} />}
          cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
        />
        <Bar
          dataKey="count"
          fill="url(#depthGradient)"
          radius={CHART_STYLES.bar.radius}
          maxBarSize={60}
        />
      </BarChart>
    </ChartContainer>
  );
});

const RegionDistributionChart = memo(function RegionDistributionChart({
  data
}: {
  data: { region: string; count: number }[]
}) {
  return (
    <ChartContainer config={CHART_CONFIGS.region} className="h-[300px] w-full">
      <BarChart data={data} layout="vertical" margin={{ ...CHART_STYLES.margin.default, left: 100 }}>
        <defs>
          <linearGradient id="regionGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={SEISMIC_COLORS.secondary.dark} stopOpacity={0.6} />
            <stop offset="100%" stopColor={SEISMIC_COLORS.secondary.dark} stopOpacity={1} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray={CHART_STYLES.grid.strokeDasharray}
          className="stroke-muted"
          opacity={CHART_STYLES.grid.opacity}
          horizontal={false}
        />
        <XAxis
          type="number"
          tick={{ fontSize: CHART_STYLES.fontSize.tick }}
          tickLine={false}
          axisLine={{ className: 'stroke-muted' }}
          tickFormatter={AXIS_FORMATTERS.compact}
        />
        <YAxis
          dataKey="region"
          type="category"
          width={95}
          tick={{ fontSize: CHART_STYLES.fontSize.tick }}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(value) => [value.toLocaleString(), 'Events']} />}
          cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
        />
        <Bar
          dataKey="count"
          fill="url(#regionGradient)"
          radius={CHART_STYLES.bar.radiusHorizontal}
          maxBarSize={24}
        />
      </BarChart>
    </ChartContainer>
  );
});

const CatalogueDistributionChart = memo(function CatalogueDistributionChart({
  data
}: {
  data: { catalogue: string; count: number }[]
}) {
  const total = useMemo(() => data.reduce((sum, item) => sum + item.count, 0), [data]);

  return (
    <ChartContainer config={{}} className="h-[300px] w-full">
      <PieChart margin={CHART_STYLES.margin.compact}>
        <defs>
          {CATEGORICAL_COLORS.map((color, index) => (
            <linearGradient key={`gradient-${index}`} id={`pieGradient${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={1} />
              <stop offset="100%" stopColor={color} stopOpacity={0.7} />
            </linearGradient>
          ))}
        </defs>
        <Pie
          data={data}
          dataKey="count"
          nameKey="catalogue"
          cx="50%"
          cy="50%"
          innerRadius={45}
          outerRadius={85}
          paddingAngle={2}
          label={({ catalogue, percent }) =>
            percent > 0.05 ? `${catalogue.slice(0, 12)}${catalogue.length > 12 ? '...' : ''} (${(percent * 100).toFixed(0)}%)` : ''
          }
          labelLine={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }}
        >
          {data.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={`url(#pieGradient${index % CATEGORICAL_COLORS.length})`}
              stroke="hsl(var(--background))"
              strokeWidth={2}
            />
          ))}
        </Pie>
        <ChartTooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const item = payload[0];
            return (
              <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-3">
                <p className="font-medium text-sm">{item.name}</p>
                <p className="text-muted-foreground text-sm">
                  {item.value?.toLocaleString()} events ({((item.value as number / total) * 100).toFixed(1)}%)
                </p>
              </div>
            );
          }}
        />
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="fill-foreground">
          <tspan x="50%" dy="-0.5em" fontSize="20" fontWeight="bold">{total.toLocaleString()}</tspan>
          <tspan x="50%" dy="1.4em" fontSize="11" className="fill-muted-foreground">Total Events</tspan>
        </text>
      </PieChart>
    </ChartContainer>
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
const ChartSkeleton = memo(function ChartSkeleton({
  height = 280,
  message,
  children
}: {
  height?: number;
  message?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="w-full animate-pulse" style={{ height }}>
      <div className="h-full bg-muted rounded-lg flex flex-col items-center justify-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        {message && (
          <p className="text-sm text-muted-foreground">{message}</p>
        )}
        {children}
      </div>
    </div>
  );
});

export default function AnalyticsPage() {
  // Core state
  const [selectedCatalogue, setSelectedCatalogue] = useState<string>(''); // Empty by default - user must select
  const [catalogueSelectOpen, setCatalogueSelectOpen] = useState(false);
  const [catalogueSearchTerm, setCatalogueSearchTerm] = useState('');
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<AnalyticsEvent | null>(null);
  // Note: Events from API may have null depth values, which are handled in filtering/display logic
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [activeTab, setActiveTab] = useState('map');
  const [isPending, startTransition] = useTransition();
  const [eventsLoaded, setEventsLoaded] = useState(false); // Track if events have been loaded for current selection

  // Visualize page filters - default to showing ALL events
  const [magnitudeRange, setMagnitudeRange] = useState([-2.0, 10.0]);
  const [depthRange, setDepthRange] = useState([0, 700]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedCataloguesFilter, setSelectedCataloguesFilter] = useState<string[]>([]);
  const [colorBy, setColorBy] = useState<'magnitude' | 'depth'>('magnitude');
  const [timeFilter, setTimeFilter] = useState('all');

  // MFD (Magnitude-Frequency Distribution) state
  const [mfdSelectedCatalogues, setMfdSelectedCatalogues] = useState<string[]>([]);
  const [mfdShowCumulative, setMfdShowCumulative] = useState(true);
  const [mfdShowHistogram, setMfdShowHistogram] = useState(true);
  const [mfdLogScale, setMfdLogScale] = useState(true);
  const [mfdBinWidth, setMfdBinWidth] = useState<number>(0.1);
  const [mfdMinMagnitude, setMfdMinMagnitude] = useState<number | undefined>(undefined);
  const [mfdCumulativeStyle, setMfdCumulativeStyle] = useState<'solid' | 'dotted'>('solid');
  const mfdChartRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!catalogueSelectOpen) {
      setCatalogueSearchTerm('');
    }
  }, [catalogueSelectOpen]);

  // Use cached fetch for catalogues (fetched once and cached)
  const { data: catalogueData, loading: cataloguesLoading } = useCachedFetch<MergedCatalogue[]>(
    '/api/catalogues',
    { cacheTime: 10 * 60 * 1000 } // 10 minute cache
  );

  // Derive catalogues array from fetched data (no separate state needed)
  const catalogues = useMemo(() =>
    Array.isArray(catalogueData) ? catalogueData : [],
    [catalogueData]
  );

  // Fetch events for a single catalogue (on-demand loading)
  const fetchSingleCatalogueEvents = useCallback(async (catalogueId: string) => {
    if (!catalogues.length) return;

    const catalogue = catalogues.find((c) => c.id === catalogueId);
    if (!catalogue) return;

    setLoading(true);
    setLoadingProgress(0);
    setLoadingMessage(`Loading events for ${catalogue.name}...`);

    try {
      const eventsResponse = await fetch(
        `/api/catalogues/${catalogueId}/events?limit=${MAX_EVENTS_PER_CATALOGUE}&direction=desc`
      );

      if (eventsResponse.ok) {
        const eventsData = await eventsResponse.json();
        const eventsList: MergedEvent[] = Array.isArray(eventsData) ? eventsData : eventsData.data || [];
        const mappedEvents: AnalyticsEvent[] = eventsList.map((event) => ({
          ...event,
          catalogue: catalogue.name,
          catalogueId: catalogue.id,
          region: event.region || 'Unknown'
        }));

        if (mountedRef.current) {
          setEvents(mappedEvents);
          setEventsLoaded(true);
          if (mappedEvents.length > 0) {
            setSelectedEvent(mappedEvents[0]);
          }
          setLoadingProgress(100);
          setLoadingMessage(`Loaded ${mappedEvents.length.toLocaleString()} events`);
        }
      }
    } catch (error) {
      console.error(`Failed to fetch events for catalogue ${catalogueId}:`, error);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setLoadingMessage('');
      }
    }
  }, [catalogues]);

  // Fetch events for all catalogues (explicit user choice)
  const fetchAllCataloguesEvents = useCallback(async () => {
    if (!catalogues.length) return;

    setLoading(true);
    setLoadingProgress(0);
    setLoadingMessage('Loading all catalogues... This may take a moment.');

    try {
      const allEvents: AnalyticsEvent[] = [];
      const totalCatalogues = catalogues.length;

      // Fetch events in parallel with limits using Promise.allSettled
      const eventPromises = catalogues.map(async (catalogue) => {
        try {
          const eventsResponse = await fetch(
            `/api/catalogues/${catalogue.id}/events?limit=${MAX_EVENTS_PER_CATALOGUE}&direction=desc`
          );
          if (eventsResponse.ok) {
            const eventsData = await eventsResponse.json();
            const eventsList: MergedEvent[] = Array.isArray(eventsData) ? eventsData : eventsData.data || [];
            return eventsList.map((event): AnalyticsEvent => ({
              ...event,
              catalogue: catalogue.name,
              catalogueId: catalogue.id,
              region: event.region || 'Unknown'
            }));
          }
        } catch (error) {
          console.error(`Failed to fetch events for catalogue ${catalogue.id}:`, error);
        }
        return [] as AnalyticsEvent[];
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
        setEventsLoaded(true);
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
  }, [catalogues]);

  // Handle catalogue selection change - load events on demand
  const handleCatalogueChange = useCallback((value: string) => {
    setSelectedCatalogue(value);
    setEvents([]); // Clear current events
    setEventsLoaded(false);
    setSelectedEvent(null);

    if (value === 'all') {
      fetchAllCataloguesEvents();
    } else if (value) {
      fetchSingleCatalogueEvents(value);
    }
  }, [fetchSingleCatalogueEvents, fetchAllCataloguesEvents]);

  // Filter events based on selected catalogue (fast operation)
  // With lazy loading, events are already filtered by catalogue when loaded
  const displayEvents = useMemo(() => {
    // If "all" is selected, events contain all catalogues, otherwise single catalogue
    return events;
  }, [events]);

  // Filter events for visualization with debounced values (expensive operation)
  // Events are already filtered by catalogue on load, so no need to filter again
  const filteredEarthquakes = useMemo(() => {
    let filtered = events;

    // Magnitude filter (using deferred values)
    filtered = filtered.filter(eq =>
      eq.magnitude >= deferredMagnitudeRange[0] && eq.magnitude <= deferredMagnitudeRange[1]
    );

    // Depth filter (using deferred values) - handle null depth values
    filtered = filtered.filter(eq =>
      eq.depth != null && eq.depth >= deferredDepthRange[0] && eq.depth <= deferredDepthRange[1]
    );

    // Region filter
    if (selectedRegions.length > 0) {
      filtered = filtered.filter(eq => selectedRegions.includes(eq.region || 'Unknown'));
    }

    // Additional catalogue filter (only when "all" is selected and we have all catalogues loaded)
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
      if (eq.depth == null) return;
      const bin = bins.find(b => eq.depth! >= b.min && eq.depth! < b.max);
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
      // Note: focal_mechanisms can be JSON string or parsed array/object depending on API response
      const fm = e.focal_mechanisms as string | unknown[] | object | null | undefined;
      if (fm &&
        (typeof fm === 'string' ? fm.length > 2 :
          Array.isArray(fm) ? fm.length > 0 :
            typeof fm === 'object')) {
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

  // Calculate MFD comparison for selected catalogues
  const mfdComparison = useMemo((): MFDComparisonResult | null => {
    if (mfdSelectedCatalogues.length === 0 || events.length === 0) {
      return null;
    }

    // Group events by catalogue and prepare data for MFD calculation
    const catalogueData = mfdSelectedCatalogues.map((catalogueId, index) => {
      const catalogue = catalogues.find(c => c.id === catalogueId);
      const catalogueEvents = events.filter(e => e.catalogueId === catalogueId);
      return {
        events: catalogueEvents as EarthquakeEvent[],
        catalogueId,
        catalogueName: catalogue?.name || `Catalogue ${index + 1}`,
        color: MFD_CATALOGUE_COLORS[index % MFD_CATALOGUE_COLORS.length],
      };
    });

    return calculateMFDComparison(catalogueData, mfdBinWidth, mfdMinMagnitude);
  }, [mfdSelectedCatalogues, events, catalogues, mfdBinWidth, mfdMinMagnitude]);

  // Handle MFD catalogue selection toggle
  const handleMfdCatalogueToggle = useCallback((catalogueId: string) => {
    setMfdSelectedCatalogues(prev => {
      if (prev.includes(catalogueId)) {
        return prev.filter(id => id !== catalogueId);
      }
      return [...prev, catalogueId];
    });
  }, []);

  // Select all catalogues for MFD
  const handleMfdSelectAll = useCallback(() => {
    setMfdSelectedCatalogues(catalogues.map(c => c.id));
  }, [catalogues]);

  // Clear all MFD selections
  const handleMfdClearAll = useCallback(() => {
    setMfdSelectedCatalogues([]);
  }, []);

  // Handle tab change with transition
  const handleTabChange = useCallback((value: string) => {
    startTransition(() => {
      setActiveTab(value);
    });
  }, []);

  // No catalogues available (only show after loading completes)
  if (!cataloguesLoading && catalogues.length === 0) {
    return (
      <div className="container py-8">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <MapPin className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-2xl font-bold">No Catalogues Available</h2>
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

  // Get total events count from catalogue metadata
  const totalEventsFromMetadata = catalogues.reduce((sum, cat) => sum + (cat.event_count || 0), 0);

  // No catalogue selected - show selection prompt (immediately, with loading state for catalogue list)
  if (!selectedCatalogue) {
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
        </div>

        {/* Catalogue Selection Card */}
        <Card className="max-w-2xl mx-auto mt-12">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-4 bg-primary/10 rounded-full w-fit">
              <BarChart3 className="h-12 w-12 text-primary" />
            </div>
            <CardTitle className="text-2xl">Select a Catalogue to Analyze</CardTitle>
            <CardDescription>
              Choose a specific catalogue for fast analysis, or load all catalogues for comprehensive comparison.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Available Catalogues</Label>
              {cataloguesLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading catalogues...</span>
                  </div>
                </div>
              ) : (
                <Popover open={catalogueSelectOpen} onOpenChange={setCatalogueSelectOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={catalogueSelectOpen}
                      className="w-full justify-between"
                    >
                      <span className="truncate">Select a catalogue...</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search catalogues..."
                        value={catalogueSearchTerm}
                        onValueChange={setCatalogueSearchTerm}
                      />
                      <CommandList>
                        <CommandEmpty>No catalogues found.</CommandEmpty>
                        <CommandGroup>
                          {catalogues.map((cat) => (
                            <CommandItem
                              key={cat.id}
                              value={`${cat.name} ${cat.id}`}
                              onSelect={() => {
                                handleCatalogueChange(cat.id);
                                setCatalogueSelectOpen(false);
                              }}
                              className="flex items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Check
                                  className={`h-4 w-4 ${selectedCatalogue === cat.id ? 'opacity-100' : 'opacity-0'}`}
                                />
                                <span className="truncate">{cat.name}</span>
                              </div>
                              <Badge variant="secondary" className="ml-2">
                                {(cat.event_count || 0).toLocaleString()} events
                              </Badge>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleCatalogueChange('all')}
              disabled={cataloguesLoading}
            >
              {cataloguesLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Activity className="h-4 w-4 mr-2" />
                  Load All Catalogues ({totalEventsFromMetadata.toLocaleString()} events total)
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Loading all catalogues may take longer for large datasets
            </p>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <div className="max-w-2xl mx-auto">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Available Catalogues Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {cataloguesLoading ? (
              <>
                <Card><CardContent className="p-4"><Skeleton className="h-8 w-12 mb-1" /><Skeleton className="h-3 w-16" /></CardContent></Card>
                <Card><CardContent className="p-4"><Skeleton className="h-8 w-16 mb-1" /><Skeleton className="h-3 w-16" /></CardContent></Card>
                <Card><CardContent className="p-4"><Skeleton className="h-8 w-12 mb-1" /><Skeleton className="h-3 w-20" /></CardContent></Card>
                <Card><CardContent className="p-4"><Skeleton className="h-8 w-16 mb-1" /><Skeleton className="h-3 w-20" /></CardContent></Card>
              </>
            ) : (
              <>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">{catalogues.length}</div>
                    <div className="text-xs text-muted-foreground">Catalogues</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">{totalEventsFromMetadata.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">Total Events</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">
                      {catalogues.length > 0
                        ? Math.round(totalEventsFromMetadata / catalogues.length).toLocaleString()
                        : 0}
                    </div>
                    <div className="text-xs text-muted-foreground">Avg Events/Catalogue</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">
                      {catalogues.length > 0
                        ? Math.max(...catalogues.map(c => c.event_count || 0)).toLocaleString()
                        : 0}
                    </div>
                    <div className="text-xs text-muted-foreground">Largest Catalogue</div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Loading events for selected catalogue
  if (loading) {
    return (
      <div className="container py-8">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <Card className="w-full max-w-md border-0 shadow-lg bg-gradient-to-br from-background to-muted/30">
            <CardContent className="pt-8 pb-6">
              <div className="flex flex-col items-center gap-6">
                {/* Animated seismic wave loader */}
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: '1.5s' }} />
                  <div className="absolute inset-2 rounded-full bg-primary/30 animate-ping" style={{ animationDuration: '1.5s', animationDelay: '0.2s' }} />
                  <div className="relative flex items-center justify-center h-20 w-20 rounded-full bg-gradient-to-br from-primary to-primary/80 shadow-lg">
                    <Activity className="h-10 w-10 text-primary-foreground animate-pulse" />
                  </div>
                </div>

                {/* Loading message */}
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">
                    {loadingMessage || 'Loading earthquake data...'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Fetching seismic events from the database
                  </p>
                </div>

                {/* Progress indicator */}
                {loadingProgress > 0 && loadingProgress < 100 ? (
                  <div className="w-full space-y-2">
                    <div className="relative">
                      <Progress value={loadingProgress} className="h-2" />
                      <div
                        className="absolute top-0 h-2 bg-primary/30 rounded-full animate-pulse"
                        style={{ width: `${Math.min(loadingProgress + 10, 100)}%`, opacity: 0.5 }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Processing...</span>
                      <span className="font-medium">{loadingProgress}%</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="flex gap-1">
                      <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span>Connecting to database</span>
                  </div>
                )}

                {/* Cancel button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setSelectedCatalogue('');
                    setEvents([]);
                    setEventsLoaded(false);
                    setLoading(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Events loaded but empty (shouldn't normally happen)
  if (eventsLoaded && events.length === 0) {
    const currentCatalogue = catalogues.find(c => c.id === selectedCatalogue);
    return (
      <div className="container py-8">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <MapPin className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-2xl font-bold">No Events Found</h2>
          <p className="text-muted-foreground text-center max-w-md">
            {selectedCatalogue === 'all'
              ? 'No events found in any catalogue.'
              : `No events found in "${currentCatalogue?.name || 'selected catalogue'}".`}
          </p>
          <Button variant="outline" onClick={() => {
            setSelectedCatalogue('');
            setEvents([]);
            setEventsLoaded(false);
          }}>
            Select Different Catalogue
          </Button>
        </div>
      </div>
    );
  }

  // Get current catalogue name for display
  const currentCatalogueName = selectedCatalogue === 'all'
    ? 'All Catalogues'
    : catalogues.find(c => c.id === selectedCatalogue)?.name || 'Selected Catalogue';

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Visualization & Analytics</h1>
          <p className="text-muted-foreground">
            Analyzing: <span className="font-medium text-foreground">{currentCatalogueName}</span>
            {' '}({events.length.toLocaleString()} events)
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Select value={selectedCatalogue} onValueChange={handleCatalogueChange}>
            <SelectTrigger className="w-[300px]">
              <SelectValue placeholder="Select catalogue" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                All Catalogues ({totalEventsFromMetadata.toLocaleString()} events)
              </SelectItem>
              {catalogues.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name} ({(cat.event_count || 0).toLocaleString()} events)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {selectedCatalogue === 'all' ? 'Comparing all catalogues' : 'Switch catalogue to analyze different data'}
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
        <TabsList className="grid w-full grid-cols-6 lg:grid-cols-12 gap-1">
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
          <TabsTrigger value="mfd" className="text-xs">
            <BarChart3 className="h-3 w-3 mr-1" />
            MFD
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
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs font-medium">
                      Magnitude: {magnitudeRange[0].toFixed(1)} - {magnitudeRange[1].toFixed(1)}
                    </Label>
                    <TechnicalTermTooltip term="magnitude" />
                  </div>
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
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs font-medium">
                      Depth: {depthRange[0]} - {depthRange[1]} km
                    </Label>
                    <TechnicalTermTooltip term="depth" />
                  </div>
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
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs font-medium">Time Period</Label>
                    <InfoTooltip content="Limits events to a relative time window based on origin time." />
                  </div>
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
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs font-medium">Regions ({selectedRegions.length} selected)</Label>
                    <InfoTooltip content="Region names derived from event metadata or location lookup." />
                  </div>
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
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs font-medium">Catalogues ({selectedCataloguesFilter.length} selected)</Label>
                      <InfoTooltip content="Filter events to a subset of catalogues when viewing all." />
                    </div>
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
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs font-medium">Catalogue Filter</Label>
                      <InfoTooltip content="Shows the currently selected catalogue." />
                    </div>
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
                    earthquakes={filteredEarthquakes.filter(eq => eq.depth != null) as any}
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
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Magnitude Distribution</CardTitle>
                  <TechnicalTermTooltip term="magnitudeFrequencyDistribution" />
                </div>
                <CardDescription className="text-xs">Number of events by magnitude range</CardDescription>
                <AxisLegendHints
                  axes="X: magnitude range bins. Y: event count."
                  legend="Color indicates relative magnitude bin."
                />
              </CardHeader>
              <CardContent>
                <MagnitudeDistributionChart data={magnitudeDistribution} />
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Depth Distribution</CardTitle>
                  <TechnicalTermTooltip term="depth" />
                </div>
                <CardDescription className="text-xs">Number of events by depth range</CardDescription>
                <AxisLegendHints
                  axes="X: depth range (km). Y: event count."
                  legend="Color indicates depth bin."
                />
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
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Top Regions</CardTitle>
                  <InfoTooltip content="Regions derived from event metadata or geocoding." />
                </div>
                <CardDescription className="text-xs">Events by region (top 10)</CardDescription>
                <AxisLegendHints axes="X: event count. Y: region name." />
              </CardHeader>
              <CardContent>
                <RegionDistributionChart data={regionDistribution} />
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Catalogue Distribution</CardTitle>
                  <InfoTooltip content="Event counts grouped by catalogue source." />
                </div>
                <CardDescription className="text-xs">Events by catalogue</CardDescription>
                <AxisLegendHints
                  axes="Slice size shows event count by catalogue."
                  legend="Labels show percent share of events."
                />
              </CardHeader>
              <CardContent>
                <CatalogueDistributionChart data={catalogueDistribution} />
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Magnitude vs Depth</CardTitle>
                  <InfoTooltip content="Scatter plot of event magnitude against hypocentral depth." />
                </div>
                <CardDescription className="text-xs">
                  Scatter plot showing relationship between magnitude and depth
                  {magnitudeDepthScatter.length < filteredEarthquakes.length && (
                    <span className="ml-2 text-amber-600">
                      (Sampled: {magnitudeDepthScatter.length.toLocaleString()} of {filteredEarthquakes.length.toLocaleString()} events)
                    </span>
                  )}
                </CardDescription>
                <AxisLegendHints
                  axes="X: magnitude. Y: depth in km (inverted)."
                  legend="Points represent events."
                />
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
              <AxisLegendHints
                axes="X: date. Y: event count."
                legend="Line shows events per day or per week when aggregated."
              />
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
                    azimuthal_gap: e.azimuthal_gap || null,
                    used_station_count: e.used_station_count || null,
                    public_id: e.event_public_id || null,
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
                          M{event.magnitude.toFixed(1)} - {new Date(event.time).toLocaleString('en-GB', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })} - {event.region || 'Unknown'}
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
              <div className="flex items-center gap-2">
                <CardTitle>Catalogue Quality Distribution</CardTitle>
                <TechnicalTermTooltip term="qualityGrade" />
              </div>
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
                          <div className="flex items-center gap-1.5">
                            <span>Events with Uncertainty Data</span>
                            <TechnicalTermTooltip term="uncertainty" />
                          </div>
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
                          <div className="flex items-center gap-1.5">
                            <span>Events with Focal Mechanisms</span>
                            <TechnicalTermTooltip term="focalMechanism" />
                          </div>
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
                          <div className="flex items-center gap-1.5">
                            <span>Events with Station Data</span>
                            <InfoTooltip content="Events that include picks or arrivals from seismic stations." />
                          </div>
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
          <Card className="border-0 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-violet-500/10 to-purple-500/10 rounded-t-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-500/20 rounded-lg">
                  <Activity className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle>Gutenberg-Richter Analysis</CardTitle>
                    <InfoTooltip content="Relates earthquake frequency to magnitude using a log-linear model." />
                  </div>
                  <CardDescription>
                    Frequency-magnitude distribution following log₁₀(N) = a - bM relationship
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {grAnalysis ? (
                <div className="space-y-6">
                  {/* Summary Cards with professional styling */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card className="bg-gradient-to-br from-violet-50 to-violet-100/50 dark:from-violet-950/50 dark:to-violet-900/30 border-violet-200 dark:border-violet-800">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm font-medium text-violet-700 dark:text-violet-300 flex items-center gap-2">
                            <span className="w-2 h-2 bg-violet-500 rounded-full"></span>
                            b-value
                          </CardTitle>
                          <TechnicalTermTooltip term="bValue" />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-violet-900 dark:text-violet-100 font-mono">
                          {grAnalysis.bValue.toFixed(3)}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge
                            variant={grAnalysis.bValue < 0.8 ? 'destructive' : grAnalysis.bValue > 1.2 ? 'secondary' : 'default'}
                            className="text-xs"
                          >
                            {grAnalysis.bValue < 0.8 ? 'Low' : grAnalysis.bValue > 1.2 ? 'High' : 'Normal'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {grAnalysis.bValue < 0.8 ? 'Stress accumulation' : grAnalysis.bValue > 1.2 ? 'Heterogeneous' : 'Typical range'}
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/50 dark:to-blue-900/30 border-blue-200 dark:border-blue-800">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center gap-2">
                            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                            a-value
                          </CardTitle>
                          <TechnicalTermTooltip term="aValue" />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-blue-900 dark:text-blue-100 font-mono">
                          {grAnalysis.aValue.toFixed(2)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">Seismic productivity index</p>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/50 dark:to-emerald-900/30 border-emerald-200 dark:border-emerald-800">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                            <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                            R² Goodness of Fit
                          </CardTitle>
                          <TechnicalTermTooltip term="rSquared" />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-emerald-900 dark:text-emerald-100 font-mono">
                          {grAnalysis.rSquared.toFixed(3)}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge
                            variant={grAnalysis.rSquared > 0.95 ? 'default' : grAnalysis.rSquared > 0.90 ? 'secondary' : 'outline'}
                            className="text-xs"
                          >
                            {grAnalysis.rSquared > 0.95 ? 'Excellent' : grAnalysis.rSquared > 0.90 ? 'Good' : 'Fair'}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/50 dark:to-amber-900/30 border-amber-200 dark:border-amber-800">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-300 flex items-center gap-2">
                            <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                            Mc (Completeness)
                          </CardTitle>
                          <TechnicalTermTooltip term="completenessMagnitude" />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-amber-900 dark:text-amber-100 font-mono">
                          M{grAnalysis.completeness.toFixed(1)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">Magnitude of completeness</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* G-R Plot with professional styling */}
                  <Card className="border border-border/50">
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">Frequency-Magnitude Relationship</CardTitle>
                        <TechnicalTermTooltip term="magnitudeFrequencyDistribution" />
                      </div>
                      <CardDescription>
                        log₁₀(N) = {grAnalysis.aValue.toFixed(2)} - {grAnalysis.bValue.toFixed(3)} × M
                      </CardDescription>
                      <AxisLegendHints
                        axes="X: magnitude. Y: log10 cumulative event count."
                        legend="Points are observed data; line is G-R fit; dashed line marks Mc."
                      />
                    </CardHeader>
                    <CardContent>
                      <ChartContainer config={CHART_CONFIGS.gutenbergRichter} className="h-[420px] w-full">
                        <ScatterChart margin={{ top: 20, right: 30, left: 60, bottom: 60 }}>
                          <defs>
                            <linearGradient id="grObservedGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={SEISMIC_COLORS.magnitude.dark} stopOpacity={0.9} />
                              <stop offset="100%" stopColor={SEISMIC_COLORS.magnitude.dark} stopOpacity={0.5} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            strokeDasharray={CHART_STYLES.grid.strokeDasharray}
                            className="stroke-muted"
                            opacity={CHART_STYLES.grid.opacity}
                          />
                          <XAxis
                            dataKey="magnitude"
                            type="number"
                            tick={{ fontSize: CHART_STYLES.fontSize.tick }}
                            tickLine={false}
                            axisLine={{ className: 'stroke-muted' }}
                            label={{
                              value: 'Magnitude (M)',
                              position: 'insideBottom',
                              offset: -10,
                              fontSize: CHART_STYLES.fontSize.label,
                              className: 'fill-muted-foreground font-medium'
                            }}
                          />
                          <YAxis
                            dataKey="logCount"
                            type="number"
                            tick={{ fontSize: CHART_STYLES.fontSize.tick }}
                            tickLine={false}
                            axisLine={false}
                            label={{
                              value: 'log₁₀(N) - Cumulative Number',
                              angle: -90,
                              position: 'insideLeft',
                              offset: 10,
                              fontSize: CHART_STYLES.fontSize.label,
                              className: 'fill-muted-foreground font-medium'
                            }}
                          />
                          <ChartTooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const data = payload[0].payload;
                              return (
                                <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-3">
                                  <p className="font-medium text-sm">M{data.magnitude?.toFixed(1)}</p>
                                  <p className="text-muted-foreground text-sm">
                                    log₁₀(N) = {data.logCount?.toFixed(2)}
                                  </p>
                                  <p className="text-muted-foreground text-sm">
                                    N = {Math.pow(10, data.logCount)?.toFixed(0)} events
                                  </p>
                                </div>
                              );
                            }}
                          />
                          <Legend
                            verticalAlign="top"
                            align="right"
                            wrapperStyle={{ paddingBottom: 10 }}
                          />
                          <Scatter
                            name="Observed Data"
                            data={grAnalysis.dataPoints}
                            fill={SEISMIC_COLORS.magnitude.dark}
                            fillOpacity={0.8}
                          >
                            {grAnalysis.dataPoints.map((_: unknown, index: number) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={SEISMIC_COLORS.magnitude.dark}
                                strokeWidth={2}
                                stroke="hsl(var(--background))"
                              />
                            ))}
                          </Scatter>
                          <Scatter
                            name="G-R Linear Fit"
                            data={grAnalysis.fittedLine}
                            fill={SEISMIC_COLORS.fit.dark}
                            line={{ stroke: SEISMIC_COLORS.fit.dark, strokeWidth: 2 }}
                            shape="diamond"
                            legendType="line"
                          />
                          <ReferenceLine
                            x={grAnalysis.completeness}
                            stroke={SEISMIC_COLORS.reference.dark}
                            strokeWidth={2}
                            strokeDasharray="8 4"
                            label={{
                              value: `Mc = ${grAnalysis.completeness.toFixed(1)}`,
                              position: 'top',
                              fill: SEISMIC_COLORS.reference.dark,
                              fontSize: 12,
                              fontWeight: 600
                            }}
                          />
                        </ScatterChart>
                      </ChartContainer>
                    </CardContent>
                  </Card>

                  {/* Interpretation panel */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-900/50 dark:to-slate-800/30 rounded-lg border">
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <Info className="h-4 w-4 text-blue-500" />
                        Parameter Interpretation
                      </h4>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 bg-violet-500 rounded-full mt-2"></span>
                          <span><strong>b-value ≈ 1.0:</strong> Global average for tectonic earthquakes</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 bg-violet-500 rounded-full mt-2"></span>
                          <span><strong>b &lt; 0.8:</strong> May indicate high stress or asperities</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 bg-violet-500 rounded-full mt-2"></span>
                          <span><strong>b &gt; 1.2:</strong> Often seen in volcanic or geothermal areas</span>
                        </li>
                      </ul>
                    </div>
                    <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-900/50 dark:to-slate-800/30 rounded-lg border">
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                        Analysis Summary
                      </h4>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2"></span>
                          <span>Events analyzed: <strong>{displayEvents.length.toLocaleString()}</strong></span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2"></span>
                          <span>Data points above Mc: <strong>{grAnalysis.dataPoints?.length || 0}</strong></span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2"></span>
                          <span>Fit quality: <strong>{grAnalysis.rSquared > 0.95 ? 'Excellent' : grAnalysis.rSquared > 0.90 ? 'Good' : 'Fair'}</strong> (R² = {grAnalysis.rSquared.toFixed(3)})</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  {events.length === 0 ? (
                    <div className="flex flex-col items-center gap-3">
                      <Activity className="h-12 w-12 opacity-30" />
                      <span>No events available</span>
                    </div>
                  ) : displayEvents.length < 10 ? (
                    <div className="flex flex-col items-center gap-3">
                      <Activity className="h-12 w-12 opacity-30" />
                      <span>Insufficient data (need at least 10 events)</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
                      <span className="font-medium">Computing Gutenberg-Richter analysis...</span>
                      <span className="text-xs">Fitting frequency-magnitude distribution</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Completeness Tab */}
        <TabsContent value="completeness" className="space-y-4">
          <Card className="border-0 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-cyan-500/10 to-teal-500/10 rounded-t-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/20 rounded-lg">
                  <Target className="h-5 w-5 text-cyan-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle>Completeness Magnitude (Mc)</CardTitle>
                    <TechnicalTermTooltip term="completenessMagnitude" />
                  </div>
                  <CardDescription>
                    Threshold magnitude above which the catalogue records all events
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {completeness ? (
                <div className="space-y-6">
                  {/* Summary Cards with professional styling */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="bg-gradient-to-br from-cyan-50 to-cyan-100/50 dark:from-cyan-950/50 dark:to-cyan-900/30 border-cyan-200 dark:border-cyan-800">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm font-medium text-cyan-700 dark:text-cyan-300 flex items-center gap-2">
                            <span className="w-2 h-2 bg-cyan-500 rounded-full"></span>
                            Completeness Magnitude
                          </CardTitle>
                          <TechnicalTermTooltip term="completenessMagnitude" />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-4xl font-bold text-cyan-900 dark:text-cyan-100 font-mono">
                          M{completeness.mc.toFixed(1)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Using {completeness.method} method
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-teal-50 to-teal-100/50 dark:from-teal-950/50 dark:to-teal-900/30 border-teal-200 dark:border-teal-800">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm font-medium text-teal-700 dark:text-teal-300 flex items-center gap-2">
                            <span className="w-2 h-2 bg-teal-500 rounded-full"></span>
                            Catalogue Completeness
                          </CardTitle>
                          <InfoTooltip content="Percent of events above Mc used to assess completeness confidence." />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-4xl font-bold text-teal-900 dark:text-teal-100 font-mono">
                          {(completeness.confidence * 100).toFixed(1)}%
                        </div>
                        <div className="mt-2">
                          <Progress value={completeness.confidence * 100} className="h-2" />
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">Events above Mc</p>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/50 dark:to-emerald-900/30 border-emerald-200 dark:border-emerald-800">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                            <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                            Detection Method
                          </CardTitle>
                          <InfoTooltip content="Method used to estimate Mc (e.g., maximum curvature)." />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
                          {completeness.method}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Maximum curvature of FMD
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Magnitude Distribution Chart */}
                  <Card className="border border-border/50">
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">Frequency-Magnitude Distribution</CardTitle>
                        <TechnicalTermTooltip term="magnitudeFrequencyDistribution" />
                      </div>
                      <CardDescription>
                        Number of events per magnitude bin with completeness threshold
                      </CardDescription>
                      <AxisLegendHints
                        axes="X: magnitude bin. Y: event count."
                        legend="Bars above Mc are complete; dashed line marks Mc."
                      />
                    </CardHeader>
                    <CardContent>
                      <ChartContainer config={CHART_CONFIGS.completeness} className="h-[420px] w-full">
                        <BarChart data={completeness.magnitudeDistribution} margin={{ top: 20, right: 30, left: 60, bottom: 60 }}>
                          <defs>
                            <linearGradient id="completenessGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={SEISMIC_COLORS.frequency.dark} stopOpacity={1} />
                              <stop offset="100%" stopColor={SEISMIC_COLORS.frequency.dark} stopOpacity={0.5} />
                            </linearGradient>
                            <linearGradient id="incompleteGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.6} />
                              <stop offset="100%" stopColor="#94a3b8" stopOpacity={0.3} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            strokeDasharray={CHART_STYLES.grid.strokeDasharray}
                            className="stroke-muted"
                            opacity={CHART_STYLES.grid.opacity}
                            vertical={false}
                          />
                          <XAxis
                            dataKey="magnitude"
                            tick={{ fontSize: CHART_STYLES.fontSize.tick }}
                            tickLine={false}
                            axisLine={{ className: 'stroke-muted' }}
                            label={{
                              value: 'Magnitude (M)',
                              position: 'insideBottom',
                              offset: -10,
                              fontSize: CHART_STYLES.fontSize.label,
                              className: 'fill-muted-foreground font-medium'
                            }}
                          />
                          <YAxis
                            tick={{ fontSize: CHART_STYLES.fontSize.tick }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={AXIS_FORMATTERS.compact}
                            label={{
                              value: 'Number of Events',
                              angle: -90,
                              position: 'insideLeft',
                              offset: 10,
                              fontSize: CHART_STYLES.fontSize.label,
                              className: 'fill-muted-foreground font-medium'
                            }}
                          />
                          <ChartTooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const data = payload[0].payload;
                              const isComplete = data.magnitude >= completeness.mc;
                              return (
                                <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-3">
                                  <p className="font-medium text-sm">M{data.magnitude?.toFixed(1)}</p>
                                  <p className="text-muted-foreground text-sm">
                                    {data.count?.toLocaleString()} events
                                  </p>
                                  <Badge variant={isComplete ? 'default' : 'secondary'} className="mt-1 text-xs">
                                    {isComplete ? 'Complete' : 'Incomplete'}
                                  </Badge>
                                </div>
                              );
                            }}
                          />
                          <Bar
                            dataKey="count"
                            radius={CHART_STYLES.bar.radius}
                            maxBarSize={50}
                          >
                            {completeness.magnitudeDistribution.map((entry: { magnitude: number; count: number }, index: number) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={entry.magnitude >= completeness.mc ? SEISMIC_COLORS.frequency.dark : '#94a3b8'}
                                fillOpacity={entry.magnitude >= completeness.mc ? 1 : 0.5}
                              />
                            ))}
                          </Bar>
                          <ReferenceLine
                            x={completeness.mc}
                            stroke={SEISMIC_COLORS.reference.dark}
                            strokeWidth={2}
                            strokeDasharray="8 4"
                            label={{
                              value: `Mc = ${completeness.mc.toFixed(1)}`,
                              position: 'top',
                              fill: SEISMIC_COLORS.reference.dark,
                              fontSize: 12,
                              fontWeight: 600
                            }}
                          />
                        </BarChart>
                      </ChartContainer>
                    </CardContent>
                  </Card>

                  {/* Interpretation panel */}
                  <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-900/50 dark:to-slate-800/30 rounded-lg border">
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Info className="h-4 w-4 text-cyan-500" />
                      Understanding Mc
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="mb-2"><strong>What is Mc?</strong></p>
                        <p className="text-muted-foreground">
                          The magnitude of completeness (Mc) is the lowest magnitude at which 100% of
                          earthquakes in a space-time volume are detected. Below Mc, network sensitivity
                          limitations cause some events to be missed.
                        </p>
                      </div>
                      <div>
                        <p className="mb-2"><strong>Why it matters</strong></p>
                        <ul className="space-y-1 text-muted-foreground">
                          <li>• Statistical analyses should use M ≥ Mc only</li>
                          <li>• Lower Mc indicates better network coverage</li>
                          <li>• Mc may vary spatially and temporally</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  {events.length === 0 ? (
                    <div className="flex flex-col items-center gap-3">
                      <Target className="h-12 w-12 opacity-30" />
                      <span>No events available</span>
                    </div>
                  ) : displayEvents.length < 50 ? (
                    <div className="flex flex-col items-center gap-3">
                      <Target className="h-12 w-12 opacity-30" />
                      <span>Insufficient data (need at least 50 events)</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="h-10 w-10 animate-spin text-cyan-500" />
                      <span className="font-medium">Computing completeness magnitude...</span>
                      <span className="text-xs">Analyzing frequency-magnitude distribution</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Temporal Tab */}
        <TabsContent value="temporal" className="space-y-4">
          <Card className="border-0 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 rounded-t-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Clock className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle>Temporal Analysis</CardTitle>
                  <CardDescription>
                    Time series evolution and seismicity cluster detection
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {temporalAnalysis ? (
                <div className="space-y-6">
                  {/* Summary Cards with professional styling */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/50 dark:to-blue-900/30 border-blue-200 dark:border-blue-800">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Time Span
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-blue-900 dark:text-blue-100 font-mono">
                          {temporalAnalysis.timeSpanDays.toFixed(0)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          days ({(temporalAnalysis.timeSpanDays / 365.25).toFixed(1)} years)
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 dark:from-indigo-950/50 dark:to-indigo-900/30 border-indigo-200 dark:border-indigo-800">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
                          <TrendingUp className="h-4 w-4" />
                          Daily Rate
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-indigo-900 dark:text-indigo-100 font-mono">
                          {temporalAnalysis.eventsPerDay.toFixed(2)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">events per day</p>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-violet-50 to-violet-100/50 dark:from-violet-950/50 dark:to-violet-900/30 border-violet-200 dark:border-violet-800">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-violet-700 dark:text-violet-300 flex items-center gap-2">
                          <Activity className="h-4 w-4" />
                          Monthly Rate
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-violet-900 dark:text-violet-100 font-mono">
                          {temporalAnalysis.eventsPerMonth.toFixed(1)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">events per month</p>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-950/50 dark:to-orange-900/30 border-orange-200 dark:border-orange-800">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-300 flex items-center gap-2">
                          <Zap className="h-4 w-4" />
                          Clusters
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-orange-900 dark:text-orange-100 font-mono">
                          {temporalAnalysis.clusters.length}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {temporalAnalysis.clusters.length === 0 ? 'No clusters' :
                            temporalAnalysis.clusters.length === 1 ? 'cluster detected' : 'clusters detected'}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Time Series Plot */}
                  <Card className="border border-border/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Cumulative Event Time Series</CardTitle>
                      <CardDescription>
                        Temporal evolution of seismicity showing cumulative events over time
                      </CardDescription>
                      <AxisLegendHints axes="X: date. Y: cumulative events." />
                    </CardHeader>
                    <CardContent>
                      <ChartContainer config={CHART_CONFIGS.temporal} className="h-[420px] w-full">
                        <AreaChart data={temporalAnalysis.timeSeries} margin={{ top: 20, right: 30, left: 60, bottom: 60 }}>
                          <defs>
                            <linearGradient id="temporalGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={SEISMIC_COLORS.time.dark} stopOpacity={0.4} />
                              <stop offset="95%" stopColor={SEISMIC_COLORS.time.dark} stopOpacity={0.05} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            strokeDasharray={CHART_STYLES.grid.strokeDasharray}
                            className="stroke-muted"
                            opacity={CHART_STYLES.grid.opacity}
                          />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: CHART_STYLES.fontSize.tick }}
                            tickLine={false}
                            axisLine={{ className: 'stroke-muted' }}
                            tickFormatter={(value) => {
                              const date = new Date(value);
                              return `${date.getMonth() + 1}/${date.getFullYear().toString().slice(-2)}`;
                            }}
                            label={{
                              value: 'Date',
                              position: 'insideBottom',
                              offset: -10,
                              fontSize: CHART_STYLES.fontSize.label,
                              className: 'fill-muted-foreground font-medium'
                            }}
                          />
                          <YAxis
                            tick={{ fontSize: CHART_STYLES.fontSize.tick }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={AXIS_FORMATTERS.compact}
                            label={{
                              value: 'Cumulative Events',
                              angle: -90,
                              position: 'insideLeft',
                              offset: 10,
                              fontSize: CHART_STYLES.fontSize.label,
                              className: 'fill-muted-foreground font-medium'
                            }}
                          />
                          <ChartTooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const data = payload[0].payload;
                              return (
                                <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-3">
                                  <p className="font-medium text-sm">{new Date(data.date).toLocaleDateString('en-GB', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                  })}</p>
                                  <p className="text-muted-foreground text-sm">
                                    {data.cumulativeCount?.toLocaleString()} cumulative events
                                  </p>
                                  {data.dailyCount !== undefined && (
                                    <p className="text-muted-foreground text-sm">
                                      {data.dailyCount?.toLocaleString()} events this period
                                    </p>
                                  )}
                                </div>
                              );
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="cumulativeCount"
                            stroke={SEISMIC_COLORS.time.dark}
                            strokeWidth={2}
                            fill="url(#temporalGradient)"
                            name="Cumulative Events"
                          />
                        </AreaChart>
                      </ChartContainer>
                    </CardContent>
                  </Card>

                  {/* Clusters - Gardner-Knopoff Declustering Results */}
                  {temporalAnalysis.clusters && temporalAnalysis.clusters.length > 0 && (
                    <Card className="border border-border/50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Zap className="h-4 w-4 text-orange-500" />
                          Detected Seismicity Clusters
                          <Badge variant="outline" className="ml-2 text-xs font-normal">
                            Gardner-Knopoff Method
                          </Badge>
                        </CardTitle>
                        <CardDescription>
                          Mainshock-aftershock sequences identified using space-time windowing (Gardner & Knopoff, 1974; Uhrhammer, 1986)
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {temporalAnalysis.clusters.map((cluster: {
                            id: number;
                            startDate: string;
                            endDate: string;
                            eventCount: number;
                            maxMagnitude: number;
                            mainshock?: { id: number | string; time: string; magnitude: number; latitude: number; longitude: number; depth: number };
                            aftershockCount?: number;
                            foreshockCount?: number;
                            durationDays?: number;
                            spatialExtentKm?: number;
                            clusterType?: 'mainshock-aftershock' | 'swarm' | 'burst';
                            bValue?: number;
                          }, idx: number) => (
                            <div
                              key={cluster.id ?? idx}
                              className="p-4 bg-gradient-to-r from-orange-50/50 to-amber-50/50 dark:from-orange-950/30 dark:to-amber-950/30 rounded-lg border border-orange-200/50 dark:border-orange-800/50"
                            >
                              {/* Header row */}
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <div className="p-2 bg-orange-500/20 rounded-lg">
                                    <span className="text-lg font-bold text-orange-600 dark:text-orange-400">#{idx + 1}</span>
                                  </div>
                                  <div>
                                    <div className="font-semibold flex items-center gap-2">
                                      Mainshock M{cluster.mainshock?.magnitude?.toFixed(1) ?? cluster.maxMagnitude.toFixed(1)}
                                      {cluster.clusterType && (
                                        <Badge
                                          variant={cluster.clusterType === 'swarm' ? 'secondary' : cluster.clusterType === 'burst' ? 'outline' : 'default'}
                                          className="text-xs"
                                        >
                                          {cluster.clusterType === 'mainshock-aftershock' ? 'Sequence' :
                                            cluster.clusterType === 'swarm' ? 'Swarm' : 'Burst'}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                      <Calendar className="h-3 w-3" />
                                      {new Date(cluster.mainshock?.time ?? cluster.startDate).toLocaleString('en-GB', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit',
                                      })}
                                    </div>
                                  </div>
                                </div>
                                <Badge
                                  variant={cluster.maxMagnitude >= 5 ? 'destructive' : cluster.maxMagnitude >= 4 ? 'default' : 'secondary'}
                                  className="font-mono text-sm"
                                >
                                  M{cluster.maxMagnitude.toFixed(1)}
                                </Badge>
                              </div>

                              {/* Statistics grid */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 pt-3 border-t border-orange-200/50 dark:border-orange-700/50">
                                <div className="text-center p-2 bg-background/50 rounded">
                                  <div className="font-mono font-bold text-lg">{cluster.eventCount}</div>
                                  <div className="text-xs text-muted-foreground">Total Events</div>
                                </div>
                                {cluster.aftershockCount !== undefined && (
                                  <div className="text-center p-2 bg-background/50 rounded">
                                    <div className="font-mono font-bold text-lg">{cluster.aftershockCount}</div>
                                    <div className="text-xs text-muted-foreground">Aftershocks</div>
                                  </div>
                                )}
                                {cluster.foreshockCount !== undefined && cluster.foreshockCount > 0 && (
                                  <div className="text-center p-2 bg-background/50 rounded">
                                    <div className="font-mono font-bold text-lg">{cluster.foreshockCount}</div>
                                    <div className="text-xs text-muted-foreground">Foreshocks</div>
                                  </div>
                                )}
                                {cluster.durationDays !== undefined && (
                                  <div className="text-center p-2 bg-background/50 rounded">
                                    <div className="font-mono font-bold text-lg">
                                      {cluster.durationDays < 1 ? `${(cluster.durationDays * 24).toFixed(1)}h` :
                                        cluster.durationDays.toFixed(1)}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {cluster.durationDays < 1 ? 'Duration' : 'Days'}
                                    </div>
                                  </div>
                                )}
                                {cluster.spatialExtentKm !== undefined && cluster.spatialExtentKm > 0 && (
                                  <div className="text-center p-2 bg-background/50 rounded">
                                    <div className="font-mono font-bold text-lg">{cluster.spatialExtentKm.toFixed(1)}</div>
                                    <div className="text-xs text-muted-foreground">km Extent</div>
                                  </div>
                                )}
                                {cluster.bValue !== undefined && (
                                  <div className="text-center p-2 bg-background/50 rounded">
                                    <div className="font-mono font-bold text-lg">{cluster.bValue.toFixed(2)}</div>
                                    <div className="text-xs text-muted-foreground">b-value</div>
                                  </div>
                                )}
                              </div>

                              {/* Location info */}
                              {cluster.mainshock?.latitude && cluster.mainshock?.longitude && (
                                <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {cluster.mainshock.latitude.toFixed(3)}°, {cluster.mainshock.longitude.toFixed(3)}°
                                  {cluster.mainshock.depth && ` • ${cluster.mainshock.depth.toFixed(1)} km depth`}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* No clusters message */}
                  {temporalAnalysis.clusters && temporalAnalysis.clusters.length === 0 && (
                    <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-900/50 dark:to-slate-800/30 rounded-lg border">
                      <div className="flex items-start gap-3">
                        <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                        <div>
                          <p className="font-medium">No significant earthquake sequences detected</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Gardner-Knopoff declustering found no mainshock-aftershock sequences with 3+ events.
                            This suggests the catalogue contains mostly independent (background) seismicity.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  {events.length === 0 ? (
                    <div className="flex flex-col items-center gap-3">
                      <Clock className="h-12 w-12 opacity-30" />
                      <span>No events available</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                      <span className="font-medium">Computing temporal analysis...</span>
                      <span className="text-xs">Analyzing time series and detecting clusters</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Seismic Moment Tab */}
        <TabsContent value="moment" className="space-y-4">
          <Card className="border-0 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-red-500/10 to-orange-500/10 rounded-t-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/20 rounded-lg">
                  <Zap className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle>Seismic Moment Analysis</CardTitle>
                    <TechnicalTermTooltip term="seismicMoment" />
                  </div>
                  <CardDescription>
                    Energy release quantification and moment magnitude distribution
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {momentAnalysis ? (
                <div className="space-y-6">
                  {/* Summary Cards with professional styling */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/50 dark:to-red-900/30 border-red-200 dark:border-red-800">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm font-medium text-red-700 dark:text-red-300 flex items-center gap-2">
                            <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                            Total Seismic Moment
                          </CardTitle>
                          <TechnicalTermTooltip term="seismicMoment" />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-red-900 dark:text-red-100 font-mono">
                          {momentAnalysis.totalMoment.toExponential(2)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">Newton-meters (N·m)</p>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-950/50 dark:to-orange-900/30 border-orange-200 dark:border-orange-800">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-300 flex items-center gap-2">
                            <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                            Equivalent Magnitude
                          </CardTitle>
                          <TechnicalTermTooltip term="momentMagnitude" />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-4xl font-bold text-orange-900 dark:text-orange-100 font-mono">
                          Mw {momentAnalysis.totalMomentMagnitude.toFixed(2)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Single event equivalent
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/50 dark:to-amber-900/30 border-amber-200 dark:border-amber-800">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-300 flex items-center gap-2">
                          <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                          Largest Event
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-4xl font-bold text-amber-900 dark:text-amber-100 font-mono">
                          M{momentAnalysis.largestEvent.magnitude.toFixed(1)}
                        </div>
                        <div className="mt-2">
                          <Progress value={momentAnalysis.largestEvent.percentOfTotal} className="h-2" />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {momentAnalysis.largestEvent.percentOfTotal.toFixed(1)}% of total moment
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Moment Distribution Chart */}
                  <Card className="border border-border/50">
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">Moment Release by Magnitude</CardTitle>
                        <TechnicalTermTooltip term="seismicMoment" />
                      </div>
                      <CardDescription>
                        Logarithmic distribution of seismic moment across magnitude bins
                      </CardDescription>
                      <AxisLegendHints axes="X: magnitude bin. Y: seismic moment (log scale)." />
                    </CardHeader>
                    <CardContent>
                      <ChartContainer config={CHART_CONFIGS.moment} className="h-[420px] w-full">
                        <BarChart data={momentAnalysis.momentByMagnitude} margin={{ top: 20, right: 30, left: 80, bottom: 60 }}>
                          <defs>
                            <linearGradient id="momentGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={SEISMIC_COLORS.energy.dark} stopOpacity={1} />
                              <stop offset="100%" stopColor={SEISMIC_COLORS.energy.dark} stopOpacity={0.5} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            strokeDasharray={CHART_STYLES.grid.strokeDasharray}
                            className="stroke-muted"
                            opacity={CHART_STYLES.grid.opacity}
                            vertical={false}
                          />
                          <XAxis
                            dataKey="magnitude"
                            tick={{ fontSize: CHART_STYLES.fontSize.tick }}
                            tickLine={false}
                            axisLine={{ className: 'stroke-muted' }}
                            label={{
                              value: 'Magnitude (M)',
                              position: 'insideBottom',
                              offset: -10,
                              fontSize: CHART_STYLES.fontSize.label,
                              className: 'fill-muted-foreground font-medium'
                            }}
                          />
                          <YAxis
                            scale="log"
                            domain={['auto', 'auto']}
                            tick={{ fontSize: CHART_STYLES.fontSize.tick }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => value.toExponential(0)}
                            label={{
                              value: 'Seismic Moment (N·m)',
                              angle: -90,
                              position: 'insideLeft',
                              offset: 0,
                              fontSize: CHART_STYLES.fontSize.label,
                              className: 'fill-muted-foreground font-medium'
                            }}
                          />
                          <ChartTooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const data = payload[0].payload;
                              const percentOfTotal = (data.moment / momentAnalysis.totalMoment * 100).toFixed(1);
                              return (
                                <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-3">
                                  <p className="font-medium text-sm">M{data.magnitude?.toFixed(1)}</p>
                                  <p className="text-muted-foreground text-sm">
                                    {data.moment?.toExponential(2)} N·m
                                  </p>
                                  <p className="text-muted-foreground text-sm">
                                    {percentOfTotal}% of total moment
                                  </p>
                                  {data.eventCount && (
                                    <p className="text-muted-foreground text-sm">
                                      {data.eventCount} events
                                    </p>
                                  )}
                                </div>
                              );
                            }}
                          />
                          <Bar
                            dataKey="moment"
                            fill="url(#momentGradient)"
                            radius={CHART_STYLES.bar.radius}
                            maxBarSize={50}
                          >
                            {momentAnalysis.momentByMagnitude.map((_: unknown, index: number) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={getMagnitudeColor(momentAnalysis.momentByMagnitude[index].magnitude)}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ChartContainer>
                    </CardContent>
                  </Card>

                  {/* Key Insights */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-900/50 dark:to-slate-800/30 rounded-lg border">
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-red-500" />
                        Energy Release Summary
                      </h4>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full mt-2"></span>
                          <span>Total moment equivalent to a <strong>single Mw {momentAnalysis.totalMomentMagnitude.toFixed(2)}</strong> earthquake</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full mt-2"></span>
                          <span>Largest event (M{momentAnalysis.largestEvent.magnitude.toFixed(1)}) released <strong>{momentAnalysis.largestEvent.percentOfTotal.toFixed(1)}%</strong> of total</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full mt-2"></span>
                          <span><strong>{momentAnalysis.momentByMagnitude.length}</strong> magnitude bins analyzed</span>
                        </li>
                      </ul>
                    </div>
                    <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-900/50 dark:to-slate-800/30 rounded-lg border">
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <Info className="h-4 w-4 text-blue-500" />
                        About Seismic Moment
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Seismic moment (M₀) is a measure of the total energy released during an earthquake.
                        It is proportional to the fault area, average slip, and rigidity of the rock.
                        Moment magnitude (Mw) is derived from M₀ using: Mw = ⅔ log₁₀(M₀) - 10.7
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  {events.length === 0 ? (
                    <div className="flex flex-col items-center gap-3">
                      <Zap className="h-12 w-12 opacity-30" />
                      <span>No events available</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="h-10 w-10 animate-spin text-red-500" />
                      <span className="font-medium">Computing seismic moment analysis...</span>
                      <span className="text-xs">Calculating energy release distribution</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* MFD (Magnitude-Frequency Distribution) Tab */}
        <TabsContent value="mfd" className="space-y-4">
          <Card className="border-0 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-indigo-500/10 to-blue-500/10 rounded-t-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/20 rounded-lg">
                  <BarChart3 className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle>Magnitude-Frequency Distribution (MFD)</CardTitle>
                    <TechnicalTermTooltip term="magnitudeFrequencyDistribution" />
                  </div>
                  <CardDescription>
                    Compare frequency-magnitude relationships across multiple catalogues
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Catalogue Selection Sidebar */}
                <div className="lg:col-span-1 space-y-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center justify-between">
                        Select Catalogues
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={handleMfdSelectAll} className="h-6 text-xs px-2">
                            All
                          </Button>
                          <Button variant="ghost" size="sm" onClick={handleMfdClearAll} className="h-6 text-xs px-2">
                            Clear
                          </Button>
                        </div>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {mfdSelectedCatalogues.length} of {catalogues.length} selected
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
                      {catalogues.map((catalogue, index) => (
                        <div key={catalogue.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`mfd-cat-${catalogue.id}`}
                            checked={mfdSelectedCatalogues.includes(catalogue.id)}
                            onCheckedChange={() => handleMfdCatalogueToggle(catalogue.id)}
                          />
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{
                              backgroundColor: mfdSelectedCatalogues.includes(catalogue.id)
                                ? MFD_CATALOGUE_COLORS[mfdSelectedCatalogues.indexOf(catalogue.id) % MFD_CATALOGUE_COLORS.length]
                                : '#94a3b8'
                            }}
                          />
                          <label
                            htmlFor={`mfd-cat-${catalogue.id}`}
                            className="text-xs cursor-pointer flex-1 truncate"
                            title={catalogue.name}
                          >
                            {catalogue.name}
                          </label>
                          <Badge variant="outline" className="text-[10px] px-1">
                            {events.filter(e => e.catalogueId === catalogue.id).length.toLocaleString()}
                          </Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Chart Options */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Display Options</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="mfd-cumulative"
                          checked={mfdShowCumulative}
                          onCheckedChange={(checked) => setMfdShowCumulative(checked as boolean)}
                        />
                        <div className="flex items-center gap-1.5">
                          <label htmlFor="mfd-cumulative" className="text-xs cursor-pointer">
                            Show cumulative (N≥M)
                          </label>
                          <InfoTooltip content="Shows cumulative counts of events with magnitude greater than or equal to M." />
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="mfd-histogram"
                          checked={mfdShowHistogram}
                          onCheckedChange={(checked) => setMfdShowHistogram(checked as boolean)}
                        />
                        <div className="flex items-center gap-1.5">
                          <label htmlFor="mfd-histogram" className="text-xs cursor-pointer">
                            Show histogram (filled)
                          </label>
                          <InfoTooltip content="Adds filled bars behind the line for visual density." />
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="mfd-log-scale"
                          checked={mfdLogScale}
                          onCheckedChange={(checked) => setMfdLogScale(checked as boolean)}
                        />
                        <div className="flex items-center gap-1.5">
                          <label htmlFor="mfd-log-scale" className="text-xs cursor-pointer">
                            Logarithmic Y-axis
                          </label>
                          <InfoTooltip content="Uses log scale to emphasize low-frequency bins." />
                        </div>
                      </div>

                      {/* Cumulative line style */}
                      {mfdShowCumulative && (
                        <div className="pt-2 border-t space-y-1">
                          <div className="flex items-center gap-1.5">
                            <label className="text-xs text-muted-foreground">Cumulative line style</label>
                            <InfoTooltip content="Controls the line style for the cumulative curve." />
                          </div>
                          <Select
                            value={mfdCumulativeStyle}
                            onValueChange={(value) => setMfdCumulativeStyle(value as 'solid' | 'dotted')}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="solid">Solid line</SelectItem>
                              <SelectItem value="dotted">Dotted line</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Bin width */}
                      <div className="pt-2 border-t space-y-1">
                        <div className="flex items-center gap-1.5">
                          <label className="text-xs text-muted-foreground">Magnitude bin width</label>
                          <InfoTooltip content="Smaller bins show more detail but can be noisier." />
                        </div>
                        <Select
                          value={mfdBinWidth.toString()}
                          onValueChange={(value) => setMfdBinWidth(parseFloat(value))}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0.1">0.1 (standard)</SelectItem>
                            <SelectItem value="0.05">0.05 (fine)</SelectItem>
                            <SelectItem value="0.01">0.01 (very fine)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Min magnitude truncation */}
                      <div className="pt-2 border-t space-y-1">
                        <div className="flex items-center gap-1.5">
                          <label className="text-xs text-muted-foreground">Min magnitude cutoff</label>
                          <InfoTooltip content="Exclude events below this magnitude for the analysis." />
                        </div>
                        <Select
                          value={mfdMinMagnitude?.toString() || 'none'}
                          onValueChange={(value) => setMfdMinMagnitude(value === 'none' ? undefined : parseFloat(value))}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="No cutoff" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No cutoff</SelectItem>
                            <SelectItem value="-1">M ≥ -1.0</SelectItem>
                            <SelectItem value="0">M ≥ 0.0</SelectItem>
                            <SelectItem value="1">M ≥ 1.0</SelectItem>
                            <SelectItem value="2">M ≥ 2.0</SelectItem>
                            <SelectItem value="3">M ≥ 3.0</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Statistics Summary */}
                  {mfdComparison && mfdComparison.catalogues.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Statistics</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-xs">
                        {mfdComparison.catalogues.map((cat, idx) => (
                          <div key={cat.catalogueId} className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: cat.color }}
                            />
                            <span className="flex-1 truncate" title={cat.catalogueName}>
                              {cat.catalogueName}
                            </span>
                            <span className="font-mono text-muted-foreground">
                              {cat.totalEvents.toLocaleString()}
                            </span>
                          </div>
                        ))}
                        <div className="pt-2 border-t">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Mag Range:</span>
                            <span className="font-mono">
                              M{mfdComparison.magnitudeRange.min.toFixed(1)} - {mfdComparison.magnitudeRange.max.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* MFD Chart */}
                <div className="lg:col-span-3">
                  <Card className="border border-border/50">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base">Frequency-Magnitude Distribution</CardTitle>
                          <CardDescription>
                            {mfdShowCumulative && mfdShowHistogram
                              ? 'Cumulative (lines) and incremental (bars) magnitude distribution'
                              : mfdShowCumulative
                                ? 'Cumulative distribution (N ≥ M)'
                                : 'Incremental histogram'}
                          </CardDescription>
                          <AxisLegendHints
                            axes="X: magnitude. Y: event count (log scale when enabled)."
                            legend="Colors map to catalogues; lines are cumulative and bars are incremental when enabled."
                          />
                        </div>
                        {mfdComparison && (
                          <ChartExportButton
                            chartRef={mfdChartRef}
                            data={mfdComparison.catalogues.flatMap(cat =>
                              cat.cumulative.map(d => ({
                                catalogue: cat.catalogueName,
                                magnitude: d.magnitude,
                                count: d.count,
                                logCount: d.logCount,
                              }))
                            )}
                            filename="mfd_comparison"
                          />
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {mfdSelectedCatalogues.length === 0 ? (
                        <div className="text-center py-20 text-muted-foreground">
                          <BarChart3 className="h-16 w-16 mx-auto mb-4 opacity-30" />
                          <p className="font-medium">Select catalogues to compare</p>
                          <p className="text-sm mt-2">
                            Choose one or more catalogues from the left panel to view their MFD
                          </p>
                        </div>
                      ) : mfdComparison ? (
                        <div ref={mfdChartRef}>
                          <ChartContainer config={CHART_CONFIGS.mfd} className="h-[500px] w-full">
                            <ComposedChart margin={{ top: 20, right: 30, left: 60, bottom: 60 }}>
                              <defs>
                                {mfdComparison.catalogues.map((cat, index) => (
                                  <linearGradient key={`gradient-${index}`} id={`mfdGradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={cat.color} stopOpacity={0.8} />
                                    <stop offset="100%" stopColor={cat.color} stopOpacity={0.3} />
                                  </linearGradient>
                                ))}
                              </defs>
                              <CartesianGrid
                                strokeDasharray={CHART_STYLES.grid.strokeDasharray}
                                className="stroke-muted"
                                opacity={CHART_STYLES.grid.opacity}
                              />
                              <XAxis
                                dataKey="magnitude"
                                type="number"
                                domain={[
                                  Math.floor(mfdComparison.magnitudeRange.min),
                                  Math.ceil(mfdComparison.magnitudeRange.max)
                                ]}
                                tick={{ fontSize: CHART_STYLES.fontSize.tick }}
                                tickLine={false}
                                axisLine={{ className: 'stroke-muted' }}
                                tickFormatter={(v) => `M${v}`}
                                label={{
                                  value: 'Magnitude (ML)',
                                  position: 'insideBottom',
                                  offset: -10,
                                  fontSize: CHART_STYLES.fontSize.label,
                                  className: 'fill-muted-foreground font-medium'
                                }}
                              />
                              <YAxis
                                scale={mfdLogScale ? 'log' : 'linear'}
                                domain={mfdLogScale ? [1, 'auto'] : [0, 'auto']}
                                tick={{ fontSize: CHART_STYLES.fontSize.tick }}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(v) => {
                                  if (mfdLogScale) {
                                    if (v >= 1000000) return `${v / 1000000}M`;
                                    if (v >= 1000) return `${v / 1000}K`;
                                    return v.toString();
                                  }
                                  return AXIS_FORMATTERS.compact(v);
                                }}
                                label={{
                                  value: 'Number of events',
                                  angle: -90,
                                  position: 'insideLeft',
                                  offset: 10,
                                  fontSize: CHART_STYLES.fontSize.label,
                                  className: 'fill-muted-foreground font-medium'
                                }}
                              />
                              <ChartTooltip
                                content={({ active, payload, label }) => {
                                  if (!active || !payload?.length) return null;
                                  return (
                                    <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-3 min-w-[180px]">
                                      <p className="font-medium text-sm border-b pb-1 mb-2">
                                        M{typeof label === 'number' ? label.toFixed(1) : label}
                                      </p>
                                      {payload.map((entry: any, index: number) => (
                                        <div key={index} className="flex items-center justify-between gap-4 text-sm">
                                          <div className="flex items-center gap-2">
                                            <div
                                              className="w-3 h-3 rounded-sm"
                                              style={{ backgroundColor: entry.color }}
                                            />
                                            <span className="text-muted-foreground truncate max-w-[120px]">
                                              {entry.name}
                                            </span>
                                          </div>
                                          <span className="font-mono font-medium tabular-nums">
                                            {entry.value?.toLocaleString()}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                }}
                              />
                              <Legend
                                verticalAlign="top"
                                align="right"
                                wrapperStyle={{ paddingBottom: 10 }}
                              />
                              {/* Render histogram as filled stepped area (render first so cumulative overlays on top) */}
                              {mfdShowHistogram && mfdComparison.catalogues.map((cat, index) => (
                                <Area
                                  key={`histogram-${cat.catalogueId}`}
                                  data={cat.histogram}
                                  dataKey="count"
                                  name={cat.catalogueName}
                                  type="stepAfter"
                                  stroke={cat.color}
                                  fill={`url(#mfdGradient-${index})`}
                                  strokeWidth={1}
                                  fillOpacity={0.4}
                                  legendType={mfdShowCumulative ? 'none' : 'square'}
                                />
                              ))}
                              {/* Render cumulative lines (overlays on top of histogram) */}
                              {mfdShowCumulative && mfdComparison.catalogues.map((cat, index) => (
                                <Line
                                  key={`cumulative-${cat.catalogueId}`}
                                  data={cat.cumulative}
                                  dataKey="count"
                                  name={cat.catalogueName}
                                  type="stepAfter"
                                  stroke={cat.color}
                                  strokeWidth={2}
                                  strokeDasharray={mfdCumulativeStyle === 'dotted' ? '5 5' : undefined}
                                  dot={{ r: 3, fill: cat.color }}
                                  activeDot={{ r: 5, strokeWidth: 2 }}
                                  connectNulls
                                />
                              ))}
                            </ComposedChart>
                          </ChartContainer>
                        </div>
                      ) : (
                        <div className="text-center py-20 text-muted-foreground">
                          <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4" />
                          <p>Computing MFD...</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* MFD Information */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-900/50 dark:to-slate-800/30 rounded-lg border">
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <Info className="h-4 w-4 text-indigo-500" />
                        About MFD
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        The Magnitude-Frequency Distribution shows how earthquake frequency varies with magnitude.
                        The cumulative plot (N≥M) typically follows the Gutenberg-Richter relation:
                        log₁₀(N) = a - bM, where b ≈ 1 for most tectonic regions.
                      </p>
                    </div>
                    <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-900/50 dark:to-slate-800/30 rounded-lg border">
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                        Interpreting the Plot
                      </h4>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2"></span>
                          <span>Steeper slopes indicate higher b-values (more small earthquakes)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2"></span>
                          <span>Rolloff at low magnitudes shows the completeness magnitude (Mc)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2"></span>
                          <span>Compare catalogues to assess detection capabilities</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
