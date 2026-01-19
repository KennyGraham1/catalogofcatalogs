/**
 * Hook for managing map theme (light/dark mode)
 * Provides appropriate tile layer URLs and styles for different themes
 */

import { useEffect, useState } from 'react';

export interface MapThemeConfig {
  tileLayerUrl: string;
  attribution: string;
  isDark: boolean;
}

/**
 * Base layer configuration for map layer control
 */
export interface BaseLayerConfig {
  name: string;
  url: string;
  attribution: string;
  maxZoom?: number;
}

/**
 * All available base layers for the layer control
 */
export const BASE_LAYERS: BaseLayerConfig[] = [
  {
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  {
    name: 'Satellite (Esri)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 19,
  },
  {
    name: 'CartoDB Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20,
  },
  {
    name: 'CartoDB Positron',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20,
  },
  {
    name: 'Terrain (OpenTopoMap)',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    maxZoom: 17,
  },
];

/**
 * Get the default base layer name based on dark mode
 */
export function getDefaultBaseLayer(isDark: boolean): string {
  return isDark ? 'CartoDB Dark' : 'OpenStreetMap';
}

/**
 * Hook to get map theme configuration based on current theme
 */
export function useMapTheme(): MapThemeConfig {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check if dark mode is enabled
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

  // Return appropriate tile layer based on theme
  if (isDark) {
    // CartoDB Dark Matter - excellent for dark mode
    return {
      tileLayerUrl: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      isDark: true,
    };
  } else {
    // OpenStreetMap - standard light mode
    return {
      tileLayerUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      isDark: false,
    };
  }
}

/**
 * Get color adjustments for map elements based on theme
 */
export function useMapColors() {
  const { isDark } = useMapTheme();

  return {
    isDark,

    // Consistent opacity for depth-gradient visualization
    markerOpacity: 0.75,
    lineOpacity: isDark ? 0.8 : 0.6,
    
    // Fault line colors (adjusted for dark mode)
    faultColors: {
      alpine: isDark ? '#FF6B6B' : '#FF0000',
      subduction: isDark ? '#C92A2A' : '#8B0000',
      wellington: isDark ? '#FF8C42' : '#FF4500',
    },
    
    // Station marker colors
    stationColor: isDark ? '#4DABF7' : '#1E88E5',
    
    // Uncertainty ellipse color
    uncertaintyColor: isDark ? '#FFA94D' : '#FF9800',
  };
}

