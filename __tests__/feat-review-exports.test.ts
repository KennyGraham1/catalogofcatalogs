/**
 * @jest-environment node
 *
 * Exports carry the merge review state (contract M5): CSV, JSON and GeoJSON lineage gain
 * review_status, and a QuakeML event that is still pending says so in a <comment> (with the
 * group's reasons), so a reader of any format can tell a provisional solution from a decided
 * one. Rows that were never held export exactly as before (empty / null, no comment).
 */
import { createHash } from 'crypto';
import {
  CSV_EVENT_HEADERS,
  computeEventRowsChecksum,
  eventLineage,
  eventsToCSV,
  eventsToGeoJSON,
  eventsToJSON,
} from '@/lib/exporters';
import { eventToQuakeML, eventsToQuakeMLDocument } from '@/lib/quakeml-exporter';
import { parseWithDelimiter } from '@/lib/delimiter-detector';

const REPORTS = [
  { catalogueId: 'cat-a', source: 'GeoNet', eventId: 'gn-1', selected: true, originalData: { time: '2016-11-13T11:02:56.000Z', latitude: -42.69, longitude: 173.02, depth: 15.1, magnitude: 7.8 } },
  { catalogueId: 'cat-b', source: 'USGS', eventId: 'us-1', originalData: { time: '2016-11-13T11:02:59.000Z', latitude: -42.74, longitude: 173.05, depth: 22, magnitude: 7.8 } },
];

function row(id: string, over: Record<string, unknown> = {}): any {
  return {
    id,
    catalogue_id: 'cat-m',
    time: '2016-11-13T11:02:56.000Z',
    created_at: '2024-01-01T00:00:00.000Z',
    latitude: -42.69,
    longitude: 173.02,
    depth: 15.1,
    magnitude: 7.8,
    magnitude_type: 'Mw',
    source_id: 'GeoNet:gn-1',
    source_events: JSON.stringify(REPORTS),
    source_catalogue_ids: ['cat-a', 'cat-b'],
    merge_strategy: 'quality',
    merge_parameters: '{"mergeStrategy":"quality","onConflict":"hold"}',
    quality_score: 80,
    quality_grade: 'A',
    review_status: null,
    review_reasons: null,
    ...over,
  };
}

const REASONS = ['Depth range 6.9 km exceeds the threshold', 'Magnitude types disagree (Mw vs ML)'];
const pending = row('evt-pending', { review_status: 'pending', review_reasons: REASONS });
const resolved = row('evt-resolved', { review_status: 'resolved', review_reasons: REASONS, review_choice: 'report:1', reviewed_by: 'u1', reviewed_at: '2026-09-30T00:00:00.000Z' });
const plain = row('evt-plain');
const legacy = { ...row('evt-legacy') };
delete legacy.review_status;
delete legacy.review_reasons;

const metadata = { catalogueName: 'Merged', catalogueId: 'cat-m', version: '1.0.0', mergeStrategy: 'quality' } as any;
const events = [pending, resolved, plain, legacy];

function csvRecords(csv: string): Array<Record<string, string>> {
  const { rows } = parseWithDelimiter(csv, ',');
  const header = csv.split('\n')[0].split(',');
  return rows.map(values => Object.fromEntries(header.map((name, i) => [name, values[i] ?? ''])));
}

/** The text of every <comment> of the document, XML entities decoded. */
const commentTexts = (xml: string) =>
  Array.from(xml.matchAll(/<comment[^>]*>\s*<text>([^<]*)<\/text>/g)).map(m =>
    m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));

describe('eventLineage', () => {
  it('reports the row\'s review status, null when the row was never held', () => {
    expect(eventLineage(pending).reviewStatus).toBe('pending');
    expect(eventLineage(resolved).reviewStatus).toBe('resolved');
    expect(eventLineage(plain).reviewStatus).toBeNull();
    expect(eventLineage(legacy).reviewStatus).toBeNull();
  });
});

describe('CSV', () => {
  const csv = eventsToCSV(events, metadata);
  const records = csvRecords(csv);

  it('adds a ReviewStatus lineage column, empty for rows that were never held', () => {
    expect(CSV_EVENT_HEADERS).toContain('ReviewStatus');
    expect(records.map(r => r.ReviewStatus)).toEqual(['pending', 'resolved', '', '']);
  });

  it('keeps ReviewStatus with the other lineage columns and CatalogueVersion last', () => {
    const headers = CSV_EVENT_HEADERS;
    expect(headers.indexOf('ReviewStatus')).toBe(headers.indexOf('QualityGrade') + 1);
    expect(headers[headers.length - 1]).toBe('CatalogueVersion');
    expect(records.map(r => r.CatalogueVersion)).toEqual(['1.0.0', '1.0.0', '1.0.0', '1.0.0']);
  });

  it('the checksum still covers the plain CSV rendering, review column included', () => {
    const expected = createHash('sha256').update(csv, 'utf8').digest('hex');
    expect(computeEventRowsChecksum(events, metadata).value).toBe(expected);
    const without = computeEventRowsChecksum(events.map(e => ({ ...e, review_status: null })), metadata).value;
    expect(without).not.toBe(expected);
  });
});

describe('JSON and GeoJSON', () => {
  it('carry reviewStatus in every record\'s lineage, null when the row was never held', () => {
    const json = JSON.parse(eventsToJSON(events, metadata));
    const statuses = json.events.map((e: any) => e.reviewStatus);
    expect(statuses).toEqual(['pending', 'resolved', null, null]);
    expect(json.events.every((e: any) => 'reviewStatus' in e)).toBe(true);

    const geojson = JSON.parse(eventsToGeoJSON(events, metadata));
    expect(geojson.features.map((f: any) => f.properties.reviewStatus)).toEqual(['pending', 'resolved', null, null]);
  });
});

describe('QuakeML', () => {
  it('writes a review comment with the reasons on a pending event only', () => {
    const texts = commentTexts(eventToQuakeML(pending));
    const review = texts.filter(t => t.startsWith('Merge review'));
    expect(review).toEqual([`Merge review: pending — ${REASONS.join('; ')}`]);
    // The comment is a BED Comment: it carries <text> and an id in resource-id form.
    expect(eventToQuakeML(pending)).toMatch(/<comment id="[^"]*evt-pending-review[^"]*">\s*<text>Merge review: pending/);

    for (const event of [resolved, plain, legacy]) {
      expect(commentTexts(eventToQuakeML(event)).some(t => t.startsWith('Merge review'))).toBe(false);
    }
  });

  it('reads reasons stored as JSON text and copes with a held row that records none', () => {
    const asText = row('evt-text', { review_status: 'pending', review_reasons: JSON.stringify(REASONS) });
    expect(commentTexts(eventToQuakeML(asText))).toContain(`Merge review: pending — ${REASONS.join('; ')}`);
    const noReasons = row('evt-none', { review_status: 'pending', review_reasons: [] });
    expect(commentTexts(eventToQuakeML(noReasons))).toContain('Merge review: pending');
  });

  it('keeps the comment ahead of the origins and magnitudes (BED element order) and escapes its text', () => {
    const spiky = row('evt-xml', { review_status: 'pending', review_reasons: ['Ambiguous <group> & "conflict"'] });
    const xml = eventsToQuakeMLDocument([spiky], 'Merged', metadata);
    const comment = xml.indexOf('Merge review: pending');
    expect(comment).toBeGreaterThan(-1);
    expect(xml).toContain('Merge review: pending — Ambiguous &lt;group&gt; &amp; &quot;conflict&quot;');
    expect(comment).toBeLessThan(xml.indexOf('<origin '));
    expect(comment).toBeLessThan(xml.indexOf('<magnitude '));
  });
});
