'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, TrendingUp, Activity, BarChart3, MapPin, Clock, Zap } from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import {
  calculateGutenbergRichter,
  estimateCompletenessMagnitude,
  analyzeTemporalPattern,
  calculateSeismicMoment,
  type EarthquakeEvent
} from '@/lib/seismological-analysis';

export default function AdvancedAnalyticsPage() {
  const [catalogues, setCatalogues] = useState<any[]>([]);
  const [selectedCatalogue, setSelectedCatalogue] = useState<string>('');
  const [events, setEvents] = useState<EarthquakeEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch catalogues on mount
  useEffect(() => {
    fetchCatalogues();
  }, []);

  // Fetch events when catalogue is selected
  useEffect(() => {
    if (selectedCatalogue) {
      fetchEvents(selectedCatalogue);
    }
  }, [selectedCatalogue]);

  const fetchCatalogues = async () => {
    try {
      const response = await fetch('/api/catalogues');
      const data = await response.json();
      setCatalogues(Array.isArray(data) ? data : []);
      if (data.length > 0) {
        setSelectedCatalogue(data[0].id);
      }
    } catch (error) {
      console.error('Error fetching catalogues:', error);
      setError('Failed to fetch catalogues');
    }
  };

  const fetchEvents = async (catalogueId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/catalogues/${catalogueId}/events`);
      const data = await response.json();
      const eventList = Array.isArray(data) ? data : data.data || [];
      setEvents(eventList);
    } catch (error) {
      console.error('Error fetching events:', error);
      setError('Failed to fetch events');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  // Calculate Gutenberg-Richter
  const grAnalysis = useMemo(() => {
    if (events.length < 10) return null;
    try {
      return calculateGutenbergRichter(events);
    } catch (error) {
      console.error('GR analysis error:', error);
      return null;
    }
  }, [events]);

  // Calculate completeness magnitude
  const completeness = useMemo(() => {
    if (events.length < 50) return null;
    try {
      return estimateCompletenessMagnitude(events);
    } catch (error) {
      console.error('Completeness analysis error:', error);
      return null;
    }
  }, [events]);

  // Temporal analysis
  const temporal = useMemo(() => {
    if (events.length === 0) return null;
    try {
      return analyzeTemporalPattern(events);
    } catch (error) {
      console.error('Temporal analysis error:', error);
      return null;
    }
  }, [events]);

  // Seismic moment
  const moment = useMemo(() => {
    if (events.length === 0) return null;
    try {
      return calculateSeismicMoment(events);
    } catch (error) {
      console.error('Moment calculation error:', error);
      return null;
    }
  }, [events]);

  const selectedCatalogueName = catalogues.find(c => c.id === selectedCatalogue)?.name || '';

  if (loading && events.length === 0) {
    return (
      <div className="container py-8">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading earthquake data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <BarChart3 className="h-8 w-8 text-primary" />
              Advanced Seismological Analytics
            </h1>
            <p className="text-muted-foreground mt-1">
              Gutenberg-Richter analysis, completeness estimation, temporal patterns, and seismic moment calculations
            </p>
          </div>

          {/* Catalogue Selector */}
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">Select Catalogue:</label>
            <Select value={selectedCatalogue} onValueChange={setSelectedCatalogue}>
              <SelectTrigger className="w-[400px]">
                <SelectValue placeholder="Select a catalogue" />
              </SelectTrigger>
              <SelectContent>
                {catalogues.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name} ({cat.event_count} events)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {events.length === 0 && !loading && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-center">
                No events available for analysis. Please select a catalogue with events.
              </p>
            </CardContent>
          </Card>
        )}

        {events.length > 0 && (
          <Tabs defaultValue="gutenberg-richter" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="gutenberg-richter">
                <TrendingUp className="h-4 w-4 mr-2" />
                Gutenberg-Richter
              </TabsTrigger>
              <TabsTrigger value="completeness">
                <Activity className="h-4 w-4 mr-2" />
                Completeness
              </TabsTrigger>
              <TabsTrigger value="temporal">
                <Clock className="h-4 w-4 mr-2" />
                Temporal
              </TabsTrigger>
              <TabsTrigger value="moment">
                <Zap className="h-4 w-4 mr-2" />
                Seismic Moment
              </TabsTrigger>
            </TabsList>

            {/* Gutenberg-Richter Tab */}
            <TabsContent value="gutenberg-richter" className="space-y-6">
              {grAnalysis ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">b-value</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{grAnalysis.bValue.toFixed(3)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {grAnalysis.bValue < 0.8 ? 'Low (stress accumulation)' :
                           grAnalysis.bValue > 1.2 ? 'High (heterogeneous)' : 'Normal'}
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">a-value</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{grAnalysis.aValue.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Productivity parameter
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">R² (Fit Quality)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{grAnalysis.rSquared.toFixed(3)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {grAnalysis.rSquared > 0.95 ? 'Excellent' :
                           grAnalysis.rSquared > 0.90 ? 'Good' : 'Fair'}
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Mc (Estimated)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{grAnalysis.completeness.toFixed(1)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Completeness magnitude
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle>Frequency-Magnitude Distribution</CardTitle>
                      <CardDescription>
                        Log₁₀(N) vs Magnitude - Gutenberg-Richter Relation: log₁₀(N) = {grAnalysis.aValue.toFixed(2)} - {grAnalysis.bValue.toFixed(3)}M
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={400}>
                        <ScatterChart>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="magnitude" 
                            type="number" 
                            domain={['dataMin', 'dataMax']}
                            label={{ value: 'Magnitude', position: 'insideBottom', offset: -5 }}
                          />
                          <YAxis 
                            dataKey="logCount" 
                            label={{ value: 'Log₁₀(Cumulative Number)', angle: -90, position: 'insideLeft' }}
                          />
                          <Tooltip 
                            formatter={(value: any, name: string) => {
                              if (name === 'logCount') return [value.toFixed(2), 'Log₁₀(N)'];
                              if (name === 'count') return [value, 'N'];
                              return [value, name];
                            }}
                          />
                          <Legend />
                          <Scatter 
                            name="Observed Data" 
                            data={grAnalysis.dataPoints} 
                            fill="#8884d8" 
                          />
                          <Scatter 
                            name="G-R Fit" 
                            data={grAnalysis.fittedLine} 
                            fill="#ff7300" 
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
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-muted-foreground text-center">
                      Insufficient data for Gutenberg-Richter analysis (need at least 10 events)
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Completeness Tab */}
            <TabsContent value="completeness" className="space-y-6">
              {completeness ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Mc (MAXC Method)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{completeness.mc.toFixed(1)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Completeness magnitude
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Confidence</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{(completeness.confidence * 100).toFixed(1)}%</div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Events above Mc
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Method</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{completeness.method}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Maximum Curvature
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle>Magnitude Distribution</CardTitle>
                      <CardDescription>
                        Frequency histogram showing completeness magnitude (Mc = {completeness.mc.toFixed(1)})
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={completeness.magnitudeDistribution}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="magnitude"
                            label={{ value: 'Magnitude', position: 'insideBottom', offset: -5 }}
                          />
                          <YAxis
                            label={{ value: 'Number of Events', angle: -90, position: 'insideLeft' }}
                          />
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
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-muted-foreground text-center">
                      Insufficient data for completeness analysis (need at least 50 events)
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Temporal Tab */}
            <TabsContent value="temporal" className="space-y-6">
              {temporal ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Time Span</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{temporal.timeSpanDays.toFixed(0)}</div>
                        <p className="text-xs text-muted-foreground mt-1">days</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Events/Day</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{temporal.eventsPerDay.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground mt-1">average rate</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Events/Month</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{temporal.eventsPerMonth.toFixed(1)}</div>
                        <p className="text-xs text-muted-foreground mt-1">average rate</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Clusters Detected</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{temporal.clusters.length}</div>
                        <p className="text-xs text-muted-foreground mt-1">high-activity periods</p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle>Cumulative Event Count</CardTitle>
                      <CardDescription>
                        Total events over time showing seismicity rate
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={400}>
                        <LineChart data={temporal.timeSeries}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="date"
                            label={{ value: 'Date', position: 'insideBottom', offset: -5 }}
                          />
                          <YAxis
                            label={{ value: 'Cumulative Events', angle: -90, position: 'insideLeft' }}
                          />
                          <Tooltip />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="cumulativeCount"
                            stroke="#8884d8"
                            strokeWidth={2}
                            name="Cumulative Count"
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {temporal.clusters.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Detected Clusters</CardTitle>
                        <CardDescription>
                          Periods with seismicity rate &gt; 2× average
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {temporal.clusters.map((cluster, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                              <div>
                                <p className="font-medium">
                                  {cluster.startDate} to {cluster.endDate}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {cluster.eventCount} events, max M{cluster.maxMagnitude.toFixed(1)}
                                </p>
                              </div>
                              <Badge variant="secondary">{cluster.eventCount} events</Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-muted-foreground text-center">
                      No events available for temporal analysis
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Seismic Moment Tab */}
            <TabsContent value="moment" className="space-y-6">
              {moment ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Total Moment</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{moment.totalMoment.toExponential(2)}</div>
                        <p className="text-xs text-muted-foreground mt-1">N⋅m</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Moment Magnitude</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">Mw {moment.totalMomentMagnitude.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground mt-1">equivalent magnitude</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Largest Event</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">M{moment.largestEvent.magnitude.toFixed(1)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {moment.largestEvent.percentOfTotal.toFixed(1)}% of total moment
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle>Seismic Moment by Magnitude</CardTitle>
                      <CardDescription>
                        Distribution of seismic moment release across magnitude bins
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={moment.momentByMagnitude}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="magnitude"
                            label={{ value: 'Magnitude', position: 'insideBottom', offset: -5 }}
                          />
                          <YAxis
                            scale="log"
                            domain={['auto', 'auto']}
                            label={{ value: 'Seismic Moment (N⋅m)', angle: -90, position: 'insideLeft' }}
                          />
                          <Tooltip
                            formatter={(value: any) => value.toExponential(2)}
                          />
                          <Legend />
                          <Bar dataKey="moment" fill="#82ca9d" name="Seismic Moment" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Key Insights</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-start gap-3">
                          <Zap className="h-5 w-5 text-primary mt-0.5" />
                          <div>
                            <p className="font-medium">Moment Release</p>
                            <p className="text-sm text-muted-foreground">
                              The largest event (M{moment.largestEvent.magnitude.toFixed(1)}) released {moment.largestEvent.percentOfTotal.toFixed(1)}%
                              of the total seismic moment, demonstrating the dominance of large earthquakes in energy release.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <Activity className="h-5 w-5 text-primary mt-0.5" />
                          <div>
                            <p className="font-medium">Equivalent Magnitude</p>
                            <p className="text-sm text-muted-foreground">
                              The total seismic moment is equivalent to a single Mw {moment.totalMomentMagnitude.toFixed(2)} earthquake.
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-muted-foreground text-center">
                      No events available for seismic moment calculation
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

