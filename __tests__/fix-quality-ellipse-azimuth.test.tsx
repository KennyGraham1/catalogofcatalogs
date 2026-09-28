/**
 * #89: an OriginUncertainty ellipse reported without its azimuth is not drawn with an
 * invented N-S orientation, and the map tooltip does not deny that an agency ellipse is a
 * confidence region.
 */

import { render } from '@testing-library/react';
import { useMap } from 'react-leaflet';
import { parseQuakeMLEvent } from '@/lib/quakeml-parser';
import { quakemlEventToDbFields } from '@/lib/quakeml-to-db';
import { calculateUncertaintyEllipse, type UncertaintyEllipse as Ellipse } from '@/lib/uncertainty-utils';
import { UncertaintyEllipse } from '@/components/advanced-viz/UncertaintyEllipse';

jest.mock('react-leaflet', () => ({ useMap: jest.fn() }));

const originXml = (uncertainty: string) =>
  `<event publicID="smi:test/event/89"><preferredOriginID>smi:test/origin/89</preferredOriginID><origin publicID="smi:test/origin/89">` +
  `<time><value>2020-01-01T00:00:00Z</value></time><latitude><value>-41</value></latitude><longitude><value>174</value></longitude>` +
  `<depth><value>10000</value></depth><originUncertainty>${uncertainty}</originUncertainty></origin></event>`;
const stored = (uncertainty: string): any => {
  const fields = quakemlEventToDbFields(parseQuakeMLEvent(originXml(uncertainty))!);
  return { latitude: -41, longitude: 174, ...fields };
};
const axesOnly = '<minHorizontalUncertainty>2000</minHorizontalUncertainty><maxHorizontalUncertainty>8000</maxHorizontalUncertainty><confidenceLevel>90</confidenceLevel>';

// Draw through the real component and real Leaflet onto a map stub that records the layer.
const draw = (ellipse: Ellipse) => {
  const layers: any[] = [];
  const map: any = { addLayer: (layer: any) => { layers.push(layer); return map; }, removeLayer: jest.fn() };
  (useMap as jest.Mock).mockReturnValue(map);
  render(<UncertaintyEllipse ellipse={ellipse} eventId="e89" />);
  const layer = layers[0];
  return { tooltip: String(layer.getTooltip().getContent()), vertices: layer.getLatLngs()[0] as Array<{ lat: number; lng: number }> };
};
// Great-circle range (m) from the centre, on the renderer's sphere.
const range = (lat: number, lng: number) => {
  const r = Math.PI / 180, a = Math.sin((lat + 41) * r / 2) ** 2 + Math.cos(-41 * r) * Math.cos(lat * r) * Math.sin((lng - 174) * r / 2) ** 2;
  return 2 * 6371000 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

describe('#89 an ellipse without an azimuth has no invented orientation', () => {
  it('is drawn as a circle of the semi-major axis and labelled as such', () => {
    const fields = stored(axesOnly);
    expect([fields.min_horizontal_uncertainty, fields.max_horizontal_uncertainty, fields.azimuth_max_horizontal_uncertainty]).toEqual([2, 8, undefined]);
    const ellipse = calculateUncertaintyEllipse(fields)!;
    expect(ellipse).toMatchObject({ source: 'origin-uncertainty', semiMajorAxis: 8000, semiMinorAxis: 8000, orientationKnown: false, reportedSemiMinorAxis: 2000 });
    const { tooltip, vertices } = draw(ellipse);
    for (const v of vertices) expect(range(v.lat, v.lng)).toBeCloseTo(8000, 0);
    expect(tooltip).toContain('8.0 × 2.0 km, azimuth not reported');
    expect(tooltip).toContain('orientation is unknown');
  });

  it('a reported azimuth of 0 still draws the major axis N-S', () => {
    const ellipse = calculateUncertaintyEllipse(stored(`${axesOnly}<azimuthMaxHorizontalUncertainty>0</azimuthMaxHorizontalUncertainty>`))!;
    expect(ellipse).toMatchObject({ semiMajorAxis: 8000, semiMinorAxis: 2000, rotation: 90, orientationKnown: true });
  });

  it('the tooltip calls an agency ellipse a confidence region, and keeps the caveat for marginals', () => {
    // axesOnly's XML carries a real <confidenceLevel>90</confidenceLevel> (quakeml-to-db.ts
    // maps it to confidence_level), and per C16/F2 describeUncertaintyEllipse now shows an
    // agency-reported ellipse's own stated level ("90% confidence ellipse") instead of the
    // generic "not recorded here" placeholder — still never denying it is a confidence region.
    const agency = draw(calculateUncertaintyEllipse(stored(`${axesOnly}<azimuthMaxHorizontalUncertainty>35</azimuthMaxHorizontalUncertainty>`))!).tooltip;
    expect(agency).not.toContain('Not a 68%/95% confidence region');
    expect(agency).toContain('90% confidence ellipse');
    // A circle with no recorded confidenceLevel still gets the honest generic wording.
    const circle = draw(calculateUncertaintyEllipse({ latitude: -41, longitude: 174, horizontal_uncertainty: 5 })!).tooltip;
    expect(circle).not.toContain('Not a 68%/95% confidence region');
    expect(circle).toContain('Confidence region at the level the agency states (not recorded here)');
    const marginals = draw(calculateUncertaintyEllipse({ latitude: -41, longitude: 174, latitude_uncertainty: 0.02, longitude_uncertainty: 0.01 })!).tooltip;
    expect(marginals).toContain('Not a 68%/95% confidence region');
  });
});
