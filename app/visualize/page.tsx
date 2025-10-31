'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  MapPin,
  BarChart3,
  Activity,
  Calendar,
  Filter,
  RefreshCw,
  Loader2
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  PieChart, 
  Pie, 
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis
} from 'recharts';

// Dynamically import map component to avoid SSR issues
const NZEarthquakeMap = dynamic(() => import('@/components/visualize/NZEarthquakeMap'), {
  ssr: false,
  loading: () => <div className="h-[600px] w-full bg-muted animate-pulse rounded-lg" />
});

interface Earthquake {
  id: number;
  latitude: number;
  longitude: number;
  magnitude: number;
  depth: number;
  time: string;
  region?: string;
  catalogue?: string;
}

export default function VisualizePage() {
  const [activeTab, setActiveTab] = useState('map');
  const [magnitudeRange, setMagnitudeRange] = useState([2.0, 6.0]);
  const [depthRange, setDepthRange] = useState([0, 50]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedCatalogues, setSelectedCatalogues] = useState<string[]>([]);
  const [colorBy, setColorBy] = useState<'magnitude' | 'depth'>('magnitude');
  const [timeFilter, setTimeFilter] = useState('all');
  const [earthquakes, setEarthquakes] = useState<Earthquake[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all earthquakes from all catalogues
  useEffect(() => {
    async function fetchEarthquakes() {
      try {
        setLoading(true);
        const response = await fetch('/api/catalogues');
        if (!response.ok) throw new Error('Failed to fetch catalogues');

        const catalogues = await response.json();

        // Fetch events from all catalogues
        const allEvents: Earthquake[] = [];
        for (const catalogue of catalogues) {
          try {
            const eventsResponse = await fetch(`/api/catalogues/${catalogue.id}/events`);
            if (eventsResponse.ok) {
              const events = await eventsResponse.json();
              // Add catalogue name to each event
              const eventsWithCatalogue = events.map((event: any) => ({
                ...event,
                catalogue: catalogue.name,
                region: event.region || 'Unknown'
              }));
              allEvents.push(...eventsWithCatalogue);
            }
          } catch (error) {
            console.error(`Failed to fetch events for catalogue ${catalogue.id}:`, error);
          }
        }

        setEarthquakes(allEvents);
      } catch (error) {
        console.error('Error fetching earthquake data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchEarthquakes();
  }, []);

  // Get unique regions and catalogues
  const regions = useMemo(() =>
    Array.from(new Set(earthquakes.map(e => e.region || 'Unknown'))).sort(),
    [earthquakes]
  );

  const catalogues = useMemo(() =>
    Array.from(new Set(earthquakes.map(e => e.catalogue || 'Unknown'))).sort(),
    [earthquakes]
  );

  // Filter earthquakes based on current filters
  const filteredEarthquakes = useMemo(() => {
    return earthquakes.filter(eq => {
      const magnitudeMatch = eq.magnitude >= magnitudeRange[0] && eq.magnitude <= magnitudeRange[1];
      const depthMatch = eq.depth >= depthRange[0] && eq.depth <= depthRange[1];
      const regionMatch = selectedRegions.length === 0 || selectedRegions.includes(eq.region || 'Unknown');
      const catalogueMatch = selectedCatalogues.length === 0 || selectedCatalogues.includes(eq.catalogue || 'Unknown');

      return magnitudeMatch && depthMatch && regionMatch && catalogueMatch;
    });
  }, [earthquakes, magnitudeRange, depthRange, selectedRegions, selectedCatalogues]);

  // Prepare data for charts
  const magnitudeDistribution = useMemo(() => {
    const bins = [
      { range: '2.0-2.9', count: 0, min: 2.0, max: 2.9 },
      { range: '3.0-3.9', count: 0, min: 3.0, max: 3.9 },
      { range: '4.0-4.9', count: 0, min: 4.0, max: 4.9 },
      { range: '5.0-5.9', count: 0, min: 5.0, max: 5.9 },
      { range: '6.0+', count: 0, min: 6.0, max: 10.0 }
    ];
    
    filteredEarthquakes.forEach(eq => {
      const bin = bins.find(b => eq.magnitude >= b.min && eq.magnitude < b.max);
      if (bin) bin.count++;
    });
    
    return bins;
  }, [filteredEarthquakes]);

  const depthDistribution = useMemo(() => {
    const bins = [
      { range: '0-10 km', count: 0, min: 0, max: 10 },
      { range: '10-20 km', count: 0, min: 10, max: 20 },
      { range: '20-30 km', count: 0, min: 20, max: 30 },
      { range: '30-40 km', count: 0, min: 30, max: 40 },
      { range: '40+ km', count: 0, min: 40, max: 1000 }
    ];
    
    filteredEarthquakes.forEach(eq => {
      const bin = bins.find(b => eq.depth >= b.min && eq.depth < b.max);
      if (bin) bin.count++;
    });
    
    return bins;
  }, [filteredEarthquakes]);

  const regionDistribution = useMemo(() => {
    const distribution: Record<string, number> = {};
    filteredEarthquakes.forEach(eq => {
      const region = eq.region || 'Unknown';
      distribution[region] = (distribution[region] || 0) + 1;
    });

    return Object.entries(distribution)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filteredEarthquakes]);

  const catalogueDistribution = useMemo(() => {
    const distribution: Record<string, number> = {};
    filteredEarthquakes.forEach(eq => {
      const catalogue = eq.catalogue || 'Unknown';
      distribution[catalogue] = (distribution[catalogue] || 0) + 1;
    });

    return Object.entries(distribution)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredEarthquakes]);

  const timeSeriesData = useMemo(() => {
    const grouped: Record<string, number> = {};
    filteredEarthquakes.forEach(eq => {
      const date = new Date(eq.time).toISOString().split('T')[0];
      grouped[date] = (grouped[date] || 0) + 1;
    });
    
    return Object.entries(grouped)
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
    setSelectedCatalogues([]);
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
    setSelectedCatalogues(prev =>
      prev.includes(catalogue)
        ? prev.filter(c => c !== catalogue)
        : [...prev, catalogue]
    );
  };

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

  if (earthquakes.length === 0) {
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
    <div className="container py-8">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Data Visualization</h1>
          <p className="text-muted-foreground">
            Interactive visualization and analysis of earthquake catalogue data
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Filters Sidebar */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Filters
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={handleResetFilters}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              <CardDescription>
                {filteredEarthquakes.length} of {earthquakes.length} events
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Magnitude Range */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  Magnitude Range: {magnitudeRange[0].toFixed(1)} - {magnitudeRange[1].toFixed(1)}
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
              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  Depth Range: {depthRange[0]} - {depthRange[1]} km
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

              {/* Color By */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Color By</Label>
                <Select value={colorBy} onValueChange={(v: any) => setColorBy(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="magnitude">Magnitude</SelectItem>
                    <SelectItem value="depth">Depth</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Time Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Time Period</Label>
                <Select value={timeFilter} onValueChange={setTimeFilter}>
                  <SelectTrigger>
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
                <Label className="text-sm font-medium">Regions ({selectedRegions.length} selected)</Label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {regions.slice(0, 8).map(region => (
                    <div key={region} className="flex items-center space-x-2">
                      <Checkbox
                        id={`region-${region}`}
                        checked={selectedRegions.includes(region)}
                        onCheckedChange={() => handleRegionToggle(region)}
                      />
                      <label
                        htmlFor={`region-${region}`}
                        className="text-sm cursor-pointer"
                      >
                        {region}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Catalogue Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Catalogues ({selectedCatalogues.length} selected)</Label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {catalogues.map(catalogue => (
                    <div key={catalogue} className="flex items-center space-x-2">
                      <Checkbox
                        id={`cat-${catalogue}`}
                        checked={selectedCatalogues.includes(catalogue)}
                        onCheckedChange={() => handleCatalogueToggle(catalogue)}
                      />
                      <label
                        htmlFor={`cat-${catalogue}`}
                        className="text-sm cursor-pointer"
                      >
                        {catalogue}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Main Visualization Area */}
          <div className="lg:col-span-3 space-y-6">
            {/* Statistics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Events</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{filteredEarthquakes.length}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Filtered from {earthquakes.length}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Avg Magnitude</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {filteredEarthquakes.length > 0
                      ? (filteredEarthquakes.reduce((sum, eq) => sum + eq.magnitude, 0) / filteredEarthquakes.length).toFixed(2)
                      : '0.00'}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Range: {Math.min(...filteredEarthquakes.map(e => e.magnitude)).toFixed(1)} - {Math.max(...filteredEarthquakes.map(e => e.magnitude)).toFixed(1)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Avg Depth</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {filteredEarthquakes.length > 0
                      ? (filteredEarthquakes.reduce((sum, eq) => sum + eq.depth, 0) / filteredEarthquakes.length).toFixed(1)
                      : '0.0'} km
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Range: {Math.min(...filteredEarthquakes.map(e => e.depth))} - {Math.max(...filteredEarthquakes.map(e => e.depth))} km
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Regions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {new Set(filteredEarthquakes.map(e => e.region)).size}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Across NZ
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Tabs for different visualizations */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="map">
                  <MapPin className="h-4 w-4 mr-2" />
                  Map
                </TabsTrigger>
                <TabsTrigger value="charts">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Charts
                </TabsTrigger>
                <TabsTrigger value="distribution">
                  <Activity className="h-4 w-4 mr-2" />
                  Distribution
                </TabsTrigger>
                <TabsTrigger value="timeline">
                  <Calendar className="h-4 w-4 mr-2" />
                  Timeline
                </TabsTrigger>
              </TabsList>

              {/* Map View */}
              <TabsContent value="map" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>New Zealand Earthquake Map</CardTitle>
                    <CardDescription>
                      Interactive map showing earthquake locations across New Zealand
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <NZEarthquakeMap
                      earthquakes={filteredEarthquakes}
                      colorBy={colorBy}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Charts View */}
              <TabsContent value="charts" className="mt-6 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Magnitude Distribution</CardTitle>
                      <CardDescription>Number of events by magnitude range</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={magnitudeDistribution}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="range" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="count" fill="#0088FE" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Depth Distribution</CardTitle>
                      <CardDescription>Number of events by depth range</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={depthDistribution}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="range" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="count" fill="#00C49F" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Distribution View */}
              <TabsContent value="distribution" className="mt-6 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Top Regions</CardTitle>
                      <CardDescription>Events by region (top 10)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={regionDistribution}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {regionDistribution.map((_entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Catalogue Sources</CardTitle>
                      <CardDescription>Events by catalogue source</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={catalogueDistribution} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" />
                          <YAxis dataKey="name" type="category" width={150} />
                          <Tooltip />
                          <Bar dataKey="value" fill="#FFBB28" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle>Magnitude vs Depth</CardTitle>
                      <CardDescription>Scatter plot showing relationship between magnitude and depth</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <ScatterChart>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="magnitude" name="Magnitude" unit="" />
                          <YAxis dataKey="depth" name="Depth" unit=" km" reversed />
                          <ZAxis range={[50, 400]} />
                          <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                          <Legend />
                          <Scatter name="Earthquakes" data={magnitudeDepthScatter} fill="#8884d8" />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Timeline View */}
              <TabsContent value="timeline" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Event Timeline</CardTitle>
                    <CardDescription>Number of events over time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={400}>
                      <LineChart data={timeSeriesData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="count" stroke="#8884d8" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}

