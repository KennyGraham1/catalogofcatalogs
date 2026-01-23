'use client';

import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { MapPin, Search, X, Map as MapIcon, Edit3, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import dynamic from 'next/dynamic';

// Dynamically import the map component to avoid SSR issues
const RegionSelectorMap = dynamic(
  () => import('./RegionSelectorMap').then(mod => mod.RegionSelectorMap),
  { ssr: false }
);

export interface GeographicBounds {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

interface GeographicSearchPanelProps {
  onSearch: (bounds: GeographicBounds) => void;
  onClear: () => void;
  isSearching?: boolean;
}

// Memoized component for better performance
export const GeographicSearchPanel = memo(function GeographicSearchPanel({
  onSearch,
  onClear,
  isSearching = false
}: GeographicSearchPanelProps) {
  const [minLat, setMinLat] = useState('');
  const [maxLat, setMaxLat] = useState('');
  const [minLon, setMinLon] = useState('');
  const [maxLon, setMaxLon] = useState('');
  const [activeTab, setActiveTab] = useState<'map' | 'manual'>('map');
  const [mapBounds, setMapBounds] = useState<GeographicBounds | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Sync map bounds to manual inputs when switching tabs
  useEffect(() => {
    if (mapBounds && activeTab === 'manual') {
      setMinLat(mapBounds.minLatitude.toFixed(2));
      setMaxLat(mapBounds.maxLatitude.toFixed(2));
      setMinLon(mapBounds.minLongitude.toFixed(2));
      setMaxLon(mapBounds.maxLongitude.toFixed(2));
    }
  }, [mapBounds, activeTab]);

  // Memoized search handler
  const handleSearch = useCallback(() => {
    let bounds: GeographicBounds;

    if (activeTab === 'map') {
      // Use map-selected bounds
      if (!mapBounds) {
        toast({
          title: 'No Region Selected',
          description: 'Please draw a polygon on the map or choose a preset region',
          variant: 'destructive',
        });
        return;
      }
      bounds = mapBounds;
    } else {
      // Use manual inputs
      if (!minLat || !maxLat || !minLon || !maxLon) {
        toast({
          title: 'Validation Error',
          description: 'Please fill in all coordinate fields',
          variant: 'destructive',
        });
        return;
      }

      const minLatNum = parseFloat(minLat);
      const maxLatNum = parseFloat(maxLat);
      const minLonNum = parseFloat(minLon);
      const maxLonNum = parseFloat(maxLon);

      // Validate numbers
      if (isNaN(minLatNum) || isNaN(maxLatNum) || isNaN(minLonNum) || isNaN(maxLonNum)) {
        toast({
          title: 'Validation Error',
          description: 'All coordinates must be valid numbers',
          variant: 'destructive',
        });
        return;
      }

      // Validate ranges
      if (minLatNum < -90 || minLatNum > 90 || maxLatNum < -90 || maxLatNum > 90) {
        toast({
          title: 'Validation Error',
          description: 'Latitude must be between -90 and 90',
          variant: 'destructive',
        });
        return;
      }

      if (minLonNum < -180 || minLonNum > 180 || maxLonNum < -180 || maxLonNum > 180) {
        toast({
          title: 'Validation Error',
          description: 'Longitude must be between -180 and 180',
          variant: 'destructive',
        });
        return;
      }

      if (minLatNum > maxLatNum) {
        toast({
          title: 'Validation Error',
          description: 'Minimum latitude cannot be greater than maximum latitude',
          variant: 'destructive',
        });
        return;
      }

      if (minLonNum > maxLonNum) {
        toast({
          title: 'Validation Error',
          description: 'Minimum longitude cannot be greater than maximum longitude',
          variant: 'destructive',
        });
        return;
      }

      bounds = {
        minLatitude: minLatNum,
        maxLatitude: maxLatNum,
        minLongitude: minLonNum,
        maxLongitude: maxLonNum,
      };
    }

    onSearch(bounds);
  }, [activeTab, mapBounds, minLat, maxLat, minLon, maxLon, onSearch]);

  // Memoized clear handler
  const handleClear = useCallback(() => {
    setMinLat('');
    setMaxLat('');
    setMinLon('');
    setMaxLon('');
    setMapBounds(null);
    onClear();
  }, [onClear]);

  // Memoized map region selection handler
  const handleMapRegionSelected = useCallback((bounds: GeographicBounds) => {
    setMapBounds(bounds);
  }, []);

  const setPresetRegion = (region: 'nz') => {
    // New Zealand region
    setMinLat('-47.5');
    setMaxLat('-34.0');
    setMinLon('166.0');
    setMaxLon('179.0');
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                <CardTitle>Geographic Region Search</CardTitle>
              </div>
              {isOpen ? (
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <CardDescription>
              Filter catalogues by geographic bounding box - use the map or enter coordinates manually
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'map' | 'manual')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="map" className="flex items-center gap-2">
                  <MapIcon className="h-4 w-4" />
                  Interactive Map
                </TabsTrigger>
                <TabsTrigger value="manual" className="flex items-center gap-2">
                  <Edit3 className="h-4 w-4" />
                  Manual Entry
                </TabsTrigger>
              </TabsList>

              <TabsContent value="map" className="space-y-4 mt-4">
                <RegionSelectorMap
                  onRegionSelected={handleMapRegionSelected}
                  initialBounds={mapBounds}
                  height="450px"
                />
              </TabsContent>

              <TabsContent value="manual" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="minLat">Min Latitude</Label>
                      <InfoTooltip content="Southern boundary in degrees (-90 to 90)." />
                    </div>
                    <Input
                      id="minLat"
                      type="number"
                      step="0.01"
                      min="-90"
                      max="90"
                      placeholder="-90 to 90"
                      value={minLat}
                      onChange={(e) => setMinLat(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="maxLat">Max Latitude</Label>
                      <InfoTooltip content="Northern boundary in degrees (-90 to 90)." />
                    </div>
                    <Input
                      id="maxLat"
                      type="number"
                      step="0.01"
                      min="-90"
                      max="90"
                      placeholder="-90 to 90"
                      value={maxLat}
                      onChange={(e) => setMaxLat(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="minLon">Min Longitude</Label>
                      <InfoTooltip content="Western boundary in degrees (-180 to 180)." />
                    </div>
                    <Input
                      id="minLon"
                      type="number"
                      step="0.01"
                      min="-180"
                      max="180"
                      placeholder="-180 to 180"
                      value={minLon}
                      onChange={(e) => setMinLon(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="maxLon">Max Longitude</Label>
                      <InfoTooltip content="Eastern boundary in degrees (-180 to 180)." />
                    </div>
                    <Input
                      id="maxLon"
                      type="number"
                      step="0.01"
                      min="-180"
                      max="180"
                      placeholder="-180 to 180"
                      value={maxLon}
                      onChange={(e) => setMaxLon(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPresetRegion('nz')}
                  >
                    New Zealand (All)
                  </Button>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex gap-2 pt-2">
              <Button
                className="flex-1"
                onClick={handleSearch}
                disabled={isSearching}
              >
                <Search className="mr-2 h-4 w-4" />
                {isSearching ? 'Searching...' : 'Search Region'}
              </Button>
              <Button
                variant="outline"
                onClick={handleClear}
                disabled={isSearching}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
});
