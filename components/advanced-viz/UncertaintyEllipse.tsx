'use client';

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { UncertaintyEllipse as UncertaintyEllipseType, createUncertaintyEllipseOptions } from '@/lib/uncertainty-utils';

interface UncertaintyEllipseProps {
  ellipse: UncertaintyEllipseType;
  eventId: string | number;
}

/**
 * Component to render uncertainty ellipse on Leaflet map
 */
export function UncertaintyEllipse({ ellipse, eventId }: UncertaintyEllipseProps) {
  const map = useMap();

  useEffect(() => {
    if (!map || !ellipse) return;

    const options = createUncertaintyEllipseOptions(ellipse);

    // Create ellipse as a polygon since L.ellipse is not in base Leaflet
    const points = generateEllipsePoints(
      ellipse.center,
      ellipse.semiMajorAxis,
      ellipse.semiMinorAxis,
      ellipse.rotation
    );

    const leafletEllipse = L.polygon(points, options);

    // Add tooltip
    leafletEllipse.bindTooltip(
      `Uncertainty Ellipse<br/>Confidence: ${(ellipse.confidence * 100).toFixed(0)}%`,
      { permanent: false, direction: 'top' }
    );

    // Add to map
    leafletEllipse.addTo(map);

    // Cleanup
    return () => {
      map.removeLayer(leafletEllipse);
    };
  }, [map, ellipse, eventId]);

  return null;
}

/**
 * Generate points for an ellipse polygon
 */
function generateEllipsePoints(
  center: [number, number],
  semiMajorAxis: number,
  semiMinorAxis: number,
  rotation: number,
  numPoints: number = 64
): [number, number][] {
  const points: [number, number][] = [];
  const [centerLat, centerLon] = center;
  const rotationRad = (rotation * Math.PI) / 180;

  // Earth's radius in meters
  const R = 6371000;

  for (let i = 0; i < numPoints; i++) {
    const angle = (i * 2 * Math.PI) / numPoints;

    // Calculate point on ellipse in local coordinates
    const x = semiMajorAxis * Math.cos(angle);
    const y = semiMinorAxis * Math.sin(angle);

    // Rotate the point
    const xRotated = x * Math.cos(rotationRad) - y * Math.sin(rotationRad);
    const yRotated = x * Math.sin(rotationRad) + y * Math.cos(rotationRad);

    // Convert meters to degrees (approximate)
    const latOffset = (yRotated / R) * (180 / Math.PI);
    const lonOffset = (xRotated / R) * (180 / Math.PI) / Math.cos(centerLat * Math.PI / 180);

    points.push([centerLat + latOffset, centerLon + lonOffset]);
  }

  return points;
}
