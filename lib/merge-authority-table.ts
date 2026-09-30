/**
 * The network-authority table's shape, built-in default and validator.
 *
 * Kept apart from lib/merge-authority.ts (which adds the AsyncLocalStorage scope and the
 * MongoDB persistence) so the settings form can import the same default and validator the
 * API applies without pulling node:async_hooks and the database driver into the browser
 * bundle. Server code imports everything from lib/merge-authority.ts, which re-exports this.
 */

import { z } from 'zod';
import { NZ_NATIONAL_BOUNDS } from './geo-bounds-utils';

/**
 * Seismological agencies the merge recognises for network authority, the GeoNet/GNS
 * priority options and focal-mechanism authority.
 */
export type AgencyKey = 'geonet' | 'gcmt' | 'isc' | 'usgs' | 'emsc' | 'jma' | 'geofon' | 'iris' | 'ingv' | 'ign' | 'bgr';

export const AGENCY_KEYS: ReadonlyArray<AgencyKey> = Object.freeze([
  'geonet', 'gcmt', 'isc', 'usgs', 'emsc', 'jma', 'geofon', 'iris', 'ingv', 'ign', 'bgr',
] as const);

/**
 * One row of the global hierarchy. `patterns` are whole words of a source name (or agency
 * codes); `agency` ties an entry to the agency resolveAgency identifies.
 */
export interface AuthorityEntry {
  patterns: string[];
  priority: number;
  region?: string;
  description: string;
  agency?: AgencyKey;
}

/**
 * A regional override: inside `bounds` this hierarchy replaces the global one. minLon >
 * maxLon marks a box crossing the antimeridian.
 */
export interface RegionalAuthority {
  name: string;
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  hierarchy: Array<{ patterns: string[]; priority: number; agency?: AgencyKey }>;
}

export interface MergeAuthorityTable {
  hierarchy: AuthorityEntry[];
  regions: RegionalAuthority[];
  /** 'custom' when an administrator saved the table; 'default' for the built-in one. */
  source: 'default' | 'custom';
  /** ISO 8601 time of the last save; null for the default table. */
  updatedAt: string | null;
}

/**
 * The built-in table: the global hierarchy and the NZ / JP overrides the engine shipped
 * with. Frozen so a caller cannot edit the default in place and leak the change into every
 * later merge.
 */
export const DEFAULT_MERGE_AUTHORITY: MergeAuthorityTable = deepFreeze<MergeAuthorityTable>({
  hierarchy: [
    // New Zealand authoritative networks
    { patterns: ['geonet', 'gns'], priority: 1, region: 'NZ', description: 'GeoNet (NZ authoritative)', agency: 'geonet' },
    // Global centroid moment tensor
    { patterns: ['gcmt', 'cmt', 'globalcmt'], priority: 2, description: 'Global CMT', agency: 'gcmt' },
    // International Seismological Centre
    { patterns: ['isc', 'iscgem'], priority: 3, description: 'ISC/ISC-GEM', agency: 'isc' },
    // USGS National Earthquake Information Center
    { patterns: ['usgs', 'neic', 'anss', 'comcat'], priority: 4, description: 'USGS/NEIC', agency: 'usgs' },
    // European-Mediterranean Seismological Centre
    { patterns: ['emsc', 'csem'], priority: 5, description: 'EMSC', agency: 'emsc' },
    // Japan Meteorological Agency
    { patterns: ['jma'], priority: 6, region: 'JP', description: 'JMA', agency: 'jma' },
    // Geofon
    { patterns: ['geofon', 'gfz'], priority: 7, description: 'GEOFON/GFZ', agency: 'geofon' },
    // IRIS
    { patterns: ['iris'], priority: 8, description: 'IRIS', agency: 'iris' },
    // Other regional networks
    { patterns: ['ingv'], priority: 9, region: 'IT', description: 'INGV (Italy)', agency: 'ingv' },
    { patterns: ['ign'], priority: 10, region: 'ES', description: 'IGN (Spain)', agency: 'ign' },
  ],
  regions: [
    {
      name: 'NZ',
      // The national extent the rest of the platform uses (lib/geo-bounds-utils
      // NZ_NATIONAL_BOUNDS): the Kermadec Islands, the Chatham Rise and the subantarctic
      // islands are GeoNet's area of responsibility too, and the old -50..-34 box ranked a
      // Kermadec event by the global table. minLon > maxLon marks the antimeridian crossing.
      bounds: {
        minLat: NZ_NATIONAL_BOUNDS.minLatitude,
        maxLat: NZ_NATIONAL_BOUNDS.maxLatitude,
        minLon: NZ_NATIONAL_BOUNDS.minLongitude,
        maxLon: NZ_NATIONAL_BOUNDS.maxLongitude,
      },
      hierarchy: [
        { patterns: ['geonet', 'gns'], priority: 1, agency: 'geonet' },
        { patterns: ['gcmt', 'cmt'], priority: 2, agency: 'gcmt' },
        { patterns: ['isc'], priority: 3, agency: 'isc' },
        { patterns: ['usgs', 'neic'], priority: 4, agency: 'usgs' },
      ],
    },
    {
      name: 'JP',
      bounds: { minLat: 24, maxLat: 46, minLon: 122, maxLon: 154 },
      hierarchy: [
        { patterns: ['jma'], priority: 1, agency: 'jma' },
        { patterns: ['gcmt', 'cmt'], priority: 2, agency: 'gcmt' },
        { patterns: ['isc'], priority: 3, agency: 'isc' },
        { patterns: ['usgs', 'neic'], priority: 4, agency: 'usgs' },
      ],
    },
  ],
  source: 'default',
  updatedAt: null,
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * A pattern is one whole word of a source name or an agency code, matched case-insensitively
 * as a whole token by the engine, so it can only be letters and digits (the engine never
 * sees punctuation inside a token). Lower-cased on output so a stored table compares equal
 * to what the engine matches against.
 */
const patternSchema = z
  .string()
  .trim()
  .min(1, 'a pattern cannot be empty')
  .max(40, 'a pattern is at most 40 characters')
  .regex(/^[A-Za-z0-9]+$/, 'a pattern is a single word of letters and digits')
  .transform(value => value.toLowerCase());

const patternsSchema = z
  .array(patternSchema)
  .min(1, 'at least one pattern is required')
  .max(10, 'at most 10 patterns per entry')
  .transform(patterns => Array.from(new Set(patterns)));

const prioritySchema = z
  .number({ invalid_type_error: 'priority must be a number' })
  .int('priority must be a whole number')
  .min(1, 'priority must be between 1 and 1000')
  .max(1000, 'priority must be between 1 and 1000');

const agencySchema = z.enum(AGENCY_KEYS as [AgencyKey, ...AgencyKey[]], {
  errorMap: () => ({ message: `agency must be one of ${AGENCY_KEYS.join(', ')}` }),
});

const hierarchyEntrySchema = z
  .object({
    patterns: patternsSchema,
    priority: prioritySchema,
    region: z.string().trim().max(60, 'region is at most 60 characters').optional(),
    description: z.string().trim().max(120, 'description is at most 120 characters').default(''),
    agency: agencySchema.optional(),
  })
  .strict()
  .transform(entry => {
    const out: AuthorityEntry = { patterns: entry.patterns, priority: entry.priority, description: entry.description };
    if (entry.region) out.region = entry.region;
    if (entry.agency) out.agency = entry.agency;
    return out;
  });

const regionalEntrySchema = z
  .object({
    patterns: patternsSchema,
    priority: prioritySchema,
    agency: agencySchema.optional(),
  })
  .strict()
  .transform(entry => {
    const out: RegionalAuthority['hierarchy'][number] = { patterns: entry.patterns, priority: entry.priority };
    if (entry.agency) out.agency = entry.agency;
    return out;
  });

/**
 * The engine takes the FIRST entry of a list that matches a report, so a second entry for
 * an agency already listed can never apply, and a pattern two entries of one list share
 * only ever matches the first. Both are rejected rather than saved as configuration that
 * silently does nothing (an administrator raising an agency by adding a second, better
 * entry below the first would see no effect). The message names the rows, numbered from 1
 * as the settings form shows them, and the list ('the global hierarchy', 'region "NZ"'), so
 * the issue is reported on the list itself rather than under a 0-based row path.
 */
function rejectShadowedEntries(
  entries: ReadonlyArray<{ patterns: string[]; agency?: AgencyKey }>,
  where: string,
  ctx: z.RefinementCtx,
  path: Array<string | number> = []
): void {
  const agencyRow = new Map<AgencyKey, number>();
  const patternRow = new Map<string, number>();
  entries.forEach((entry, index) => {
    const row = index + 1;
    if (entry.agency) {
      const first = agencyRow.get(entry.agency);
      if (first !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `rows ${first} and ${row} of ${where} are both for agency ${entry.agency}; list each agency once`,
        });
      } else {
        agencyRow.set(entry.agency, row);
      }
    }
    for (const pattern of entry.patterns) {
      const first = patternRow.get(pattern);
      if (first !== undefined && first !== row) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `rows ${first} and ${row} of ${where} both list the pattern "${pattern}"; list each pattern once`,
        });
      } else if (first === undefined) {
        patternRow.set(pattern, row);
      }
    }
  });
}

const latitudeSchema = z.number({ invalid_type_error: 'latitude must be a number' }).min(-90).max(90);
const longitudeSchema = z.number({ invalid_type_error: 'longitude must be a number' }).min(-180).max(180);

const regionSchema = z
  .object({
    name: z.string().trim().min(1, 'a region needs a name').max(60, 'a region name is at most 60 characters'),
    // minLon > maxLon is deliberately allowed: it marks a box crossing the antimeridian, as
    // the NZ default does (165 .. -175).
    bounds: z
      .object({ minLat: latitudeSchema, maxLat: latitudeSchema, minLon: longitudeSchema, maxLon: longitudeSchema })
      .strict()
      .refine(b => b.minLat <= b.maxLat, { message: 'minLat must not exceed maxLat', path: ['minLat'] }),
    hierarchy: z
      .array(regionalEntrySchema)
      .min(1, 'a region needs at least one entry')
      .max(50, 'a region has at most 50 entries'),
  })
  .strict()
  .superRefine((region, ctx) => rejectShadowedEntries(region.hierarchy, `region "${region.name}"`, ctx, ['hierarchy']));

const mergeAuthorityInputSchema = z
  .object({
    hierarchy: z
      .array(hierarchyEntrySchema)
      .min(1, 'at least one hierarchy entry is required')
      .max(50, 'at most 50 hierarchy entries')
      .superRefine((entries, ctx) => rejectShadowedEntries(entries, 'the global hierarchy', ctx)),
    regions: z.array(regionSchema).max(20, 'at most 20 regions').default([]),
  })
  // Extra keys (source, updatedAt, lastUpdated) are ignored rather than rejected so a client
  // can PUT back what GET returned.
  .passthrough();

/**
 * Validate a table as an administrator submits it ({ hierarchy, regions }). The output is
 * normalised (patterns lower-cased and deduplicated) and stamped source 'custom'; updatedAt is
 * left null until saveMergeAuthority sets it.
 */
export function parseMergeAuthorityTable(
  input: unknown,
): { ok: true; table: MergeAuthorityTable } | { ok: false; error: string } {
  const parsed = mergeAuthorityInputSchema.safeParse(input);
  if (parsed.success) {
    return {
      ok: true,
      table: {
        hierarchy: parsed.data.hierarchy,
        regions: parsed.data.regions,
        source: 'custom',
        updatedAt: null,
      },
    };
  }
  const issue = parsed.error.issues[0];
  const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
  return { ok: false, error: `Invalid authority table: ${where}${issue?.message ?? 'invalid value'}` };
}
