/**
 * GeoNet's own locality text for GeoNet events ("15 km north-east of Culverden"), shown on
 * the map hover card in place of the locality this platform derives from the LINZ
 * Gazetteer (lib/nz-localities.ts).
 *
 * The text is not in anything the importer reads: GeoNet's FDSN QuakeML (lib/geonet-client.ts)
 * carries only a broad region ("South Island, New Zealand") and the bulk Quake Search CSV has
 * no locality column. GeoNet's quake API has it per event,
 *
 *   GET https://api.geonet.org.nz/quake/{publicID}
 *     → GeoJSON FeatureCollection; features[0].properties.locality
 *
 * (the list endpoint only covers about the last 100 quakes). So it is fetched lazily, in the
 * browser, for the one event the user points at - never at import and never for a whole
 * catalogue. The CSP's connect-src already allows https://api.geonet.org.nz (middleware.ts).
 * GeoNet data is CC BY 4.0: wherever the text is shown, GeoNet is credited (the card's
 * "Locality: GeoNet" line and GEONET_LOCALITY_ATTRIBUTION on the map).
 *
 * WHICH EVENTS ARE GEONET'S (geonetPublicIdOf) - strict, so that another catalogue's
 * look-alike id is never sent to GeoNet or captioned with GeoNet's text:
 *
 *  1. The id. A GeoNet event id is a year, the letter "p" and six digits: "2016p858000"
 *     (GEONET_EVENT_ID; lower-case p, the whole string, years 1900-2099). It is read from
 *     - event_public_id: GeoNet's QuakeML resource id "smi:nz.org.geonet/2016p858000" (the
 *       last path segment; "quakeml:" and https://*.geonet.org.nz/... URLs likewise), or a
 *       bare id;
 *     - source_id: the bare id "2016p858000" (GeoNet import, Quake Search CSV upload), or the
 *       merge-qualified "GeoNet:2016p858000" / "GeoNet - Automated Import:2016p858000" a merge
 *       writes ('<source catalogue>:<id>', one qualification per merge).
 *     When both fields carry an id and they differ, the event is not treated as GeoNet's.
 *  2. Nothing on the row may name another agency:
 *     - an agency_id that is not one of GeoNet's codes (WEL, NZ, GNS, GEONET, optionally
 *       with a parenthesised suffix such as "WEL(GNS_Primary)" - lib/merge.ts AGENCY_CODES);
 *     - a resource id in another agency's namespace ("quakeml:us.anss.org/...",
 *       "smi:ISC/evid=..."; the platform's own "smi:local/..." is neutral);
 *     - a merge qualification naming another agency ("ISC Bulletin:2016p858000").
 *  3. Something must say GeoNet:
 *     - the id is in GeoNet's namespace (smi:nz.org.geonet/..., *.geonet.org.nz), or
 *     - its merge qualification names GeoNet, or
 *     - agency_id (or author) is a GeoNet code, or
 *     - the catalogue label (catalogue, catalogue_name or source) names GeoNet and no other
 *       agency, by whole words as lib/merge.ts agencyFromName reads names ("GeoNet",
 *       "GNS"; "Merged NZ Catalogue" and "GeoNet vs USGS comparison" do not).
 *     A bare "2016p858000" in a catalogue called "Canterbury sequence" is therefore not
 *     looked up: nothing but its shape says it is GeoNet's.
 *
 * FETCH POLICY (fetchGeoNetLocality): browser only; an in-memory cache for the page's life
 * (a locality, or "none" after a 404 or an answer without one - never retried); other
 * failures (network error, 5xx, 408/429, bad JSON, the GEONET_LOCALITY_TIMEOUT_MS timeout)
 * are remembered as "none" for GEONET_LOCALITY_FAILURE_TTL_MS, then a later hover may try
 * again; one request per id at a time (in-flight deduplication); at most
 * GEONET_LOCALITY_MAX_CONCURRENT requests at once, a short queue behind them (oldest dropped),
 * and a queued request every caller has abandoned (its AbortSignal aborted: the pointer left
 * the marker) is never sent. No retries. It resolves to the trimmed locality or null and
 * never throws.
 */

/** GeoNet's per-event quake API (GeoJSON). */
export const GEONET_QUAKE_API = 'https://api.geonet.org.nz/quake';

/** Credit for GeoNet's locality text, as the map attribution shows it (CC BY 4.0 requires it). */
export const GEONET_LOCALITY_ATTRIBUTION = 'Event localities &copy; <a href="https://www.geonet.org.nz">GeoNet</a> (CC BY 4.0)';

/** GeoNet's event id: year, "p", six digits ("2016p858000"). */
export const GEONET_EVENT_ID = /^(?:19|20)\d{2}p\d{6}$/;

/** A request that has not answered by then counts as a (briefly remembered) failure. */
export const GEONET_LOCALITY_TIMEOUT_MS = 4000;
/** Requests to GeoNet in flight at once, at most. */
export const GEONET_LOCALITY_MAX_CONCURRENT = 4;
/** How long a failure (other than a 404) is remembered before a hover may ask again. */
export const GEONET_LOCALITY_FAILURE_TTL_MS = 30_000;
/** Requests waiting for a free slot, at most; the oldest is dropped beyond it. */
const MAX_QUEUED = 8;
/** Ids remembered, at most (oldest forgotten first); hovering is human-paced, so this is ample. */
const MAX_CACHED = 2000;
/** Longer text is not a locality ("15 km north-east of Culverden"); it is not shown. */
const MAX_LOCALITY_LENGTH = 160;

/** Whether a value is a GeoNet event id in GeoNet's own form ("2016p858000"). */
export function isGeoNetEventId(id: unknown): id is string {
  return typeof id === 'string' && GEONET_EVENT_ID.test(id);
}

// ============================================================================
// WHICH EVENTS ARE GEONET'S
// ============================================================================

/** The event fields geonetPublicIdOf reads (any event object may be passed). */
export interface GeoNetIdentityFields {
  source_id?: unknown;
  event_public_id?: unknown;
  agency_id?: unknown;
  author?: unknown;
  /** Catalogue name (catalogue-event-loader stamps every event with it). */
  catalogue?: unknown;
  catalogue_name?: unknown;
  /** Source label (merge previews). */
  source?: unknown;
}

/** 'geonet', 'other' (another agency), or null (says nothing about the agency). */
type Attribution = 'geonet' | 'other' | null;

/** GeoNet's agency codes (lib/merge.ts AGENCY_CODES, the 'geonet' entries). */
const GEONET_AGENCY_CODES: ReadonlySet<string> = new Set(['wel', 'nz', 'gns', 'geonet']);

/** Whole words that name an agency in free text (mirrors lib/merge.ts AGENCY_NAME_TOKENS). */
const AGENCY_NAME_TOKENS: ReadonlyMap<string, string> = new Map([
  ['geonet', 'geonet'], ['gns', 'geonet'],
  ['gcmt', 'gcmt'], ['globalcmt', 'gcmt'],
  ['isc', 'isc'], ['iscgem', 'isc'],
  ['usgs', 'usgs'], ['neic', 'usgs'], ['anss', 'usgs'], ['comcat', 'usgs'],
  ['emsc', 'emsc'], ['csem', 'emsc'],
  ['jma', 'jma'],
  ['geofon', 'geofon'], ['gfz', 'geofon'],
  ['iris', 'iris'],
  ['ingv', 'ingv'],
  ['ign', 'ign'],
  ['bgr', 'bgr'],
]);
/** Product words naming an agency only when no agency name is beside them (lib/merge.ts GENERIC_AGENCY_TOKENS). */
const GENERIC_AGENCY_TOKENS: ReadonlyMap<string, string> = new Map([['cmt', 'gcmt']]);

/** An agency code ('WEL(GNS_Primary)'): GeoNet's, another agency's (any other code), or none. */
function agencyCodeAttribution(code: unknown): Attribution {
  if (typeof code !== 'string' || !code.trim()) return null;
  const bare = code.trim().toLowerCase().replace(/\s*\(.*\)\s*$/, '');
  return GEONET_AGENCY_CODES.has(bare) ? 'geonet' : 'other';
}

/**
 * The agency a free-text label names by whole words, as lib/merge.ts agencyFromName reads
 * it: GeoNet, another agency, or null for none or several ("GeoNet vs USGS comparison").
 */
function labelAttribution(label: unknown): Attribution {
  if (typeof label !== 'string' || !label) return null;
  const named = new Set<string>();
  const generic = new Set<string>();
  for (const token of label.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!token) continue;
    const agency = AGENCY_NAME_TOKENS.get(token);
    if (agency) named.add(agency);
    const product = GENERIC_AGENCY_TOKENS.get(token);
    if (product) generic.add(product);
  }
  const agencies = named.size > 0 ? named : generic;
  if (agencies.size !== 1) return null;
  return agencies.has('geonet') ? 'geonet' : 'other';
}

/** A GeoNet web or API address (www.geonet.org.nz, api.geonet.org.nz, ...). */
const isGeoNetHost = (host: string) => host === 'geonet.org.nz' || host.endsWith('.geonet.org.nz');

/**
 * An identifier field read for a GeoNet id: the id (when one in GeoNet's form is there) and
 * whom the identifier itself attributes it to (its namespace or merge qualification).
 */
function readIdentifier(raw: unknown): { id: string | null; attribution: Attribution } {
  if (typeof raw !== 'string') return { id: null, attribution: null };
  let text = raw.trim();
  let qualifiedBy: Attribution = null;
  // Bounded: a row re-merged several times carries one qualification per merge.
  for (let depth = 0; depth < 8 && text; depth++) {
    const url = /^https?:\/\/([^/?#]+)([^?#]*)/i.exec(text);
    if (url) {
      const last = url[2].split('/').filter(Boolean).pop() ?? '';
      return { id: isGeoNetEventId(last) ? last : null, attribution: isGeoNetHost(url[1].toLowerCase()) ? 'geonet' : 'other' };
    }
    const resource = /^(?:smi|quakeml):([^/?#]+)\/([^?#]*)/i.exec(text);
    if (resource) {
      const authority = resource[1].toLowerCase();
      const last = resource[2].split('/').filter(Boolean).pop() ?? '';
      const namespace: Attribution = authority === 'nz.org.geonet' ? 'geonet' : authority === 'local' ? null : 'other';
      return { id: isGeoNetEventId(last) ? last : null, attribution: namespace ?? qualifiedBy };
    }
    // '<source>:<id>' (lib/merge.ts MERGE_QUALIFICATION): the qualification nearest the id
    // that names an agency says whose id it is.
    const qualification = /^([^:/]+):(?=.)/.exec(text);
    if (!qualification) break;
    qualifiedBy = labelAttribution(qualification[1]) ?? qualifiedBy;
    text = text.slice(qualification[0].length).trim();
  }
  return { id: isGeoNetEventId(text) ? text : null, attribution: qualifiedBy };
}

/**
 * The GeoNet public id ("2016p858000") of an event that is GeoNet's, or null - see "WHICH
 * EVENTS ARE GEONET'S" in the module comment for the rule. Never throws.
 */
export function geonetPublicIdOf(event: object | null | undefined): string | null {
  if (!event || typeof event !== 'object') return null;
  try {
    const fields = event as GeoNetIdentityFields;
    const agency = agencyCodeAttribution(fields.agency_id);
    if (agency === 'other') return null;
    const publicId = readIdentifier(fields.event_public_id);
    const sourceId = readIdentifier(fields.source_id);
    if (publicId.attribution === 'other' || sourceId.attribution === 'other') return null;
    const ids = new Set([publicId.id, sourceId.id].filter((id): id is string => id !== null));
    if (ids.size !== 1) return null;
    const [id] = Array.from(ids);
    const saysGeoNet =
      (publicId.id !== null && publicId.attribution === 'geonet') ||
      (sourceId.id !== null && sourceId.attribution === 'geonet') ||
      agency === 'geonet' ||
      agencyCodeAttribution(fields.author) === 'geonet' ||
      [fields.catalogue, fields.catalogue_name, fields.source].some((label) => labelAttribution(label) === 'geonet');
    return saysGeoNet ? id : null;
  } catch {
    return null;
  }
}

// ============================================================================
// FETCHING THE LOCALITY
// ============================================================================

export interface GeoNetLocalityRequestOptions {
  /**
   * The caller's interest: once aborted (the pointer left the marker), a request still
   * waiting for a slot is not sent unless another caller still wants it. A request already
   * sent runs to completion and is cached either way.
   */
  signal?: AbortSignal;
  /**
   * false: only the cached answer or one already being fetched (joined as a caller that
   * stays interested); never starts a request. Default true.
   */
  start?: boolean;
}

interface CacheEntry { value: string | null; expires: number }
interface Job {
  id: string;
  promise: Promise<string | null>;
  resolve: (value: string | null) => void;
  /** One entry per caller; null for a caller without a signal (always interested). */
  interest: Array<AbortSignal | null>;
}
interface Outcome { value: string | null; ttl: number }

const cache = new Map<string, CacheEntry>();
const pending = new Map<string, Job>();
const queue: Job[] = [];
let running = 0;
/** Bumped by the test reset, so requests from before it cannot touch the new state. */
let generation = 0;

const FAILED: Outcome = { value: null, ttl: GEONET_LOCALITY_FAILURE_TTL_MS };
const NONE: Outcome = { value: null, ttl: Infinity };

const browserCanFetch = () => typeof window !== 'undefined' && typeof fetch === 'function';

function remember(id: string, { value, ttl }: Outcome): void {
  cache.delete(id);
  cache.set(id, { value, expires: ttl === Infinity ? Infinity : Date.now() + ttl });
  while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string);
}

/**
 * The answer already known for a GeoNet id, synchronously: the locality, null (GeoNet has
 * none, or a recent request failed), or undefined (not asked yet, or a failure expired).
 */
export function peekGeoNetLocality(publicId: string): string | null | undefined {
  const entry = cache.get(publicId);
  if (!entry) return undefined;
  if (entry.expires <= Date.now()) {
    cache.delete(publicId);
    return undefined;
  }
  return entry.value;
}

/** The locality in GeoNet's answer for `id`, or null. */
function localityFrom(body: unknown, id: string): string | null {
  const features = (body as { features?: unknown } | null)?.features;
  const properties = Array.isArray(features)
    ? (features[0] as { properties?: Record<string, unknown> } | undefined)?.properties
    : undefined;
  if (!properties || typeof properties !== 'object') return null;
  // An answer about another event (a misrouted response) is no answer.
  if (typeof properties.publicID === 'string' && properties.publicID.trim() && properties.publicID.trim() !== id) return null;
  const locality = typeof properties.locality === 'string' ? properties.locality.replace(/\s+/g, ' ').trim() : '';
  return locality && locality.length <= MAX_LOCALITY_LENGTH ? locality : null;
}

/** One request to GeoNet's quake API; never rejects. */
async function request(id: string): Promise<Outcome> {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => { controller?.abort(); resolve('timeout'); }, GEONET_LOCALITY_TIMEOUT_MS);
  });
  try {
    const response = await Promise.race([
      fetch(`${GEONET_QUAKE_API}/${encodeURIComponent(id)}`, { signal: controller?.signal, credentials: 'omit' }),
      timedOut,
    ]);
    if (response === 'timeout') return FAILED;
    // 404: GeoNet has no such event; other 4xx (but a timeout or rate limit): asking again will not help.
    if (!response.ok) return response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429 ? NONE : FAILED;
    const body = await Promise.race([response.json() as Promise<unknown>, timedOut]);
    if (body === 'timeout') return FAILED;
    return { value: localityFrom(body, id), ttl: Infinity };
  } catch {
    return FAILED;
  } finally {
    clearTimeout(timer);
  }
}

const isWanted = (job: Job) => job.interest.some((signal) => !signal || !signal.aborted);

function settle(job: Job, value: string | null): void {
  if (pending.get(job.id) === job) pending.delete(job.id);
  job.resolve(value);
}

/** Drops queued requests nobody wants any more, then the oldest beyond MAX_QUEUED. */
function pruneQueue(): void {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (!isWanted(queue[i])) settle(queue.splice(i, 1)[0], null);
  }
  while (queue.length > MAX_QUEUED) settle(queue.shift()!, null);
}

/** Sends queued requests while a slot is free. */
function pump(): void {
  while (running < GEONET_LOCALITY_MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift()!;
    if (!isWanted(job)) {
      settle(job, null);
      continue;
    }
    running++;
    const started = generation;
    void request(job.id).catch(() => FAILED).then((outcome) => {
      if (started !== generation) return;
      running--;
      remember(job.id, outcome);
      settle(job, outcome.value);
      pump();
    });
  }
}

/**
 * GeoNet's locality for a GeoNet event id ("15 km north-east of Culverden"), or null when
 * GeoNet has none, the request failed or timed out, or this is not a browser. See "FETCH
 * POLICY" in the module comment. Never throws; the promise never rejects.
 */
export function fetchGeoNetLocality(publicId: string, options: GeoNetLocalityRequestOptions = {}): Promise<string | null> {
  try {
    if (!isGeoNetEventId(publicId) || !browserCanFetch()) return Promise.resolve(null);
    const cached = peekGeoNetLocality(publicId);
    if (cached !== undefined) return Promise.resolve(cached);
    let job = pending.get(publicId);
    if (!job) {
      if (options.start === false) return Promise.resolve(null);
      let resolve!: (value: string | null) => void;
      const promise = new Promise<string | null>((done) => { resolve = done; });
      job = { id: publicId, promise, resolve, interest: [] };
      pending.set(publicId, job);
      queue.push(job);
    }
    job.interest.push(options.start === false ? null : options.signal ?? null);
    pruneQueue();
    pump();
    return job.promise;
  } catch {
    return Promise.resolve(null);
  }
}

/** Test hook: forget every answer and request. */
export function resetGeoNetLocalityForTests(): void {
  generation++;
  cache.clear();
  pending.clear();
  queue.length = 0;
  running = 0;
}
