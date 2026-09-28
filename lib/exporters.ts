/**
 * Export utilities for earthquake catalogues
 * Supports GeoJSON, KML, CSV, JSON, and QuakeML formats
 */

import type { MergedEvent } from './db';
import { csvField, csvRow, Sha256, stripXmlIllegalChars, toUtcIsoString } from './export-utils';

/**
 * Target size, in characters, of one streamed chunk.
 *
 * Exports are produced as a chunk stream rather than a single string: V8 caps a JS string at
 * 536,870,888 characters (`require('buffer').constants.MAX_STRING_LENGTH` on Node 20) and a
 * national-scale catalogue exceeds that — measured at roughly 1.8 kB/event for GeoJSON, a
 * FeatureCollection passes the cap near 290,000 events and throws
 * `RangeError: Invalid string length`, which the export route could only report as an opaque 500.
 */
const STREAM_CHUNK_CHARS = 64 * 1024;

/**
 * Coalesce many small parts into ~STREAM_CHUNK_CHARS chunks so a streaming consumer gets
 * useful-sized writes without the whole document ever existing as one string.
 *
 * Generators are driven with an explicit next() loop rather than for-of/yield* throughout this
 * module: tsconfig targets ES5 with downlevelIteration off, under which for-of is only allowed
 * over arrays.
 */
function* coalesce(parts: Generator<string>): Generator<string> {
  let buffer = '';
  for (let step = parts.next(); !step.done; step = parts.next()) {
    buffer += step.value;
    if (buffer.length >= STREAM_CHUNK_CHARS) {
      yield buffer;
      buffer = '';
    }
  }
  if (buffer.length > 0) yield buffer;
}

/**
 * Concatenate a chunk stream into one string, for callers that need the whole document in
 * memory (the browser-side merge export, tests). Server routes should stream the chunks.
 */
function joinChunks(chunks: Generator<string>): string {
  let out = '';
  for (let step = chunks.next(); !step.done; step = chunks.next()) out += step.value;
  return out;
}

/**
 * Splice an array member onto a pretty-printed JSON object so the streamed bytes are
 * identical to `JSON.stringify(wholeDocument, null, 2)`.
 *
 * `head` is the document with the array member omitted; it always ends in "\n}" because it
 * always has at least one key. Each element is re-indented from its own two-space stringify
 * to the four spaces it occupies inside the parent array.
 */
function* jsonArrayMember(
  head: Record<string, unknown>,
  key: string,
  elements: Generator<unknown>
): Generator<string> {
  const headJson = JSON.stringify(head, null, 2);
  yield `${headJson.slice(0, headJson.length - 2)},\n  ${JSON.stringify(key)}: [`;

  let empty = true;
  for (let step = elements.next(); !step.done; step = elements.next()) {
    const elementJson = JSON.stringify(step.value, null, 2).split('\n').join('\n    ');
    yield `${empty ? '\n    ' : ',\n    '}${elementJson}`;
    empty = false;
  }

  yield empty ? ']\n}' : '\n  ]\n}';
}

export interface ExportMetadata {
  catalogueName?: string;
  description?: string;
  source?: string;
  provider?: string;
  region?: string;
  timePeriodStart?: string;
  timePeriodEnd?: string;
  license?: string;
  citation?: string;
  eventCount?: number;
  generatedAt?: string;
  // Geographic bounds
  boundingBox?: {
    minLatitude?: number | null;
    maxLatitude?: number | null;
    minLongitude?: number | null;
    maxLongitude?: number | null;
  };
  // Contact information
  contactName?: string;
  contactEmail?: string;
  contactOrganization?: string;
  // Data quality
  dataQuality?: {
    completeness?: string;
    accuracy?: string;
    reliability?: string;
  };
  qualityNotes?: string;
  // Additional metadata
  doi?: string;
  version?: string;
  keywords?: string[];
  referenceLinks?: string[];
  usageTerms?: string;
  notes?: string;
  // Merge-specific metadata
  mergeDescription?: string;
  mergeUseCase?: string;
  mergeMethodology?: string;
  mergeQualityAssessment?: string;
  // Catalogue-level merge strategy and threshold parameters (MergedCatalogue.merge_config).
  // The per-event strategy, parameters and quality score (contracts C1/C2) travel with each
  // event instead; see eventLineage().
  mergeConfig?: unknown;
  // Provenance
  createdBy?: string;
  modifiedAt?: string;
  // Source catalogues (parsed from JSON string in database)
  sourceCatalogues?: unknown;
  // Catalogue identity (C3). `version` above is the catalogue version ("MAJOR.MINOR.PATCH").
  catalogueId?: string;
  versionUpdatedAt?: string;
  /** The depositor's own release label for the source data (MergedCatalogue.source_version). */
  sourceVersion?: string;
  // Export provenance (C12). `generatedAt` above is the export timestamp (UTC).
  /** SHA-256 of the canonical exported event rows; computed when absent. */
  checksum?: ExportChecksum;
  /** The event filter applied (C4); null or absent when the whole catalogue was exported. */
  filter?: Record<string, unknown> | null;
  /** Declustering applied to the exported events; absent means none. */
  declustering?: ExportDeclustering;
}

/**
 * Event row fields read by the exporters beyond lib/db.ts MergedEvent: the per-event quality
 * score (contract C1), merge provenance (C2), the agency's raw event type (C8) and the
 * origin-uncertainty confidence level (C16). All optional: rows stored before those fields
 * existed export them empty.
 */
export type ExportableEvent = MergedEvent & {
  quality_score?: number | null;
  quality_grade?: string | null;
  merge_strategy?: string | null;
  merge_parameters?: string | null;
  source_catalogue_ids?: string[] | string | null;
  source_event_type?: string | null;
  confidence_level?: number | null;
};

/** Checksum recorded by every export format (see computeEventRowsChecksum). */
export interface ExportChecksum {
  algorithm: 'SHA-256';
  /** 64 lowercase hex digits. */
  value: string;
  /** What exactly was hashed, stated in the file so the value can be re-derived. */
  scope: string;
}

/** Per-event declustering tag (contract C7). */
export interface DeclusterTag {
  /** The cluster's identifier (its mainshock's event id); null for an event in no cluster. */
  clusterId: string | null;
  /** True for independent events: cluster mainshocks and events in no cluster. */
  isMainshock: boolean;
}

/** Declustering applied to an export (C12). */
export interface ExportDeclustering {
  algorithm: 'none' | 'gardner-knopoff';
  /** Algorithm settings (window definitions), recorded verbatim in the export metadata. */
  parameters?: Record<string, unknown>;
  /** Counts over the exported events. */
  summary?: { eventCount: number; mainshockCount: number; dependentCount: number; clusterCount: number };
  /** Per-event tags keyed by event row id. Emitted per event, never serialised as a whole. */
  tags?: ReadonlyMap<string, DeclusterTag>;
}

/** One contributing source event of a row, as recorded in its `source_events` JSON. */
export interface SourceEventMember {
  catalogueId: string | null;
  source: string | null;
  /** The member's identifier: its recorded eventId, else the source row's source_id / public id. */
  eventId: string | null;
  /** `eventId` exactly as the entry recorded it (importers store the agency's event id here). */
  recordedEventId: string | null;
  /** C2: the member whose solution (time and epicentre) the row publishes. */
  selected: boolean;
  /** The contributing row as it was stored at merge time (merged rows only). */
  originalData: Record<string, unknown> | null;
}

/** Per-event provenance carried by every format (C12). */
export interface EventLineage {
  /**
   * Source whose solution the row publishes: the C2-selected member, else the agency that
   * qualifies the row's source_id, else 'merged' for an averaged solution.
   */
  source: string;
  selectedSource: string | null;
  selectedSourceCatalogueId: string | null;
  sourceCatalogueIds: string[];
  mergeStrategy: string | null;
  /** The effective merge configuration for this event (C2), as JSON text. */
  mergeParameters: string | null;
  qualityScore: number | null;
  qualityGrade: string | null;
  members: SourceEventMember[];
}

function textOrNull(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Parse a row's `source_events` (JSON text, or an already-parsed array) into its members. */
export function parseSourceEvents(value: unknown): SourceEventMember[] {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const members: SourceEventMember[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const data = record.originalData && typeof record.originalData === 'object' && !Array.isArray(record.originalData)
      ? record.originalData as Record<string, unknown>
      : null;
    const recordedEventId = textOrNull(record.eventId);
    members.push({
      catalogueId: textOrNull(record.catalogueId),
      source: textOrNull(record.source),
      eventId: recordedEventId ?? textOrNull(data?.source_id) ?? textOrNull(data?.event_public_id) ?? textOrNull(data?.id),
      recordedEventId,
      selected: record.selected === true,
      originalData: data,
    });
  }
  return members;
}

/** True when the row is the product of merging two or more source events. */
export function isMultiSourceRow(event: Pick<MergedEvent, 'source_events'>): boolean {
  return parseSourceEvents(event.source_events).length > 1;
}

// A date-time with no zone designator. Stored event times are UTC, but the JS Date parser
// reads an offset-less date-time as local time.
const OFFSETLESS_DATE_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/;

/** Epoch milliseconds of an ISO 8601 timestamp (offset-less read as UTC); null if unparseable. */
export function utcEpoch(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  const offsetless = raw.match(OFFSETLESS_DATE_TIME);
  const epoch = Date.parse(offsetless ? `${offsetless[1]}T${offsetless[2]}Z` : raw);
  return Number.isFinite(epoch) ? epoch : null;
}

interface Hypocentre {
  time?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  depth?: unknown;
}

/**
 * Whether two stored records carry the same hypocentre: origin time equal to the millisecond,
 * equal latitude, equal longitude modulo 360 and equal depth in km (both unknown, or equal
 * within floating-point noise).
 */
export function sameHypocentre(a: Hypocentre, b: Hypocentre): boolean {
  const ta = utcEpoch(a.time);
  if (ta === null || ta !== utcEpoch(b.time)) return false;
  const latA = finiteOrNull(a.latitude);
  const latB = finiteOrNull(b.latitude);
  if (latA === null || latB === null || Math.abs(latA - latB) > 1e-9) return false;
  const lonA = finiteOrNull(a.longitude);
  const lonB = finiteOrNull(b.longitude);
  if (lonA === null || lonB === null) return false;
  const lonDiff = Math.abs(((lonA - lonB) % 360 + 540) % 360 - 180);
  if (lonDiff > 1e-9) return false;
  const depthA = finiteOrNull(a.depth);
  const depthB = finiteOrNull(b.depth);
  if (depthA === null || depthB === null) return depthA === depthB;
  return Math.abs(depthA - depthB) <= 1e-9 * Math.max(1, Math.abs(depthA));
}

/**
 * The contributing member whose own stored solution is exactly the hypocentre the row
 * publishes: the C2-selected member when it carries it, else the only member that does.
 * null for a single-source row, an averaged solution, a member list without stored rows, or
 * a tie between members reporting the same values.
 */
export function publishedSolutionMember(
  event: Hypocentre & Pick<MergedEvent, 'source_events'>,
  members: SourceEventMember[] = parseSourceEvents(event.source_events)
): SourceEventMember | null {
  if (members.length < 2) return null;
  const carries = (member: SourceEventMember) =>
    member.originalData !== null && sameHypocentre(member.originalData, event);
  const selected = members.find(member => member.selected);
  if (selected && carries(selected)) return selected;
  const matching = members.filter(carries);
  return matching.length === 1 ? matching[0] : null;
}

/** The catalogue-level merge strategy from a merge_config (legacy rows carry no per-event one). */
function catalogueMergeStrategy(metadata?: ExportMetadata): string | null {
  const config = metadata?.mergeConfig;
  if (!config || typeof config !== 'object') return null;
  const record = config as Record<string, unknown>;
  return textOrNull(record.mergeStrategy) ?? textOrNull(record.strategy);
}

/**
 * Attribute the published solution of a row to a source. Never the first member by array
 * position: source_events is in group (time) order, so members[0] is the earliest report,
 * which is the published one only by coincidence.
 */
function attributedSource(
  event: ExportableEvent,
  members: SourceEventMember[],
  strategy: string | null
): string {
  const selected = members.find(member => member.selected);
  if (selected?.source) return selected.source;
  if (members.length <= 1) return members[0]?.source || 'unknown';
  // An averaged hypocentre is no single source's solution (C2 selects no member for it),
  // although lib/merge.ts still qualifies the kept source_id by the base event's agency.
  if (strategy === 'average') return 'merged';
  // lib/merge.ts qualifies a merged row's source_id by the agency whose record (and so whose
  // solution) the strategy kept: "<source>:<id>". Longest label first, so "GeoNet NZ" wins
  // over a "GeoNet" that merely prefixes it.
  const sourceId = textOrNull(event.source_id);
  if (sourceId) {
    const labels = Array.from(new Set(members.map(member => member.source).filter((s): s is string => !!s)))
      .sort((a, b) => b.length - a.length);
    const qualifying = labels.find(label => sourceId.startsWith(`${label}:`));
    if (qualifying) return qualifying;
  }
  return publishedSolutionMember(event, members)?.source || 'unknown';
}

/**
 * Per-event lineage (C12): the contributing catalogues, merge strategy and parameters,
 * quality score and selected source. Fields the row does not carry (rows stored before
 * contracts C1/C2) come back empty; source catalogue IDs are read from the members'
 * catalogueId, which is what C2's source_catalogue_ids records, when the row lacks the column.
 */
export function eventLineage(event: ExportableEvent, catalogueStrategy?: string | null): EventLineage {
  const members = parseSourceEvents(event.source_events);
  const selected = members.find(member => member.selected) ?? null;

  let storedIds: unknown = event.source_catalogue_ids;
  if (typeof storedIds === 'string') {
    const text = storedIds;
    try {
      storedIds = JSON.parse(text);
    } catch {
      storedIds = text.split(';');
    }
  }
  const sourceCatalogueIds = Array.isArray(storedIds)
    ? storedIds.map(textOrNull).filter((id): id is string => id !== null)
    : Array.from(new Set(members.map(member => member.catalogueId).filter((id): id is string => id !== null)));

  const mergeStrategy = textOrNull(event.merge_strategy);
  const rawParameters: unknown = event.merge_parameters;
  const mergeParameters = typeof rawParameters === 'string'
    ? textOrNull(rawParameters)
    : rawParameters && typeof rawParameters === 'object' ? JSON.stringify(rawParameters) : null;

  return {
    source: attributedSource(event, members, mergeStrategy ?? (members.length > 1 ? catalogueStrategy ?? null : null)),
    selectedSource: selected?.source ?? null,
    selectedSourceCatalogueId: selected?.catalogueId ?? null,
    sourceCatalogueIds,
    mergeStrategy,
    mergeParameters,
    qualityScore: finiteOrNull(event.quality_score),
    qualityGrade: textOrNull(event.quality_grade),
    members,
  };
}

/** The declustering an export records: the one applied, or `{ algorithm: 'none' }`. */
function declusteringOf(metadata?: ExportMetadata): ExportDeclustering {
  return metadata?.declustering ?? { algorithm: 'none' };
}

/** Per-event declustering tags, when declustering was applied. */
function declusterTagsOf(metadata?: ExportMetadata): ReadonlyMap<string, DeclusterTag> | null {
  const declustering = metadata?.declustering;
  return declustering && declustering.algorithm !== 'none' && declustering.tags ? declustering.tags : null;
}

/** One-line text form of the declustering record, for the text-based formats. */
function declusteringText(metadata?: ExportMetadata): string {
  const record = describeDeclustering(metadata);
  return record.algorithm === 'none' ? 'none' : JSON.stringify(record);
}

/** The declustering record written into export metadata (the per-event tag map is not). */
export function describeDeclustering(metadata?: ExportMetadata): Record<string, unknown> {
  const declustering = declusteringOf(metadata);
  if (declustering.algorithm === 'none') return { algorithm: 'none' };
  return {
    algorithm: declustering.algorithm,
    ...(declustering.parameters ? { parameters: declustering.parameters } : {}),
    ...(declustering.summary ? { summary: declustering.summary } : {}),
  };
}

/** Time-period bounds as UTC ISO strings (C11), whatever form they were stored in. */
function timePeriodOf(metadata?: ExportMetadata): { start?: string; end?: string } | undefined {
  const start = toUtcIsoString(metadata?.timePeriodStart);
  const end = toUtcIsoString(metadata?.timePeriodEnd);
  return start || end ? { start, end } : undefined;
}

/**
 * What the export checksum covers. The canonical rows are the plain CSV rendering (the body of
 * `?format=csv`), so every format of the same selection carries the same value, and for a
 * plain CSV download it is simply the SHA-256 of the file.
 */
export const EVENT_ROWS_CHECKSUM_SCOPE =
  'SHA-256 of the UTF-8 plain-CSV rendering of the exported event rows (the header record and ' +
  'one record per event, LF-separated, no trailing newline): the body of the format=csv export ' +
  'with the same filter and declustering options';

/** Minimal incremental hasher, so the server can use node:crypto for the same canonical rows. */
export interface IncrementalHasher {
  update(text: string): unknown;
  digestHex(): string;
}

/**
 * SHA-256 over the canonical exported event rows (EVENT_ROWS_CHECKSUM_SCOPE). The rows include
 * each event's CatalogueVersion and, when applied, its declustering tags, so the same metadata
 * must be passed here and to the exporter.
 */
export function computeEventRowsChecksum(
  events: ExportableEvent[],
  metadata?: ExportMetadata,
  hasher: IncrementalHasher = new Sha256()
): ExportChecksum {
  const rows = csvBodyParts(events, metadata, { neutralizeFormulas: true });
  for (let step = rows.next(); !step.done; step = rows.next()) hasher.update(step.value);
  return { algorithm: 'SHA-256', value: hasher.digestHex(), scope: EVENT_ROWS_CHECKSUM_SCOPE };
}

/** The checksum an export records: the one supplied by the caller, else computed here. */
export function exportChecksumOf(events: ExportableEvent[], metadata?: ExportMetadata): ExportChecksum {
  return metadata?.checksum ?? computeEventRowsChecksum(events, metadata);
}

/**
 * Convert events to GeoJSON FeatureCollection
 * GeoJSON is a format for encoding geographic data structures
 * https://geojson.org/
 */
export function eventsToGeoJSON(
  events: ExportableEvent[],
  metadata?: ExportMetadata
): string {
  return joinChunks(eventsToGeoJSONChunks(events, metadata));
}

/**
 * Streaming form of eventsToGeoJSON(): yields the same bytes in chunks so a whole-catalogue
 * export never has to exist as a single JS string.
 */
export function eventsToGeoJSONChunks(
  events: ExportableEvent[],
  metadata?: ExportMetadata
): Generator<string> {
  const context = eventExportContext(metadata);
  return coalesce(
    jsonArrayMember(
      buildGeoJSONHead(events.length, metadata, exportChecksumOf(events, metadata)),
      'features',
      iterate(events, event => buildGeoJSONFeature(event, context))
    )
  );
}

/** Lazily map an array, so the mapped results are never all live at once. */
function* iterate<T, R>(items: T[], map: (item: T) => R): Generator<R> {
  for (const item of items) yield map(item);
}

/** Catalogue-level values every per-event record needs. */
interface EventExportContext {
  catalogueStrategy: string | null;
  catalogueVersion: string | null;
  tags: ReadonlyMap<string, DeclusterTag> | null;
}

function eventExportContext(metadata?: ExportMetadata): EventExportContext {
  return {
    catalogueStrategy: catalogueMergeStrategy(metadata),
    catalogueVersion: textOrNull(metadata?.version),
    tags: declusterTagsOf(metadata),
  };
}

/**
 * The per-event provenance members shared by the JSON and GeoJSON records: lineage (C1/C2),
 * the catalogue version the event was exported from (C3) and, when declustering was applied,
 * its tags (C7). Keys are always present (null when the row lacks the value).
 */
function lineageProperties(event: ExportableEvent, context: EventExportContext): Record<string, unknown> {
  const lineage = eventLineage(event, context.catalogueStrategy);
  const properties: Record<string, unknown> = {
    source: lineage.source,
    sourceCatalogueIds: lineage.sourceCatalogueIds,
    mergeStrategy: lineage.mergeStrategy,
    mergeParameters: lineage.mergeParameters === null
      ? null
      : safeParseJsonField(lineage.mergeParameters) ?? lineage.mergeParameters,
    selectedSource: lineage.selectedSource,
    selectedSourceCatalogueId: lineage.selectedSourceCatalogueId,
    qualityScore: lineage.qualityScore,
    qualityGrade: lineage.qualityGrade,
    catalogueVersion: context.catalogueVersion,
  };
  if (context.tags) {
    const tag = context.tags.get(event.id);
    properties.clusterId = tag ? tag.clusterId : null;
    properties.isMainshock = tag ? tag.isMainshock : null;
  }
  return properties;
}

/** Export-provenance members shared by the JSON and GeoJSON metadata heads (C12). */
function exportProvenanceMembers(metadata: ExportMetadata | undefined, checksum: ExportChecksum): Record<string, unknown> {
  return {
    checksum,
    filter: metadata?.filter ?? null,
    declustering: describeDeclustering(metadata),
  };
}

/** The FeatureCollection document with the `features` member omitted (spliced in on stream). */
function buildGeoJSONHead(
  count: number,
  metadata: ExportMetadata | undefined,
  checksum: ExportChecksum
): Record<string, unknown> {
  // No bbox. RFC 7946 §5 requires 2n values for n-dimensional geometry, and every event
  // with a known depth is emitted as a 3D point, so a 4-value bbox was non-conformant for
  // almost every catalogue. The 6-value form would need a vertical extent the head does
  // not have before streaming, and inventing one for unknown-depth events is worse than
  // omitting the optional member. The horizontal extent stays available under metadata.
  return {
    type: 'FeatureCollection',
    metadata: {
      title: metadata?.catalogueName || 'Earthquake Catalogue',
      catalogueId: metadata?.catalogueId,
      description: metadata?.description,
      generated: metadata?.generatedAt || new Date().toISOString(),
      count,
      ...exportProvenanceMembers(metadata, checksum),
      source: metadata?.source,
      provider: metadata?.provider,
      region: metadata?.region,
      timePeriod: timePeriodOf(metadata),
      boundingBox: metadata?.boundingBox,
      license: metadata?.license,
      citation: metadata?.citation,
      // Contact information
      contact: (metadata?.contactName || metadata?.contactEmail || metadata?.contactOrganization) ? {
        name: metadata?.contactName,
        email: metadata?.contactEmail,
        organization: metadata?.contactOrganization,
      } : undefined,
      // Data quality
      dataQuality: metadata?.dataQuality,
      qualityNotes: metadata?.qualityNotes,
      // Additional metadata
      doi: metadata?.doi,
      version: metadata?.version,
      versionUpdatedAt: metadata?.versionUpdatedAt,
      sourceVersion: metadata?.sourceVersion,
      keywords: metadata?.keywords,
      referenceLinks: metadata?.referenceLinks,
      usageTerms: metadata?.usageTerms,
      notes: metadata?.notes,
      // Merge-specific metadata
      merge: (metadata?.mergeDescription || metadata?.mergeUseCase ||
              metadata?.mergeMethodology || metadata?.mergeQualityAssessment ||
              metadata?.mergeConfig) ? {
        description: metadata?.mergeDescription,
        useCase: metadata?.mergeUseCase,
        methodology: metadata?.mergeMethodology,
        qualityAssessment: metadata?.mergeQualityAssessment,
        // Merge strategy and threshold parameters, catalogue-level (MergedCatalogue.merge_config).
        config: metadata?.mergeConfig,
      } : undefined,
      // Provenance
      provenance: (metadata?.createdBy || metadata?.modifiedAt || metadata?.sourceCatalogues) ? {
        createdBy: metadata?.createdBy,
        modifiedAt: metadata?.modifiedAt,
        sourceCatalogues: metadata?.sourceCatalogues,
      } : undefined,
    },
  };
}

/** One GeoJSON Feature for a single event. */
function buildGeoJSONFeature(event: ExportableEvent, context: EventExportContext): Record<string, unknown> {
  return {
    type: 'Feature',
    id: event.id,
    geometry: {
      type: 'Point',
      // GeoJSON coordinates are [longitude, latitude, elevation_m].
      // For earthquakes, depth (km below surface) becomes negative elevation in metres.
      // When depth is unknown (null) we emit a 2D point [lon, lat] rather than
      // implying a surface location with elevation=0 (RFC 7946 §3.1.1).
      coordinates: event.depth != null
        ? [event.longitude, event.latitude, -event.depth * 1000]
        : [event.longitude, event.latitude],
    },
    properties: {
      // Identifiers
      publicId: event.event_public_id,
      sourceId: event.source_id,
      catalogueId: event.catalogue_id,
      createdAt: event.created_at,

      // Timing
      time: event.time,

      // Location
      depth: event.depth,               // km
      depthType: event.depth_type,
      region: event.region,
      locationName: event.location_name,

      // Event classification
      eventType: event.event_type,
      eventTypeCertainty: event.event_type_certainty,
      // The event type exactly as the source agency reported it (C8).
      sourceEventType: event.source_event_type ?? null,

      // Magnitude
      magnitude: event.magnitude,
      magnitudeType: event.magnitude_type,
      magnitudeUncertainty: event.magnitude_uncertainty,
      magnitudeStationCount: event.magnitude_station_count,
      magnitudeMethodId: event.magnitude_method_id,
      magnitudeEvaluationMode: event.magnitude_evaluation_mode,
      magnitudeEvaluationStatus: event.magnitude_evaluation_status,

      // Location uncertainties (individual components + precomputed horizontal)
      timeUncertainty: event.time_uncertainty,
      latitudeUncertainty: event.latitude_uncertainty,
      longitudeUncertainty: event.longitude_uncertainty,
      depthUncertainty: event.depth_uncertainty,
      horizontalUncertainty: event.horizontal_uncertainty,     // km
      locationUncertainty: event.horizontal_uncertainty,       // deprecated alias, km

      // Origin provenance
      earthModelId: event.earth_model_id,
      methodId: event.method_id,
      agencyId: event.agency_id,
      author: event.author,

      // Quality metrics
      azimuthalGap: event.azimuthal_gap,
      usedPhaseCount: event.used_phase_count,
      usedStationCount: event.used_station_count,
      standardError: event.standard_error,
      minimumDistance: event.minimum_distance,        // degrees
      maximumDistance: event.maximum_distance,        // degrees
      associatedPhaseCount: event.associated_phase_count,
      associatedStationCount: event.associated_station_count,
      depthPhaseCount: event.depth_phase_count,

      // Evaluation
      evaluationMode: event.evaluation_mode,
      evaluationStatus: event.evaluation_status,

      // Preferred IDs (for cross-referencing nested elements)
      preferredOriginId: event.preferred_origin_id,
      preferredMagnitudeId: event.preferred_magnitude_id,
      preferredFocalMechanismId: event.preferred_focal_mechanism_id,
      minHorizontalUncertainty: event.min_horizontal_uncertainty,
      maxHorizontalUncertainty: event.max_horizontal_uncertainty,
      azimuthMaxHorizontalUncertainty: event.azimuth_max_horizontal_uncertainty,
      // Confidence level (%) of the origin uncertainty above (C16).
      confidenceLevel: event.confidence_level ?? null,

      // Per-event lineage, catalogue version and declustering tags (C12).
      ...lineageProperties(event, context),

      // Complex nested data — parsed from JSON strings stored in the database.
      // GeoJSON properties may contain any valid JSON value (RFC 7946 §3.2).
      sourceEvents: safeParseJsonField(event.source_events),
      origins: safeParseJsonField(event.origins),
      magnitudes: safeParseJsonField(event.magnitudes),
      picks: safeParseJsonField(event.picks),
      arrivals: safeParseJsonField(event.arrivals),
      focalMechanisms: safeParseJsonField(event.focal_mechanisms),
      amplitudes: safeParseJsonField(event.amplitudes),
      stationMagnitudes: safeParseJsonField(event.station_magnitudes),
      eventDescriptions: safeParseJsonField(event.event_descriptions),
      comments: safeParseJsonField(event.comments),
      creationInfo: safeParseJsonField(event.creation_info),
      originQuality: safeParseJsonField(event.origin_quality),
    },
  };
}

/**
 * Convert events to KML (Keyhole Markup Language)
 * KML is used by Google Earth and other mapping applications
 * https://developers.google.com/kml/documentation/kmlreference
 */
export function eventsToKML(
  events: ExportableEvent[],
  metadata?: ExportMetadata
): string {
  return joinChunks(eventsToKMLChunks(events, metadata));
}

/**
 * Streaming form of eventsToKML(): yields the same bytes in chunks so a whole-catalogue
 * export never has to exist as a single JS string.
 */
export function eventsToKMLChunks(
  events: ExportableEvent[],
  metadata?: ExportMetadata
): Generator<string> {
  return coalesce(kmlParts(events, metadata));
}

function* kmlParts(
  events: ExportableEvent[],
  metadata?: ExportMetadata
): Generator<string> {
  const escapeXml = (str: string | null | undefined): string => {
    if (!str) return '';
    return stripXmlIllegalChars(String(str))
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };
  const context = eventExportContext(metadata);
  const checksum = exportChecksumOf(events, metadata);

  // Returns a KML icon scale (0.5–3.0) that grows with magnitude.
  const getMagnitudeScale = (magnitude: number): number =>
    Math.max(0.5, Math.min(3.0, magnitude / 3));

  yield '<?xml version="1.0" encoding="UTF-8"?>\n';
  yield '<kml xmlns="http://www.opengis.net/kml/2.2">\n';
  yield '  <Document>\n';
  yield `    <name>${escapeXml(metadata?.catalogueName || 'Earthquake Catalogue')}</name>\n`;

  // Build comprehensive description with all metadata
  const descriptionParts: string[] = [];
  if (metadata?.description) descriptionParts.push(metadata.description);
  if (metadata?.catalogueId) descriptionParts.push(`Catalogue ID: ${metadata.catalogueId}`);
  if (metadata?.source) descriptionParts.push(`Source: ${metadata.source}`);
  if (metadata?.provider) descriptionParts.push(`Provider: ${metadata.provider}`);
  if (metadata?.region) descriptionParts.push(`Region: ${metadata.region}`);
  const timePeriod = timePeriodOf(metadata);
  if (timePeriod) {
    descriptionParts.push(`Time Period: ${timePeriod.start ?? '?'} to ${timePeriod.end ?? '?'}`);
  }
  if (metadata?.eventCount != null) descriptionParts.push(`Event Count: ${metadata.eventCount}`);
  if (metadata?.license) descriptionParts.push(`License: ${metadata.license}`);
  if (metadata?.citation) descriptionParts.push(`Citation: ${metadata.citation}`);
  if (metadata?.doi) descriptionParts.push(`DOI: ${metadata.doi}`);
  if (metadata?.version) descriptionParts.push(`Version: ${metadata.version}`);
  if (metadata?.versionUpdatedAt) descriptionParts.push(`Version Updated At: ${metadata.versionUpdatedAt}`);
  if (metadata?.sourceVersion) descriptionParts.push(`Source Version: ${metadata.sourceVersion}`);
  descriptionParts.push(`Event Rows SHA-256: ${checksum.value} (${checksum.scope})`);
  descriptionParts.push(`Filter: ${metadata?.filter ? JSON.stringify(metadata.filter) : 'none'}`);
  descriptionParts.push(`Declustering: ${declusteringText(metadata)}`);
  if (metadata?.contactName || metadata?.contactEmail || metadata?.contactOrganization) {
    const contactParts = [];
    if (metadata?.contactName) contactParts.push(metadata.contactName);
    if (metadata?.contactOrganization) contactParts.push(metadata.contactOrganization);
    if (metadata?.contactEmail) contactParts.push(metadata.contactEmail);
    descriptionParts.push(`Contact: ${contactParts.join(', ')}`);
  }
  if (metadata?.keywords && metadata.keywords.length > 0) {
    descriptionParts.push(`Keywords: ${metadata.keywords.join(', ')}`);
  }
  if (metadata?.usageTerms) descriptionParts.push(`Usage Terms: ${metadata.usageTerms}`);
  if (metadata?.qualityNotes) descriptionParts.push(`Quality Notes: ${metadata.qualityNotes}`);
  if (metadata?.dataQuality) {
    const qualityParts = [];
    if (metadata.dataQuality.completeness) qualityParts.push(`Completeness: ${metadata.dataQuality.completeness}`);
    if (metadata.dataQuality.accuracy) qualityParts.push(`Accuracy: ${metadata.dataQuality.accuracy}`);
    if (metadata.dataQuality.reliability) qualityParts.push(`Reliability: ${metadata.dataQuality.reliability}`);
    if (qualityParts.length > 0) descriptionParts.push(`Data Quality: ${qualityParts.join('; ')}`);
  }
  if (metadata?.referenceLinks && metadata.referenceLinks.length > 0) {
    descriptionParts.push(`References: ${metadata.referenceLinks.join(', ')}`);
  }
  if (metadata?.notes) descriptionParts.push(`Notes: ${metadata.notes}`);
  descriptionParts.push(`Generated: ${metadata?.generatedAt || new Date().toISOString()}`);

  if (metadata?.boundingBox) {
    const bb = metadata.boundingBox;
    const parts: string[] = [];
    if (bb.minLatitude != null) parts.push(`S: ${bb.minLatitude}`);
    if (bb.maxLatitude != null) parts.push(`N: ${bb.maxLatitude}`);
    if (bb.minLongitude != null) parts.push(`W: ${bb.minLongitude}`);
    if (bb.maxLongitude != null) parts.push(`E: ${bb.maxLongitude}`);
    if (parts.length > 0) descriptionParts.push(`Bounding Box: ${parts.join(', ')}`);
  }
  if (metadata?.mergeDescription) descriptionParts.push(`Merge Description: ${metadata.mergeDescription}`);
  if (metadata?.mergeUseCase) descriptionParts.push(`Merge Use Case: ${metadata.mergeUseCase}`);
  if (metadata?.mergeMethodology) descriptionParts.push(`Merge Methodology: ${metadata.mergeMethodology}`);
  if (metadata?.mergeQualityAssessment) descriptionParts.push(`Merge Quality Assessment: ${metadata.mergeQualityAssessment}`);
  if (metadata?.mergeConfig) descriptionParts.push(`Merge Config: ${JSON.stringify(metadata.mergeConfig)}`);
  if (metadata?.createdBy) descriptionParts.push(`Created By: ${metadata.createdBy}`);
  if (metadata?.modifiedAt) descriptionParts.push(`Modified At: ${metadata.modifiedAt}`);
  if (metadata?.sourceCatalogues) {
    descriptionParts.push(`Source Catalogues: ${JSON.stringify(metadata.sourceCatalogues)}`);
  }

  // CDATA does not make an XML-illegal character legal (XML 1.0 §2.7 CharData is Char*).
  const cdata = (value: string): string =>
    `<![CDATA[${stripXmlIllegalChars(value).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;

  if (descriptionParts.length > 0) {
    yield `    <description>${cdata(descriptionParts.join('\n'))}</description>\n`;
  }

  // Define styles for different magnitude ranges.
  // The bands must cover the whole magnitude domain or events fall through and are silently
  // omitted from the file: min is -Infinity on the first band because lib/validation.ts admits
  // magnitudes down to -3 and negative local magnitudes are routine in NZ microseismic and
  // induced-seismicity catalogues; max is Infinity on the last so all M7+ events are captured.
  const magnitudeRanges = [
    { min: -Infinity, max: 3, name: 'mag_0_3', color: 'ff00ff00', label: 'M < 3' },
    { min: 3, max: 4, name: 'mag_3_4', color: 'ff00ffff', label: 'M 3-4' },
    { min: 4, max: 5, name: 'mag_4_5', color: 'ff0099ff', label: 'M 4-5' },
    { min: 5, max: 6, name: 'mag_5_6', color: 'ff0066ff', label: 'M 5-6' },
    { min: 6, max: 7, name: 'mag_6_7', color: 'ff0000ff', label: 'M 6-7' },
    { min: 7, max: Infinity, name: 'mag_7_plus', color: 'ff0000cc', label: 'M ≥ 7' },
  ];

  for (const range of magnitudeRanges) {
    // Use the midpoint of the range to pick a representative icon scale so larger-magnitude
    // folders have bigger icons. The two open-ended bands have no midpoint, so step one unit
    // inside their finite edge (M<3 -> 1.5, M>=7 -> 8), which is what the closed-band midpoint
    // formula produced for them before the bands were opened.
    const representativeMag = isFinite(range.min) && isFinite(range.max)
      ? (range.min + range.max) / 2
      : isFinite(range.max) ? range.max / 2 : range.min + 1;
    const scale = getMagnitudeScale(representativeMag).toFixed(1);

    yield `    <Style id="${range.name}">\n`;
    yield '      <IconStyle>\n';
    yield `        <color>${range.color}</color>\n`;
    yield `        <scale>${scale}</scale>\n`;
    yield '        <Icon>\n';
    yield '          <href>https://maps.google.com/mapfiles/kml/shapes/earthquake.png</href>\n';
    yield '        </Icon>\n';
    yield '      </IconStyle>\n';
    yield '      <LabelStyle>\n';
    yield '        <scale>0.7</scale>\n';
    yield '      </LabelStyle>\n';
    yield `      <BalloonStyle>\n`;
    yield `        <text><![CDATA[\n`;
    yield `          <h3>$[name]</h3>\n`;
    yield `          <p>$[description]</p>\n`;
    yield `        ]]></text>\n`;
    yield `      </BalloonStyle>\n`;
    yield '    </Style>\n';
  }

  // Create folders for each magnitude range
  for (const range of magnitudeRanges) {
    const rangeEvents = events.filter(e => e.magnitude >= range.min && e.magnitude < range.max);

    if (rangeEvents.length > 0) {
      yield `    <Folder>\n`;
      // escapeXml: the lowest band's label contains a literal '<', which would otherwise
      // make the whole document malformed XML and unopenable in Google Earth.
      yield `      <name>${escapeXml(range.label)} (${rangeEvents.length} events)</name>\n`;
      yield `      <open>1</open>\n`;

      for (const event of rangeEvents) {
        const eventDate = new Date(event.time);
        const formattedDate = eventDate.toISOString();

        yield '      <Placemark>\n';
        yield `        <name>M ${event.magnitude.toFixed(1)}</name>\n`;
        yield `        <description><![CDATA[\n`;
        yield `          <table>\n`;
        yield `            <tr><td><b>Time:</b></td><td>${escapeXml(formattedDate)}</td></tr>\n`;
        yield `            <tr><td><b>Magnitude:</b></td><td>${event.magnitude.toFixed(2)} ${escapeXml(event.magnitude_type || '')}</td></tr>\n`;
        if (event.magnitude_uncertainty != null) {
          yield `            <tr><td><b>Magnitude Uncertainty:</b></td><td>±${event.magnitude_uncertainty}</td></tr>\n`;
        }
        if (event.magnitude_station_count != null) {
          yield `            <tr><td><b>Magnitude Stations:</b></td><td>${event.magnitude_station_count}</td></tr>\n`;
        }
        yield `            <tr><td><b>Depth:</b></td><td>${event.depth != null ? event.depth.toFixed(1) + ' km' : 'Unknown'}</td></tr>\n`;
        if (event.depth_type) {
          yield `            <tr><td><b>Depth Type:</b></td><td>${escapeXml(event.depth_type)}</td></tr>\n`;
        }
        yield `            <tr><td><b>Location:</b></td><td>${event.latitude.toFixed(4)}°, ${event.longitude.toFixed(4)}°</td></tr>\n`;
        if (event.horizontal_uncertainty != null) {
          yield `            <tr><td><b>Horizontal Uncertainty:</b></td><td>${event.horizontal_uncertainty} km</td></tr>\n`;
        }
        if (event.region || event.location_name) {
          yield `            <tr><td><b>Region:</b></td><td>${escapeXml(event.region || event.location_name || '')}</td></tr>\n`;
        }
        if (event.event_type) {
          yield `            <tr><td><b>Event Type:</b></td><td>${escapeXml(event.event_type)}</td></tr>\n`;
        }
        if (event.event_type_certainty) {
          yield `            <tr><td><b>Type Certainty:</b></td><td>${escapeXml(event.event_type_certainty)}</td></tr>\n`;
        }
        if (event.event_public_id) {
          yield `            <tr><td><b>Public ID:</b></td><td>${escapeXml(event.event_public_id)}</td></tr>\n`;
        }
        if (event.agency_id) {
          yield `            <tr><td><b>Agency:</b></td><td>${escapeXml(event.agency_id)}</td></tr>\n`;
        }
        if (event.author) {
          yield `            <tr><td><b>Author:</b></td><td>${escapeXml(event.author)}</td></tr>\n`;
        }
        if (event.earth_model_id) {
          yield `            <tr><td><b>Earth Model:</b></td><td>${escapeXml(event.earth_model_id)}</td></tr>\n`;
        }
        if (event.method_id) {
          yield `            <tr><td><b>Location Method:</b></td><td>${escapeXml(event.method_id)}</td></tr>\n`;
        }
        if (event.azimuthal_gap != null) {
          yield `            <tr><td><b>Azimuthal Gap:</b></td><td>${event.azimuthal_gap.toFixed(0)}°</td></tr>\n`;
        }
        if (event.used_station_count != null) {
          yield `            <tr><td><b>Stations Used:</b></td><td>${event.used_station_count}</td></tr>\n`;
        }
        if (event.used_phase_count != null) {
          yield `            <tr><td><b>Phases Used:</b></td><td>${event.used_phase_count}</td></tr>\n`;
        }
        if (event.standard_error != null) {
          yield `            <tr><td><b>RMS Error:</b></td><td>${event.standard_error.toFixed(3)} s</td></tr>\n`;
        }
        if (event.minimum_distance != null) {
          yield `            <tr><td><b>Min Distance:</b></td><td>${event.minimum_distance}°</td></tr>\n`;
        }
        if (event.maximum_distance != null) {
          yield `            <tr><td><b>Max Distance:</b></td><td>${event.maximum_distance}°</td></tr>\n`;
        }
        if (event.associated_phase_count != null) {
          yield `            <tr><td><b>Associated Phases:</b></td><td>${event.associated_phase_count}</td></tr>\n`;
        }
        if (event.associated_station_count != null) {
          yield `            <tr><td><b>Associated Stations:</b></td><td>${event.associated_station_count}</td></tr>\n`;
        }
        if (event.depth_phase_count != null) {
          yield `            <tr><td><b>Depth Phases:</b></td><td>${event.depth_phase_count}</td></tr>\n`;
        }
        if (event.evaluation_mode) {
          yield `            <tr><td><b>Eval Mode:</b></td><td>${escapeXml(event.evaluation_mode)}</td></tr>\n`;
        }
        if (event.evaluation_status) {
          yield `            <tr><td><b>Eval Status:</b></td><td>${escapeXml(event.evaluation_status)}</td></tr>\n`;
        }
        // Per-event lineage and declustering tags (C12).
        const lineage = eventLineage(event, context.catalogueStrategy);
        if (lineage.members.length > 0) {
          yield `            <tr><td><b>Source:</b></td><td>${escapeXml(lineage.source)}</td></tr>\n`;
        }
        if (lineage.sourceCatalogueIds.length > 0) {
          yield `            <tr><td><b>Source Catalogues:</b></td><td>${escapeXml(lineage.sourceCatalogueIds.join('; '))}</td></tr>\n`;
        }
        if (lineage.mergeStrategy) {
          yield `            <tr><td><b>Merge Strategy:</b></td><td>${escapeXml(lineage.mergeStrategy)}</td></tr>\n`;
        }
        if (lineage.selectedSource) {
          yield `            <tr><td><b>Selected Source:</b></td><td>${escapeXml(lineage.selectedSource)}</td></tr>\n`;
        }
        if (lineage.qualityScore !== null) {
          const grade = lineage.qualityGrade ? ` (${escapeXml(lineage.qualityGrade)})` : '';
          yield `            <tr><td><b>Quality Score:</b></td><td>${lineage.qualityScore}${grade}</td></tr>\n`;
        }
        if (context.tags) {
          const tag = context.tags.get(event.id);
          if (tag) {
            yield `            <tr><td><b>Cluster ID:</b></td><td>${escapeXml(tag.clusterId ?? '')}</td></tr>\n`;
            yield `            <tr><td><b>Mainshock:</b></td><td>${tag.isMainshock ? 'yes' : 'no'}</td></tr>\n`;
          }
        }
        // Note: complex nested fields (origins, magnitudes, picks, arrivals, focal_mechanisms,
        // amplitudes, station_magnitudes, etc.) cannot be meaningfully represented in KML
        // balloon HTML tables. Use JSON or QuakeML export for full fidelity.

        yield `          </table>\n`;
        yield `        ]]></description>\n`;
        yield `        <styleUrl>#${range.name}</styleUrl>\n`;
        yield `        <TimeStamp><when>${formattedDate}</when></TimeStamp>\n`;
        yield '        <Point>\n';
        // altitudeMode=absolute: altitude is meters above MSL; earthquakes are below
        // surface so depth (km) becomes negative meters altitude.
        // Without this mode Google Earth clamps all points to the ground and ignores altitude.
        yield '          <altitudeMode>absolute</altitudeMode>\n';
        const altitude = event.depth != null ? -event.depth * 1000 : 0;
        yield `          <coordinates>${event.longitude},${event.latitude},${altitude}</coordinates>\n`;
        yield '        </Point>\n';
        yield '      </Placemark>\n';
      }

      yield '    </Folder>\n';
    }
  }

  yield '  </Document>\n';
  yield '</kml>\n';
}

/**
 * Safely parse a JSON string stored in a database field.
 * Returns the parsed value, or undefined if the input is falsy or invalid JSON.
 */
function safeParseJsonField(value: string | null | undefined): unknown | undefined {
  if (!value) return undefined;
  try { return JSON.parse(value); } catch { return undefined; }
}

/**
 * Convert events to enhanced JSON format.
 * Includes all scalar event fields and all parsed nested JSON blob fields
 * (origins, magnitudes, picks, arrivals, focal_mechanisms, amplitudes,
 * station_magnitudes, event_descriptions, comments, creation_info, source_events).
 */
export function eventsToJSON(
  events: ExportableEvent[],
  metadata?: ExportMetadata
): string {
  return joinChunks(eventsToJSONChunks(events, metadata));
}

/**
 * Streaming form of eventsToJSON(): yields the same bytes in chunks so a whole-catalogue
 * export never has to exist as a single JS string.
 */
export function eventsToJSONChunks(
  events: ExportableEvent[],
  metadata?: ExportMetadata
): Generator<string> {
  const context = eventExportContext(metadata);
  return coalesce(
    jsonArrayMember(
      { metadata: buildJSONMetadata(events.length, metadata, exportChecksumOf(events, metadata)) },
      'events',
      iterate(events, event => buildJSONEvent(event, context))
    )
  );
}

/** The export document's metadata member. */
function buildJSONMetadata(
  count: number,
  metadata: ExportMetadata | undefined,
  checksum: ExportChecksum
): Record<string, unknown> {
  return {
    catalogueName: metadata?.catalogueName,
    catalogueId: metadata?.catalogueId,
    description: metadata?.description,
    source: metadata?.source,
    provider: metadata?.provider,
    region: metadata?.region,
    timePeriod: timePeriodOf(metadata),
    boundingBox: metadata?.boundingBox,
    license: metadata?.license,
    citation: metadata?.citation,
    generated: metadata?.generatedAt || new Date().toISOString(),
    eventCount: count,
    ...exportProvenanceMembers(metadata, checksum),
    // Contact information
    contact: (metadata?.contactName || metadata?.contactEmail || metadata?.contactOrganization) ? {
      name: metadata?.contactName,
      email: metadata?.contactEmail,
      organization: metadata?.contactOrganization,
    } : undefined,
    // Data quality
    dataQuality: metadata?.dataQuality,
    qualityNotes: metadata?.qualityNotes,
    // Additional metadata
    doi: metadata?.doi,
    version: metadata?.version,
    versionUpdatedAt: metadata?.versionUpdatedAt,
    sourceVersion: metadata?.sourceVersion,
    keywords: metadata?.keywords,
    referenceLinks: metadata?.referenceLinks,
    usageTerms: metadata?.usageTerms,
    notes: metadata?.notes,
    // Merge-specific metadata (present when catalogue was created by merging source catalogues)
    merge: (metadata?.mergeDescription || metadata?.mergeUseCase ||
            metadata?.mergeMethodology || metadata?.mergeQualityAssessment ||
            metadata?.mergeConfig) ? {
      description: metadata?.mergeDescription,
      useCase: metadata?.mergeUseCase,
      methodology: metadata?.mergeMethodology,
      qualityAssessment: metadata?.mergeQualityAssessment,
      // Merge strategy and threshold parameters, catalogue-level (MergedCatalogue.merge_config).
      config: metadata?.mergeConfig,
    } : undefined,
    // Provenance
    provenance: (metadata?.createdBy || metadata?.modifiedAt || metadata?.sourceCatalogues) ? {
      createdBy: metadata?.createdBy,
      modifiedAt: metadata?.modifiedAt,
      sourceCatalogues: metadata?.sourceCatalogues,
    } : undefined,
  };
}

/** One JSON export record for a single event. */
function buildJSONEvent(event: ExportableEvent, context: EventExportContext): Record<string, unknown> {
  return {
    // Identifiers
    id: event.id,
    publicId: event.event_public_id,
    sourceId: event.source_id,
    catalogueId: event.catalogue_id,

    // Timing
    time: event.time,
    createdAt: event.created_at,

    // Location
    location: {
      latitude: event.latitude,
      longitude: event.longitude,
      depth: event.depth,             // km
      depthType: event.depth_type,
    },

    // Event classification
    eventType: event.event_type,
    eventTypeCertainty: event.event_type_certainty,
    // The event type exactly as the source agency reported it (C8).
    sourceEventType: event.source_event_type ?? null,

    // Region / location description
    region: event.region,
    locationName: event.location_name,

    // Magnitude
    magnitude: {
      value: event.magnitude,
      type: event.magnitude_type,
      uncertainty: event.magnitude_uncertainty,
      stationCount: event.magnitude_station_count,
      methodId: event.magnitude_method_id,
      evaluationMode: event.magnitude_evaluation_mode,
      evaluationStatus: event.magnitude_evaluation_status,
    },

    // All location uncertainties (individual + combined horizontal + error ellipse)
    uncertainties: {
      time: event.time_uncertainty,
      latitude: event.latitude_uncertainty,
      longitude: event.longitude_uncertainty,
      depth: event.depth_uncertainty,
      horizontal: event.horizontal_uncertainty,  // km
      // QuakeML OriginUncertainty error ellipse: semi-minor / semi-major axes (km) and the
      // azimuth of the semi-major axis (degrees). Stored since the parser gained them, but
      // exported only by GeoJSON and QuakeML until now.
      minHorizontal: event.min_horizontal_uncertainty,
      maxHorizontal: event.max_horizontal_uncertainty,
      azimuthMaxHorizontal: event.azimuth_max_horizontal_uncertainty,
      // Confidence level (%) of the uncertainties above (C16).
      confidenceLevel: event.confidence_level ?? null,
    },

    // Origin provenance
    origin: {
      earthModelId: event.earth_model_id,
      methodId: event.method_id,
      agencyId: event.agency_id,
      author: event.author,
    },

    // Origin quality metrics
    quality: {
      azimuthalGap: event.azimuthal_gap,
      usedPhaseCount: event.used_phase_count,
      usedStationCount: event.used_station_count,
      standardError: event.standard_error,
      minimumDistance: event.minimum_distance,     // degrees
      maximumDistance: event.maximum_distance,     // degrees
      associatedPhaseCount: event.associated_phase_count,
      associatedStationCount: event.associated_station_count,
      depthPhaseCount: event.depth_phase_count,
    },

    // Evaluation
    evaluation: {
      mode: event.evaluation_mode,
      status: event.evaluation_status,
    },

    // Preferred IDs (for QuakeML cross-referencing within this event)
    preferredOriginId: event.preferred_origin_id,
    preferredMagnitudeId: event.preferred_magnitude_id,
    preferredFocalMechanismId: event.preferred_focal_mechanism_id,

    // Per-event lineage, catalogue version and declustering tags (C12).
    ...lineageProperties(event, context),

    // Complex nested data — parsed from JSON strings stored in the database.
    // These are omitted (undefined) when absent, so JSON.stringify drops them.
    sourceEvents: safeParseJsonField(event.source_events),
    origins: safeParseJsonField(event.origins),
    magnitudes: safeParseJsonField(event.magnitudes),
    picks: safeParseJsonField(event.picks),
    arrivals: safeParseJsonField(event.arrivals),
    focalMechanisms: safeParseJsonField(event.focal_mechanisms),
    amplitudes: safeParseJsonField(event.amplitudes),
    stationMagnitudes: safeParseJsonField(event.station_magnitudes),
    eventDescriptions: safeParseJsonField(event.event_descriptions),
    comments: safeParseJsonField(event.comments),
    creationInfo: safeParseJsonField(event.creation_info),
    originQuality: safeParseJsonField(event.origin_quality),
  };
}

/**
 * Column headers of the CSV export, in emitted order.
 * Exported so importers and tests can assert the contract without re-typing it.
 */
export const CSV_EVENT_HEADERS: readonly string[] = [
  'ID',
  'CatalogueID',
  'Time',
  'CreatedAt',
  'Latitude',
  'Longitude',
  'Depth',
  'Magnitude',
  'MagnitudeType',
  'EventType',
  'EventTypeCertainty',
  'Region',
  'LocationName',
  'Source',
  'SourceEventsJSON',
  'SourceID',
  'PublicID',
  // Location uncertainties
  'TimeUncertainty',
  'LatitudeUncertainty',
  'LongitudeUncertainty',
  'DepthUncertainty',
  'HorizontalUncertainty',
  'MagnitudeUncertainty',
  // Origin metadata
  'DepthType',
  'EarthModelID',
  'MethodID',
  'AgencyID',
  'Author',
  // Magnitude details
  'MagnitudeStationCount',
  'MagnitudeMethodID',
  'MagnitudeEvaluationMode',
  'MagnitudeEvaluationStatus',
  // Quality metrics
  'AzimuthalGap',
  'UsedStationCount',
  'UsedPhaseCount',
  'StandardError',
  'MinimumDistance',
  'MaximumDistance',
  'AssociatedPhaseCount',
  'AssociatedStationCount',
  'DepthPhaseCount',
  // Evaluation metadata
  'EvaluationMode',
  'EvaluationStatus',
  'PreferredOriginID',
  'PreferredMagnitudeID',
  // Columns added after the original 45 are appended, so positional readers of the older
  // layout keep working.
  // Error ellipse (km, km, degrees) and its confidence level in % (C16)
  'MinHorizontalUncertainty',
  'MaxHorizontalUncertainty',
  'AzimuthMaxHorizontalUncertainty',
  'ConfidenceLevel',
  'PreferredFocalMechanismID',
  // The event type exactly as the source agency reported it (C8)
  'SourceEventType',
  // Per-event lineage (C1/C2); empty for rows stored before those fields existed
  'SourceCatalogueIDs',
  'MergeStrategy',
  'MergeParameters',
  'SelectedSource',
  'SelectedSourceCatalogueID',
  'QualityScore',
  'QualityGrade',
  // The catalogue version this row was exported from (C3): a plain CSV has no other place
  // to carry it, and a per-row value survives filtering and concatenating exports.
  'CatalogueVersion',
];

/** Columns appended to CSV_EVENT_HEADERS when the export was declustered (C7). */
export const CSV_DECLUSTER_HEADERS: readonly string[] = ['ClusterID', 'IsMainshock'];

export interface CSVExportOptions {
  /**
   * Prepend the catalogue metadata as `#`-prefixed comment lines.
   */
  metadataComments?: boolean;

  /**
   * Neutralise text a spreadsheet would execute as a formula, by prefixing an apostrophe
   * (default true — see csvField()).
   */
  neutralizeFormulas?: boolean;
}

/**
 * Convert events to CSV.
 */
export function eventsToCSV(
  events: ExportableEvent[],
  metadata?: ExportMetadata,
  options?: CSVExportOptions
): string {
  return joinChunks(eventsToCSVChunks(events, metadata, options));
}

/**
 * Streaming form of eventsToCSV(): yields the same bytes in chunks so a whole-catalogue
 * export never has to exist as a single JS string.
 */
export function eventsToCSVChunks(
  events: ExportableEvent[],
  metadata?: ExportMetadata,
  options?: CSVExportOptions
): Generator<string> {
  return coalesce(csvParts(events, metadata, options));
}

/** The CSV header record for an export with these options. */
export function csvHeadersFor(metadata?: ExportMetadata): readonly string[] {
  return declusterTagsOf(metadata) ? CSV_EVENT_HEADERS.concat(CSV_DECLUSTER_HEADERS) : CSV_EVENT_HEADERS;
}

function* csvParts(
  events: ExportableEvent[],
  metadata?: ExportMetadata,
  options?: CSVExportOptions
): Generator<string> {
  if (options?.metadataComments) {
    const checksum = exportChecksumOf(events, metadata);
    for (const line of csvMetadataComments(events.length, metadata, checksum)) {
      yield `${line}\n`;
    }
  }

  const body = csvBodyParts(events, metadata, { neutralizeFormulas: options?.neutralizeFormulas !== false });
  for (let step = body.next(); !step.done; step = body.next()) yield step.value;
}

/**
 * The plain CSV body (header record, then one record per event, LF-separated, no trailing
 * newline). This is both the CSV export and the canonical rendering the export checksum is
 * computed over (EVENT_ROWS_CHECKSUM_SCOPE).
 */
function* csvBodyParts(
  events: ExportableEvent[],
  metadata: ExportMetadata | undefined,
  fieldOptions: { neutralizeFormulas: boolean }
): Generator<string> {
  const context = eventExportContext(metadata);

  yield csvHeadersFor(metadata).join(',');

  // Emit a nullable number/string as an empty field when null/undefined.
  const n = (v: number | string | null | undefined) => (v !== null && v !== undefined ? v : '');

  for (const event of events) {
    const lineage = eventLineage(event, context.catalogueStrategy);
    const record: Array<string | number | null | undefined> = [
      event.id,
      event.catalogue_id,
      event.time,
      event.created_at,
      event.latitude,
      event.longitude,
      n(event.depth),
      event.magnitude,
      event.magnitude_type,
      event.event_type,
      event.event_type_certainty,
      // Region: prefer region, fall back to location_name
      event.region || event.location_name || '',
      event.location_name,
      // The source whose solution this row publishes (see eventLineage), never simply the
      // first source_events entry, which is the earliest report of the group.
      lineage.source,
      event.source_events,
      event.source_id,
      event.event_public_id,
      // Location uncertainties
      n(event.time_uncertainty),
      n(event.latitude_uncertainty),
      n(event.longitude_uncertainty),
      n(event.depth_uncertainty),
      n(event.horizontal_uncertainty),
      n(event.magnitude_uncertainty),
      // Origin metadata
      event.depth_type,
      event.earth_model_id,
      event.method_id,
      event.agency_id,
      event.author,
      // Magnitude details
      n(event.magnitude_station_count),
      event.magnitude_method_id,
      event.magnitude_evaluation_mode,
      event.magnitude_evaluation_status,
      // Quality metrics
      n(event.azimuthal_gap),
      n(event.used_station_count),
      n(event.used_phase_count),
      n(event.standard_error),
      n(event.minimum_distance),
      n(event.maximum_distance),
      n(event.associated_phase_count),
      n(event.associated_station_count),
      n(event.depth_phase_count),
      // Evaluation metadata
      event.evaluation_mode,
      event.evaluation_status,
      event.preferred_origin_id,
      event.preferred_magnitude_id,
      // Error ellipse and confidence level
      n(event.min_horizontal_uncertainty),
      n(event.max_horizontal_uncertainty),
      n(event.azimuth_max_horizontal_uncertainty),
      n(event.confidence_level),
      event.preferred_focal_mechanism_id,
      event.source_event_type,
      // Per-event lineage
      lineage.sourceCatalogueIds.join(';'),
      lineage.mergeStrategy,
      lineage.mergeParameters,
      lineage.selectedSource,
      lineage.selectedSourceCatalogueId,
      n(lineage.qualityScore),
      lineage.qualityGrade,
      context.catalogueVersion,
    ];
    if (context.tags) {
      const tag = context.tags.get(event.id);
      record.push(tag ? tag.clusterId : '', tag ? String(tag.isMainshock) : '');
    }
    yield '\n' + csvRow(record, fieldOptions);
  }
}

/**
 * Build the optional `#`-prefixed metadata prologue (see CSVExportOptions.metadataComments).
 * Each value is escaped and flattened to a single line so the prologue can never be mistaken
 * for data by a reader that does strip comments.
 */
function csvMetadataComments(eventCount: number, metadata: ExportMetadata | undefined, checksum: ExportChecksum): string[] {
  const lines: string[] = [];
  const commentValue = (value: unknown): string => {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    return csvField(str ?? '').replace(/\r?\n|\r/g, ' ');
  };
  const add = (label: string, value: unknown) => {
    if (value === null || value === undefined || value === '') return;
    if (Array.isArray(value) && value.length === 0) return;
    lines.push(`# ${label}: ${commentValue(value)}`);
  };

  add('Catalogue', metadata?.catalogueName);
  add('Catalogue ID', metadata?.catalogueId);
  add('Description', metadata?.description);
  add('Source', metadata?.source);
  add('Provider', metadata?.provider);
  add('Region', metadata?.region);
  const timePeriod = timePeriodOf(metadata);
  if (timePeriod) {
    add('Time Period', `${timePeriod.start ?? '?'} to ${timePeriod.end ?? '?'}`);
  }
  lines.push(`# Event Count: ${eventCount}`);
  lines.push(`# Generated: ${metadata?.generatedAt || new Date().toISOString()}`);
  add('Event Rows SHA-256', checksum.value);
  add('Checksum Scope', checksum.scope);
  add('Filter', metadata?.filter ?? 'none');
  add('Declustering', declusteringText(metadata));

  add('License', metadata?.license);
  add('Citation', metadata?.citation);
  add('DOI', metadata?.doi);
  add('Version', metadata?.version);
  add('Version Updated At', metadata?.versionUpdatedAt);
  add('Source Version', metadata?.sourceVersion);
  add('Contact Name', metadata?.contactName);
  add('Contact Email', metadata?.contactEmail);
  add('Contact Organization', metadata?.contactOrganization);
  if (metadata?.dataQuality) {
    add('Data Quality', metadata.dataQuality);
  }
  add('Quality Notes', metadata?.qualityNotes);
  add('Keywords', metadata?.keywords);
  add('References', metadata?.referenceLinks);
  add('Usage Terms', metadata?.usageTerms);
  add('Notes', metadata?.notes);
  // Geographic bounds
  if (metadata?.boundingBox) {
    const bb = metadata.boundingBox;
    lines.push(
      `# Bounding Box: lat [${bb.minLatitude ?? '?'}, ${bb.maxLatitude ?? '?'}], ` +
      `lon [${bb.minLongitude ?? '?'}, ${bb.maxLongitude ?? '?'}]`
    );
  }
  add('Merge Description', metadata?.mergeDescription);
  add('Merge Use Case', metadata?.mergeUseCase);
  add('Merge Methodology', metadata?.mergeMethodology);
  add('Merge Quality Assessment', metadata?.mergeQualityAssessment);
  add('Merge Config', metadata?.mergeConfig);
  add('Created By', metadata?.createdBy);
  add('Modified At', metadata?.modifiedAt);
  add('Source Catalogues', metadata?.sourceCatalogues);

  lines.push('#');
  return lines;
}
