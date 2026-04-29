'use client';

import { useEffect, useState, useCallback, memo } from 'react';
import { Card } from '@/components/ui/card';
import { MapPin, Filter } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EarthquakeCircleMap } from '@/components/map/EarthquakeCircleMap';

interface EarthquakeEvent {
  id: string;
  catalogue_id?: string;
  latitude: number;
  longitude: number;
  magnitude: number;
  depth: number | null;
  time: string;
  catalogue_name: string;
  magnitude_type?: string | null;
  event_type?: string | null;
}

interface Catalogue {
  id: string;
  name: string;
  event_count: number;
}

export const CatalogueMap = memo(function CatalogueMap() {
  const [events, setEvents] = useState<EarthquakeEvent[]>([]);
  const [catalogues, setCatalogues] = useState<Catalogue[]>([]);
  const [selectedCatalogue, setSelectedCatalogue] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sampleSize, setSampleSize] = useState<number>(1000);

  useEffect(() => {
    async function fetchCatalogues() {
      try {
        const response = await fetch('/api/catalogues');
        if (!response.ok) throw new Error('Failed to fetch catalogues');
        const data = await response.json();
        setCatalogues(data || []);
        if (data && data.length > 0 && !selectedCatalogue) {
          setSelectedCatalogue(data[0].id);
        }
      } catch (err) {
        console.error('Error fetching catalogues:', err);
      }
    }
    fetchCatalogues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchEvents = useCallback(async () => {
    if (!selectedCatalogue) return;
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/catalogues/${selectedCatalogue}/events`);
      if (!response.ok) throw new Error('Failed to fetch events');
      const data = await response.json();
      setEvents(Array.isArray(data) ? data : (data.data || []));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [selectedCatalogue]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const emptyHeight = 'h-[600px] w-full relative flex items-center justify-center bg-muted/20';

  if (loading) {
    return (
      <div className={emptyHeight}>
        <div className="text-center">
          <Skeleton className="h-12 w-12 rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading earthquake data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={emptyHeight}>
        <div className="text-center text-muted-foreground">
          <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Failed to load map data</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (catalogues.length === 0) {
    return (
      <div className={emptyHeight}>
        <div className="text-center text-muted-foreground">
          <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No catalogues found</p>
          <p className="text-sm mt-1">Import or create catalogues to see events on the map</p>
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className={emptyHeight}>
        <div className="text-center text-muted-foreground">
          <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No earthquake events found in this catalogue</p>
          <p className="text-sm mt-1">Select a different catalogue or import more data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[600px] w-full relative">
      {/* Catalogue selector — overlaid top-left, above the map */}
      <div className="absolute top-4 left-4 z-[2000]">
        <Card className="p-3 bg-background/95 backdrop-blur-sm shadow-lg">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedCatalogue} onValueChange={setSelectedCatalogue}>
              <SelectTrigger className="w-[250px] h-8">
                <SelectValue placeholder="Select catalogue" />
              </SelectTrigger>
              <SelectContent position="popper" className="z-[10000]">
                {catalogues.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.event_count} events)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>
      </div>

      <EarthquakeCircleMap
        events={events}
        sampleSize={sampleSize}
        onSampleSizeChange={setSampleSize}
        mapKey={`catalogue-map-${selectedCatalogue}`}
        height="600px"
      />
    </div>
  );
});
