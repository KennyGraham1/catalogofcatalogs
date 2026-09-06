'use client';

import { useEffect, useState, memo } from 'react';
import { Card } from '@/components/ui/card';
import { MapPin, Filter } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCatalogueEvents } from '@/hooks/use-catalogue-events';
import { Button } from '@/components/ui/button';
import { EarthquakeCircleMap } from '@/components/map/EarthquakeCircleMap';
import type { MapDetail } from '@/lib/map-event-selection';

interface Catalogue {
  id: string;
  name: string;
  event_count: number;
}

export const CatalogueMap = memo(function CatalogueMap() {
  const [catalogues, setCatalogues] = useState<Catalogue[]>([]);
  const [selectedCatalogue, setSelectedCatalogue] = useState<string>('');
  const [cataloguesLoading, setCataloguesLoading] = useState(true);
  const [cataloguesError, setCataloguesError] = useState<string | null>(null);
  const [sampleSize, setSampleSize] = useState<MapDetail>('auto');

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function fetchCatalogues() {
      try {
        const response = await fetch('/api/catalogues', { signal: controller.signal });
        if (!response.ok) throw new Error('Failed to fetch catalogues');
        const data = await response.json();
        if (!active) return;
        const available = Array.isArray(data) ? data : [];
        setCatalogues(available);
        if (available.length > 0) setSelectedCatalogue(available[0].id);
        setCataloguesLoading(false);
      } catch (err) {
        if (!active) return;
        setCataloguesError(err instanceof Error ? err.message : 'Failed to load catalogues');
        setCataloguesLoading(false);
      }
    }
    fetchCatalogues();
    return () => { active = false; controller.abort(); };
  }, []);

  const { events, loading: eventsLoading, complete, loadedCount, error: eventsError, retry: reload } = useCatalogueEvents(catalogues, selectedCatalogue);
  const loading = cataloguesLoading || (eventsLoading && events.length === 0);
  const error = cataloguesError || eventsError;

  const emptyHeight = 'h-[600px] w-full relative flex items-center justify-center bg-muted/20';

  const renderMap = () => {
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

    if (error && events.length === 0) {
      return (
        <div className={emptyHeight}>
          <div className="text-center text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Failed to load map data</p>
            <p className="text-sm mt-1">{error}</p>
            {eventsError && <Button variant="outline" onClick={reload}>Retry loading events</Button>}
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
    return <EarthquakeCircleMap
      events={events}
      sampleSize={sampleSize}
      onSampleSizeChange={setSampleSize}
      mapKey={`catalogue-map-${selectedCatalogue}`}
      height="600px"
    />;
  };

  return (
    <div className="h-[600px] w-full relative">
      {/* Catalogue selector — overlaid top-left, above the map */}
      {catalogues.length > 0 && <div className="absolute top-4 left-4 z-[2000]">
        <Card className="p-3 bg-background/95 backdrop-blur-sm shadow-lg">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedCatalogue} onValueChange={setSelectedCatalogue}>
              <SelectTrigger aria-label="Catalogue" className="w-[250px] h-8">
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
      </div>}

      {renderMap()}
      {!complete && events.length > 0 && <Card className="absolute bottom-4 left-4 z-[2000] p-3" role={eventsError ? 'alert' : 'status'}>
        <p className="text-sm">{eventsError || `Preview · ${loadedCount.toLocaleString()} events received. Loading remaining events...`}</p>
        {eventsError && <Button size="sm" variant="outline" onClick={reload}>Retry loading events</Button>}
      </Card>}
    </div>
  );
});
