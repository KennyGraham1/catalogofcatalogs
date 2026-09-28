/**
 * Input rules for saved filters. A saved filter is a small, personal UI preset: the
 * configuration used to be stored as sent, of any size or shape, and then served back.
 */

/** Most saved filters one user may keep. */
export const MAX_SAVED_FILTERS_PER_USER = 200;
/** Largest serialised filter configuration accepted, in characters. */
export const MAX_FILTER_CONFIG_LENGTH = 10_000;
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_CONFIG_DEPTH = 5;

export interface SavedFilterInput {
  name: string;
  description: string | null;
  filterConfig: Record<string, unknown>;
  filterConfigString: string;
}

function depthOf(value: unknown): number {
  if (value === null || typeof value !== 'object') return 0;
  const children = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  return 1 + children.reduce<number>((max, child) => Math.max(max, depthOf(child)), 0);
}

export function validateSavedFilterInput(body: unknown):
  | { ok: true; value: SavedFilterInput }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }
  const { name, description, filterConfig } = body as Record<string, unknown>;

  if (!name || !filterConfig) {
    return { ok: false, error: 'Missing required fields: name and filterConfig' };
  }
  if (typeof name !== 'string' || !name.trim() || name.trim().length > MAX_NAME_LENGTH) {
    return { ok: false, error: `name must be a non-empty string of at most ${MAX_NAME_LENGTH} characters` };
  }
  if (description != null && (typeof description !== 'string' || description.length > MAX_DESCRIPTION_LENGTH)) {
    return { ok: false, error: `description must be a string of at most ${MAX_DESCRIPTION_LENGTH} characters` };
  }
  if (typeof filterConfig !== 'object' || Array.isArray(filterConfig)) {
    return { ok: false, error: 'filterConfig must be a JSON object' };
  }
  if (depthOf(filterConfig) > MAX_CONFIG_DEPTH) {
    return { ok: false, error: `filterConfig is nested more than ${MAX_CONFIG_DEPTH} levels deep` };
  }
  const filterConfigString = JSON.stringify(filterConfig);
  if (filterConfigString.length > MAX_FILTER_CONFIG_LENGTH) {
    return { ok: false, error: `filterConfig exceeds ${MAX_FILTER_CONFIG_LENGTH} characters` };
  }

  return {
    ok: true,
    value: {
      name: name.trim(),
      description: typeof description === 'string' && description.trim() ? description : null,
      filterConfig: filterConfig as Record<string, unknown>,
      filterConfigString,
    },
  };
}
