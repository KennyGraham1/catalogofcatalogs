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
  const [isDark, setIsDark] = useState(false);

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

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize map
    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        center: [group.events[0].latitude, group.events[0].longitude],
        zoom: 8,
        zoomControl: true,
      });

      // Create base layer map for layer control
      const baseLayers: Record<string, L.TileLayer> = {};
      const defaultLayerName = getDefaultBaseLayer(isDark);

      BASE_LAYERS.forEach((layer) => {
        const tileLayer = L.tileLayer(layer.url, {
          attribution: layer.attribution,
          maxZoom: layer.maxZoom || 19,
        });
        baseLayers[layer.name] = tileLayer;

        // Add the default layer to the map
        if (layer.name === defaultLayerName) {
          tileLayer.addTo(mapRef.current!);
        }
      });

      // Add layer control
      layerControlRef.current = L.control.layers(baseLayers, {}, { position: 'topright' });
      layerControlRef.current.addTo(mapRef.current);
    }

    const map = mapRef.current;

    // Clear existing layers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        map.removeLayer(layer);
      }
    });

    // Add markers for each event
    const markers: L.Marker[] = [];
    group.events.forEach((event, idx) => {
      const isSelected = idx === group.selectedEventIndex;
      const color = catalogueColors[event.catalogueId] || '#gray';

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
              <div><strong>Time:</strong> ${new Date(event.time).toISOString().substring(0, 19).replace('T', ' ')}</div>
              <div><strong>Magnitude:</strong> ${event.magnitude.toFixed(2)}</div>
              <div><strong>Depth:</strong> ${event.depth != null ? event.depth.toFixed(1) + ' km' : 'N/A'}</div>
              <div><strong>Location:</strong> ${event.latitude.toFixed(4)}, ${event.longitude.toFixed(4)}</div>
              ${isSelected ? '<div style="color: green; font-weight: bold; margin-top: 4px;">✓ Selected Event</div>' : ''}
            </div>
          </div>
        `)
        .addTo(map);

      markers.push(marker);
    });

    // Draw lines connecting events
    if (group.events.length > 1) {
      const referenceEvent = group.events[0];
      group.events.slice(1).forEach((event) => {
        const line = L.polyline(
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
        ).addTo(map);
      });
    }

    // Fit bounds to show all events
    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers.map(m => m.getLatLng()));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }

    return () => {
      // Cleanup on unmount
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerControlRef.current = null;
      }
    };
  }, [group, catalogueColors, isDark]);

  return (
    <div 
      ref={mapContainerRef} 
      style={{ height, width: '100%', borderRadius: '8px', overflow: 'hidden' }}
    />
  );
}

