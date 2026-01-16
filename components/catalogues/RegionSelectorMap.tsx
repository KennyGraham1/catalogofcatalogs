'use client';

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, FeatureGroup } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Trash2, Info } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

export interface GeographicBounds {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

interface RegionSelectorMapProps {
  onRegionSelected: (bounds: GeographicBounds) => void;
  initialBounds?: GeographicBounds | null;
  height?: string;
}

// Memoized component for better performance
export const RegionSelectorMap = memo(function RegionSelectorMap({
  onRegionSelected,
  initialBounds = null,
  height = '400px'
}: RegionSelectorMapProps) {
  const mapRef = useRef<L.Map>(null);
  const featureGroupRef = useRef<L.FeatureGroup>(null);
  const [selectedBounds, setSelectedBounds] = useState<GeographicBounds | null>(initialBounds);
  const [drawnRectangle, setDrawnRectangle] = useState<L.Rectangle | null>(null);

  // Fix for Leaflet icons in Next.js
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
  }, []);

  // Memoized rectangle creation handler
  const handleRectangleCreated = useCallback((e: any) => {
    const layer = e.layer as L.Rectangle;
    const bounds = layer.getBounds();

    // Remove previous rectangle if exists
    if (drawnRectangle && featureGroupRef.current) {
      featureGroupRef.current.removeLayer(drawnRectangle);
    }

    setDrawnRectangle(layer);

    const geoBounds: GeographicBounds = {
      minLatitude: bounds.getSouth(),
      maxLatitude: bounds.getNorth(),
      minLongitude: bounds.getWest(),
      maxLongitude: bounds.getEast(),
    };

    setSelectedBounds(geoBounds);
    onRegionSelected(geoBounds);
  }, [drawnRectangle, onRegionSelected]);

  // Memoized rectangle edit handler
  const handleRectangleEdited = useCallback((e: any) => {
    const layers = e.layers;
    layers.eachLayer((layer: L.Rectangle) => {
      const bounds = layer.getBounds();
      const geoBounds: GeographicBounds = {
        minLatitude: bounds.getSouth(),
        maxLatitude: bounds.getNorth(),
        minLongitude: bounds.getWest(),
        maxLongitude: bounds.getEast(),
      };

      setSelectedBounds(geoBounds);
      onRegionSelected(geoBounds);
    });
  }, [onRegionSelected]);

  // Memoized rectangle deletion handler
  const handleRectangleDeleted = useCallback(() => {
    setDrawnRectangle(null);
    setSelectedBounds(null);
  }, []);

  // Memoized clear handler
  const handleClear = useCallback(() => {
    if (drawnRectangle && featureGroupRef.current) {
      featureGroupRef.current.removeLayer(drawnRectangle);
      setDrawnRectangle(null);
      setSelectedBounds(null);
    }
  }, [drawnRectangle]);

  // Set preset region
  const setPresetRegion = (region: string) => {
    // Clear existing rectangle
    if (drawnRectangle && featureGroupRef.current) {
      featureGroupRef.current.removeLayer(drawnRectangle);
    }

    let bounds: L.LatLngBounds;
    let geoBounds: GeographicBounds;

    switch (region) {
      case 'nz':
        // New Zealand (entire country)
        geoBounds = {
          minLatitude: -47.5,
          maxLatitude: -34.0,
          minLongitude: 166.0,
          maxLongitude: 179.0,
        };
        bounds = L.latLngBounds(
          L.latLng(-47.5, 166.0),
          L.latLng(-34.0, 179.0)
        );
        break;
      case 'nz-north':
        // North Island
        geoBounds = {
          minLatitude: -41.8,
          maxLatitude: -34.0,
          minLongitude: 172.5,
          maxLongitude: 178.6,
        };
        bounds = L.latLngBounds(
          L.latLng(-41.8, 172.5),
          L.latLng(-34.0, 178.6)
        );
        break;
      case 'nz-south':
        // South Island
        geoBounds = {
          minLatitude: -47.5,
          maxLatitude: -40.5,
          minLongitude: 166.0,
          maxLongitude: 174.5,
        };
        bounds = L.latLngBounds(
          L.latLng(-47.5, 166.0),
          L.latLng(-40.5, 174.5)
        );
        break;
      case 'nz-canterbury':
        // Canterbury region
        geoBounds = {
          minLatitude: -44.5,
          maxLatitude: -42.5,
          minLongitude: 170.5,
          maxLongitude: 173.5,
        };
        bounds = L.latLngBounds(
          L.latLng(-44.5, 170.5),
          L.latLng(-42.5, 173.5)
        );
        break;
      case 'nz-wellington':
        // Wellington region
        geoBounds = {
          minLatitude: -41.6,
          maxLatitude: -40.7,
          minLongitude: 174.7,
          maxLongitude: 175.5,
        };
        bounds = L.latLngBounds(
          L.latLng(-41.6, 174.7),
          L.latLng(-40.7, 175.5)
        );
        break;
      case 'nz-auckland':
        // Auckland region
        geoBounds = {
          minLatitude: -37.3,
          maxLatitude: -36.5,
          minLongitude: 174.4,
          maxLongitude: 175.2,
        };
        bounds = L.latLngBounds(
          L.latLng(-37.3, 174.4),
          L.latLng(-36.5, 175.2)
        );
        break;
      default:
        // Default to New Zealand (All)
        geoBounds = {
          minLatitude: -47.5,
          maxLatitude: -34.0,
          minLongitude: 166.0,
          maxLongitude: 179.0,
        };
        bounds = L.latLngBounds(
          L.latLng(-47.5, 166.0),
          L.latLng(-34.0, 179.0)
        );
        break;
    }

    // Create rectangle
    const rectangle = L.rectangle(bounds, {
      color: '#3b82f6',
      weight: 2,
      fillOpacity: 0.2,
    });

    if (featureGroupRef.current) {
      featureGroupRef.current.addLayer(rectangle);
      setDrawnRectangle(rectangle);
      setSelectedBounds(geoBounds);
      onRegionSelected(geoBounds);

      // Fit map to bounds
      if (mapRef.current) {
        mapRef.current.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  };

  const formatCoord = (value: number, isLat: boolean): string => {
    const abs = Math.abs(value);
    const dir = isLat
      ? value >= 0 ? 'N' : 'S'
      : value >= 0 ? 'E' : 'W';
    return `${abs.toFixed(2)}°${dir}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Interactive Region Selector
        </CardTitle>
        <CardDescription>
          Draw a rectangle on the map to select a geographic region, or choose a preset
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Preset Regions */}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Select onValueChange={setPresetRegion}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select Region" />
              </SelectTrigger>
              <SelectContent className="z-[1000]">
                <SelectItem value="nz">New Zealand (All)</SelectItem>
                <SelectItem value="nz-north">North Island</SelectItem>
                <SelectItem value="nz-south">South Island</SelectItem>
                <SelectItem value="nz-auckland">Auckland</SelectItem>
                <SelectItem value="nz-wellington">Wellington</SelectItem>
                <SelectItem value="nz-canterbury">Canterbury</SelectItem>
              </SelectContent>
            </Select>
            {selectedBounds && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Selected Bounds Display */}
        {selectedBounds && (
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div className="text-sm">
                <div className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                  Selected Region
                </div>
                <div className="text-blue-700 dark:text-blue-300 space-y-0.5">
                  <div>
                    Latitude: {formatCoord(selectedBounds.minLatitude, true)} to {formatCoord(selectedBounds.maxLatitude, true)}
                  </div>
                  <div>
                    Longitude: {formatCoord(selectedBounds.minLongitude, false)} to {formatCoord(selectedBounds.maxLongitude, false)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Map */}
        <div style={{ height }} className="rounded-lg overflow-hidden border">
          <MapContainer
            key="region-selector-map"
            center={[-41, 174]}
            zoom={5}
            ref={mapRef}
            className="h-full w-full"
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <FeatureGroup ref={featureGroupRef}>
              <EditControl
                position="topright"
                onCreated={handleRectangleCreated}
                onEdited={handleRectangleEdited}
                onDeleted={handleRectangleDeleted}
                draw={{
                  rectangle: {
                    shapeOptions: {
                      color: '#3b82f6',
                      weight: 2,
                      fillOpacity: 0.2,
                    },
                  },
                  polygon: false,
                  circle: false,
                  circlemarker: false,
                  marker: false,
                  polyline: false,
                }}
                edit={{
                  edit: {},
                  remove: true,
                }}
              />
            </FeatureGroup>
          </MapContainer>
        </div>

        {/* Instructions */}
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-xs">Tip</Badge>
            <span>Click the rectangle tool (□) in the top-right corner to draw a region on the map</span>
          </div>
          <div>You can also edit or delete the rectangle after drawing it</div>
        </div>
      </CardContent>
    </Card>
  );
});

