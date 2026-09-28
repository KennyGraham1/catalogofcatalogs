'use client';

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  UncertaintyEllipse as UncertaintyEllipseType,
  createUncertaintyEllipseOptions,
  describeUncertaintyEllipse,
  generateEllipsePoints,
} from '@/lib/uncertainty-utils';

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

    // Tooltip states what was reported and what is drawn: an agency ellipse is a
    // confidence region at the agency's (unrecorded) level, only the lat/lon-marginal
    // construction is an uncalibrated extent (see describeUncertaintyEllipse).
    leafletEllipse.bindTooltip(describeUncertaintyEllipse(ellipse), { permanent: false, direction: 'top' });

    // Add to map
    leafletEllipse.addTo(map);

    // Cleanup
    return () => {
      map.removeLayer(leafletEllipse);
    };
  }, [map, ellipse, eventId]);

  return null;
}
