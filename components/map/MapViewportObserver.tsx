'use client';

import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';
import { useMapViewport } from '@/hooks/use-map-viewport';
import type { MapViewport } from '@/lib/map-event-selection';

export function MapViewportObserver({ onChange }: { onChange: (viewport: MapViewport) => void }) {
  const map = useMap();
  const { bounds } = useMapViewport({ paddingFactor: 1 });
  const [size, setSize] = useState({ width: 800, height: 600 });
  useEffect(() => {
    const update = () => {
      const next = map.getSize();
      setSize(previous => previous.width === next.x && previous.height === next.y ? previous : { width: next.x, height: next.y });
    };
    update();
    map.on('resize', update);
    return () => { map.off('resize', update); };
  }, [map]);
  useEffect(() => { if (bounds) onChange({ bounds, ...size }); }, [bounds, size, onChange]);
  return null;
}
