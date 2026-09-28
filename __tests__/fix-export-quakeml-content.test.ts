/** @jest-environment node */

/**
 * QuakeML export content (cluster C): identity and lineage (#69 + gap gi#2), BED enumerations
 * (#68, C8), untrusted blob values (#70), XML-illegal characters (#74), required arrival and
 * moment-tensor identifiers (#75) and the origin-uncertainty confidence level (C16).
 *
 * Well-formedness is checked with saxes, the strict XML parser jsdom uses. Expected values come
 * from QuakeML-BED-1.2.xsd, XML 1.0 and the input rows, not from running the exporter.
 */

import { SaxesParser } from 'saxes';
import { eventToQuakeML, eventsToQuakeMLDocument } from '@/lib/quakeml-exporter';
import { parseQuakeMLEvent } from '@/lib/quakeml-parser';
import { validateQuakeMLStructure } from '@/lib/quakeml-validator';
import { QUAKEML_EVENT_TYPES, QUAKEML_ORIGIN_DEPTH_TYPES } from '@/lib/types/quakeml';
import type { MergedEvent } from '@/lib/db';
import type { ExportableEvent } from '@/lib/exporters';

/** null when the document is well-formed XML 1.0, else the parser's first error. */
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
  id: 'row-1',
  catalogue_id: 'cat-1',
  time: '2016-11-13T11:02:56.346Z',
  latitude: -42.6925,
  longitude: 173.0218,
  depth: 15.1,
  magnitude: 7.8,
  magnitude_type: 'Mw',
  source_events: '[]',
  created_at: '2024-01-01T00:00:00Z',
  ...over,
} as ExportableEvent);

/** A row as the GeoNet FDSN-text importer stored it: the EventID only in source_id / source_events. */
const geonetRow = (id: string) => row({
  id,
  source_id: '2016p858000',
  source_events: JSON.stringify([{ source: 'GeoNet', eventId: '2016p858000', catalog: 'GeoNet' }]),
});

const eventPublicID = (xml: string) => xml.match(/<event publicID="([^"]+)"/)?.[1];

// ---------------------------------------------------------------------------
// #69 / gi#2 — event identity and per-event lineage
// ---------------------------------------------------------------------------

describe('#69 event publicID falls back to the source identity before the row id', () => {
  it('a GeoNet-imported row exports as smi:nz.org.geonet/<EventID>', () => {
    const xml = eventToQuakeML(geonetRow('clz9x0abc0000qwerty'));
    // The event's identity is GeoNet's, not the internal row id (local origin and magnitude
    // ids may still derive from the row id).
    expect(eventPublicID(xml)).toBe('smi:nz.org.geonet/2016p858000');
    expect(eventPublicID(xml)).not.toContain('clz9x0abc0000qwerty');
  });

  it('keeps the same identity when the event is imported again under a new row id', () => {
    expect(eventPublicID(eventToQuakeML(geonetRow('row-a'))))
      .toBe(eventPublicID(eventToQuakeML(geonetRow('row-b'))));
  });

  it('a merged row that kept a GeoNet member\'s id ("<source>:<EventID>") keeps the GeoNet identity', () => {
    const merged = row({
      id: 'merged-1',
      source_id: 'GeoNet NZ:2016p858000',
      source_events: JSON.stringify([
        {
          catalogueId: 'cat-geonet', source: 'GeoNet NZ',
          originalData: { id: 'gn-1', source_id: '2016p858000', source_events: JSON.stringify([{ source: 'GeoNet', eventId: '2016p858000' }]) },
        },
        { catalogueId: 'cat-isc', source: 'ISC', originalData: { id: 'isc-1', source_id: '623456789' } },
      ]),
    });
    expect(eventPublicID(eventToQuakeML(merged))).toBe('smi:nz.org.geonet/2016p858000');
  });

  it('any other source identity exports under smi:local/source/, escaped', () => {
    const xml = eventToQuakeML(row({ source_id: 'AgencyB:B-77', source_events: JSON.stringify([{ source: 'upload', eventId: 'B-77' }]) }));
    expect(eventPublicID(xml)).toBe('smi:local/source/AgencyB~3AB-77');
  });

  it('a stored public id still wins, and a source_id repeating the row id adds nothing', () => {
    expect(eventPublicID(eventToQuakeML(row({ event_public_id: 'smi:ISC/evid=1', source_id: '2016p858000' }))))
      .toBe('smi:ISC/evid=1');
    expect(eventPublicID(eventToQuakeML(row({ id: 'r9', source_id: 'r9' })))).toBe('smi:local/event/r9');
  });

  it('keeps event publicIDs unique within a document', () => {
    const doc = eventsToQuakeMLDocument([geonetRow('row-a'), geonetRow('row-b')], 'dup');
    const ids = Array.from(doc.matchAll(/<event publicID="([^"]+)"/g)).map(m => m[1]);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('gi#2 per-event lineage is carried as an event-level comment', () => {
  const merged = row({
    id: 'merged-2',
    source_id: 'GeoNet:2023p122368',
    merge_strategy: 'priority',
    quality_score: 72,
    quality_grade: 'B',
    source_catalogue_ids: ['cat-geonet', 'cat-isc'],
    source_events: JSON.stringify([
      { catalogueId: 'cat-geonet', source: 'GeoNet', selected: true, originalData: { id: 'g1', source_id: '2023p122368' } },
      { catalogueId: 'cat-isc', source: 'ISC', originalData: { id: 'i1', source_id: '623456789', event_public_id: 'smi:ISC/evid=623456789' } },
    ]),
  });

  function lineageOf(xml: string): Record<string, any> {
    const event = parseQuakeMLEvent(xml)!;
    const comment = event.comment?.find(c => c.text.startsWith('Lineage: '));
    expect(comment).toBeDefined();
    return JSON.parse(comment!.text.slice('Lineage: '.length));
  }

  it('names every contributing catalogue and source event, the selected one, strategy and Q', () => {
    const lineage = lineageOf(eventToQuakeML(merged));
    expect(lineage.sourceCatalogueIds).toEqual(['cat-geonet', 'cat-isc']);
    expect(lineage.members.map((m: any) => m.eventId)).toEqual(['2023p122368', '623456789']);
    expect(lineage.members[0].selected).toBe(true);
    expect(lineage.selectedSource).toBe('GeoNet');
    expect(lineage.source).toBe('GeoNet');
    expect(lineage.mergeStrategy).toBe('priority');
    expect([lineage.qualityScore, lineage.qualityGrade]).toEqual([72, 'B']);
  });

  it('records the source event of a single-source row too', () => {
    const lineage = lineageOf(eventToQuakeML(geonetRow('row-g')));
    expect(lineage.members).toEqual([{ catalogueId: null, source: 'GeoNet', eventId: '2016p858000' }]);
  });

  it('emits no lineage comment when the row records none', () => {
    expect(eventToQuakeML(row())).not.toContain('Lineage:');
  });
});

// ---------------------------------------------------------------------------
// #68 — QuakeML 1.2 BED enumerations
// ---------------------------------------------------------------------------

describe('#68 non-BED event and depth types are mapped at export, the label kept', () => {
  it.each([
    ['tremor', 'other event'],
    ['volcanic tremor', 'other event'],
    ['volcanic', 'other event'],
    ['volcano-tectonic', 'earthquake'],
    ['tectonic', 'earthquake'],
    ['not a type at all', 'other event'],
  ])('event_type %j exports as the BED value %j with the original in a comment', (stored, bed) => {
    const xml = eventToQuakeML(row({ event_type: stored }));
    const event = parseQuakeMLEvent(xml)!;
    expect(event.type).toBe(bed);
    expect((QUAKEML_EVENT_TYPES as readonly string[]).includes(event.type!)).toBe(true);
    expect(event.comment?.some(c => c.text.includes(`"${stored}"`))).toBe(true);
  });

  it('leaves a BED event type alone and adds no comment', () => {
    const xml = eventToQuakeML(row({ event_type: 'quarry blast' }));
    expect(xml).toContain('<type>quarry blast</type>');
    expect(xml).not.toContain('Event type reported');
  });

  it('keeps the agency\'s raw event type (C8) when it differs from the exported one', () => {
    const xml = eventToQuakeML(row({ event_type: 'earthquake', source_event_type: 'induced earthquake' }));
    expect(xml).toContain('<type>earthquake</type>');
    expect(parseQuakeMLEvent(xml)!.comment?.some(c => c.text.includes('"induced earthquake"'))).toBe(true);
  });

  it.each([
    // Stored labels are lowercased (lib/db.ts); BED spells this one with a capital P.
    ['from modeling of broad-band p waveforms', 'from modeling of broad-band P waveforms', false],
    ['constrained by depth and direct phases', 'constrained by depth and direct phases', false],
    ['constrained by s-p time differences', 'constrained by direct phases', true],
    ['fixed by analyst', 'other', true],
  ])('depth_type %j exports as %j', (stored, bed, commented) => {
    const xml = eventToQuakeML(row({ depth_type: stored }));
    const origin = parseQuakeMLEvent(xml)!.origins![0];
    expect(origin.depthType).toBe(bed);
    expect((QUAKEML_ORIGIN_DEPTH_TYPES as readonly string[]).includes(origin.depthType!)).toBe(true);
    expect(origin.comment?.some(c => c.text.includes(`"${stored}"`)) ?? false).toBe(commented);
  });

  it('maps a non-BED depth type inside a stored origin as well', () => {
    const xml = eventToQuakeML(row({
      preferred_origin_id: 'smi:nz.org.geonet/origin/1',
      origins: JSON.stringify([{
        publicID: 'smi:nz.org.geonet/origin/1', time: { value: '2016-11-13T11:02:56.346Z' },
        latitude: { value: -42.6925 }, longitude: { value: 173.0218 }, depthType: 'constrained by S-P time differences',
      }]),
    }));
    expect(xml).toContain('<depthType>constrained by direct phases</depthType>');
    expect(xml).not.toContain('<depthType>constrained by S-P time differences</depthType>');
  });
});

// ---------------------------------------------------------------------------
// #70 — values from stored JSON blobs are validated, never interpolated raw
// ---------------------------------------------------------------------------

describe('#70 untrusted blob values cannot break or forge the document', () => {
  const injected = '2020-01-01T00:00:00Z</value></time></origin><origin publicID="smi:evil/origin/2"><time><value>1900-01-01T00:00:00Z';

  it('a crafted origin time cannot inject a second origin', () => {
    const doc = eventsToQuakeMLDocument([row({
      preferred_origin_id: 'smi:nz.org.geonet/origin/1',
      origins: JSON.stringify([{ publicID: 'smi:nz.org.geonet/origin/1', time: { value: injected }, latitude: { value: -42 }, longitude: { value: 173 } }]),
    })], 'Injection');

    expect(wellFormednessError(doc)).toBeNull();
    expect(doc).not.toContain('smi:evil/origin/2');
    const event = parseQuakeMLEvent(doc.match(/<event [\s\S]*<\/event>/)![0])!;
    expect(event.origins!.map(o => o.publicID)).not.toContain('smi:evil/origin/2');
    // The stored origin has no valid time, so it cannot be a BED Origin: it is left out (and
    // said so), and the row's own solution is the preferred origin.
    expect(event.comment?.some(c => c.text.includes('smi:nz.org.geonet/origin/1') && c.text.includes('omitted'))).toBe(true);
    expect(event.origins!.find(o => o.publicID === event.preferredOriginID)?.latitude.value).toBe(-42.6925);
  });

  it.each([
    ['creationTime', { creation_info: JSON.stringify({ agencyID: 'WEL', creationTime: '2020 & co' }) }],
    ['a numeric slot', {
      origins: JSON.stringify([{ publicID: 'smi:nz.org.geonet/origin/1', time: { value: '2016-11-13T11:02:56.346Z' }, latitude: { value: '<x/>' }, longitude: { value: 173 }, quality: { usedPhaseCount: '4</usedPhaseCount><forged/>' } }]),
      preferred_origin_id: 'smi:nz.org.geonet/origin/1',
    }],
    ['a boolean slot', {
      origins: JSON.stringify([{ publicID: 'smi:nz.org.geonet/origin/1', time: { value: '2016-11-13T11:02:56.346Z' }, latitude: { value: -42 }, longitude: { value: 173 }, timeFixed: 'true</timeFixed><x>' }]),
      preferred_origin_id: 'smi:nz.org.geonet/origin/1',
    }],
    ['an arrival residual', {
      arrivals: JSON.stringify([{ publicID: 'smi:nz.org.geonet/arrival/1', pickID: 'smi:nz.org.geonet/pick/1', phase: 'P', timeResidual: '0.1&0.2' }]),
    }],
  ])('drops an invalid value in %s and stays well-formed', (_label, over) => {
    const doc = eventsToQuakeMLDocument([row(over as Partial<ExportableEvent>)], 'Blob');
    expect(wellFormednessError(doc)).toBeNull();
    expect(doc).not.toContain('<forged/>');
    expect(doc).not.toContain('<x>');
    expect(doc).not.toContain('2020 & co');
    expect(validateQuakeMLStructure(doc).isValid).toBe(true);
  });

  it('keeps numeric literals that arrive as strings', () => {
    const xml = eventToQuakeML(row({
      preferred_origin_id: 'smi:nz.org.geonet/origin/1',
      origins: JSON.stringify([{ publicID: 'smi:nz.org.geonet/origin/1', time: { value: '2016-11-13T11:02:56.346Z' }, latitude: { value: '-42.6925' }, longitude: { value: 173.0218 }, quality: { usedPhaseCount: '101' } }]),
    }));
    const origin = parseQuakeMLEvent(xml)!.origins!.find(o => o.publicID === 'smi:nz.org.geonet/origin/1')!;
    expect(origin.latitude.value).toBe(-42.6925);
    expect(origin.quality?.usedPhaseCount).toBe(101);
  });

  it('does not throw on non-string text in a comment blob', () => {
    expect(() => eventToQuakeML(row({ comments: JSON.stringify([{ text: 42 }, 'not an object', null]) }))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// #74 — XML 1.0 forbids C0 control characters even when escaped
// ---------------------------------------------------------------------------

describe('#74 control characters in text never make the document unreadable', () => {
  it('drops a vertical tab from a location name and keeps the rest of the text', () => {
    const doc = eventsToQuakeMLDocument([row({ location_name: 'Te Anau\u000b fault' })], 'Ctrl');
    expect(wellFormednessError(doc)).toBeNull();
    expect(doc).toContain('<text>Te Anau fault</text>');
  });

  it('drops control characters from catalogue metadata and comments', () => {
    const doc = eventsToQuakeMLDocument(
      [row({ comments: JSON.stringify([{ text: 'bell\u0007 and form feed\u000c' }]) })],
      'Ctrl\u0001 catalogue',
      { notes: 'notes\u0001', description: 'desc\u001f', license: 'CC￾ BY' }
    );
    expect(wellFormednessError(doc)).toBeNull();
    expect(doc).toContain('Ctrl catalogue');
    expect(doc).toContain('bell and form feed');
  });
});

// ---------------------------------------------------------------------------
// #75 — Arrival and MomentTensor publicIDs are required
// ---------------------------------------------------------------------------

describe('#75 required arrival and moment tensor identifiers', () => {
  it('derives an arrival publicID from its origin when the stored arrival has none', () => {
    const xml = eventToQuakeML(row({
      arrivals: JSON.stringify([{ pickID: 'smi:nz.org.geonet/pick/1', phase: 'P' }, { pickID: 'smi:nz.org.geonet/pick/2', phase: 'S' }]),
    }));
    expect(xml).not.toContain('<arrival>');
    const origin = parseQuakeMLEvent(xml)!.origins![0];
    expect(origin.arrivals!.map(a => a.publicID)).toEqual([
      `${origin.publicID}#arrival-1`,
      `${origin.publicID}#arrival-2`,
    ]);
  });

  it('derives a moment tensor publicID from its focal mechanism', () => {
    const xml = eventToQuakeML(row({
      focal_mechanisms: JSON.stringify([{
        publicID: 'smi:nz.org.geonet/fm/1',
        momentTensor: { derivedOriginID: 'smi:nz.org.geonet/origin/1', scalarMoment: { value: 1.2e20 } },
      }]),
    }));
    expect(xml).not.toContain('<momentTensor>');
    expect(xml).toContain('<momentTensor publicID="smi:nz.org.geonet/fm/1#momentTensor">');
  });

  it('keeps stored identifiers unchanged', () => {
    const xml = eventToQuakeML(row({
      arrivals: JSON.stringify([{ publicID: 'smi:nz.org.geonet/arrival/7', pickID: 'smi:nz.org.geonet/pick/7', phase: 'P' }]),
    }));
    expect(xml).toContain('<arrival publicID="smi:nz.org.geonet/arrival/7">');
  });
});

// ---------------------------------------------------------------------------
// C16 — origin-uncertainty confidence level
// ---------------------------------------------------------------------------

describe('C16 confidence level of the origin uncertainty', () => {
  it('is exported inside <originUncertainty> when the row carries it', () => {
    const event = parseQuakeMLEvent(eventToQuakeML(row({
      horizontal_uncertainty: 2.8,
      min_horizontal_uncertainty: 1.1,
      max_horizontal_uncertainty: 4.2,
      azimuth_max_horizontal_uncertainty: 35,
      confidence_level: 68,
    })))!;
    const uncertainty = event.origins![0].uncertainty!;
    expect(uncertainty.confidenceLevel).toBe(68);
    expect([uncertainty.minHorizontalUncertainty, uncertainty.maxHorizontalUncertainty]).toEqual([1100, 4200]);
  });

  it('is absent when the row has none', () => {
    expect(eventToQuakeML(row({ horizontal_uncertainty: 2.8 }))).not.toContain('<confidenceLevel>');
  });
});

// ---------------------------------------------------------------------------
// The whole document stays well-formed with everything combined.
// ---------------------------------------------------------------------------

it('a document mixing every case above is well-formed and structurally valid', () => {
  const rows: MergedEvent[] = [
    geonetRow('g-1'),
    row({ id: 'r-2', event_type: 'tremor', depth_type: 'constrained by s-p time differences', location_name: 'x\u000by' }),
    row({ id: 'r-3', arrivals: JSON.stringify([{ pickID: 'smi:nz.org.geonet/pick/1', phase: 'P', timeResidual: 'bad' }]) }),
  ];
  const doc = eventsToQuakeMLDocument(rows, 'All');
  expect(wellFormednessError(doc)).toBeNull();
  expect(validateQuakeMLStructure(doc)).toMatchObject({ isValid: true, eventCount: 3 });
});
