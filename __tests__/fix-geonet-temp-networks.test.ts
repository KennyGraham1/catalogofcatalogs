/** @jest-environment node */
/**
 * scripts/import-temp-networks.ts (findings #101 and #111).
 *
 * #101: the IRIS fdsnws-event text Time column is UTC with no zone designator. The
 * script re-parsed it with new Date(raw), which ECMA-262 reads as LOCAL time, so on a
 * Pacific/Auckland machine every origin time and both catalogue time-period bounds were
 * stored 12-13 h early. Expected values below are the raw column read as UTC.
 *
 * #111: the smallest magnitude in the file was written as data_quality.completeness
 * ("M0.3+ for ..."), which exports then advertised as the magnitude of completeness.
 */

// The script imports lib/mongodb for its main(); these tests never reach it.
jest.mock('@/lib/mongodb', () => ({
  __esModule: true,
  getDb: jest.fn(() => {
    throw new Error('no database in unit tests');
  }),
  COLLECTIONS: { CATALOGUES: 'merged_catalogues', EVENTS: 'merged_events' },
}));

import { execFileSync } from 'node:child_process';
import {
  parseCatalogText,
  buildCatalogueDocument,
  buildEventDocuments,
  type NetworkMetadata,
} from '../scripts/import-temp-networks';

// Real rows from the IRIS downloads the script reads (Darfield mainshock, Arthur's
// Pass, Dusky Sound). Darfield occurred at 16:35:46 UTC on 3 Sept 2010 (04:35 NZST
// on 4 Sept); July is NZST (+12), September is NZST, 1994-06 is NZST.
const FILE = [
  '#EventID | Time | Latitude | Longitude | Depth/km | Author | Catalog | Contributor | ContributorID | MagType | Magnitude | MagAuthor | EventLocationName',
  '2879335|2010-09-03T16:35:46|-43.3608|171.9023|4.0|ISC|ISC|ISC|15155483|MW|7.0|GCMT|SOUTH ISLAND, NEW ZEALAND',
  '377499|1994-06-18T03:25:15|-43.1077|171.6149|11.0|ISC|ISC|ISC|169816|mw|6.7|NEIC|SOUTH ISLAND, NEW ZEALAND',
  '2871698|2009-07-15T09:22:31|-45.8339|166.6363|20.9|ISC|ISC|ISC|15157724|MW|7.8|GCMT|OFF W. COAST OF S. ISLAND, N.Z.',
  // A summer (NZDT, +13) row with fractional seconds.
  '2900001|2011-01-05T01:02:03.250|-43.5|172.6|8.0|ISC|ISC|ISC|15200001|ML|3.1|WEL|SOUTH ISLAND, NEW ZEALAND',
].join('\n');

const METADATA: NetworkMetadata = {
  fdsnCode: 'ZU',
  fullName: 'Test Deployment',
  operationalPeriod: '2009-2011',
  operatingInstitution: 'Test Institution',
  scientificPurpose: 'Alpine Fault monitoring.',
  geographicRegion: 'Canterbury',
  catalogLatRange: '-46 to -43',
  catalogLonRange: '166 to 173',
  eventCount: 4,
  dateRange: '1994-06-18 to 2011-01-05',
};

describe('import-temp-networks origin times (#101)', () => {
  it('stores every FDSN text time as the UTC instant it names', () => {
    const events = parseCatalogText(FILE);
    const docs = buildEventDocuments(events, 'cat-zu', '2026-01-01T00:00:00.000Z');

    expect(docs.map((d) => d.time)).toEqual([
      '2010-09-03T16:35:46.000Z',
      '1994-06-18T03:25:15.000Z',
      '2009-07-15T09:22:31.000Z',
      '2011-01-05T01:02:03.250Z',
    ]);
    // The bare IRIS EventID stays the source identifier.
    expect(docs.map((d) => d.source_id)).toEqual(['2879335', '377499', '2871698', '2900001']);
  });

  it('derives the catalogue time period from the UTC instants', () => {
    const events = parseCatalogText(FILE);
    const doc = buildCatalogueDocument('ZU', METADATA, events, 'cat-zu', '2026-01-01T00:00:00.000Z');

    expect(doc).not.toBeNull();
    expect(doc!.time_period_start).toBe('1994-06-18T03:25:15.000Z');
    expect(doc!.time_period_end).toBe('2011-01-05T01:02:03.250Z');
    // Bounds keep the antimeridian-aware extent.
    expect([doc!.min_latitude, doc!.max_latitude]).toEqual([-45.8339, -43.1077]);
    expect([doc!.min_longitude, doc!.max_longitude]).toEqual([166.6363, 172.6]);
  });

  it('skips a row whose time cannot be read instead of throwing', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const events = parseCatalogText(
      FILE + '\n2999999|not-a-time|-43.5|172.6|8.0|ISC|ISC|ISC|1|ML|3.1|WEL|SOUTH ISLAND, NEW ZEALAND'
    );
    expect(events.map((e) => e.eventId)).not.toContain('2999999');
    expect(events).toHaveLength(4);
    expect(() => buildEventDocuments(events, 'cat-zu')).not.toThrow();
    warn.mockRestore();
  });

  it('gives the same instants whatever the machine timezone is', () => {
    // process.env.TZ must be set before V8 first resolves the zone, so run the real
    // script module in fresh processes (as __tests__/lib/timestamp-timezone.test.ts does).
    const script = `
      const { parseCatalogText, buildCatalogueDocument, buildEventDocuments } = require('./scripts/import-temp-networks');
      const file = ${JSON.stringify(FILE)};
      const events = parseCatalogText(file);
      const cat = buildCatalogueDocument('ZU', ${JSON.stringify(METADATA)}, events, 'c', '2026-01-01T00:00:00.000Z');
      process.stdout.write(JSON.stringify({
        times: buildEventDocuments(events, 'c').map((d) => d.time),
        start: cat.time_period_start,
        end: cat.time_period_end,
      }));
    `;
    const run = (tz: string) =>
      JSON.parse(
        execFileSync(process.execPath, ['--import', 'tsx', '-e', script], {
          env: { ...process.env, TZ: tz },
          encoding: 'utf8',
        })
      );

    const expected = {
      times: [
        '2010-09-03T16:35:46.000Z',
        '1994-06-18T03:25:15.000Z',
        '2009-07-15T09:22:31.000Z',
        '2011-01-05T01:02:03.250Z',
      ],
      start: '1994-06-18T03:25:15.000Z',
      end: '2011-01-05T01:02:03.250Z',
    };
    expect(run('Pacific/Auckland')).toEqual(expected);
    expect(run('UTC')).toEqual(expected);
  }, 30000);
});

describe('import-temp-networks data quality (#111)', () => {
  it('does not record the smallest magnitude as the completeness magnitude', () => {
    const events = parseCatalogText(FILE);
    const doc = buildCatalogueDocument('ZU', METADATA, events, 'cat-zu');
    const quality = JSON.parse(String(doc!.data_quality));

    expect(quality).not.toHaveProperty('completeness');
    // The observed range is still reported, labelled as the range it is.
    expect(quality.magnitudeRange).toBe('M 3.1 - 7.8');
  });

  it('starts the catalogue at version 1.0.0', () => {
    const doc = buildCatalogueDocument('ZU', METADATA, parseCatalogText(FILE), 'cat-zu', '2026-01-01T00:00:00.000Z');
    expect(doc!.version).toBe('1.0.0');
    expect(doc!.version_updated_at).toBe('2026-01-01T00:00:00.000Z');
  });
});
