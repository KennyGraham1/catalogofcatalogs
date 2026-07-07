'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BASE_LAYERS, getDefaultBaseLayer } from '@/hooks/use-map-theme';

interface EventData {
  id?: string;
  time: string;
  latitude: number;
  longitude: number;
  depth?: number | null;
  magnitude: number;
  source: string;
  catalogueId: string;
  catalogueName: string;
}

interface DuplicateGroup {
  id: string;
  events: EventData[];
  selectedEventIndex: number;
  isSuspicious: boolean;
  validationWarnings: string[];
}

interface DuplicateGroupMapProps {
  group: DuplicateGroup;
  catalogueColors: Record<string, string>;
  height?: string;
}

export function DuplicateGroupMap({ group, catalogueColors, height = '400px' }: DuplicateGroupMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const layerControlRef = useRef<L.Control.Layers | null>(null);
  const baseLayersRef = useRef<Record<string, L.TileLayer>>({});
  const activeBaseLayerRef = useRef<L.TileLayer | null>(null);
  const overlayLayerRef = useRef<L.LayerGroup | null>(null);
  const [isDark, setIsDark] = useState(false);

  // Guard against empty events array
  const hasEvents = group.events && group.events.length > 0;

  // Check for dark mode
  useEffect(() => {
    const checkDarkMode = () => {
      const isDarkMode = document.documentElement.classList.contains('dark');
      setIsDark(isDarkMode);
    };

    checkDarkMode();

    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  // Initialize the map ONCE (mount) and destroy it only on unmount. Previously this whole
  // effect depended on [group, catalogueColors, isDark, hasEvents] and its cleanup called
  // map.remove() on every change, so a dark-mode toggle or prop change tore down and rebuilt
  // the entire Leaflet map — losing zoom/pan/layer selection and flashing tiles.
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current || !hasEvents) return;

    const map = L.map(mapContainerRef.current, {
      center: [group.events[0].latitude, group.events[0].longitude],
      zoom: 8,
      zoomControl: true,
    });
    mapRef.current = map;

    // Create base layers + layer control once.
    const baseLayers: Record<string, L.TileLayer> = {};
    const defaultLayerName = getDefaultBaseLayer(isDark);
    BASE_LAYERS.forEach((layer) => {
      const tileLayer = L.tileLayer(layer.url, {
        attribution: layer.attribution,
        maxZoom: layer.maxZoom || 19,
      });
      baseLayers[layer.name] = tileLayer;
      if (layer.name === defaultLayerName) {
        tileLayer.addTo(map);
        activeBaseLayerRef.current = tileLayer;
      }
    });
    baseLayersRef.current = baseLayers;

    layerControlRef.current = L.control.layers(baseLayers, {}, { position: 'topright' });
    layerControlRef.current.addTo(map);

    // Markers/polylines live in a dedicated overlay group so they can be swapped without
    // touching the base layers.
    overlayLayerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      layerControlRef.current = null;
      overlayLayerRef.current = null;
      activeBaseLayerRef.current = null;
      baseLayersRef.current = {};
    };
    // Mount/unmount only — subsequent prop/theme changes are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasEvents]);

  // Swap the active base tile layer on theme change instead of recreating the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const targetName = getDefaultBaseLayer(isDark);
    const target = baseLayersRef.current[targetName];
    if (!target || target === activeBaseLayerRef.current) return;
    if (activeBaseLayerRef.current) map.removeLayer(activeBaseLayerRef.current);
    target.addTo(map);
    activeBaseLayerRef.current = target;
  }, [isDark]);

  // Update markers/polylines when the group or colours change; the map itself is reused.
  useEffect(() => {
    const map = mapRef.current;
    const overlay = overlayLayerRef.current;
    if (!map || !overlay || !hasEvents) return;

    // Clear previously drawn markers/polylines (base layers untouched).
    overlay.clearLayers();

    // Add markers for each event
    const markers: L.Marker[] = [];
    group.events.forEach((event, idx) => {
      const isSelected = idx === group.selectedEventIndex;
      const color = catalogueColors[event.catalogueId] || '#6b7280';

      // Create custom icon
      const iconHtml = `
        <div style="
          background-color: ${color};
          width: ${isSelected ? '24px' : '16px'};
          height: ${isSelected ? '24px' : '16px'};
          border-radius: 50%;
          border: ${isSelected ? '3px solid #fff' : '2px solid #fff'};
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: ${isSelected ? '12px' : '10px'};
          font-weight: bold;
        ">
          ${idx + 1}
        </div>
      `;

      const icon = L.divIcon({
        html: iconHtml,
        className: 'custom-marker',
        iconSize: [isSelected ? 24 : 16, isSelected ? 24 : 16],
        iconAnchor: [isSelected ? 12 : 8, isSelected ? 12 : 8],
      });

      const marker = L.marker([event.latitude, event.longitude], { icon })
        .bindPopup(`
          <div style="min-width: 200px;">
            <div style="font-weight: bold; margin-bottom: 4px; color: ${color};">
              ${event.catalogueName}
            </div>
            <div style="font-size: 12px;">
              <div><strong>Time:</strong> ${new Date(event.time).toLocaleString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}</div>
              <div><strong>Magnitude:</strong> ${event.magnitude.toFixed(2)}</div>
              <div><strong>Depth:</strong> ${event.depth != null ? event.depth.toFixed(1) + ' km' : 'N/A'}</div>
              <div><strong>Location:</strong> ${event.latitude.toFixed(4)}, ${event.longitude.toFixed(4)}</div>
              ${isSelected ? '<div style="color: green; font-weight: bold; margin-top: 4px;">✓ Selected Event</div>' : ''}
            </div>
          </div>
        `);
      overlay.addLayer(marker);

      markers.push(marker);
    });

    // Draw lines connecting events
    if (group.events.length > 1) {
      const referenceEvent = group.events[0];
      group.events.slice(1).forEach((event) => {
        overlay.addLayer(
          L.polyline(
            [
              [referenceEvent.latitude, referenceEvent.longitude],
              [event.latitude, event.longitude],
            ],
            {
              color: '#666',
              weight: 1,
              opacity: 0.5,
              dashArray: '5, 5',
            }
          )
        );
      });
    }

    // Fit bounds to show all events
    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers.map(m => m.getLatLng()));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [group, catalogueColors, hasEvents]);

  // Fallback UI for empty groups
  if (!hasEvents) {
    return (
      <div
        style={{
          height,
          width: '100%',
          borderRadius: '8px',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--muted)',
          color: 'var(--muted-foreground)',
        }}
      >
        <span>No events to display</span>
      </div>
    );
  }

  return (
    <div
      ref={mapContainerRef}
      style={{ height, width: '100%', borderRadius: '8px', overflow: 'hidden' }}
    />
  );
}
