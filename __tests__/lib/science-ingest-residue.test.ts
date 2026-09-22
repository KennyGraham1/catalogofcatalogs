/** @jest-environment node */

// Analysis caches, Reasenberg declustering, event association, CSV and
// QuakeML/GeoJSON round trips, and quality presentation.

import {
  reasenbergDeclustering, gardnerKnopoffDeclustering, analyzeTemporalPatternMemoized, analyzeTemporalPattern,
  estimateCompletenessMemoized, estimateCompletenessMagnitude, calculateGutenbergRichterMemoized,
  calculateGutenbergRichter, clearSeismologicalCaches,
} from '@/lib/seismological-analysis';
import { groupMatchingEvents, performMergeWithGroups, mergeEventGroup, createHierarchicalIndex, queryHierarchicalIndex, getGridKey } from '@/lib/merge';
import { parseCSV, parseQuakeML } from '@/lib/parsers';
import { parseQuakeMLEvent } from '@/lib/quakeml-parser';
import { validateQuakeMLStructure, validateQuakeMLEvent } from '@/lib/quakeml-validator';
import { parseGeoJSON } from '@/lib/geojson-parser';
import { eventsToGeoJSON } from '@/lib/exporters';
import { eventToQuakeML } from '@/lib/quakeml-exporter';
import { parsedEventToDbFields } from '@/lib/parsed-event-to-db';
import { normalizeTimestamp } from '@/lib/earthquake-utils';
import { calculateQualityScore, metricsFromEvent, scoreToGrade } from '@/lib/quality-scoring';
import { calculateCompletenessMetrics } from '@/lib/completeness-metrics';
import { assessEventQuality } from '@/lib/integrated-quality-assessment';

const ev = (id: string, day: number, magnitude: number, lon = 0, extra: Record<string, unknown> = {}): any =>
  ({ id, time: new Date(Date.UTC(2020, 0, 1) + day * 86400000).toISOString(), latitude: 0, longitude: lon, depth: 10, magnitude, ...extra });
const kmLon = (km: number) => (km / 6371) * (180 / Math.PI);

describe('declustering', () => {
  it('Reasenberg links through the most recent event as well as the largest', () => {
    const chain = [ev('A', 0, 5), ev('B', 0.5, 4.9, kmLon(10.9)), ev('C', 0.6, 3, kmLon(11.1))];
    const r = reasenbergDeclustering(chain);
    expect(r.mainshocks.map((e) => e.id)).toEqual(['A']);
    expect(Array.from(r.clusters.values())[0]).toHaveLength(3);
  });

  it('a cluster straddling the antimeridian is centred on the antimeridian', () => {
    const anti = [ev('a', 0, 4, 179.99), ev('b', 0.1, 3, -179.99), ev('c', 0.2, 3, -179.98)];
    expect(gardnerKnopoffDeclustering(anti).clusterInfo[0].centerLongitude).toBeCloseTo(-179.99333, 4);
  });

  it('memoised analyses key on content, parameters and method', () => {
    clearSeismologicalCaches();
    const regular = Array.from({ length: 100 }, (_, i) => ev('e' + i, i, 2 + (i % 21) / 10));
    const mutated = regular.map((e) => ({ ...e, magnitude: e.magnitude + 1 }));
    calculateGutenbergRichterMemoized(regular);
    expect(calculateGutenbergRichterMemoized(mutated).completeness).toBe(calculateGutenbergRichter(mutated).completeness);
    estimateCompletenessMemoized(regular, 0.1, 0);
    expect(estimateCompletenessMemoized(regular, 0.1, 0.2).mc).toBe(estimateCompletenessMagnitude(regular, 0.1, 0.2).mc);
    const byMethod = [ev('m', 0, 4), ev('a1', 20, 3), ev('a2', 20.1, 3), ...Array.from({ length: 7 }, (_, i) => ev('iso' + i, 1000 + i * 1000, 1))];
    analyzeTemporalPatternMemoized(byMethod, 'gardner-knopoff');
    expect(analyzeTemporalPatternMemoized(byMethod, 'reasenberg').clusters.length).toBe(analyzeTemporalPattern(byMethod, 'reasenberg').clusters.length);
  });
});

describe('association residue', () => {
  const cfg: any = { timeThreshold: 10, distanceThreshold: 10, mergeStrategy: 'quality', priority: 'quality' };
  const ids = (evs: any[], c = cfg) => groupMatchingEvents(evs, c).map((g) => g.events.map((e: any) => e.id).sort());
  const mev = (id: string, sec: number, extra: Record<string, unknown>) => ({ id, time: new Date(Date.UTC(2024, 0, 1) + sec * 1000).toISOString(), latitude: 0, longitude: 0, depth: 10, magnitude: 3, source: id, catalogueId: id, ...extra });

  it('a valid near-pole pair is grouped', () => {
    expect(ids([mev('P', 0, { latitude: 89, longitude: 0, magnitude: 7, depth: 350 }), mev('Q', 1, { latitude: 89, longitude: 20, magnitude: 7, depth: 350 })])).toEqual([['P', 'Q']]);
  });
  it('+180 and -180 share a storage cell and pair', () => {
    expect(getGridKey(0, 180, 1)).toBe(getGridKey(0, -180, 1));
    expect(ids([mev('X', 0, { longitude: -180 }), mev('Y', 1, { longitude: 180 })], { ...cfg, distanceThreshold: 5.566 })).toEqual([['X', 'Y']]);
  });
  it('co-located records are returned once from the hierarchical index', () => {
    const repeated = Array.from({ length: 101 }, (_, i) => mev(String(i), 0, {}));
    const found = queryHierarchicalIndex(createHierarchicalIndex(repeated as any, 100, 4), { minLat: -1, maxLat: 1, minLon: -1, maxLon: 1 });
    expect(found).toHaveLength(101);
  });
  it('the preview highlights the event the merge actually selected', () => {
    const low = mev('LOW', 0, { magnitude: 4, used_station_count: 2, azimuthal_gap: 300, standard_error: 3, magnitude_type: 'ML' });
    const high = mev('HIGH', 0, { magnitude: 4.1, depth: 11, used_station_count: 100, azimuthal_gap: 40, standard_error: 0.1, magnitude_type: 'ML' });
    const preview = performMergeWithGroups([low, high] as any, cfg)[0];
    expect(preview.events[preview.selectedEventIndex].id).toBe(mergeEventGroup([low, high] as any, cfg).id);
  });
});

describe('CSV ingestion', () => {
  const csv = (head: string, row: string) => `time,latitude,longitude,${head}\n2024-01-01T00:00:00Z,-41,174,${row}`;
  it('a scale-named column that wins also sets the label and keeps the generic value', () => {
    const e: any = parseCSV(csv('magnitude,magnitude_type,Mw', '3.2,ML,4.1'), ',', 'International').events[0];
    expect([e.magnitude, e.magnitude_type]).toEqual([4.1, 'Mw']);
    expect(JSON.parse(e.magnitudes)[0]).toEqual({ type: 'ML', mag: { value: 3.2 } });
  });
  it('a blank alias column does not hide a populated one', () => {
    const r = parseCSV(csv('mag,magnitude', ',4.1'), ',', 'International');
    expect(r.success).toBe(true);
    expect(r.events[0].magnitude).toBe(4.1);
  });
  it('fractional seconds carry into the next minute', () => {
    const r = parseCSV('year,month,day,hour,minute,second,latitude,longitude,magnitude\n2024,1,1,0,0,59.9999,-41,174,3.2', ',', 'International');
    expect(r.events[0].time).toBe('2024-01-01T00:01:00.000Z');
  });
  it('a zone designator does not override the declared day/month order', () => {
    const r = parseCSV(csv('magnitude', '3.2').replace('2024-01-01T00:00:00Z', '03/04/2024 05:06:07Z'), ',', 'International');
    expect(r.events[0].time).toBe('2024-04-03T05:06:07.000Z');
  });
  it('a quoted multi-line field survives delimiter auto-detection', () => {
    const r = parseCSV(csv('magnitude,region', '3.2,"first line\nsecond line"'));
    expect(r.success).toBe(true);
    expect((r.events[0] as any).region).toBe('first line\nsecond line');
  });
});

describe('QuakeML fidelity', () => {
  const NS = 'xmlns="http://quakeml.org/xmlns/bed/1.2" xmlns:q="http://quakeml.org/xmlns/quakeml/1.2"';
  const doc = (events: string) => `<?xml version="1.0"?><q:quakeml ${NS}><eventParameters publicID="smi:local/ep">${events}</eventParameters></q:quakeml>`;
  const time = '2024-01-01T00:00:00.000Z';
  const origin = `<origin publicID="smi:local/origin/1"><time><value>${time}</value><lowerUncertainty>0.1</lowerUncertainty><upperUncertainty>0.4</upperUncertainty><confidenceLevel>95</confidenceLevel></time><latitude><value>-41</value><uncertainty>0.02</uncertainty><confidenceLevel>95</confidenceLevel></latitude><longitude><value>174</value></longitude><depth><value>12000</value></depth><timeFixed>true</timeFixed><type>centroid</type><quality><secondaryAzimuthalGap>70</secondaryAzimuthalGap><groundTruthLevel>GT5</groundTruthLevel><medianDistance>1.2</medianDistance></quality><originUncertainty><confidenceEllipsoid><semiMajorAxisLength>3000</semiMajorAxisLength><semiMinorAxisLength>1000</semiMinorAxisLength><semiIntermediateAxisLength>2000</semiIntermediateAxisLength><majorAxisPlunge>30</majorAxisPlunge><majorAxisAzimuth>45</majorAxisAzimuth><majorAxisRotation>60</majorAxisRotation></confidenceEllipsoid><confidenceLevel>95</confidenceLevel></originUncertainty></origin>`;
  const magnitude = `<magnitude publicID="smi:local/mag/1"><stationMagnitudeContribution><stationMagnitudeID>smi:local/sm/1</stationMagnitudeID><residual>0.2</residual><weight>0.7</weight></stationMagnitudeContribution><mag><value>4.5</value></mag><type>ML</type></magnitude>`;
  const pick = `<pick publicID="smi:local/pick/2"><time><value>${time}</value></time><waveformID networkCode="NZ" stationCode="WEL">smi:local/waveform/WEL-filtered</waveformID><horizontalSlowness><value>12</value></horizontalSlowness><backazimuth><value>120</value></backazimuth><slownessMethodID>smi:local/method/array</slownessMethodID></pick>`;
  const event = `<event publicID="smi:local/event/1">${origin}${magnitude}${pick}<preferredOriginID>smi:local/origin/1</preferredOriginID><creationInfo><agencyID>GNS</agencyID><agencyURI>smi:local/agency/GNS</agencyURI></creationInfo></event>`;

  it('quantity errors, ellipsoid and typed BED fields survive parsing', () => {
    const e: any = parseQuakeMLEvent(event)!;
    expect([e.origins[0].time.lowerUncertainty, e.origins[0].time.upperUncertainty, e.origins[0].time.confidenceLevel]).toEqual([0.1, 0.4, 95]);
    expect(e.origins[0].latitude.confidenceLevel).toBe(95);
    expect(e.origins[0].uncertainty.confidenceEllipsoid.semiIntermediateAxisLength).toBe(2000);
    expect([e.origins[0].timeFixed, e.origins[0].type, e.origins[0].quality.groundTruthLevel, e.origins[0].quality.medianDistance]).toEqual([true, 'centroid', 'GT5', 1.2]);
    expect(e.magnitudes[0].stationMagnitudeContributions[0]).toEqual({ stationMagnitudeID: 'smi:local/sm/1', residual: 0.2, weight: 0.7 });
    expect([e.picks[0].waveformID.resourceURI, e.picks[0].horizontalSlowness.value, e.picks[0].slownessMethodID]).toEqual(['smi:local/waveform/WEL-filtered', 12, 'smi:local/method/array']);
    expect(e.creationInfo.agencyURI).toBe('smi:local/agency/GNS');
  });

  it('malformed numeric text is rejected rather than truncated to a value', () => {
    const r = parseQuakeML(doc(event.replace('<value>4.5</value>', '<value>4.5junk</value>')));
    expect(r.events[0]?.magnitude).not.toBe(4.5);
  });

  it('the structure validator judges the document, not its spelling', () => {
    const renamed = doc(event).replace(/q:quakeml/g, 'qml:quakeml').replace('xmlns:q=', 'xmlns:qml=');
    expect(validateQuakeMLStructure(renamed).isValid).toBe(true);
    expect(validateQuakeMLStructure(doc(event) + '<secondRoot/>').isValid).toBe(false);
    expect(validateQuakeMLStructure(doc(`<!-- ${event} -->`)).eventCount).toBe(0);
    const nan: any = parseQuakeMLEvent(event)!;
    nan.origins[0].latitude.value = NaN;
    expect(validateQuakeMLEvent(nan).isValid).toBe(false);
  });

  it('the exported preferred magnitude carries the selected measurement\'s method and review state', () => {
    const merged: any = {
      id: 'e1', catalogue_id: 'c', source_id: 'e1', time, latitude: -41, longitude: 174, depth: 10,
      magnitude: 5.9, magnitude_type: 'Mw', magnitude_uncertainty: 0.05, magnitude_method_id: 'smi:local/method/Mw',
      magnitude_evaluation_mode: 'manual', magnitude_evaluation_status: 'reviewed', preferred_magnitude_id: 'smi:local/mag/ML',
      source_events: '[{"source":"A"},{"source":"B"}]',
      magnitudes: JSON.stringify([{ publicID: 'smi:local/mag/ML', mag: { value: 5.4, uncertainty: 0.1 }, type: 'ML', methodID: 'smi:local/method/ML', evaluationMode: 'automatic', evaluationStatus: 'preliminary' }]),
    };
    const xml = eventToQuakeML(merged);
    const event = parseQuakeMLEvent(xml)!;
    const preferred = event.magnitudes?.find(m => m.publicID === event.preferredMagnitudeID);
    expect(preferred?.methodID).toBe('smi:local/method/Mw');
    expect(preferred?.evaluationMode).toBe('manual');
    expect(preferred?.evaluationStatus).toBe('reviewed');
  });
});

describe('GeoJSON', () => {
  const feature = (props: Record<string, unknown> = {}, z: number | undefined = 10, extra = {}) =>
    ({ type: 'Feature', id: 'f1', geometry: { type: 'Point', coordinates: [174.8, -41.3, ...(z === undefined ? [] : [z])] }, properties: { time: '2024-01-01T00:00:00Z', magnitude: 3, ...props }, ...extra });
  it('an own export re-imports without losing identifiers, uncertainties or nested data', () => {
    const rich: any = {
      id: 'db-1', catalogue_id: 'c', created_at: '2024-01-02T00:00:00Z', time: '2024-01-01T00:00:00Z', latitude: -41.3, longitude: 174.8, depth: 12.5, magnitude: 3,
      source_events: '[]', event_public_id: 'smi:nz/event/abc', source_id: '2024abc', magnitude_uncertainty: 0.2, depth_uncertainty: 2, horizontal_uncertainty: 3.5,
      focal_mechanisms: JSON.stringify([{ publicID: 'smi:org/fm/1', nodalPlanes: { nodalPlane1: { strike: { value: 20 }, dip: { value: 40 }, rake: { value: 90 } } } }]),
      origin_quality: JSON.stringify({ standardError: 0.4 }), agency_id: 'WEL',
    };
    const parsed = parseGeoJSON(eventsToGeoJSON([rich]));
    const fields: any = parsedEventToDbFields(parsed.events[0]);
    for (const k of ['event_public_id', 'source_id', 'magnitude_uncertainty', 'depth_uncertainty', 'horizontal_uncertainty', 'focal_mechanisms', 'origin_quality', 'agency_id']) {
      expect(fields[k]).toEqual(rich[k]);
    }
  });
  it('USGS times are milliseconds (0 and pre-1970 included); other producers by magnitude', () => {
    const usgs = (ms: number) => parseGeoJSON(JSON.stringify(feature({ time: ms, net: 'us', mag: 3 }))).events[0]?.time;
    expect([usgs(0), usgs(86400000), usgs(Date.parse('1960-01-01T00:00:00Z'))]).toEqual(['1970-01-01T00:00:00.000Z', '1970-01-02T00:00:00.000Z', '1960-01-01T00:00:00.000Z']);
    // A GeoPandas-style export carries epoch seconds.
    expect(parseGeoJSON(JSON.stringify(feature({ time: 1704067200 }))).events[0]?.time).toBe('2024-01-01T00:00:00.000Z');
    expect(normalizeTimestamp(-315619200)).toBe('1960-01-01T00:00:00.000Z');
    expect(normalizeTimestamp(-30610224000)).toBe('1000-01-01T00:00:00.000Z');
  });
  it('the ambiguous third-coordinate reading is disclosed', () => {
    expect(parseGeoJSON(JSON.stringify(feature({}, 500))).warnings.some((w) => /Third coordinate/.test(w.message))).toBe(true);
  });
  it('a numeric feature id of 0 keeps its identity', () => {
    const r = parseGeoJSON(JSON.stringify(feature({}, 10, { id: 0 })));
    expect(parsedEventToDbFields(r.events[0]).event_public_id).toBe('0');
  });
});

describe('quality presentation', () => {
  const base: any = { time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude: 4 };
  it('the grade is read from the reported (rounded) score', () => {
    const s = calculateQualityScore(metricsFromEvent({ ...base, horizontal_uncertainty: 10, depth_uncertainty: 0, time_uncertainty: 0.12, azimuthal_gap: 60, used_station_count: 40, used_phase_count: 50, standard_error: 0.1, magnitude_uncertainty: 0, magnitude_station_count: 20, evaluation_mode: 'manual', evaluation_status: 'reviewed', minimum_distance: 0.1 }));
    expect(s.grade).toBe(scoreToGrade(s.overall));
  });
  it('presence counts agree with the field table and know the horizontal column', () => {
    expect(calculateCompletenessMetrics([{ ...base, picks: '[]' }]).hasPicks).toBe(0);
    const incomplete = calculateCompletenessMetrics([{ ...base, time: null, picks: '[{"publicID":"p"}]', depth_uncertainty: 1 }]);
    expect([incomplete.incompleteEvents, incomplete.hasPicks, incomplete.hasUncertainties]).toEqual([1, 1, 1]);
    expect(calculateCompletenessMetrics([{ ...base, horizontal_uncertainty: 0.8 }]).hasUncertainties).toBe(1);
  });
  it('a rejected solution is unsuitable for every use however well it scores', () => {
    const r = assessEventQuality({ ...base, horizontal_uncertainty: 0, depth_uncertainty: 0, time_uncertainty: 0, azimuthal_gap: 60, used_station_count: 40, used_phase_count: 50, standard_error: 0.1, magnitude_uncertainty: 0, magnitude_station_count: 20, evaluation_mode: 'manual', evaluation_status: 'rejected', minimum_distance: 0.1 });
    expect(Object.values(r.summary.useCaseGuidance).every((v) => v === false)).toBe(true);
    expect(r.summary.recommendation).toMatch(/rejected/i);
  });
});

describe('alternative magnitudes kept from CSV survive a QuakeML round trip', () => {
  it('exports the selected Mw as the preferred magnitude alongside the ML alternative', () => {
    const parsed: any = parseCSV('time,latitude,longitude,magnitude,magnitude_type,Mw\n2024-01-01T00:00:00Z,-41,174,3.2,ML,4.1', ',', 'International').events[0];
    const row: any = { id: 'e1', catalogue_id: 'c', source_id: 'e1', time: parsed.time, latitude: -41, longitude: 174, depth: 10, magnitude: parsed.magnitude, source_events: '[]', ...parsedEventToDbFields(parsed) };
    const xml = eventToQuakeML(row);
    const ids = Array.from(xml.matchAll(/<magnitude publicID="([^"]+)"/g)).map((m) => m[1]);
    expect(new Set(ids).size).toBe(2);
    expect(xml).toMatch(/<preferredMagnitudeID>[^<]*preferred<\/preferredMagnitudeID>/);
    const back: any = parseQuakeML(`<?xml version="1.0"?><q:quakeml xmlns="http://quakeml.org/xmlns/bed/1.2" xmlns:q="http://quakeml.org/xmlns/quakeml/1.2"><eventParameters publicID="smi:local/ep">${xml}</eventParameters></q:quakeml>`);
    expect([back.events[0].magnitude, back.events[0].magnitude_type]).toEqual([4.1, 'Mw']);
    expect(back.events[0].quakeml.magnitudes).toHaveLength(2);
  });
});
