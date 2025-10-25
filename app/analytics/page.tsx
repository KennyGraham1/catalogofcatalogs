'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Map, Target, Radio, Award, TrendingUp } from 'lucide-react';
import { QualityScoreCard } from '@/components/advanced-viz/QualityScoreCard';
import { UncertaintyVisualization } from '@/components/advanced-viz/UncertaintyVisualization';
import { FocalMechanismCard } from '@/components/advanced-viz/FocalMechanismCard';
import { StationCoverageCard } from '@/components/advanced-viz/StationCoverageCard';
import { calculateQualityScore, QualityMetrics } from '@/lib/quality-scoring';
import { parseFocalMechanism } from '@/lib/focal-mechanism-utils';
import { parseStationData } from '@/lib/station-coverage-utils';

// Dynamically import map component to avoid SSR issues
const EnhancedMapView = dynamic(() => import('@/components/advanced-viz/EnhancedMapView').then(mod => mod.EnhancedMapView), {
  ssr: false,
  loading: () => <div className="h-[700px] w-full bg-muted animate-pulse rounded-lg" />
});

export default function AnalyticsPage() {
  const [catalogues, setCatalogues] = useState<any[]>([]);
  const [selectedCatalogue, setSelectedCatalogue] = useState<string>('');
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

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
    }
  };

  const fetchEvents = async (catalogueId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/catalogues/${catalogueId}/events`);
      const data = await response.json();
      const eventList = Array.isArray(data) ? data : data.data || [];
      setEvents(eventList);
      if (eventList.length > 0) {
        setSelectedEvent(eventList[0]);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  // Calculate statistics
  const statistics = useMemo(() => {
    if (events.length === 0) return null;

    const qualityScores = events.map(e => calculateQualityScore(e as QualityMetrics));
    const avgQuality = qualityScores.reduce((sum, s) => sum + s.overall, 0) / qualityScores.length;
    
    const gradeDistribution = qualityScores.reduce((acc, s) => {
      acc[s.grade] = (acc[s.grade] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const withUncertainty = events.filter(e => 
      e.latitude_uncertainty || e.longitude_uncertainty || e.depth_uncertainty
    ).length;

    const withFocalMechanism = events.filter(e => {
      const fm = parseFocalMechanism(e.focal_mechanisms);
      return fm !== null;
    }).length;

    const withStationData = events.filter(e => 
      e.used_station_count && e.used_station_count > 0
    ).length;

    return {
      totalEvents: events.length,
      avgQuality: avgQuality.toFixed(1),
      gradeDistribution,
      withUncertainty,
      withFocalMechanism,
      withStationData,
      percentageWithUncertainty: ((withUncertainty / events.length) * 100).toFixed(1),
      percentageWithFocalMechanism: ((withFocalMechanism / events.length) * 100).toFixed(1),
      percentageWithStationData: ((withStationData / events.length) * 100).toFixed(1),
    };
  }, [events]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Advanced Analytics</h1>
          <p className="text-muted-foreground">
            Comprehensive quality assessment and visualization of earthquake catalogue data
          </p>
        </div>
        <Select value={selectedCatalogue} onValueChange={setSelectedCatalogue}>
          <SelectTrigger className="w-[300px]">
            <SelectValue placeholder="Select catalogue" />
          </SelectTrigger>
          <SelectContent>
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
        <TabsList>
          <TabsTrigger value="map">
            <Map className="h-4 w-4 mr-2" />
            Enhanced Map
          </TabsTrigger>
          <TabsTrigger value="event-details">
            <Target className="h-4 w-4 mr-2" />
            Event Details
          </TabsTrigger>
          <TabsTrigger value="quality">
            <TrendingUp className="h-4 w-4 mr-2" />
            Quality Analysis
          </TabsTrigger>
        </TabsList>

        {/* Enhanced Map Tab */}
        <TabsContent value="map" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Enhanced Visualization Map</CardTitle>
              <CardDescription>
                Interactive map with uncertainty ellipses, focal mechanisms, and station coverage
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {events.length > 0 ? (
                <EnhancedMapView events={events} />
              ) : (
                <div className="h-[700px] flex items-center justify-center text-muted-foreground">
                  {loading ? 'Loading events...' : 'No events to display'}
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
      </Tabs>
    </div>
  );
}

