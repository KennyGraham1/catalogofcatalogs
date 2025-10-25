'use client';

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { FocalMechanism, generateBeachBallDataURL } from '@/lib/focal-mechanism-utils';

interface BeachBallMarkerProps {
  position: [number, number];
  mechanism: FocalMechanism;
  eventId: string | number;
  size?: number;
  onClick?: () => void;
}

/**
 * Component to render focal mechanism beach ball on Leaflet map
 */
export function BeachBallMarker({ 
  position, 
  mechanism, 
  eventId, 
  size = 40,
  onClick 
}: BeachBallMarkerProps) {
  const map = useMap();

  useEffect(() => {
    if (!map || !mechanism || !mechanism.nodalPlane1) return;

    // Generate beach ball icon
    const iconUrl = generateBeachBallDataURL(mechanism, size);
    
    const beachBallIcon = L.icon({
      iconUrl,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2],
    });

    // Create marker
    const marker = L.marker(position, { icon: beachBallIcon });

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
  }, [map, position, mechanism, eventId, size, onClick]);

  return null;
}

