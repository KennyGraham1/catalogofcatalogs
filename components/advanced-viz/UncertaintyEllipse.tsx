'use client';

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  UncertaintyEllipse as UncertaintyEllipseType,
  createUncertaintyEllipseOptions,
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

    // Tooltip states what is actually drawn. The shape is the reported
    // uncertainty extent, NOT a 68%/95% confidence region: scaling a bivariate
    // normal to probability p needs both semi-axes multiplied by
    // k = sqrt(-2 ln(1 - p)) (k = 1.515 for 68%, 2.448 for 95%), which is not
    // done here. The colour encodes the azimuthal gap, not a confidence level.
    const axes = `${(ellipse.semiMajorAxis / 1000).toFixed(1)} × ${(ellipse.semiMinorAxis / 1000).toFixed(1)} km`;
    const provenance =
      ellipse.source === 'origin-uncertainty'
        ? 'QuakeML OriginUncertainty horizontal error ellipse'
        : 'Approximate: axis-aligned from independent lat/lon uncertainties (no covariance)';
    leafletEllipse.bindTooltip(
      `Location uncertainty extent<br/>Semi-axes: ${axes}<br/>${provenance}<br/><em>Not a 68%/95% confidence region</em>`,
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
