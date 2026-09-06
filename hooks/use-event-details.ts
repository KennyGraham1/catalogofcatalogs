'use client';

import { useEffect, useRef, useState } from 'react';
import type { MergedEvent } from '@/lib/db';

/** Fetch nested QuakeML data only for the event the user opens. */
export function useEventDetails(catalogueId?: string, eventId?: string, enabled = true) {
  const cache = useRef(new Map<string, { data: MergedEvent; time: number }>());
  const key = enabled && catalogueId && eventId
    ? `/api/catalogues/${encodeURIComponent(catalogueId)}/events/${encodeURIComponent(eventId)}` : null;
  const [state, setState] = useState({ key: null as string | null, data: null as MergedEvent | null, loading: false, error: null as string | null });
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const cached = cache.current.get(key);
    if (cached && Date.now() - cached.time < 120000) {
      setState({ key, data: cached.data, loading: false, error: null });
      return;
    }
    setState({ key, data: null, loading: true, error: null });
    fetch(key, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(`Unable to load event details (HTTP ${response.status})`);
      const data = await response.json() as MergedEvent;
      if (controller.signal.aborted) return;
      cache.current.delete(key);
      cache.current.set(key, { data, time: Date.now() });
      if (cache.current.size > 20) cache.current.delete(cache.current.keys().next().value!);
      setState({ key, data, loading: false, error: null });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ key, data: null, loading: false, error: error.message });
    });
    return () => controller.abort();
  }, [key]);
  return state.key === key && key ? state : { data: null, loading: Boolean(key), error: null };
}
