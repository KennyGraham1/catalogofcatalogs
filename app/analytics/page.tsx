'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import {
  BarChart3,
  Map,
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
  Loader2
} from 'lucide-react';
import { QualityScoreCard } from '@/components/advanced-viz/QualityScoreCard';
import { UncertaintyVisualization } from '@/components/advanced-viz/UncertaintyVisualization';
import { FocalMechanismCard } from '@/components/advanced-viz/FocalMechanismCard';
import { StationCoverageCard } from '@/components/advanced-viz/StationCoverageCard';
import { calculateQualityScore, QualityMetrics } from '@/lib/quality-scoring';
import { parseFocalMechanism } from '@/lib/focal-mechanism-utils';
import { parseStationData } from '@/lib/station-coverage-utils';
import { EventTable } from '@/components/events/EventTable';
import {
  calculateGutenbergRichter,
  estimateCompletenessMagnitude,
  analyzeTemporalPattern,
  calculateSeismicMoment,
  type EarthquakeEvent
} from '@/lib/seismological-analysis';
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

export default function AnalyticsPage() {
  const [catalogues, setCatalogues] = useState<any[]>([]);
  const [selectedCatalogue, setSelectedCatalogue] = useState<string>('all');
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  // Visualize page filters
  const [magnitudeRange, setMagnitudeRange] = useState([2.0, 6.0]);
  const [depthRange, setDepthRange] = useState([0, 50]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedCataloguesFilter, setSelectedCataloguesFilter] = useState<string[]>([]);
  const [colorBy, setColorBy] = useState<'magnitude' | 'depth'>('magnitude');
  const [timeFilter, setTimeFilter] = useState('all');

  // Fetch catalogues and all events on mount
  useEffect(() => {
    fetchCataloguesAndEvents();
  }, []);

  const fetchCataloguesAndEvents = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/catalogues');
      const data = await response.json();
      const catalogueList = Array.isArray(data) ? data : [];
      setCatalogues(catalogueList);

      // Fetch events from all catalogues
      const allEvents: any[] = [];
      for (const catalogue of catalogueList) {
        try {
          const eventsResponse = await fetch(`/api/catalogues/${catalogue.id}/events`);
          if (eventsResponse.ok) {
            const events = await eventsResponse.json();
            const eventsWithCatalogue = events.map((event: any) => ({
              ...event,
              catalogue: catalogue.name,
              catalogueId: catalogue.id,
              region: event.region || 'Unknown'
            }));
            allEvents.push(...eventsWithCatalogue);
          }
        } catch (error) {
          console.error(`Failed to fetch events for catalogue ${catalogue.id}:`, error);
        }
      }

      setEvents(allEvents);
      if (allEvents.length > 0) {
        setSelectedEvent(allEvents[0]);
      }
    } catch (error) {
      console.error('Error fetching catalogues and events:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter events based on selected catalogue and filters
  const displayEvents = useMemo(() => {
    let filtered = events;

    // Filter by selected catalogue (for quality analysis tabs)
    if (selectedCatalogue !== 'all') {
      filtered = filtered.filter(e => e.catalogueId === selectedCatalogue);
    }

    return filtered;
  }, [events, selectedCatalogue]);

  // Filter events for visualization (with all filters applied)
  const filteredEarthquakes = useMemo(() => {
    let filtered = events;

    // Magnitude filter
    filtered = filtered.filter(eq =>
      eq.magnitude >= magnitudeRange[0] && eq.magnitude <= magnitudeRange[1]
    );

    // Depth filter
    filtered = filtered.filter(eq =>
      eq.depth >= depthRange[0] && eq.depth <= depthRange[1]
    );

    // Region filter
    if (selectedRegions.length > 0) {
      filtered = filtered.filter(eq => selectedRegions.includes(eq.region || 'Unknown'));
    }

    // Catalogue filter
    if (selectedCataloguesFilter.length > 0) {
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
  }, [events, magnitudeRange, depthRange, selectedRegions, selectedCataloguesFilter, timeFilter]);

  // Visualization data calculations
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

  const timeSeriesData = useMemo(() => {
    const dateCounts: Record<string, number> = {};
    filteredEarthquakes.forEach(eq => {
      const date = new Date(eq.time).toISOString().split('T')[0];
      dateCounts[date] = (dateCounts[date] || 0) + 1;
    });

    return Object.entries(dateCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredEarthquakes]);

  const magnitudeDepthScatter = useMemo(() => {
    return filteredEarthquakes.map(eq => ({
      magnitude: eq.magnitude,
      depth: eq.depth,
      region: eq.region || 'Unknown'
    }));
  }, [filteredEarthquakes]);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#FF6B9D'];

  const handleResetFilters = () => {
    setMagnitudeRange([2.0, 6.0]);
    setDepthRange([0, 50]);
    setSelectedRegions([]);
    setSelectedCataloguesFilter([]);
    setTimeFilter('all');
  };

  const handleRegionToggle = (region: string) => {
    setSelectedRegions(prev =>
      prev.includes(region)
        ? prev.filter(r => r !== region)
        : [...prev, region]
    );
  };

  const handleCatalogueToggle = (catalogue: string) => {
    setSelectedCataloguesFilter(prev =>
      prev.includes(catalogue)
        ? prev.filter(c => c !== catalogue)
        : [...prev, catalogue]
    );
  };

  // Calculate statistics (using displayEvents for quality analysis)
  const statistics = useMemo(() => {
    if (displayEvents.length === 0) return null;

    const qualityScores = displayEvents.map(e => calculateQualityScore(e as QualityMetrics));
    const avgQuality = qualityScores.reduce((sum, s) => sum + s.overall, 0) / qualityScores.length;

    const gradeDistribution = qualityScores.reduce((acc, s) => {
      acc[s.grade] = (acc[s.grade] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const withUncertainty = displayEvents.filter(e =>
      e.latitude_uncertainty || e.longitude_uncertainty || e.depth_uncertainty
    ).length;

    const withFocalMechanism = displayEvents.filter(e => {
      const fm = parseFocalMechanism(e.focal_mechanisms);
      return fm !== null;
    }).length;

    const withStationData = displayEvents.filter(e =>
      e.used_station_count && e.used_station_count > 0
    ).length;

    return {
      totalEvents: displayEvents.length,
      avgQuality: avgQuality.toFixed(1),
      gradeDistribution,
      withUncertainty,
      withFocalMechanism,
      withStationData,
      percentageWithUncertainty: ((withUncertainty / displayEvents.length) * 100).toFixed(1),
      percentageWithFocalMechanism: ((withFocalMechanism / displayEvents.length) * 100).toFixed(1),
      percentageWithStationData: ((withStationData / displayEvents.length) * 100).toFixed(1),
    };
  }, [displayEvents]);

  // Seismological analysis calculations (using displayEvents for selected catalogue)
  const grAnalysis = useMemo(() => {
    if (displayEvents.length < 10) return null;
    try {
      return calculateGutenbergRichter(displayEvents as EarthquakeEvent[]);
    } catch (error) {
      console.error('GR analysis error:', error);
      return null;
    }
  }, [displayEvents]);

  const completeness = useMemo(() => {
    if (displayEvents.length < 50) return null;
    try {
      return estimateCompletenessMagnitude(displayEvents as EarthquakeEvent[]);
    } catch (error) {
      console.error('Completeness analysis error:', error);
      return null;
    }
  }, [displayEvents]);

  const temporalAnalysis = useMemo(() => {
    if (displayEvents.length === 0) return null;
    try {
      return analyzeTemporalPattern(displayEvents as EarthquakeEvent[]);
    } catch (error) {
      console.error('Temporal analysis error:', error);
      return null;
    }
  }, [displayEvents]);

  const momentAnalysis = useMemo(() => {
    if (displayEvents.length === 0) return null;
    try {
      return calculateSeismicMoment(displayEvents as EarthquakeEvent[]);
    } catch (error) {
      console.error('Moment analysis error:', error);
      return null;
    }
  }, [displayEvents]);

  if (loading) {
    return (
      <div className="container py-8">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading earthquake data...</p>
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
        <Select value={selectedCatalogue} onValueChange={setSelectedCatalogue}>
          <SelectTrigger className="w-[300px]">
            <SelectValue placeholder="Select catalogue" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Catalogues ({events.length} events)</SelectItem>
            {catalogues.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name} ({cat.event_count || 0} events)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Events</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.totalEvents}</div>
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
              <div className="text-2xl font-bold">{statistics.withUncertainty}</div>
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
              <div className="text-2xl font-bold">{statistics.withFocalMechanism}</div>
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
              <div className="text-2xl font-bold">{statistics.withStationData}</div>
              <p className="text-xs text-muted-foreground">
                {statistics.percentageWithStationData}% of events
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <Tabs defaultValue="map" className="space-y-4">
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
          <TabsTrigger value="temporal-analysis" className="text-xs">
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
                  {filteredEarthquakes.length} of {events.length} events
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Magnitude Range */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">
                    Magnitude: {magnitudeRange[0].toFixed(1)} - {magnitudeRange[1].toFixed(1)}
                  </Label>
                  <Slider
                    min={2.0}
                    max={6.0}
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
                    max={50}
                    step={1}
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

                {/* Catalogue Filter */}
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
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={magnitudeDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Depth Distribution</CardTitle>
                <CardDescription className="text-xs">Number of events by depth range</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={depthDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
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
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={regionDistribution} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis dataKey="region" type="category" width={100} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Catalogue Distribution</CardTitle>
                <CardDescription className="text-xs">Events by catalogue</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={catalogueDistribution}
                      dataKey="count"
                      nameKey="catalogue"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={(entry) => entry.catalogue}
                      labelLine={false}
                    >
                      {catalogueDistribution.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Magnitude vs Depth</CardTitle>
                <CardDescription className="text-xs">Scatter plot showing relationship between magnitude and depth</CardDescription>
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
              <CardDescription className="text-xs">Number of events over time</CardDescription>
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
                    dot={{ r: 3 }}
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
                      // Switch to event details tab
                      const tabsList = document.querySelector('[role="tablist"]');
                      const eventDetailsTab = tabsList?.querySelector('[value="event-details"]') as HTMLElement;
                      eventDetailsTab?.click();
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
                      {events.map((event) => (
                        <SelectItem key={event.id} value={event.id}>
                          M{event.magnitude.toFixed(1)} - {new Date(event.time).toLocaleString()} - {event.region || 'Unknown'}
                        </SelectItem>
                      ))}
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
                        <div className="text-3xl font-bold">{statistics.gradeDistribution[grade] || 0}</div>
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
                   events.length < 10 ? 'Insufficient data (need at least 10 events)' :
                   'Unable to calculate G-R analysis'}
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
                   events.length < 50 ? 'Insufficient data (need at least 50 events)' :
                   'Unable to calculate completeness magnitude'}
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
                  {temporalAnalysis.clusters.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-2">Detected Clusters</h3>
                      <div className="space-y-2">
                        {temporalAnalysis.clusters.map((cluster, idx) => (
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
                  {events.length === 0 ? 'No events available' : 'Unable to perform temporal analysis'}
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
                  {events.length === 0 ? 'No events available' : 'Unable to calculate seismic moment'}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

