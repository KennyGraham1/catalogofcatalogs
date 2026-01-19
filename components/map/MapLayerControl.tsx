'use client';

import { useEffect, useState } from 'react';
import { LayersControl, TileLayer, useMap } from 'react-leaflet';
import { BASE_LAYERS, getDefaultBaseLayer } from '@/hooks/use-map-theme';

const { BaseLayer } = LayersControl;

interface MapLayerControlProps {
  position?: 'topleft' | 'topright' | 'bottomleft' | 'bottomright';
}

/**
 * Component that syncs the map base layer with the system theme
 * Changes to the appropriate layer when dark/light mode changes
 */
function ThemeLayerSync() {
  const map = useMap();
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const checkDarkMode = () => {
      const isDarkMode = document.documentElement.classList.contains('dark');
      setCurrentTheme(isDarkMode ? 'dark' : 'light');
    };

    // Initial check
    checkDarkMode();

    // Watch for theme changes
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  // When theme changes, we could auto-switch layers, but for now
  // we'll just let the user choose. The default layer is set based on
  // the initial theme when the component mounts.

  return null;
}

/**
 * Map Layer Control component that provides multiple base layer options
 *
 * Usage:
 * ```tsx
 * <MapContainer ...>
 *   <MapLayerControl position="topright" />
 *   {/* other map content *\/}
 * </MapContainer>
 * ```
 */
export function MapLayerControl({ position = 'topright' }: MapLayerControlProps) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkDarkMode = () => {
      const isDarkMode = document.documentElement.classList.contains('dark');
      setIsDark(isDarkMode);
    };

    // Initial check
    checkDarkMode();

    // Watch for theme changes
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  const defaultLayerName = getDefaultBaseLayer(isDark);

  return (
    <>
      <ThemeLayerSync />
      <LayersControl position={position}>
        {BASE_LAYERS.map((layer) => (
          <BaseLayer
            key={layer.name}
            checked={layer.name === defaultLayerName}
            name={layer.name}
          >
            <TileLayer
              url={layer.url}
              attribution={layer.attribution}
              maxZoom={layer.maxZoom}
            />
          </BaseLayer>
        ))}
      </LayersControl>
    </>
  );
}

export default MapLayerControl;
