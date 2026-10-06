/**
 * GeoNet's own locality text on the map hover card (lib/geonet-locality.ts): which events
 * are GeoNet's, the lazy per-event lookup against GeoNet's quake API (cache, in-flight
 * deduplication, timeout, concurrency, failures), and the card's GeoNet title. fetch is
 * mocked throughout: no test touches the network.
 */
import {
  GEONET_LOCALITY_ATTRIBUTION, GEONET_LOCALITY_FAILURE_TTL_MS, GEONET_LOCALITY_MAX_CONCURRENT,
  GEONET_LOCALITY_TIMEOUT_MS, fetchGeoNetLocality, geonetPublicIdOf, isGeoNetEventId,
  peekGeoNetLocality, resetGeoNetLocalityForTests,
} from '@/lib/geonet-locality';
import { buildEventCardHtml } from '@/lib/map-event-card';
import { agencyFromCode, agencyFromName } from '@/lib/merge';

const KAIKOURA = '2016p858000';
const LOCALITY = '15 km north-east of Culverden';

/** A GeoNet quake API answer (GeoJSON FeatureCollection). */
const quake = (publicID: string, locality: unknown) => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [173.02, -42.69] }, properties: { publicID, locality, magnitude: 7.8 } }],
});
const answer = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

const originalFetch = global.fetch;
let fetchMock: jest.Mock;
beforeEach(() => {
  resetGeoNetLocalityForTests();
  fetchMock = jest.fn(async (url: string) => answer(200, quake(String(url).split('/').pop()!, `  ${LOCALITY} `)));
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  jest.useRealTimers();
  global.fetch = originalFetch;
  resetGeoNetLocalityForTests();
});

describe('GeoNet event ids', () => {
  it('are a year, a lower-case "p" and six digits, and nothing else', () => {
    for (const id of ['2016p858000', '2024p100000', '2013p543824', '1999p000001']) expect(isGeoNetEventId(id)).toBe(true);
    for (const id of [
      '2016P858000', '2016p85800', '2016p8580001', '16p858000', 'x2016p858000', '2016p858000x',
      ' 2016p858000', '2016a858000', '2016p85800a', '3366146', 'us2016p858000', '2116p858000', '', null, 2016858000,
    ]) expect(isGeoNetEventId(id)).toBe(false);
  });
});

describe('which events are GeoNet\'s', () => {
  it('recognises the GeoNet importer\'s rows, by the smi:nz.org.geonet publicID alone', () => {
    expect(geonetPublicIdOf({ source_id: KAIKOURA, event_public_id: `smi:nz.org.geonet/${KAIKOURA}`, catalogue: 'NZ quakes' })).toBe(KAIKOURA);
    expect(geonetPublicIdOf({ event_public_id: `smi:nz.org.geonet/${KAIKOURA}` })).toBe(KAIKOURA);
    expect(geonetPublicIdOf({ event_public_id: `quakeml:nz.org.geonet/${KAIKOURA}` })).toBe(KAIKOURA);
    expect(geonetPublicIdOf({ event_public_id: `https://www.geonet.org.nz/earthquake/${KAIKOURA}` })).toBe(KAIKOURA);
  });

  it('recognises merge-qualified source ids whose qualification names GeoNet', () => {
    expect(geonetPublicIdOf({ source_id: `GeoNet:${KAIKOURA}` })).toBe(KAIKOURA);
    expect(geonetPublicIdOf({ source_id: `GeoNet - Automated Import:${KAIKOURA}`, catalogue: 'Merged NZ 2016' })).toBe(KAIKOURA);
    // Re-merged: the qualification nearest the id names its source.
    expect(geonetPublicIdOf({ source_id: `Merged NZ 2016:GeoNet:${KAIKOURA}` })).toBe(KAIKOURA);
    expect(geonetPublicIdOf({ source_id: `GeoNet:smi:nz.org.geonet/${KAIKOURA}` })).toBe(KAIKOURA);
  });

  it('accepts a bare id when the row\'s agency code or its catalogue names GeoNet', () => {
    expect(geonetPublicIdOf({ source_id: KAIKOURA, catalogue: 'GeoNet' })).toBe(KAIKOURA);
    expect(geonetPublicIdOf({ source_id: KAIKOURA, catalogue: 'GeoNet Quake Search 2016' })).toBe(KAIKOURA);
    expect(geonetPublicIdOf({ source_id: KAIKOURA, catalogue: 'GNS earthquakes' })).toBe(KAIKOURA);
    expect(geonetPublicIdOf({ source_id: KAIKOURA, source: 'GeoNet' })).toBe(KAIKOURA);
    expect(geonetPublicIdOf({ source_id: KAIKOURA, agency_id: 'WEL(GNS_Primary)' })).toBe(KAIKOURA);
    expect(geonetPublicIdOf({ source_id: KAIKOURA, agency_id: 'NZ' })).toBe(KAIKOURA);
    expect(geonetPublicIdOf({ source_id: KAIKOURA, author: 'WEL(GNS_Primary)' })).toBe(KAIKOURA);
    expect(geonetPublicIdOf({ event_public_id: KAIKOURA, catalogue: 'GeoNet' })).toBe(KAIKOURA);
  });

  it('does not take a look-alike id on its shape alone', () => {
    // Nothing but the shape says GeoNet: a campaign or SeisComP network with the same id format.
    expect(geonetPublicIdOf({ source_id: KAIKOURA })).toBeNull();
    expect(geonetPublicIdOf({ source_id: KAIKOURA, catalogue: 'Canterbury sequence 2016' })).toBeNull();
    // Region words are not GeoNet ("Merged NZ Catalogue", "ISC bulletin (NZ)").
    expect(geonetPublicIdOf({ source_id: KAIKOURA, catalogue: 'Merged NZ Catalogue' })).toBeNull();
    // A catalogue naming two agencies names neither.
    expect(geonetPublicIdOf({ source_id: KAIKOURA, catalogue: 'GeoNet vs USGS comparison' })).toBeNull();
    // An author that is not a GeoNet code is no evidence.
    expect(geonetPublicIdOf({ source_id: KAIKOURA, author: 'scevent@seiscomp' })).toBeNull();
  });

  it('does not take an id the row attributes to another agency', () => {
    expect(geonetPublicIdOf({ source_id: KAIKOURA, catalogue: 'GeoNet', agency_id: 'ISC' })).toBeNull();
    expect(geonetPublicIdOf({ event_public_id: `smi:nz.org.geonet/${KAIKOURA}`, agency_id: 'US' })).toBeNull();
    expect(geonetPublicIdOf({ source_id: `ISC Bulletin:${KAIKOURA}`, catalogue: 'GeoNet' })).toBeNull();
    expect(geonetPublicIdOf({ source_id: `USGS ComCat:${KAIKOURA}` })).toBeNull();
    expect(geonetPublicIdOf({ event_public_id: `quakeml:us.anss.org/event/${KAIKOURA}`, catalogue: 'GeoNet' })).toBeNull();
    expect(geonetPublicIdOf({ event_public_id: `https://earthquake.usgs.gov/${KAIKOURA}`, catalogue: 'GeoNet' })).toBeNull();
    // Two different ids on one row: not trusted.
    expect(geonetPublicIdOf({ source_id: '2016p858001', event_public_id: `smi:nz.org.geonet/${KAIKOURA}` })).toBeNull();
  });

  it('ignores ids not in GeoNet\'s form and odd input, without throwing', () => {
    expect(geonetPublicIdOf({ source_id: '3366146', catalogue: 'GeoNet' })).toBeNull(); // pre-2012 numeric id
    expect(geonetPublicIdOf({ source_id: 'us7000abcd', catalogue: 'GeoNet' })).toBeNull();
    expect(geonetPublicIdOf({ event_public_id: 'smi:nz.org.geonet/Origin#123', catalogue: 'GeoNet' })).toBeNull();
    expect(geonetPublicIdOf({ source_id: `merge-row:0b6f1c2e-0000-4000-8000-000000000000`, catalogue: 'GeoNet' })).toBeNull();
    expect(geonetPublicIdOf({ source_id: `${KAIKOURA}.1`, catalogue: 'GeoNet' })).toBeNull();
    // The platform's own smi:local namespace is neutral, not another agency.
    expect(geonetPublicIdOf({ event_public_id: `smi:local/${KAIKOURA}`, catalogue: 'GeoNet' })).toBe(KAIKOURA);
    expect(geonetPublicIdOf(null)).toBeNull();
    expect(geonetPublicIdOf({ source_id: 42, event_public_id: {}, catalogue: ['GeoNet'] })).toBeNull();
  });

  it('reads catalogue names and agency codes as lib/merge.ts does', () => {
    for (const label of [
      'GeoNet', 'GeoNet - Automated Import', 'GNS Science', 'GeoNet CMT', 'Merged NZ Catalogue', 'ISC bulletin (NZ)',
      'USGS ComCat NZ region', 'GeoNet vs USGS comparison', 'CMT', 'Franz Josef', 'geonet_2016', 'Tonga campaigns',
    ]) {
      const ours = geonetPublicIdOf({ source_id: KAIKOURA, catalogue: label }) !== null;
      expect([label, ours]).toEqual([label, agencyFromName(label) === 'geonet']);
    }
    for (const code of ['WEL', 'WEL(GNS_Primary)', 'nz', 'GNS', 'GeoNet', 'ISC', 'US', 'HRV', 'XYZ']) {
      const ours = geonetPublicIdOf({ source_id: KAIKOURA, agency_id: code }) !== null;
      expect([code, ours]).toEqual([code, agencyFromCode(code) === 'geonet']);
    }
  });
});

describe('fetchGeoNetLocality', () => {
  it('asks GeoNet\'s quake API for the event and resolves to the trimmed locality', async () => {
    await expect(fetchGeoNetLocality(KAIKOURA)).resolves.toBe(LOCALITY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.geonet.org.nz/quake/${KAIKOURA}`);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'omit' });
  });

  it('caches the answer: later calls, and peeks, need no request', async () => {
    expect(peekGeoNetLocality(KAIKOURA)).toBeUndefined();
    await fetchGeoNetLocality(KAIKOURA);
    expect(peekGeoNetLocality(KAIKOURA)).toBe(LOCALITY);
    await expect(fetchGeoNetLocality(KAIKOURA)).resolves.toBe(LOCALITY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends one request for concurrent callers of the same event', async () => {
    const results = await Promise.all([fetchGeoNetLocality(KAIKOURA), fetchGeoNetLocality(KAIKOURA), fetchGeoNetLocality(KAIKOURA)]);
    expect(results).toEqual([LOCALITY, LOCALITY, LOCALITY]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after the timeout, remembers the failure briefly, then may ask again', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise(() => {})); // GeoNet never answers
    const result = fetchGeoNetLocality(KAIKOURA);
    await jest.advanceTimersByTimeAsync(GEONET_LOCALITY_TIMEOUT_MS - 1);
    expect(peekGeoNetLocality(KAIKOURA)).toBeUndefined();
    await jest.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBeNull();
    // The request was aborted when it timed out.
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
    // Remembered as "none" for a while: no retry storm on the next hovers.
    await expect(fetchGeoNetLocality(KAIKOURA)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(GEONET_LOCALITY_FAILURE_TTL_MS);
    expect(peekGeoNetLocality(KAIKOURA)).toBeUndefined();
    void fetchGeoNetLocality(KAIKOURA);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resolves to null on a network error, a server error or a bad answer, and retries only after a while', async () => {
    jest.useFakeTimers();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(fetchGeoNetLocality(KAIKOURA)).resolves.toBeNull();
    fetchMock.mockResolvedValueOnce(answer(503));
    await expect(fetchGeoNetLocality('2016p858001')).resolves.toBeNull();
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new SyntaxError('not JSON'); } });
    await expect(fetchGeoNetLocality('2016p858002')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await expect(fetchGeoNetLocality(KAIKOURA)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await jest.advanceTimersByTimeAsync(GEONET_LOCALITY_FAILURE_TTL_MS + 1);
    await expect(fetchGeoNetLocality(KAIKOURA)).resolves.toBe(LOCALITY);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('never retries a 404, or an event GeoNet gives no locality', async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValueOnce(answer(404));
    await expect(fetchGeoNetLocality(KAIKOURA)).resolves.toBeNull();
    fetchMock.mockResolvedValueOnce(answer(200, quake('2016p858001', '   ')));
    await expect(fetchGeoNetLocality('2016p858001')).resolves.toBeNull();
    await jest.advanceTimersByTimeAsync(GEONET_LOCALITY_FAILURE_TTL_MS * 10);
    await fetchGeoNetLocality(KAIKOURA);
    await fetchGeoNetLocality('2016p858001');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(peekGeoNetLocality(KAIKOURA)).toBeNull();
  });

  it('ignores an answer about another event or without features', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, quake('2016p858999', LOCALITY)));
    await expect(fetchGeoNetLocality(KAIKOURA)).resolves.toBeNull();
    fetchMock.mockResolvedValueOnce(answer(200, { type: 'FeatureCollection', features: [] }));
    await expect(fetchGeoNetLocality('2016p858001')).resolves.toBeNull();
  });

  it(`has at most ${GEONET_LOCALITY_MAX_CONCURRENT} requests in flight; the rest wait for a slot`, async () => {
    const answers: Array<() => void> = [];
    fetchMock.mockImplementation((url: string) => new Promise((resolve) => {
      const id = String(url).split('/').pop()!;
      answers.push(() => resolve(answer(200, quake(id, `near ${id.slice(-3)}`))));
    }));
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
    const ids = Array.from({ length: 6 }, (_, i) => `2024p10000${i}`);
    const results = ids.map((id) => fetchGeoNetLocality(id));
    expect(fetchMock).toHaveBeenCalledTimes(GEONET_LOCALITY_MAX_CONCURRENT);
    answers[0]();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(GEONET_LOCALITY_MAX_CONCURRENT + 1);
    answers.forEach((done) => done());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(6);
    answers.forEach((done) => done());
    await expect(Promise.all(results)).resolves.toEqual(ids.map((id) => `near ${id.slice(-3)}`));
  });

  it('never sends a queued request every caller has abandoned', async () => {
    const answers: Array<() => void> = [];
    fetchMock.mockImplementation((url: string) => new Promise((resolve) => {
      answers.push(() => resolve(answer(200, quake(String(url).split('/').pop()!, LOCALITY))));
    }));
    const busy = Array.from({ length: GEONET_LOCALITY_MAX_CONCURRENT }, (_, i) => fetchGeoNetLocality(`2024p20000${i}`));
    const left = new AbortController();
    const abandoned = fetchGeoNetLocality(KAIKOURA, { signal: left.signal });
    left.abort(); // the pointer left that marker while its request waited
    answers.forEach((done) => done());
    await Promise.all(busy);
    await expect(abandoned).resolves.toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain(`https://api.geonet.org.nz/quake/${KAIKOURA}`);
    // Not remembered: the next hover asks.
    expect(peekGeoNetLocality(KAIKOURA)).toBeUndefined();
  });

  it('with start: false only joins a request already under way', async () => {
    await expect(fetchGeoNetLocality(KAIKOURA, { start: false })).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    const asked = fetchGeoNetLocality(KAIKOURA);
    await expect(fetchGeoNetLocality(KAIKOURA, { start: false })).resolves.toBe(LOCALITY);
    await asked;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never throws and sends nothing for ids not in GeoNet\'s form, or where fetch is missing or throws', async () => {
    await expect(fetchGeoNetLocality('us7000abcd')).resolves.toBeNull();
    await expect(fetchGeoNetLocality('2016p858000/../../users')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockImplementationOnce(() => { throw new Error('boom'); });
    await expect(fetchGeoNetLocality(KAIKOURA)).resolves.toBeNull();
    resetGeoNetLocalityForTests();
    (global as { fetch?: typeof fetch }).fetch = undefined;
    expect(() => fetchGeoNetLocality(KAIKOURA)).not.toThrow();
    await expect(fetchGeoNetLocality(KAIKOURA)).resolves.toBeNull();
  });

  it('credits GeoNet under CC BY 4.0 in the map attribution text', () => {
    expect(GEONET_LOCALITY_ATTRIBUTION).toContain('GeoNet');
    expect(GEONET_LOCALITY_ATTRIBUTION).toContain('CC BY 4.0');
  });
});

describe('the hover card with GeoNet\'s locality', () => {
  const event = {
    id: 'e1', time: '2016-11-13T11:02:56Z', latitude: -42.69, longitude: 173.02, depth: 15,
    magnitude: 7.8, magnitude_type: 'Mw', source_id: KAIKOURA, region: 'South Island, New Zealand',
  };
  const places = [{ name: 'Waiau', latitude: -42.65, longitude: 173.04 }];
  const title = (html: string) => /<div class="eq-card-title">(.*?)<\/div>/.exec(html)![1];

  it('titles the card with GeoNet\'s text and credits GeoNet in a muted line', () => {
    const html = buildEventCardHtml(event, places, { geonetLocality: ` ${LOCALITY}  ` });
    expect(title(html)).toBe(`${LOCALITY}<span class="eq-card-credit eq-card-muted">Locality: GeoNet</span>`);
    expect(html).not.toContain('of Waiau');
  });

  it('keeps the Gazetteer / region / epicentre title without it, and with no credit line', () => {
    for (const options of [undefined, {}, { geonetLocality: null }, { geonetLocality: '   ' }]) {
      const html = buildEventCardHtml(event, places, options);
      expect(title(html)).toMatch(/of Waiau$/);
      expect(html).not.toContain('GeoNet');
    }
    expect(title(buildEventCardHtml(event, [], { geonetLocality: null }))).toBe('South Island, New Zealand');
  });

  it('escapes GeoNet\'s text', () => {
    const html = buildEventCardHtml(event, places, { geonetLocality: '<img src=x onerror=alert(1)> & "Culverden"' });
    expect(html).not.toContain('<img');
    expect(title(html)).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;Culverden&quot;');
  });
});
