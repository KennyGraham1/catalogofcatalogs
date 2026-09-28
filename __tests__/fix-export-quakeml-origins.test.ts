/** @jest-environment node */

/**
 * QuakeML origin identity and preference (cluster C, findings #66, #67, #77).
 *
 * QuakeML 1.2 BED: a publicID names ONE object, Origin.creationInfo says who produced that
 * solution, OriginQuality counts and Arrival residuals describe that solution's hypocentre, and
 * an Arrival belongs to exactly one Origin (publicIDs are unique in a document).
 *
 * #66  A merged row's hypocentre was written into a contributing agency's origin (keeping its
 *      publicID, creationInfo, quality and arrivals), and the agency's real solution vanished.
 *      The merged solution must be its own origin (or the unmodified source origin that already
 *      carries exactly that solution), and <preferredOriginID> must point at it.
 * #67  The flat `arrivals` column (the PREFERRED origin's phases) was attached to origins[0],
 *      duplicating arrival publicIDs on the wrong solution.
 * #77  The scalar fallback emitted one origin but never marked it preferred, and the scalar
 *      magnitude carried no <originID>.
 *
 * Expected values come from the input documents and rows, not from running the exporter.
 */

import { mergeEventGroup, buildMergedEventFields } from '@/lib/merge';
import { eventToQuakeML, eventsToQuakeMLDocument } from '@/lib/quakeml-exporter';
import { parseQuakeMLEvent } from '@/lib/quakeml-parser';
import { quakemlEventToDbFields } from '@/lib/quakeml-to-db';
import { validateQuakeMLEvent } from '@/lib/quakeml-validator';
import type { MergedEvent } from '@/lib/db';
import type { QuakeMLEvent, Origin } from '@/lib/types/quakeml';

// The columns lib/merge.ts copies onto a stored merged row (OPTIONAL_DB_FIELDS).
const OPTIONAL_FIELDS = [
  'source_id', 'region', 'location_name',
  'event_public_id', 'event_type', 'event_type_certainty',
  'time_uncertainty', 'latitude_uncertainty', 'longitude_uncertainty',
  'depth_uncertainty', 'horizontal_uncertainty',
  'min_horizontal_uncertainty', 'max_horizontal_uncertainty', 'azimuth_max_horizontal_uncertainty',
  'depth_type', 'earth_model_id', 'method_id', 'agency_id', 'author',
  'magnitude_type', 'magnitude_uncertainty', 'magnitude_station_count',
  'magnitude_method_id', 'magnitude_evaluation_mode', 'magnitude_evaluation_status',
  'azimuthal_gap', 'used_phase_count', 'used_station_count', 'standard_error',
  'minimum_distance', 'maximum_distance',
  'associated_phase_count', 'associated_station_count', 'depth_phase_count',
  'evaluation_mode', 'evaluation_status',
  'preferred_origin_id', 'preferred_magnitude_id', 'preferred_focal_mechanism_id',
  'origin_quality', 'origins', 'magnitudes', 'picks', 'arrivals',
  'focal_mechanisms', 'amplitudes', 'station_magnitudes',
  'event_descriptions', 'comments', 'creation_info',
];

// ISC-style bulletin event: a contributing NEIC origin (no phases) listed first, the
// preferred ISC prime origin (two arrivals) second.
const ISC_EVENT_XML = `<event publicID="smi:ISC/evid=1">
  <origin publicID="smi:ISC/origid=100">
    <time><value>2016-11-13T11:02:57.000Z</value></time>
    <latitude><value>-42.60</value></latitude>
    <longitude><value>173.10</value></longitude>
    <depth><value>30000</value></depth>
    <quality><usedPhaseCount>400</usedPhaseCount></quality>
    <evaluationStatus>reviewed</evaluationStatus>
    <creationInfo><agencyID>NEIC</agencyID></creationInfo>
  </origin>
  <origin publicID="smi:ISC/origid=200">
    <time><value>2016-11-13T11:02:56.900Z</value></time>
    <latitude><value>-42.66</value></latitude>
    <longitude><value>173.05</value></longitude>
    <depth><value>11000</value></depth>
    <quality><usedPhaseCount>900</usedPhaseCount><azimuthalGap>40</azimuthalGap></quality>
    <evaluationStatus>reviewed</evaluationStatus>
    <creationInfo><agencyID>ISC</agencyID></creationInfo>
    <arrival publicID="smi:ISC/arrid=1"><pickID>smi:ISC/pickid=1</pickID><phase>P</phase><timeResidual>0.3</timeResidual></arrival>
    <arrival publicID="smi:ISC/arrid=2"><pickID>smi:ISC/pickid=2</pickID><phase>S</phase><timeResidual>-0.4</timeResidual></arrival>
  </origin>
  <magnitude publicID="smi:ISC/magid=1"><mag><value>7.8</value></mag><type>Mw</type><originID>smi:ISC/origid=200</originID></magnitude>
  <preferredOriginID>smi:ISC/origid=200</preferredOriginID>
  <preferredMagnitudeID>smi:ISC/magid=1</preferredMagnitudeID>
</event>`;

const iscParsed = parseQuakeMLEvent(ISC_EVENT_XML) as QuakeMLEvent;

/** The ISC event as the QuakeML upload path stores it (lib/quakeml-to-db.ts). */
const iscRow = {
  id: 'isc-row', catalogue_id: 'cat-isc', created_at: '2024-01-01T00:00:00Z',
  time: '2016-11-13T11:02:56.900Z', latitude: -42.66, longitude: 173.05, depth: 11, magnitude: 7.8,
  source_events: JSON.stringify([{ source: 'upload', eventId: 'smi:ISC/evid=1' }]),
  ...quakemlEventToDbFields(iscParsed),
} as MergedEvent;

/** A GeoNet FDSN-text row as lib/geonet-import-service.ts builds it: no blobs, no preferred ids. */
const geonetRow = {
  id: 'gn-row', catalogue_id: 'cat-geonet', created_at: '2024-01-01T00:00:00Z',
  source_id: '2016p858000',
  time: '2016-11-13T11:02:56.346Z', latitude: -42.6925, longitude: 173.0218, depth: 15.1, magnitude: 7.8,
  magnitude_type: 'Mw', event_type: 'earthquake',
  source_events: JSON.stringify([{ source: 'GeoNet', eventId: '2016p858000' }]),
} as MergedEvent;

/** Run the real merge (mergeEventGroup -> buildMergedEventFields) and return the stored row. */
function mergedRow(config: Record<string, unknown>): MergedEvent {
  const inputs = [
    { ...geonetRow, source: 'GeoNet', catalogueId: 'cat-geonet' },
    { ...iscRow, source: 'ISC', catalogueId: 'cat-isc' },
  ];
  const merged = mergeEventGroup(inputs as any, { timeThreshold: 60, distanceThreshold: 100, ...config } as any);
  return {
    id: 'merged-row', catalogue_id: 'cat-merged', created_at: '2024-01-02T00:00:00Z',
    ...buildMergedEventFields(merged as any, OPTIONAL_FIELDS),
  } as MergedEvent;
}

function exportAndParse(row: MergedEvent): QuakeMLEvent {
  const event = parseQuakeMLEvent(eventToQuakeML(row));
  expect(event).not.toBeNull();
  return event as QuakeMLEvent;
}

const originById = (event: QuakeMLEvent, id: string): Origin | undefined =>
  event.origins?.find(o => o.publicID === id);

function preferredOrigin(event: QuakeMLEvent): Origin {
  expect(event.preferredOriginID).toBeDefined();
  const origin = originById(event, event.preferredOriginID!);
  // A dangling <preferredOriginID> is an error in BED (and in lib/quakeml-validator.ts).
  expect(origin).toBeDefined();
  return origin!;
}

// ---------------------------------------------------------------------------
// #66 — the merged hypocentre never overwrites a contributing agency's origin
// ---------------------------------------------------------------------------

describe('#66 merged rows keep every contributing origin intact', () => {
  it('priority merge that selects the blob-less GeoNet row: ISC/NEIC origins are untouched', () => {
    const row = mergedRow({ mergeStrategy: 'priority', priority: 'geonet' });
    // Precondition: this is the reachable shape the finding describes.
    expect(row.latitude).toBe(-42.6925);
    expect(row.origins).toBeTruthy();

    const event = exportAndParse(row);

    const neic = originById(event, 'smi:ISC/origid=100')!;
    expect(neic.creationInfo?.agencyID).toBe('NEIC');
    expect([neic.latitude.value, neic.longitude.value, neic.depth?.value, neic.time.value])
      .toEqual([-42.6, 173.1, 30000, '2016-11-13T11:02:57.000Z']);

    const isc = originById(event, 'smi:ISC/origid=200')!;
    expect(isc.creationInfo?.agencyID).toBe('ISC');
    expect([isc.latitude.value, isc.longitude.value, isc.depth?.value]).toEqual([-42.66, 173.05, 11000]);
    expect(isc.quality?.usedPhaseCount).toBe(900);

    // The published (GeoNet) solution is the preferred origin, under an identity of its own.
    const preferred = preferredOrigin(event);
    expect([preferred.latitude.value, preferred.longitude.value, preferred.time.value])
      .toEqual([-42.6925, 173.0218, '2016-11-13T11:02:56.346Z']);
    expect(preferred.depth?.value).toBeCloseTo(15100, 6);
    expect(preferred.publicID).not.toMatch(/^smi:ISC\//);
    expect(['NEIC', 'ISC']).not.toContain(preferred.creationInfo?.agencyID);
    // Residuals computed for ISC's hypocentre are not attached to GeoNet's.
    expect(preferred.arrivals ?? []).toHaveLength(0);
  });

  it('average merge: the averaged hypocentre is a new origin, the sources keep their own', () => {
    const row = mergedRow({ mergeStrategy: 'average', priority: 'newest' });
    const event = exportAndParse(row);

    const isc = originById(event, 'smi:ISC/origid=200')!;
    expect([isc.latitude.value, isc.longitude.value, isc.time.value])
      .toEqual([-42.66, 173.05, '2016-11-13T11:02:56.900Z']);
    expect(isc.arrivals?.map(a => a.publicID)).toEqual(['smi:ISC/arrid=1', 'smi:ISC/arrid=2']);

    const preferred = preferredOrigin(event);
    expect(preferred.latitude.value).toBe(row.latitude);
    expect(preferred.longitude.value).toBe(row.longitude);
    expect(Date.parse(preferred.time.value)).toBe(Date.parse(row.time));
    expect(preferred.publicID).not.toMatch(/^smi:ISC\//);
    expect(preferred.creationInfo).toBeUndefined();
    expect(preferred.quality).toBeUndefined();
    expect(preferred.arrivals ?? []).toHaveLength(0);
  });

  it('prefers the unmodified source origin when it already carries the merged solution', () => {
    // Priority merge that selects the ISC row: the merged scalars ARE ISC's prime origin.
    const row = mergedRow({ mergeStrategy: 'priority', priority: 'isc' });
    expect(row.latitude).toBe(-42.66);

    const event = exportAndParse(row);
    expect(event.preferredOriginID).toBe('smi:ISC/origid=200');
    expect(event.origins).toHaveLength(2); // no synthetic duplicate of the same solution
    expect(preferredOrigin(event).creationInfo?.agencyID).toBe('ISC');
  });

  it('never falls back to rewriting origins[0] and never emits a dangling preference', () => {
    const row: MergedEvent = {
      ...iscRow,
      id: 'merged-2',
      source_events: JSON.stringify([{ source: 'A' }, { source: 'B' }]),
      latitude: -42.7, longitude: 173.0, depth: 20, time: '2016-11-13T11:02:56.500Z',
      // A preference that names no stored origin (the union pass filled the blob from
      // another source): it must not be emitted as a dangling reference.
      preferred_origin_id: 'smi:nz.org.geonet/origin/missing',
    };
    const event = exportAndParse(row);

    expect(originById(event, 'smi:ISC/origid=100')!.latitude.value).toBe(-42.6);
    expect(originById(event, 'smi:ISC/origid=200')!.latitude.value).toBe(-42.66);
    const preferred = preferredOrigin(event);
    expect([preferred.latitude.value, preferred.longitude.value]).toEqual([-42.7, 173.0]);
    expect(preferred.depth?.value).toBeCloseTo(20000, 6);
  });

  it('the exported merged event passes the platform validator (preference resolves)', () => {
    for (const config of [
      { mergeStrategy: 'priority', priority: 'geonet' },
      { mergeStrategy: 'average', priority: 'newest' },
      { mergeStrategy: 'quality', priority: 'newest' },
    ]) {
      const result = validateQuakeMLEvent(exportAndParse(mergedRow(config)));
      expect(result.errors.filter(e => e.path.includes('preferred'))).toEqual([]);
      // "multiple origins but no preferredOriginID" is what the old export produced.
      expect(result.warnings.filter(w => w.path.includes('preferredOriginID'))).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// #67 — the flat arrivals column belongs to the preferred origin only
// ---------------------------------------------------------------------------

describe('#67 arrivals stay on the origin they were computed for', () => {
  it('does not copy the preferred origin\'s arrivals onto origins[0]', () => {
    const xml = eventToQuakeML(iscRow);
    const event = exportAndParse(iscRow);

    expect(originById(event, 'smi:ISC/origid=100')!.arrivals ?? []).toHaveLength(0);
    expect(originById(event, 'smi:ISC/origid=200')!.arrivals?.map(a => a.timeResidual)).toEqual([0.3, -0.4]);
    // publicIDs are unique in a document.
    expect(xml.match(/<arrival publicID="smi:ISC\/arrid=1">/g)).toHaveLength(1);
    expect(xml.match(/<arrival publicID="smi:ISC\/arrid=2">/g)).toHaveLength(1);
  });

  it('attaches a standalone arrivals column to the preferred origin when it has none', () => {
    const origins = JSON.parse(iscRow.origins!) as Origin[];
    const withoutNested = origins.map(o => ({ ...o, arrivals: undefined }));
    const row: MergedEvent = { ...iscRow, origins: JSON.stringify(withoutNested) };
    const event = exportAndParse(row);

    expect(originById(event, 'smi:ISC/origid=100')!.arrivals ?? []).toHaveLength(0);
    expect(originById(event, 'smi:ISC/origid=200')!.arrivals?.map(a => a.pickID))
      .toEqual(['smi:ISC/pickid=1', 'smi:ISC/pickid=2']);
  });

  it('attaches standalone arrivals to the single scalar-fallback origin', () => {
    const row: MergedEvent = {
      ...geonetRow,
      arrivals: JSON.stringify([{ publicID: 'smi:nz.org.geonet/arrival/1', pickID: 'smi:nz.org.geonet/pick/1', phase: 'P' }]),
    };
    const event = exportAndParse(row);
    expect(event.origins).toHaveLength(1);
    expect(event.origins![0].arrivals?.map(a => a.publicID)).toEqual(['smi:nz.org.geonet/arrival/1']);
  });
});

// ---------------------------------------------------------------------------
// #77 — the scalar fallback marks its only origin preferred and links the magnitude
// ---------------------------------------------------------------------------

describe('#77 scalar fallback preference', () => {
  it('marks the single fallback origin preferred and links the magnitude to it', () => {
    const event = exportAndParse(geonetRow);

    expect(event.origins).toHaveLength(1);
    expect(event.preferredOriginID).toBe(event.origins![0].publicID);
    const magnitude = event.magnitudes?.find(m => m.publicID === event.preferredMagnitudeID);
    expect(magnitude?.originID).toBe(event.origins![0].publicID);
  });

  it('keeps an explicit preferred_origin_id as the fallback origin identity', () => {
    const row: MergedEvent = { ...geonetRow, preferred_origin_id: 'smi:nz.org.geonet/origin/1' };
    const event = exportAndParse(row);
    expect(event.origins!.map(o => o.publicID)).toEqual(['smi:nz.org.geonet/origin/1']);
    expect(event.preferredOriginID).toBe('smi:nz.org.geonet/origin/1');
  });

  it('every event in a document names a resolvable preferred origin', () => {
    const doc = eventsToQuakeMLDocument([geonetRow, iscRow], 'Mixed');
    const blocks = doc.match(/<event [\s\S]*?<\/event>/g) || [];
    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      const event = parseQuakeMLEvent(block)!;
      expect(preferredOrigin(event)).toBeDefined();
    }
  });
});
