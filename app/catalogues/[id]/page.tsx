'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileText, 
  Map as MapIcon, 
  ArrowLeft, 
  Download,
  BarChart3,
  Activity
} from 'lucide-react';
import { EventTable } from '@/components/events/EventTable';
import { toast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

interface Event {
  id: string | number;
  time: string;
  latitude: number;
  longitude: number;
  depth: number;
  magnitude: number;
  magnitude_type?: string | null;
  location_name?: string | null;
  event_type?: string | null;
  quality_score?: number | null;
  azimuthal_gap?: number | null;
  used_station_count?: number | null;
  public_id?: string | null;
}

interface Catalogue {
  id: string;
  name: string;
  event_count: number;
  status: string;
  created_at: string;
  source_catalogues?: string;
}

export default function CatalogueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const catalogueId = params.id as string;

  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCatalogueData();
  }, [catalogueId]);

  const fetchCatalogueData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch catalogue details
      const catalogueRes = await fetch('/api/catalogues');
      const catalogues = await catalogueRes.json();
      const currentCatalogue = catalogues.find((c: Catalogue) => c.id === catalogueId);

      if (currentCatalogue) {
        setCatalogue(currentCatalogue);
      } else {
        setError('Catalogue not found');
        return;
      }

      // Fetch events
      const eventsRes = await fetch(`/api/catalogues/${catalogueId}/events`);
      const eventsData = await eventsRes.json();

      if (Array.isArray(eventsData)) {
        setEvents(eventsData);
      } else if (eventsData.data && Array.isArray(eventsData.data)) {
        setEvents(eventsData.data);
      } else {
        setError('Invalid events data format');
      }
    } catch (err) {
      console.error('Error fetching catalogue data:', err);
      setError('Failed to load catalogue data');
      toast({
        title: 'Error',
        description: 'Failed to load catalogue data. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEventClick = (event: Event) => {
    // Could navigate to event detail page or show modal
    console.log('Event clicked:', event);
  };

  const handleExport = async () => {
    try {
      const response = await fetch(`/api/catalogues/${catalogueId}/download`);
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${catalogue?.name || 'catalogue'}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Export successful',
        description: 'Catalogue exported as CSV',
      });
    } catch (error) {
      toast({
        title: 'Export failed',
        description: 'Failed to export catalogue',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (error || !catalogue) {
    return (
      <div className="container mx-auto py-6">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error || 'Catalogue not found'}</p>
            <Button onClick={() => router.push('/catalogues')} className="mt-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Catalogues
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stats = {
    total: events.length,
    avgMagnitude: events.length > 0 
      ? (events.reduce((sum, e) => sum + e.magnitude, 0) / events.length).toFixed(2)
      : '0',
    avgDepth: events.length > 0
      ? (events.reduce((sum, e) => sum + e.depth, 0) / events.length).toFixed(1)
      : '0',
    withQuality: events.filter(e => e.quality_score).length,
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/catalogues')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <FileText className="h-8 w-8 text-primary" />
              {catalogue.name}
            </h1>
            <Badge variant={catalogue.status === 'complete' ? 'default' : 'secondary'}>
              {catalogue.status}
            </Badge>
          </div>
          <p className="text-muted-foreground ml-12">
            Created {new Date(catalogue.created_at).toLocaleDateString('en-NZ', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button onClick={() => router.push(`/catalogues/${catalogueId}/map`)}>
            <MapIcon className="mr-2 h-4 w-4" />
            View Map
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Magnitude</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgMagnitude}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Depth</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgDepth} km</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">With Quality Score</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.withQuality} 
              <span className="text-sm font-normal text-muted-foreground ml-1">
                ({stats.total > 0 ? ((stats.withQuality / stats.total) * 100).toFixed(0) : 0}%)
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Events Table */}
      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>
            {events.length} earthquake events in this catalogue. Click column headers to sort.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <EventTable 
            events={events} 
            onEventClick={handleEventClick}
          />
        </CardContent>
      </Card>
    </div>
  );
}

