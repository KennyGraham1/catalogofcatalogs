'use client';

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

interface StationMarkerProps {
  position: [number, number];
  stationCode: string;
  stationNetwork: string;
  stationName?: string;
  distance?: number | null;
  onClick?: () => void;
}

/**
 * Custom triangular marker for seismic stations
 * Renders stations as upward-pointing triangles to distinguish them from circular earthquake markers
 */
export function StationMarker({
  position,
  stationCode,
  stationNetwork,
  stationName,
  distance,
  onClick,
}: StationMarkerProps) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    // Create SVG triangle icon (red for stations)
    const triangleSvg = `
      <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M 12 4 L 20 20 L 4 20 Z"
          fill="#dc2626"
          stroke="#991b1b"
          stroke-width="2"
          opacity="0.9"
        />
      </svg>
    `;

    // Convert SVG to data URL
    const iconUrl = 'data:image/svg+xml;base64,' + btoa(triangleSvg);

    // Create custom icon
    const triangleIcon = L.icon({
      iconUrl,
      iconSize: [24, 24],
      iconAnchor: [12, 20], // Point at the bottom of the triangle
      popupAnchor: [0, -20],
    });

    // Create marker
    const marker = L.marker(position, { icon: triangleIcon });

    // Create popup content
    const popupContent = `
      <div style="padding: 8px; min-width: 200px;">
        <h4 style="font-weight: 600; margin-bottom: 4px;">${stationNetwork}.${stationCode}</h4>
        ${stationName ? `<p style="font-size: 0.875rem; color: #6b7280; margin-bottom: 4px;">${stationName}</p>` : ''}
        <p style="font-size: 0.75rem; margin-top: 4px;">
          Location: ${position[0].toFixed(4)}°, ${position[1].toFixed(4)}°
        </p>
        ${distance !== null && distance !== undefined ? `
          <p style="font-size: 0.75rem; margin-top: 4px;">
            Distance to selected event: ${distance.toFixed(1)} km
          </p>
        ` : ''}
      </div>
    `;

    marker.bindPopup(popupContent);

    // Add click handler
    if (onClick) {
      marker.on('click', onClick);
    }

    // Add to map
    marker.addTo(map);

    // Cleanup
    return () => {
      map.removeLayer(marker);
    };
  }, [map, position, stationCode, stationNetwork, stationName, distance, onClick]);

  return null;
}

