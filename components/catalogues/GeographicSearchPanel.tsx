'use client';

import { useState, useEffect, useCallback, useMemo, useId, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { MapPin, Search, X, Map as MapIcon, Edit3, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { NZ_NATIONAL_BOUNDS } from '@/lib/geo-bounds-utils';
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
  const descriptionId = useId();

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
    // New Zealand region: the map's national preset, which crosses the date line
    // (min longitude greater than max longitude) to take in the Chatham and Kermadec Islands.
    setMinLat(NZ_NATIONAL_BOUNDS.minLatitude.toFixed(2));
    setMaxLat(NZ_NATIONAL_BOUNDS.maxLatitude.toFixed(2));
    setMinLon(NZ_NATIONAL_BOUNDS.minLongitude.toFixed(2));
    setMaxLon(NZ_NATIONAL_BOUNDS.maxLongitude.toFixed(2));
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CardHeader>
          {/* Disclosure pattern: the heading holds one native button (the only interactive
              element), which Radix gives aria-expanded and aria-controls. */}
          <CardTitle className="text-lg leading-tight sm:text-2xl sm:leading-none">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                aria-describedby={descriptionId}
                className="-mx-2 -my-1 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-md px-2 py-1 text-left ring-offset-background transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <MapPin className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 break-words">Geographic Region Search</span>
                </span>
                {isOpen ? (
                  <ChevronUp className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
              </button>
            </CollapsibleTrigger>
          </CardTitle>
          <CardDescription id={descriptionId}>
            Filter catalogues by geographic bounding box - use the map or enter coordinates manually
          </CardDescription>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'map' | 'manual')}>
              {/* At 320 px each tab is about 115 px wide: the icons drop out below the sm
                  breakpoint so the labels fit, and the list grows rather than clips if a
                  label still wraps. */}
              <TabsList className="grid h-auto w-full grid-cols-2">
                <TabsTrigger value="map" className="flex min-w-0 items-center gap-2 whitespace-normal px-1 text-center text-xs sm:px-3 sm:text-sm">
                  <MapIcon className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
                  Interactive Map
                </TabsTrigger>
                <TabsTrigger value="manual" className="flex min-w-0 items-center gap-2 whitespace-normal px-1 text-center text-xs sm:px-3 sm:text-sm">
                  <Edit3 className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
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
                      <InfoTooltip content="Western boundary in degrees (-180 to 180). For date line regions, this can be greater than max longitude." />
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
                      <InfoTooltip content="Eastern boundary in degrees (-180 to 180). For date line regions, this can be less than min longitude." />
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
                <p className="text-xs text-muted-foreground">
                  Tip: If your region crosses the international date line, enter a min longitude greater than the max longitude (e.g., 170 to -170).
                </p>
              </TabsContent>
            </Tabs>

            <div className="flex gap-2 pt-2">
              <Button
                className="flex-1"
                onClick={handleSearch}
                disabled={isSearching}
              >
                <Search className="mr-2 h-4 w-4" aria-hidden="true" />
                {isSearching ? 'Searching...' : 'Search Region'}
              </Button>
              <Button
                variant="outline"
                onClick={handleClear}
                disabled={isSearching}
                aria-label="Clear region"
                title="Clear region"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
});
