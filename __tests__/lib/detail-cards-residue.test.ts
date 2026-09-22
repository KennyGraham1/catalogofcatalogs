/** @jest-environment node */

// Scientific detail-card behaviour: uncertainty,
// focal mechanisms and station coverage.

import { parseQuakeMLEvent } from '@/lib/quakeml-parser';
import { quakemlEventToDbFields } from '@/lib/quakeml-to-db';
import { eventToQuakeML } from '@/lib/quakeml-exporter';
import { parseCSV } from '@/lib/parsers';
import {
  calculateUncertaintyEllipse, calculateLocationQuality, generateEllipsePoints, horizontalUncertaintyKm,
} from '@/lib/uncertainty-utils';
import {
  parseFocalMechanism, computeBeachball, formatFocalMechanism, selectPlane,
} from '@/lib/focal-mechanism-utils';
import { parseStationData, calculateStationDistributionRatio, calculateDistance } from '@/lib/station-coverage-utils';

const originXml = (uncertainty: string) =>
  `<event publicID="smi:test/event/11"><preferredOriginID>smi:test/origin/11</preferredOriginID><origin publicID="smi:test/origin/11">` +
  `<time><value>2020-01-01T00:00:00Z</value></time><latitude><value>-41.3</value></latitude><longitude><value>174.8</value></longitude>` +
  `<depth><value>10000</value></depth><originUncertainty>${uncertainty}</originUncertainty></origin></event>`;

describe('location uncertainty is carried and presented', () => {
  it('the agency error ellipse survives storage and export', () => {
    const parsed = parseQuakeMLEvent(originXml(
      '<minHorizontalUncertainty>1100</minHorizontalUncertainty><maxHorizontalUncertainty>4200</maxHorizontalUncertainty><azimuthMaxHorizontalUncertainty>35</azimuthMaxHorizontalUncertainty>'
    ))!;
    const fields: any = { latitude: -41.3, longitude: 174.8, ...quakemlEventToDbFields(parsed) };
    expect([fields.min_horizontal_uncertainty, fields.max_horizontal_uncertainty, fields.azimuth_max_horizontal_uncertainty]).toEqual([1.1, 4.2, 35]);
    const ellipse = calculateUncertaintyEllipse(fields)!;
    expect([ellipse.semiMajorAxis, ellipse.semiMinorAxis, ellipse.rotation, ellipse.source]).toEqual([4200, 1100, 55, 'origin-uncertainty']);
    const xml = eventToQuakeML({ ...fields, id: 'e', catalogue_id: 'c', source_id: 'e', time: '2020-01-01T00:00:00Z', depth: 10, magnitude: 3 });
    expect(xml).toContain('<maxHorizontalUncertainty>4200</maxHorizontalUncertainty>');
    expect(xml).toContain('<azimuthMaxHorizontalUncertainty>35</azimuthMaxHorizontalUncertainty>');
  });

  it('a stored circular horizontal uncertainty is scored, drawn and labelled', () => {
    const parsed = parseQuakeMLEvent(originXml('<horizontalUncertainty>20000</horizontalUncertainty>'))!;
    const fields: any = { latitude: -41.3, longitude: 174.8, ...quakemlEventToDbFields(parsed) };
    expect(fields.horizontal_uncertainty).toBe(20);
    expect(horizontalUncertaintyKm(fields)).toEqual({ km: 20, source: 'horizontal-circle' });
    const quality = calculateLocationQuality(fields);
    expect(quality.score).not.toBeNull();
    expect(quality.factors.horizontalUncertainty).toBe(0); // 20 km is beyond the 11 km floor
    const ellipse = calculateUncertaintyEllipse(fields)!;
    expect([ellipse.semiMajorAxis, ellipse.semiMinorAxis, ellipse.source]).toEqual([20000, 20000, 'horizontal-circle']);
  });

  it('ellipse vertices never leave the WGS84 latitude domain', () => {
    const polar = calculateUncertaintyEllipse({ latitude: 83, longitude: 0, latitude_uncertainty: 8, longitude_uncertainty: 1 })!;
    const points = generateEllipsePoints(polar.center, polar.semiMajorAxis, polar.semiMinorAxis, polar.rotation);
    expect(points.every(([lat]) => lat >= -90 && lat <= 90)).toBe(true);
    // Ordinary antimeridian ellipse stays locally continuous for Leaflet.
    const crossing = generateEllipsePoints([0, 179.99], 10000, 1000, 0);
    const jump = Math.max(...crossing.map((p, i) => Math.abs(p[1] - crossing[(i + 1) % crossing.length][1])));
    expect(jump).toBeLessThan(1);
  });
});

describe('focal mechanisms are reported, not invented', () => {
  const csvEvent = (extras: Record<string, unknown>) => {
    const base = { time: '2003-08-21T12:12:47Z', latitude: -45.1929, longitude: 166.83, depth: 24, magnitude: 7.1 };
    const row = { ...base, ...extras };
    const result = parseCSV([Object.keys(row).join(','), Object.values(row).join(',')].join('\n'), ',');
    expect(result.success).toBe(true);
    return result.events[0];
  };
  const firstFM = (event: any) => JSON.parse(String(event.focal_mechanisms))[0];

  it('principal-axis lengths take the same unit scale as the tensor', () => {
    const fm = firstFM(csvEvent({ id: 'diag', Mo: 2e20, Mxx: -2, Mxy: 0, Mxz: 0, Myy: 0, Myz: 0, Mzz: 2, Tva: 2, Tpl: 90, Taz: 0, Nva: 0, Npl: 0, Naz: 90, Pva: -2, Ppl: 0, Paz: 0 }));
    expect(fm.momentTensor.tensor.Mrr.value).toBe(2e13);
    expect(fm.principalAxes.tAxis.length.value).toBe(2e13);
    expect(fm.principalAxes.pAxis.length.value).toBe(-2e13);
  });

  it('no stated preference means no preferred plane', () => {
    const neutral = parseFocalMechanism(JSON.stringify([{ nodalPlanes: { nodalPlane1: { strike: { value: 0 }, dip: { value: 90 }, rake: { value: 0 } }, nodalPlane2: { strike: { value: 90 }, dip: { value: 90 }, rake: { value: 180 } } } }]))!;
    expect(neutral.preferredPlane).toBeUndefined();
    expect(formatFocalMechanism(neutral).preferred).toBe('Not stated');
    const stated = parseFocalMechanism(JSON.stringify([{ nodalPlanes: { preferredPlane: 2, nodalPlane1: { strike: { value: 0 }, dip: { value: 90 }, rake: { value: 0 } }, nodalPlane2: { strike: { value: 90 }, dip: { value: 90 }, rake: { value: 180 } } } }]))!;
    expect(stated.preferredPlane).toBe(2);
    // the description follows the preferred plane's rake.
    expect(formatFocalMechanism(stated).faultType).toBe('Right-lateral strike-slip');
  });

  it('a plane-2-only mechanism is usable from QuakeML and from flat CSV columns', () => {
    const fromQuakeml = parseFocalMechanism(JSON.stringify([{ nodalPlanes: { preferredPlane: 2, nodalPlane2: { strike: { value: 120 }, dip: { value: 30 }, rake: { value: 90 } } } }]))!;
    expect(selectPlane(fromQuakeml)).toEqual({ strike: 120, dip: 30, rake: 90 });
    expect(computeBeachball(fromQuakeml)).not.toBeNull();
    const flat = firstFM(csvEvent({ strike2: 120, dip2: 30, rake2: 90 }));
    expect(flat.nodalPlanes.nodalPlane2).toEqual({ strike: { value: 120 }, dip: { value: 30 }, rake: { value: 90 } });
    expect(flat.nodalPlanes.nodalPlane1).toBeUndefined();
  });

  it('missing angles stay missing and yield no geometry or classification', () => {
    const partial = parseFocalMechanism(csvEvent({ strike1: 120 }).focal_mechanisms)!;
    expect(partial.nodalPlane1).toEqual({ strike: 120, dip: null, rake: null });
    expect(computeBeachball(partial)).toBeNull();
    expect(formatFocalMechanism(partial)).toMatchObject({ faultType: 'Unknown', plane1: 'Strike: 120°, Dip: —, Rake: —' });
    // A partial plane is not exported as a BED NodalPlane with invented zeros.
    const xml = eventToQuakeML({ id: 'e', catalogue_id: 'c', source_id: 'e', time: '2020-01-01T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude: 3, focal_mechanisms: csvEvent({ strike1: 120 }).focal_mechanisms } as any);
    expect(xml).not.toContain('<nodalPlane1>');
  });
});

describe('station coverage describes stations, not phases', () => {
  type Arrival = { station: number; phase: string; azimuth: number; distance: number };
  const document = (arrivals: Arrival[], quality = '') => {
    const picks = arrivals.map((a, i) => `<pick publicID="smi:test/p${i}"><time><value>2020-01-01T00:00:01Z</value></time><waveformID networkCode="NZ" stationCode="S${a.station}" channelCode="HHZ"/><phaseHint>${a.phase}</phaseHint></pick>`).join('');
    const arr = arrivals.map((a, i) => `<arrival publicID="smi:test/a${i}"><pickID>smi:test/p${i}</pickID><phase>${a.phase}</phase><azimuth>${a.azimuth}</azimuth><distance>${a.distance}</distance></arrival>`).join('');
    return `<event publicID="smi:test/e13">${picks}<origin publicID="smi:test/o13">${arr}<time><value>2020-01-01T00:00:00Z</value></time><longitude><value>174</value></longitude><latitude><value>-41</value></latitude><depth><value>10000</value></depth>${quality}</origin><preferredOriginID>smi:test/o13</preferredOriginID></event>`;
  };
  const mapped = (xml: string): any => ({ latitude: -41, longitude: 174, ...quakemlEventToDbFields(parseQuakeMLEvent(xml)!) });

  it('stored origin quality outranks a partial phase list, and stands alone without one', () => {
    const quality = '<quality><usedStationCount>12</usedStationCount><azimuthalGap>30</azimuthalGap></quality>';
    const row = mapped(document([{ station: 0, phase: 'P', azimuth: 0, distance: 1 }, { station: 1, phase: 'P', azimuth: 90, distance: 1 }], quality));
    const withStored = parseStationData(row.picks, row.arrivals, -41, 174, { usedStationCount: row.used_station_count, azimuthalGap: row.azimuthal_gap })!;
    expect([withStored.stationCount, withStored.azimuthalGap, withStored.coverageQuality]).toEqual([12, 30, 'excellent']);
    const qualityOnly = parseStationData(undefined, undefined, -41, 174, { usedStationCount: 12, azimuthalGap: 30 })!;
    expect([qualityOnly.stationCount, qualityOnly.azimuthalGap, qualityOnly.azimuths]).toEqual([12, 30, []]);
    expect(parseStationData(null, null, -41, 174)).toBeNull();
  });

  it('a station with P and S arrivals counts once for distribution and distance', () => {
    const pOnly: Arrival[] = Array.from({ length: 12 }, (_, s) => ({ station: s, phase: 'P', azimuth: s * 30, distance: 1 }));
    const both = pOnly.flatMap((a) => [a, { ...a, phase: 'S' }]);
    const p = mapped(document(pOnly)); const ps = mapped(document(both));
    const pc = parseStationData(p.picks, p.arrivals, -41, 174)!; const psc = parseStationData(ps.picks, ps.arrivals, -41, 174)!;
    expect(psc.azimuths).toHaveLength(12);
    expect(calculateStationDistributionRatio(psc.azimuths)).toBe(calculateStationDistributionRatio(pc.azimuths));
    const two: Arrival[] = [{ station: 0, phase: 'P', azimuth: 0, distance: 1 }, { station: 1, phase: 'P', azimuth: 180, distance: 9 }];
    const a = mapped(document(two)); const b = mapped(document([...two, { ...two[0], phase: 'S' }]));
    expect(parseStationData(b.picks, b.arrivals, -41, 174)!.averageDistance).toBeCloseTo(parseStationData(a.picks, a.arrivals, -41, 174)!.averageDistance, 9);
  });

  it('antipodal points give half the circumference, not NaN', () => {
    expect(calculateDistance(-88.68, 0, 88.68, 180)).toBeCloseTo(6371 * Math.PI, 6);
  });
});

describe('review follow-ups: one precedence for horizontal uncertainty', () => {
  it('map, card and quality factor resolve the same measurement in the same order', () => {
    const all = { latitude: -41.3, longitude: 174.8, horizontal_uncertainty: 2.1, latitude_uncertainty: 0.0123, longitude_uncertainty: 0.0151 };
    expect(calculateUncertaintyEllipse(all)!.source).toBe('horizontal-circle');
    expect(horizontalUncertaintyKm(all)!.source).toBe('horizontal-circle');
    // Longitude marginals are scaled by cos(latitude) for the score as well as the badge.
    const hi = { latitude: -60, longitude: 0, longitude_uncertainty: 0.05 };
    expect(calculateLocationQuality(hi).factors.horizontalUncertainty).toBeCloseTo(100 * (1 - horizontalUncertaintyKm(hi)!.km / 11.132), 6);
  });
  it('unnamed picks are not merged into one station', () => {
    const picks = JSON.stringify([{ publicID: 'p1', waveformID: { networkCode: 'NZ' } }, { publicID: 'p2', waveformID: { networkCode: 'NZ' } }]);
    const arrivals = JSON.stringify([{ pickID: 'p1', azimuth: 10, distance: 1 }, { pickID: 'p2', azimuth: 200, distance: 2 }]);
    expect(parseStationData(picks, arrivals, -41, 174)!.azimuths).toEqual([10, 200]);
  });
  it('the card names the plane it classified when the stated preference is incomplete', () => {
    const m = { preferredPlane: 1 as const, nodalPlane1: { strike: 0, dip: 90, rake: null }, nodalPlane2: { strike: 90, dip: 90, rake: 180 } };
    expect(selectPlane(m)).toEqual({ strike: 90, dip: 90, rake: 180 });
    expect(formatFocalMechanism(m).faultType).toBe('Right-lateral strike-slip');
  });
});
