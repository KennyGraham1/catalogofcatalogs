/** @jest-environment node */

/**
 * CSV / JSON / GeoJSON / KML export content (cluster C): the Source column (#132), the error
 * ellipse and preferred focal mechanism (#76), per-event lineage (C1/C2), the confidence level
 * (C16), control characters in KML (#74), and export provenance: catalogue version, timestamp,
 * checksum, filter, declustering, merge configuration and UTC time periods (C3/C12).
 *
 * Expected values come from the input rows, the format specifications and the contracts,
 * not from running the exporters.
 */

import { createHash } from 'crypto';
import { SaxesParser } from 'saxes';
import { mergeEventGroup, buildMergedEventFields } from '@/lib/merge';
import {
  CSV_EVENT_HEADERS,
  CSV_DECLUSTER_HEADERS,
  computeEventRowsChecksum,
  eventsToCSV,
  eventsToGeoJSON,
  eventsToJSON,
  eventsToKML,
} from '@/lib/exporters';
import type { DeclusterTag, ExportableEvent, ExportMetadata } from '@/lib/exporters';
import { eventsToQuakeMLDocument } from '@/lib/quakeml-exporter';
import { parseWithDelimiter } from '@/lib/delimiter-detector';
import { parseCSV } from '@/lib/parsers';

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

function wellFormednessError(xml: string): string | null {
  const parser = new SaxesParser({ xmlns: true });
  let error: string | null = null;
  parser.on('error', (e: Error) => { if (!error) error = e.message; });
  try {
    parser.write(xml).close();
  } catch (e) {
    error = error ?? (e as Error).message;
  }
  return error;
}

const row = (over: Partial<ExportableEvent> = {}): ExportableEvent => ({
  id: 'evt-1',
  catalogue_id: 'cat-1',
  time: '2024-01-15T10:00:00.000Z',
  latitude: -41.2865,
  longitude: 174.7762,
  depth: 12.5,
  magnitude: 4.2,
  source_events: JSON.stringify([{ source: 'GeoNet', eventId: '2024p000001' }]),
  created_at: '2024-01-16T00:00:00.000Z',
  ...over,
} as ExportableEvent);

/** One CSV data record as a header -> value map (RFC 4180 aware). */
function csvRecords(csv: string): Array<Record<string, string>> {
  const { rows } = parseWithDelimiter(csv, ',');
  const header = csv.split('\n')[0].split(',');
  return rows.map(values => Object.fromEntries(header.map((name, i) => [name, values[i] ?? ''])));
}

// The columns lib/merge.ts copies onto a stored merged row (OPTIONAL_DB_FIELDS).
const OPTIONAL_FIELDS = [
  'source_id', 'region', 'location_name', 'event_public_id', 'event_type', 'event_type_certainty',
  'time_uncertainty', 'latitude_uncertainty', 'longitude_uncertainty', 'depth_uncertainty',
  'horizontal_uncertainty', 'depth_type', 'earth_model_id', 'method_id', 'agency_id', 'author',
  'magnitude_type', 'magnitude_uncertainty', 'magnitude_station_count', 'magnitude_method_id',
  'magnitude_evaluation_mode', 'magnitude_evaluation_status', 'azimuthal_gap', 'used_phase_count',
  'used_station_count', 'standard_error', 'evaluation_mode', 'evaluation_status',
];

// ---------------------------------------------------------------------------
// #132 — the CSV Source column names the source whose solution the row publishes
// ---------------------------------------------------------------------------

describe('#132 CSV Source column', () => {
  // GeoNet reports first (poorly constrained); AgencyB two seconds later (well constrained).
  const geonet = {
    id: 'g-1', source: 'GeoNet', catalogueId: 'cat-geonet', source_id: 'G-12',
    time: '2024-03-01T10:30:45.000Z', latitude: -41.30, longitude: 174.80, depth: 10, magnitude: 3.4,
    magnitude_type: 'ML', used_station_count: 3, azimuthal_gap: 250, evaluation_status: 'preliminary',
  };
  const agencyB = {
    id: 'b-1', source: 'AgencyB', catalogueId: 'cat-b', source_id: 'B-77',
    time: '2024-03-01T10:30:47.000Z', latitude: -41.31, longitude: 174.81, depth: 12, magnitude: 3.6,
    magnitude_type: 'Mw', used_station_count: 40, azimuthal_gap: 60, evaluation_status: 'reviewed', evaluation_mode: 'manual',
  };

  function mergedRow(strategy: string, priority = 'newest'): ExportableEvent {
    const merged = mergeEventGroup([geonet, agencyB] as any, {
      mergeStrategy: strategy, priority, timeThreshold: 60, distanceThreshold: 50,
    } as any);
    return { id: 'm-1', catalogue_id: 'cat-m', created_at: '2024-03-02T00:00:00.000Z', ...buildMergedEventFields(merged as any, OPTIONAL_FIELDS) } as ExportableEvent;
  }

  it('is the winning agency, not the earliest report, for a quality merge', () => {
    const merged = mergedRow('quality');
    expect(merged.time).toBe(agencyB.time); // precondition: AgencyB's solution is published
    const [record] = csvRecords(eventsToCSV([merged]));
    expect(record.Source).toBe('AgencyB');
    expect(record.SourceID).toBe('AgencyB:B-77');
  });

  it('is "merged" for an averaged solution', () => {
    const merged = { ...mergedRow('average'), merge_strategy: 'average' } as ExportableEvent;
    expect(csvRecords(eventsToCSV([merged]))[0].Source).toBe('merged');
  });

  it('reads the averaged strategy from the catalogue merge_config for rows stored before C2', () => {
    const [record] = csvRecords(eventsToCSV([mergedRow('average')], { mergeConfig: { mergeStrategy: 'average' } }));
    expect(record.Source).toBe('merged');
  });

  it('uses the C2 selected member when the row records one', () => {
    const selected = row({
      source_id: 'X:1',
      source_events: JSON.stringify([
        { catalogueId: 'cat-a', source: 'GeoNet' },
        { catalogueId: 'cat-b', source: 'AgencyB', selected: true },
      ]),
    });
    const [record] = csvRecords(eventsToCSV([selected]));
    expect([record.Source, record.SelectedSource, record.SelectedSourceCatalogueID]).toEqual(['AgencyB', 'AgencyB', 'cat-b']);
  });

  it('is unchanged for a single-source row', () => {
    expect(csvRecords(eventsToCSV([row()]))[0].Source).toBe('GeoNet');
  });
});

// ---------------------------------------------------------------------------
// #76 — error ellipse and preferred focal mechanism in CSV and JSON
// ---------------------------------------------------------------------------

describe('#76 CSV and JSON carry the error ellipse and preferred focal mechanism', () => {
  const ellipse = row({
    horizontal_uncertainty: 2.1,
    min_horizontal_uncertainty: 1.1,
    max_horizontal_uncertainty: 4.2,
    azimuth_max_horizontal_uncertainty: 35,
    preferred_focal_mechanism_id: 'smi:nz.org.geonet/fm/1',
  });

  it('exports the four fields as CSV columns', () => {
    const [record] = csvRecords(eventsToCSV([ellipse]));
    expect([
      record.MinHorizontalUncertainty,
      record.MaxHorizontalUncertainty,
      record.AzimuthMaxHorizontalUncertainty,
      record.PreferredFocalMechanismID,
    ]).toEqual(['1.1', '4.2', '35', 'smi:nz.org.geonet/fm/1']);
  });

  it('round-trips the ellipse through the platform\'s own CSV import', () => {
    const parsed = parseCSV(eventsToCSV([ellipse], undefined, { neutralizeFormulas: false }));
    expect(parsed.success).toBe(true);
    const event = parsed.events[0] as Record<string, unknown>;
    expect([event.min_horizontal_uncertainty, event.max_horizontal_uncertainty, event.azimuth_max_horizontal_uncertainty])
      .toEqual([1.1, 4.2, 35]);
  });

  it('exports them in the JSON event record', () => {
    const event = JSON.parse(eventsToJSON([ellipse])).events[0];
    expect(event.uncertainties).toMatchObject({ horizontal: 2.1, minHorizontal: 1.1, maxHorizontal: 4.2, azimuthMaxHorizontal: 35 });
    expect(event.preferredFocalMechanismId).toBe('smi:nz.org.geonet/fm/1');
  });
});

// ---------------------------------------------------------------------------
// Per-event lineage (C1/C2), raw agency event type (C8) and confidence level (C16)
// ---------------------------------------------------------------------------

describe('per-event lineage in CSV, JSON and GeoJSON', () => {
  const lineageRow = row({
    id: 'evt-lin',
    source_id: 'GeoNet:2024p000001',
    merge_strategy: 'priority',
    merge_parameters: JSON.stringify({ mergeStrategy: 'priority', timeThresholdSeconds: 60, distanceThresholdKm: 50 }),
    source_catalogue_ids: ['cat-geonet', 'cat-isc'],
    quality_score: 72,
    quality_grade: 'B',
    source_event_type: 'earthquake (felt)',
    confidence_level: 68,
    source_events: JSON.stringify([
      { catalogueId: 'cat-geonet', source: 'GeoNet', selected: true },
      { catalogueId: 'cat-isc', source: 'ISC' },
    ]),
  });

  it('CSV carries every lineage column', () => {
    const [record] = csvRecords(eventsToCSV([lineageRow]));
    expect(record).toMatchObject({
      SourceCatalogueIDs: 'cat-geonet;cat-isc',
      MergeStrategy: 'priority',
      SelectedSource: 'GeoNet',
      SelectedSourceCatalogueID: 'cat-geonet',
      QualityScore: '72',
      QualityGrade: 'B',
      SourceEventType: 'earthquake (felt)',
      ConfidenceLevel: '68',
    });
    expect(JSON.parse(record.MergeParameters)).toEqual({ mergeStrategy: 'priority', timeThresholdSeconds: 60, distanceThresholdKm: 50 });
  });

  it('CSV leaves the lineage columns empty for a row without them', () => {
    const [record] = csvRecords(eventsToCSV([row()]));
    for (const column of ['SourceCatalogueIDs', 'MergeStrategy', 'MergeParameters', 'SelectedSource', 'QualityScore', 'QualityGrade', 'ConfidenceLevel']) {
      expect(record[column]).toBe('');
    }
  });

  it.each([
    ['GeoJSON', () => JSON.parse(eventsToGeoJSON([lineageRow])).features[0].properties],
    ['JSON', () => JSON.parse(eventsToJSON([lineageRow])).events[0]],
  ])('%s carries the same lineage', (_format, record) => {
    const r = record();
    expect(r).toMatchObject({
      source: 'GeoNet',
      sourceCatalogueIds: ['cat-geonet', 'cat-isc'],
      mergeStrategy: 'priority',
      mergeParameters: { mergeStrategy: 'priority', timeThresholdSeconds: 60, distanceThresholdKm: 50 },
      selectedSource: 'GeoNet',
      selectedSourceCatalogueId: 'cat-geonet',
      qualityScore: 72,
      qualityGrade: 'B',
      sourceEventType: 'earthquake (felt)',
    });
  });

  it('JSON and GeoJSON carry the confidence level (C16)', () => {
    expect(JSON.parse(eventsToGeoJSON([lineageRow])).features[0].properties.confidenceLevel).toBe(68);
    expect(JSON.parse(eventsToJSON([lineageRow])).events[0].uncertainties.confidenceLevel).toBe(68);
  });
});

// ---------------------------------------------------------------------------
// Version-specific exports: version, timestamp and checksum in every format (C3/C12)
// ---------------------------------------------------------------------------

describe('every format records catalogue version, export time and one row checksum', () => {
  const events = [row(), row({ id: 'evt-2', time: '2024-02-20T04:30:00.000Z', magnitude: 2.1, region: '=cmd|calc' })];
  const metadata: ExportMetadata = {
    catalogueName: 'NZ test',
    catalogueId: 'cat-1',
    version: '1.3.0',
    versionUpdatedAt: '2026-09-01T00:00:00.000Z',
    sourceVersion: '2024.1',
    generatedAt: '2026-09-25T01:02:03.000Z',
  };
  const plainCsv = eventsToCSV(events, metadata);
  const expected = sha256(plainCsv);

  it('the checksum is the SHA-256 of the plain CSV rendering', () => {
    expect(computeEventRowsChecksum(events, metadata).value).toBe(expected);
  });

  it('each CSV row carries the catalogue version, so the plain file is citable on its own', () => {
    expect(csvRecords(plainCsv).map(r => r.CatalogueVersion)).toEqual(['1.3.0', '1.3.0']);
    expect(CSV_EVENT_HEADERS[CSV_EVENT_HEADERS.length - 1]).toBe('CatalogueVersion');
  });

  it('the CSV preamble carries id, version, timestamp and checksum', () => {
    const lines = eventsToCSV(events, metadata, { metadataComments: true }).split('\n');
    expect(lines).toEqual(expect.arrayContaining([
      '# Catalogue ID: cat-1',
      '# Version: 1.3.0',
      '# Source Version: 2024.1',
      '# Generated: 2026-09-25T01:02:03.000Z',
      `# Event Rows SHA-256: ${expected}`,
      '# Filter: none',
      '# Declustering: none',
    ]));
    // Stripping the prologue gives back exactly the plain file the checksum covers.
    const body = lines.slice(lines.indexOf('#') + 1).join('\n');
    expect(sha256(body)).toBe(expected);
  });

  it('JSON and GeoJSON heads carry the same values', () => {
    for (const head of [JSON.parse(eventsToJSON(events, metadata)).metadata, JSON.parse(eventsToGeoJSON(events, metadata)).metadata]) {
      expect(head).toMatchObject({
        catalogueId: 'cat-1',
        version: '1.3.0',
        versionUpdatedAt: '2026-09-01T00:00:00.000Z',
        sourceVersion: '2024.1',
        generated: '2026-09-25T01:02:03.000Z',
        checksum: { algorithm: 'SHA-256', value: expected },
        filter: null,
        declustering: { algorithm: 'none' },
      });
    }
  });

  it('KML and QuakeML carry the same values', () => {
    const kml = eventsToKML(events, metadata);
    const quakeml = eventsToQuakeMLDocument(events, 'NZ test', metadata);
    for (const doc of [kml, quakeml]) {
      expect(doc).toContain(`SHA-256: ${expected}`);
      expect(doc).toContain('Catalogue ID: cat-1');
      expect(doc).toContain('Declustering: none');
      expect(doc).toContain('Filter: none');
    }
    expect(quakeml).toContain('<version>1.3.0</version>');
    expect(quakeml).toContain('<creationTime>2026-09-25T01:02:03.000Z</creationTime>');
    expect(kml).toContain('Version: 1.3.0');
  });

  it('the checksum does not depend on the export time and changes with the rows', () => {
    const later = { ...metadata, generatedAt: '2030-01-01T00:00:00.000Z' };
    expect(computeEventRowsChecksum(events, later).value).toBe(expected);
    expect(computeEventRowsChecksum([events[0]], metadata).value).not.toBe(expected);
  });
});

describe('filter and declustering are recorded; declustered exports carry per-event tags', () => {
  const events = [row({ id: 'm' }), row({ id: 'a', time: '2024-01-16T10:00:00.000Z', magnitude: 2 }), row({ id: 'x', magnitude: 3 })];
  const tags = new Map<string, DeclusterTag>([
    ['m', { clusterId: 'm', isMainshock: true }],
    ['a', { clusterId: 'm', isMainshock: false }],
    ['x', { clusterId: null, isMainshock: true }],
  ]);
  const metadata: ExportMetadata = {
    filter: { minMagnitude: 2 },
    declustering: {
      algorithm: 'gardner-knopoff',
      parameters: { timeWindow: 'forward only' },
      summary: { eventCount: 3, mainshockCount: 2, dependentCount: 1, clusterCount: 1 },
      tags,
    },
  };

  it('CSV appends ClusterID and IsMainshock', () => {
    const csv = eventsToCSV(events, metadata);
    expect(csv.split('\n')[0]).toBe(CSV_EVENT_HEADERS.concat(CSV_DECLUSTER_HEADERS).join(','));
    expect(csvRecords(csv).map(r => [r.ClusterID, r.IsMainshock])).toEqual([['m', 'true'], ['m', 'false'], ['', 'true']]);
  });

  it('JSON/GeoJSON record the filter, the algorithm and the tags (never the tag map itself)', () => {
    const json = JSON.parse(eventsToJSON(events, metadata));
    expect(json.metadata.filter).toEqual({ minMagnitude: 2 });
    expect(json.metadata.declustering).toEqual({
      algorithm: 'gardner-knopoff',
      parameters: { timeWindow: 'forward only' },
      summary: { eventCount: 3, mainshockCount: 2, dependentCount: 1, clusterCount: 1 },
    });
    expect(json.events.map((e: any) => [e.clusterId, e.isMainshock])).toEqual([['m', true], ['m', false], [null, true]]);
    const geo = JSON.parse(eventsToGeoJSON(events, metadata));
    expect(geo.features[1].properties).toMatchObject({ clusterId: 'm', isMainshock: false });
  });

  it('QuakeML records the tag in the event lineage comment', () => {
    const doc = eventsToQuakeMLDocument(events, 'tags', metadata);
    expect(doc).toContain('&quot;declustering&quot;:{&quot;algorithm&quot;:&quot;gardner-knopoff&quot;,&quot;clusterId&quot;:&quot;m&quot;,&quot;isMainshock&quot;:false}');
  });
});

// ---------------------------------------------------------------------------
// Merged catalogues: every format carries merge configuration and source catalogues;
// time-period bounds are UTC ISO strings (C11/C12)
// ---------------------------------------------------------------------------

describe('merge configuration, source catalogues and UTC time periods in every format', () => {
  const metadata: ExportMetadata = {
    catalogueName: 'Merged',
    mergeConfig: { mergeStrategy: 'quality', timeThreshold: 60, distanceThreshold: 50 },
    sourceCatalogues: [{ id: 'cat-a', name: 'A' }, { id: 'cat-b', name: 'B' }],
    // Offset-less (C11: stored as UTC) and offset forms.
    timePeriodStart: '2024-01-01T12:00',
    timePeriodEnd: '2024-06-30T23:59:59+12:00',
  };
  const events = [row()];

  it('JSON and GeoJSON', () => {
    for (const head of [JSON.parse(eventsToJSON(events, metadata)).metadata, JSON.parse(eventsToGeoJSON(events, metadata)).metadata]) {
      expect(head.merge.config).toEqual(metadata.mergeConfig);
      expect(head.provenance.sourceCatalogues).toEqual(metadata.sourceCatalogues);
      expect(head.timePeriod).toEqual({ start: '2024-01-01T12:00:00.000Z', end: '2024-06-30T11:59:59.000Z' });
    }
  });

  it('CSV preamble, KML and QuakeML', () => {
    const texts = [
      // Preamble values are CSV-escaped (RFC 4180 doubled quotes).
      eventsToCSV(events, metadata, { metadataComments: true }).replace(/""/g, '"'),
      eventsToKML(events, metadata),
      eventsToQuakeMLDocument(events, 'Merged', metadata).replace(/&quot;/g, '"'),
    ];
    for (const text of texts) {
      expect(text).toContain('"mergeStrategy":"quality"');
      expect(text).toContain('"id":"cat-b"');
      expect(text).toContain('2024-01-01T12:00:00.000Z to 2024-06-30T11:59:59.000Z');
    }
  });

  it('leaves an already-UTC bound byte-for-byte', () => {
    const head = JSON.parse(eventsToJSON(events, { timePeriodStart: '2024-01-01T00:00:00Z' })).metadata;
    expect(head.timePeriod.start).toBe('2024-01-01T00:00:00Z');
  });
});

// ---------------------------------------------------------------------------
// #74 (KML) — XML 1.0 forbids C0 control characters even inside CDATA
// ---------------------------------------------------------------------------

describe('#74 KML stays well-formed with control characters in text', () => {
  it('drops them from placemark fields and the CDATA catalogue description', () => {
    const kml = eventsToKML(
      [row({ region: 'Te Anau\u000b fault', agency_id: 'W\u0001EL' })],
      { catalogueName: 'KML\u0002 test', description: 'desc\u000c with form feed', notes: 'n￾' }
    );
    expect(wellFormednessError(kml)).toBeNull();
    expect(kml).toContain('Te Anau fault');
    expect(kml).toContain('desc with form feed');
  });
});
