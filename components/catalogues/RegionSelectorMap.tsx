'use client';

import { useEffect, useMemo, useRef, useState, useCallback, memo } from 'react';
import L from 'leaflet';
import { MapContainer, FeatureGroup } from 'react-leaflet';
import { MapLayerControl } from '@/components/map/MapLayerControl';
import { MapScaleBar } from '@/components/map/MapScaleBar';
import { ensureLeafletDefaultIcon } from '@/components/map/leaflet-default-icon';
import { EditControl } from 'react-leaflet-draw';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
import { useIsDarkTheme } from '@/hooks/use-map-theme';
import { NZ_NATIONAL_BOUNDS, unwrappedLongitudeRange } from '@/lib/geo-bounds-utils';
import { cn } from '@/lib/utils';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import styles from './RegionSelectorMap.module.css';
import { MAP_ZOOM_OPTIONS } from '@/lib/map-style';

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

/** Preset regions, keyed by Select value (RFC 7946: minLongitude > maxLongitude crosses 180). */
const REGION_PRESETS: Record<string, GeographicBounds> = {
  // New Zealand (entire country, including the Chatham and Kermadec Islands across 180)
  nz: NZ_NATIONAL_BOUNDS,
  // North Island
  'nz-north': { minLatitude: -41.8, maxLatitude: -34.0, minLongitude: 172.5, maxLongitude: 178.6 },
  // South Island
  'nz-south': { minLatitude: -47.5, maxLatitude: -40.5, minLongitude: 166.0, maxLongitude: 174.5 },
  // Canterbury region
  'nz-canterbury': { minLatitude: -44.5, maxLatitude: -42.5, minLongitude: 170.5, maxLongitude: 173.5 },
  // Wellington region
  'nz-wellington': { minLatitude: -41.6, maxLatitude: -40.7, minLongitude: 174.7, maxLongitude: 175.5 },
  // Auckland region
  'nz-auckland': { minLatitude: -37.3, maxLatitude: -36.5, minLongitude: 174.4, maxLongitude: 175.2 },
};

/** Drawn-region outline width (px) and fill opacity (spec S6). */
export const REGION_SHAPE_WEIGHT = 2;
export const REGION_SHAPE_FILL_OPACITY = 0.08;

/** --primary of the default light / dark theme (app/globals.css), if it cannot be read. */
const PRIMARY_FALLBACK = { light: 'hsl(0, 0%, 9%)', dark: 'hsl(0, 0%, 98%)' };

/**
 * The app's primary colour (--primary, "H S% L%") as a colour Leaflet can paint: SVG
 * presentation attributes and leaflet-draw's guide dashes cannot read a CSS variable.
 */
export function resolvePrimaryColor(isDark: boolean): string {
  if (typeof document !== 'undefined') {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
    const match = /^(-?[\d.]+)(?:deg)?\s+([\d.]+)%\s+([\d.]+)%$/.exec(raw);
    if (match) return `hsl(${match[1]}, ${match[2]}%, ${match[3]}%)`;
  }
  return isDark ? PRIMARY_FALLBACK.dark : PRIMARY_FALLBACK.light;
}

/** Style of a drawn or preset region: the primary colour, 2 px outline, 8 % fill. */
export function regionShapeStyle(isDark: boolean): L.PathOptions {
  const color = resolvePrimaryColor(isDark);
  return { color, weight: REGION_SHAPE_WEIGHT, opacity: 1, fillColor: color, fillOpacity: REGION_SHAPE_FILL_OPACITY };
}

/** leaflet-draw edit mode: dash the region being edited but keep its colour (leaflet-draw
 *  would otherwise repaint it pink). */
const EDIT_OPTIONS = {
  edit: {
    selectedPathOptions: { dashArray: '6, 4', fill: true, fillOpacity: 0.14, maintainColor: true } as L.PathOptions,
  },
};

const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const collectLatLngs = (latlngs: any): L.LatLng[] => {
  const result: L.LatLng[] = [];
  const visit = (item: any) => {
    if (!item) return;
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (typeof item.lat === 'number' && typeof item.lng === 'number') {
      result.push(item as L.LatLng);
    }
  };

  visit(latlngs);
  return result;
};

/**
 * Bounds of a drawn polygon. Leaflet reports unwrapped longitudes when the user
 * draws across the antimeridian or on a world copy (177..184, 537..544,
 * -183..-176 are all the same rectangle), so the extent is measured in the
 * unwrapped frame and only then wrapped to [-180, 180]. A result whose west is
 * greater than its east crosses the antimeridian (RFC 7946 section 5.2), which
 * is the convention pointInBounds/boundsOverlap already use. Clamping each
 * endpoint separately turned those three rectangles into three different boxes,
 * one of them the empty 180..180.
 */
const wrapLongitude180 = (value: number) => {
  const wrapped = ((((value + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 && value > 0 ? 180 : wrapped;
};

const getPolygonBounds = (layer: L.Polygon): GeographicBounds => {
  const latlngs = collectLatLngs(layer.getLatLngs());
  if (latlngs.length === 0) {
    const bounds = layer.getBounds();
    return {
      minLatitude: clampValue(bounds.getSouth(), -90, 90),
      maxLatitude: clampValue(bounds.getNorth(), -90, 90),
      minLongitude: clampValue(bounds.getWest(), -180, 180),
      maxLongitude: clampValue(bounds.getEast(), -180, 180),
    };
  }

  const lats = latlngs.map((point) => point.lat);
  const lons = latlngs.map((point) => point.lng);
  const minLat = clampValue(Math.min(...lats), -90, 90);
  const maxLat = clampValue(Math.max(...lats), -90, 90);
  const minLonRaw = Math.min(...lons);
  const maxLonRaw = Math.max(...lons);

  if (maxLonRaw - minLonRaw >= 360) {
    return { minLatitude: minLat, maxLatitude: maxLat, minLongitude: -180, maxLongitude: 180 };
  }

  let minLongitude = wrapLongitude180(minLonRaw);
  let maxLongitude = wrapLongitude180(maxLonRaw);
  if (minLongitude === 180) minLongitude = -180;
  if (maxLongitude === -180 && minLongitude !== -180) maxLongitude = 180;

  return { minLatitude: minLat, maxLatitude: maxLat, minLongitude, maxLongitude };
};

// Memoized component for better performance
export const RegionSelectorMap = memo(function RegionSelectorMap({
  onRegionSelected,
  initialBounds = null,
  height = '400px'
}: RegionSelectorMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const featureGroupRef = useRef<L.FeatureGroup | null>(null);
  const [selectedBounds, setSelectedBounds] = useState<GeographicBounds | null>(initialBounds);
  const drawnPolygonRef = useRef<L.Layer | null>(null);
  const isDark = useIsDarkTheme();

  // Default marker icon from this origin (the cdnjs images the CSP blocks are not used).
  useEffect(() => { ensureLeafletDefaultIcon(); }, []);

  // Drawn and preset regions in the app's primary colour, following the site theme.
  const shapeStyle = useMemo(() => regionShapeStyle(isDark), [isDark]);
  useEffect(() => {
    const drawn = drawnPolygonRef.current;
    if (drawn instanceof L.Path) drawn.setStyle(shapeStyle);
  }, [shapeStyle]);

  // leaflet-draw options; a new object (theme change) makes EditControl rebuild its toolbar.
  const drawOptions = useMemo(() => ({
    polygon: { allowIntersection: false, shapeOptions: shapeStyle },
    rectangle: false as const,
    circle: false as const,
    circlemarker: false as const,
    marker: false as const,
    polyline: false as const,
  }), [shapeStyle]);

  // Memoized polygon creation handler
  const handlePolygonCreated = useCallback((e: any) => {
    const layer = e.layer as L.Polygon;

    // Remove previous polygon if exists (use ref to avoid stale closure)
    if (drawnPolygonRef.current && featureGroupRef.current) {
      featureGroupRef.current.removeLayer(drawnPolygonRef.current);
    }

    // Update ref
    drawnPolygonRef.current = layer;

    // Extract bounding box from polygon for API compatibility
    const geoBounds = getPolygonBounds(layer);

    setSelectedBounds(geoBounds);
    onRegionSelected(geoBounds);
  }, [onRegionSelected]);

  // Memoized polygon edit handler
  const handlePolygonEdited = useCallback((e: any) => {
    const layers = e.layers;
    layers.eachLayer((layer: L.Polygon) => {
      const geoBounds = getPolygonBounds(layer);

      setSelectedBounds(geoBounds);
      onRegionSelected(geoBounds);
    });
  }, [onRegionSelected]);

  // Memoized polygon deletion handler
  const handlePolygonDeleted = useCallback((e: any) => {
    const layers = e.layers;
    layers.eachLayer((layer: L.Layer) => {
      if (drawnPolygonRef.current === layer) {
        drawnPolygonRef.current = null;
        setSelectedBounds(null);
      }
    });
  }, []);

  // Memoized clear handler
  const handleClear = useCallback(() => {
    if (drawnPolygonRef.current && featureGroupRef.current) {
      featureGroupRef.current.removeLayer(drawnPolygonRef.current);
      drawnPolygonRef.current = null;
      setSelectedBounds(null);
    }
  }, []);

  // Set preset region
  const setPresetRegion = (region: string) => {
    // Clear existing polygon
    if (drawnPolygonRef.current && featureGroupRef.current) {
      featureGroupRef.current.removeLayer(drawnPolygonRef.current);
    }

    // Default to New Zealand (All)
    const preset = Object.prototype.hasOwnProperty.call(REGION_PRESETS, region)
      ? REGION_PRESETS[region] : REGION_PRESETS.nz;
    const geoBounds: GeographicBounds = { ...preset };
    // Draw in the map's continuous longitude frame so a box that crosses 180 (the
    // national preset) spans New Zealand instead of the rest of the globe.
    const { west, east } = unwrappedLongitudeRange(geoBounds);
    const bounds = L.latLngBounds(
      L.latLng(geoBounds.minLatitude, west),
      L.latLng(geoBounds.maxLatitude, east)
    );

    // Create rectangle for preset (keep as rectangle for presets)
    const rectangle = L.rectangle(bounds, shapeStyle);

    if (featureGroupRef.current) {
      featureGroupRef.current.addLayer(rectangle);
      drawnPolygonRef.current = rectangle;
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

  const crossesDateLine = selectedBounds !== null && selectedBounds.minLongitude > selectedBounds.maxLongitude;

  return (
    <div className="space-y-3">
      {/* Preset regions */}
      <div className="flex flex-wrap items-center gap-2">
        <Select onValueChange={setPresetRegion}>
          <SelectTrigger className="w-[200px]" aria-label="Preset region">
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

      {/* Selected bounds */}
      {selectedBounds && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-md border bg-muted/40 px-3 py-2 text-xs tabular-nums">
          <span className="font-medium text-foreground">Selected region</span>
          <span className="text-muted-foreground">
            Latitude: {formatCoord(selectedBounds.minLatitude, true)} to {formatCoord(selectedBounds.maxLatitude, true)}
          </span>
          <span className="text-muted-foreground">
            Longitude: {formatCoord(selectedBounds.minLongitude, false)} to {formatCoord(selectedBounds.maxLongitude, false)}
            {crossesDateLine && <span className="ml-1">(crosses date line)</span>}
          </span>
        </div>
      )}

      {/* Map */}
      <div style={{ height }} className={cn('relative isolate overflow-hidden rounded-md border', styles.map)}>
        <MapContainer
          key="region-selector-map"
          center={[-41, 174]}
          zoom={5}
          ref={mapRef}
          className="h-full w-full"
          {...MAP_ZOOM_OPTIONS}
          scrollWheelZoom={true}
        >
          <MapLayerControl position="topright" />
          <MapScaleBar />

          <FeatureGroup ref={featureGroupRef}>
            <EditControl
              position="topright"
              onCreated={handlePolygonCreated}
              onEdited={handlePolygonEdited}
              onDeleted={handlePolygonDeleted}
              draw={drawOptions}
              edit={EDIT_OPTIONS}
            />
          </FeatureGroup>
        </MapContainer>
      </div>

      <p className="text-xs text-muted-foreground">
        Draw a polygon with the tool at the top right of the map, or pick a preset; the search uses its bounding box.
      </p>
    </div>
  );
});
