import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * De-duplicate a list of records by their `id` (keeps the first occurrence; records
 * without an id are kept as-is). Used to guard against repeated event records that
 * would otherwise inflate counts and break React's unique-key rule in lists/maps.
 */
export function dedupeById<T extends { id?: string | number | null }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const id = item?.id != null ? String(item.id) : null;
    if (id !== null) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    out.push(item);
  }
  return out;
}
