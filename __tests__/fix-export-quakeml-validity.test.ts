/** @jest-environment node */

/**
 * QuakeML export validity after the post-fix review (cluster C, review R5):
 *
 *  #5  Stored origins, picks, amplitudes and station magnitudes without a publicID all became
 *      "smi:local/<kind>/unknown": two origins shared an id, their derived arrival ids collided
 *      and ObsPy resolved <preferredOriginID> to the wrong origin.
 *  #6  Values outside the schema's facets made the WHOLE document XSD-invalid: enumerations in
 *      another case ("Manual", "Point", "Region Name"), values outside an enumeration
 *      ("metres"), strings over a maxLength (agencyID > 64) and impossible date-times
 *      ("2019-13-45T25:61:61Z").
 *  #8  The document was built as one string (V8's string limit is reached near 100k richly
 *      merged events); it is now streamed event by event.
 *
 * Expected values come from QuakeML-BED-1.2.xsd (enumerations, maxLength facets, xs:dateTime),
 * not from running the exporter. The documents these tests build were also validated with lxml
 * against the official XSD and read with ObsPy (review-R5/q1_validate.py).
 */

import { SaxesParser } from 'saxes';
import { eventToQuakeML, eventsToQuakeMLChunks, eventsToQuakeMLDocument } from '@/lib/quakeml-exporter';
import { parseQuakeMLEvent } from '@/lib/quakeml-parser';
import type { ExportableEvent } from '@/lib/exporters';

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
  id: 'ev-1',
  catalogue_id: 'cat-1',
  time: '2019-01-01T00:00:00.000Z',
  latitude: 10,
  longitude: 20,
  depth: null,
  magnitude: 2.1,
  magnitude_type: 'ML',
  source_events: '[]',
  created_at: '2024-01-01T00:00:00.000Z',
  ...over,
} as ExportableEvent);

/** Every publicID attribute in the text, in order. */
const publicIDs = (xml: string) => Array.from(xml.matchAll(/publicID="([^"]+)"/g)).map(m => m[1]);

/** The text of every <comment> in the text. */
const commentTexts = (xml: string) => Array.from(xml.matchAll(/<comment[^>]*>\s*<text>([^<]*)<\/text>/g)).map(m => m[1]);

// ---------------------------------------------------------------------------
// #5 — distinct fallback identifiers
// ---------------------------------------------------------------------------

describe('#5 stored objects without a publicID get distinct, resolvable identifiers', () => {
  const origin = (lat: number, second: number) => ({
    time: { value: `2019-01-01T00:00:0${second}Z` }, latitude: { value: lat }, longitude: { value: 20 },
    arrivals: [{ pickID: 'smi:nz.org.geonet/pick/1', phase: 'P' }],
  });
  const noIds = row({
    origins: JSON.stringify([origin(10, 0), origin(10.1, 1)]),
    picks: JSON.stringify([
      { time: { value: '2019-01-01T00:00:03Z' }, waveformID: { networkCode: 'XX', stationCode: 'ABC' } },
      { time: { value: '2019-01-01T00:00:04Z' }, waveformID: { networkCode: 'XX', stationCode: 'DEF' } },
    ]),
    amplitudes: JSON.stringify([{ genericAmplitude: { value: 1 } }, { genericAmplitude: { value: 2 } }]),
    station_magnitudes: JSON.stringify([{ mag: { value: 2.0 } }, { mag: { value: 2.2 } }]),
  });

  it('never exports ".../unknown" and never repeats an id within the event', () => {
    const xml = eventToQuakeML(noIds);
    const ids = publicIDs(xml);
    expect(ids.some(id => id.endsWith('/unknown'))).toBe(false);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining([
      'smi:local/origin/ev-1-origin-1',
      'smi:local/origin/ev-1-origin-2',
      'smi:local/pick/ev-1-pick-1',
      'smi:local/pick/ev-1-pick-2',
      'smi:local/amplitude/ev-1-amplitude-1',
      'smi:local/amplitude/ev-1-amplitude-2',
      'smi:local/stationMagnitude/ev-1-stationMagnitude-1',
      'smi:local/stationMagnitude/ev-1-stationMagnitude-2',
      // Arrival ids derive from their (now distinct) origins.
      'smi:local/origin/ev-1-origin-1#arrival-1',
      'smi:local/origin/ev-1-origin-2#arrival-1',
    ]));
  });

  it('the preferred origin resolves to the stored origin that carries the row\'s solution', () => {
    const event = parseQuakeMLEvent(eventToQuakeML(noIds))!;
    const preferred = event.origins!.filter(o => o.publicID === event.preferredOriginID);
    expect(preferred).toHaveLength(1);
    expect(preferred[0].latitude.value).toBe(10); // the row is at 10/20, not 10.1/20.1
  });

  it('keeps stored ids, and gives a repeated stored id a derived one instead', () => {
    const xml = eventToQuakeML(row({
      picks: JSON.stringify([
        { publicID: 'smi:nz.org.geonet/pick/9', time: { value: '2019-01-01T00:00:03Z' }, waveformID: { networkCode: 'NZ', stationCode: 'WEL' } },
        { publicID: 'smi:nz.org.geonet/pick/9', time: { value: '2019-01-01T00:00:04Z' }, waveformID: { networkCode: 'NZ', stationCode: 'KHZ' } },
      ]),
    }));
    expect(publicIDs(xml)).toEqual(expect.arrayContaining(['smi:nz.org.geonet/pick/9', 'smi:local/pick/ev-1-pick-2']));
  });

  it('keeps the existing fallback for magnitudes and focal mechanisms', () => {
    const xml = eventToQuakeML(row({
      magnitudes: JSON.stringify([{ mag: { value: 2.1 }, type: 'ML' }, { mag: { value: 2.4 }, type: 'Mw' }]),
      focal_mechanisms: JSON.stringify([{ nodalPlane1: { strike: 10, dip: 40, rake: 90 } }]),
    }));
    expect(publicIDs(xml)).toEqual(expect.arrayContaining([
      'smi:local/magnitude/ev-1-magnitude-1',
      'smi:local/magnitude/ev-1-magnitude-2',
      'smi:local/focalMechanism/ev-1-focalMechanism-1',
    ]));
    expect(xml).toContain('<preferredMagnitudeID>smi:local/magnitude/ev-1-magnitude-1</preferredMagnitudeID>');
  });
});

// ---------------------------------------------------------------------------
// #6 — enumerations, maxLength facets and date-time values
// ---------------------------------------------------------------------------

describe('#6 enumerated values are written in their BED spelling', () => {
  const malformed = row({
    event_type_certainty: 'Known',
    origins: JSON.stringify([{
      publicID: 'smi:nz.org.geonet/origin/1', time: { value: '2019-01-01T00:00:00Z' }, latitude: { value: 10 }, longitude: { value: 20 },
      type: 'Hypocenter', evaluationMode: 'Manual', evaluationStatus: 'REVIEWED',
      uncertainty: { horizontalUncertainty: 1000, preferredDescription: 'Horizontal Uncertainty' },
    }]),
    preferred_origin_id: 'smi:nz.org.geonet/origin/1',
    amplitudes: JSON.stringify([{ publicID: 'smi:nz.org.geonet/amp/1', genericAmplitude: { value: 1 }, category: 'Point', unit: 'metres' }]),
    picks: JSON.stringify([{ publicID: 'smi:nz.org.geonet/pick/1', time: { value: '2019-01-01T00:00:03Z' }, waveformID: { networkCode: 'NZ', stationCode: 'WEL' }, onset: 'Impulsive', polarity: 'Positive' }]),
    event_descriptions: JSON.stringify([{ text: 'Somewhere', type: 'Region Name' }]),
    focal_mechanisms: JSON.stringify([{
      publicID: 'smi:nz.org.geonet/fm/1',
      momentTensor: {
        derivedOriginID: 'smi:nz.org.geonet/origin/1', category: 'Regional', inversionType: 'Zero Trace',
        sourceTimeFunction: { type: 'Triangle', duration: 4 },
        dataUsed: [{ waveType: 'Surface Waves', stationCount: 5 }, { waveType: 'infrasound' }],
      },
    }]),
  });
  const xml = eventToQuakeML(malformed);

  it.each([
    ['<type>hypocenter</type>'],
    ['<evaluationMode>manual</evaluationMode>'],
    ['<evaluationStatus>reviewed</evaluationStatus>'],
    ['<preferredDescription>horizontal uncertainty</preferredDescription>'],
    ['<category>point</category>'],
    ['<onset>impulsive</onset>'],
    ['<polarity>positive</polarity>'],
    ['<type>region name</type>'],
    ['<typeCertainty>known</typeCertainty>'],
    ['<category>regional</category>'],
    ['<inversionType>zero trace</inversionType>'],
    ['<type>triangle</type>'],
    ['<waveType>surface waves</waveType>'],
  ])('writes %s', (expected) => {
    expect(xml).toContain(expected);
  });

  it('drops a value outside its enumeration and keeps it in a comment', () => {
    expect(xml).not.toContain('<unit>');
    expect(xml).not.toContain('infrasound</waveType>');
    const texts = commentTexts(xml).join(' | ').replace(/&quot;/g, '"');
    expect(texts).toContain('unit="metres"');
    expect(texts).toContain('dataUsed waveType="infrasound"');
  });
});

describe('#6 strings longer than the schema allows are shortened, the original kept', () => {
  const longAgency = 'A'.repeat(80);
  const xml = eventToQuakeML(row({
    creation_info: JSON.stringify({ agencyID: longAgency, author: 'B'.repeat(130), version: 'v'.repeat(70) }),
    magnitudes: JSON.stringify([{ publicID: 'smi:nz.org.geonet/mag/1', mag: { value: 2.1 }, type: 'M'.repeat(40) }]),
    origins: JSON.stringify([{ publicID: 'smi:nz.org.geonet/origin/1', time: { value: '2019-01-01T00:00:00Z' }, latitude: { value: 10 }, longitude: { value: 20 }, region: 'R'.repeat(200) }]),
    preferred_origin_id: 'smi:nz.org.geonet/origin/1',
    picks: JSON.stringify([{ publicID: 'smi:nz.org.geonet/pick/1', time: { value: '2019-01-01T00:00:03Z' }, waveformID: { networkCode: 'TOOLONGCODE', stationCode: 'WEL' } }]),
  }));

  it.each([
    ['agencyID', 64, 'A'],
    ['author', 128, 'B'],
    ['version', 64, 'v'],
    ['region', 128, 'R'],
  ])('%s is cut to %i characters', (tag, max, ch) => {
    expect(xml).toContain(`<${tag}>${ch.repeat(max)}</${tag}>`);
  });

  it('magnitude type and SEED codes are cut to their limits (32 and 8)', () => {
    expect(xml).toContain(`<type>${'M'.repeat(32)}</type>`);
    expect(xml).toContain('networkCode="TOOLONGC"');
  });

  it('records the full original values', () => {
    const texts = commentTexts(xml).join(' | ').replace(/&quot;/g, '"');
    expect(texts).toContain(`agencyID="${longAgency}"`);
    expect(texts).toContain('networkCode="TOOLONGCODE"');
  });
});

describe('#6 date-times must be real calendar values', () => {
  it.each([
    ['2019-13-45T25:61:61Z'],
    ['2019-02-29T00:00:00Z'], // 2019 is not a leap year
    ['2019-04-31T00:00:00Z'],
    ['2019-01-01T24:00:00Z'],
    ['2019-01-01T00:00:60Z'],
    ['2019-01-01T00:00:00+15:00'],
    ['0000-01-01T00:00:00Z'],
  ])('drops creationTime %s and notes it', (value) => {
    const xml = eventToQuakeML(row({ creation_info: JSON.stringify({ agencyID: 'WEL', creationTime: value }) }));
    expect(xml).not.toContain('<creationTime>');
    expect(commentTexts(xml).join(' ').replace(/&quot;/g, '"')).toContain(`creationTime="${value}"`);
  });

  it.each([
    ['2020-02-29T00:00:00Z'],
    ['2000-02-29T12:34:56.789+13:00'],
    ['1855-01-23T09:32:00'],
  ])('keeps %s', (value) => {
    const xml = eventToQuakeML(row({ creation_info: JSON.stringify({ agencyID: 'WEL', creationTime: value }) }));
    expect(xml).toContain(`<creationTime>${value}</creationTime>`);
  });

  it('a stored origin whose time is not a real date cannot be an origin', () => {
    const xml = eventToQuakeML(row({
      origins: JSON.stringify([{ publicID: 'smi:nz.org.geonet/origin/bad', time: { value: '2019-02-30T00:00:00Z' }, latitude: { value: 10 }, longitude: { value: 20 } }]),
    }));
    expect(xml).not.toContain('<origin publicID="smi:nz.org.geonet/origin/bad">');
    const event = parseQuakeMLEvent(xml)!;
    expect(event.origins!.find(o => o.publicID === event.preferredOriginID)?.time.value).toBe('2019-01-01T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// #8 — the document is streamed event by event
// ---------------------------------------------------------------------------

describe('#8 QuakeML is generated as a stream', () => {
  const events = Array.from({ length: 1500 }, (_, i) => row({
    id: `ev-${i}`,
    time: new Date(Date.UTC(2019, 0, 1) + i * 60_000).toISOString(),
    region: 'Wellington region, a place with a reasonably long description',
  }));
  const normalise = (xml: string) => xml.replace(/smi:local\/eventParameters\/\d+/, 'smi:local/eventParameters/N');

  it('yields bounded chunks whose concatenation is the whole document', () => {
    const chunks: string[] = [];
    const metadata = { generatedAt: '2026-09-28T00:00:00.000Z' };
    const generator = eventsToQuakeMLChunks(events, 'Streamed', metadata);
    for (let step = generator.next(); !step.done; step = generator.next()) chunks.push(step.value);

    expect(chunks.length).toBeGreaterThan(5);
    // ~64 KiB chunks: the largest is one coalescing target plus at most one event.
    expect(Math.max(...chunks.map(c => c.length))).toBeLessThan(80 * 1024);
    const whole = chunks.join('');
    expect(normalise(whole)).toBe(normalise(eventsToQuakeMLDocument(events, 'Streamed', metadata)));
    expect(wellFormednessError(whole)).toBeNull();
    expect((whole.match(/<event publicID=/g) || []).length).toBe(events.length);
  });

  it('the first chunk is available before the last event is formatted', () => {
    const first = eventsToQuakeMLChunks(events, 'Streamed').next();
    expect(first.done).toBe(false);
    expect(first.value).toContain('<eventParameters');
    expect(first.value).not.toContain(`smi:local/event/ev-${events.length - 1}"`);
  });
});
