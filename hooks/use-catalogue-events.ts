'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CatalogueEventCache, loadCatalogueEvents, type CatalogueEvent, type EventCatalogue } from '@/lib/catalogue-event-loader';

const EMPTY_EVENTS: CatalogueEvent[] = [];

export function useCatalogueEvents(catalogues: EventCatalogue[], selection: string, sharedCache?: CatalogueEventCache) {
  const localCache = useRef(new CatalogueEventCache());
  const cache = sharedCache ?? localCache.current;
  const controller = useRef<AbortController | null>(null);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({
    catalogues, selection: '', events: EMPTY_EVENTS, loading: false, complete: false,
    loadedCount: 0, error: null as string | null,
  });

  useEffect(() => {
    const request = new AbortController();
    controller.current = request;
    const selected = selection === 'all' ? catalogues : catalogues.filter(catalogue => catalogue.id === selection);
    setState({ catalogues, selection, events: EMPTY_EVENTS, loading: selected.length > 0, complete: false, loadedCount: 0, error: null });
    if (!selection || !selected.length) return () => request.abort();
    let lastUpdate = 0;
    loadCatalogueEvents(selected, {
      signal: request.signal,
      cache,
      onProgress: (loadedCount, preview) => {
        if (request.signal.aborted) return;
        if (!preview && Date.now() - lastUpdate < 150) return;
        lastUpdate = Date.now();
        setState(previous => ({ ...previous, loadedCount, events: preview ?? previous.events }));
      },
    }).then(events => {
      if (!request.signal.aborted) setState({ catalogues, selection, events, loadedCount: events.length, loading: false, complete: true, error: null });
    }).catch(error => {
      if (!request.signal.aborted) setState(previous => ({ ...previous, loading: false, error: error instanceof Error ? error.message : 'Failed to load events' }));
    });
    return () => request.abort();
  }, [catalogues, selection, revision, cache]);

  const cancel = useCallback(() => {
    controller.current?.abort();
    setState(previous => ({ ...previous, loading: false, complete: false, error: 'Event loading cancelled' }));
  }, []);
  const retry = useCallback(() => {
    controller.current?.abort();
    setRevision(previous => previous + 1);
  }, []);
  const current = state.selection === selection && state.catalogues === catalogues ? state : {
    ...state, events: EMPTY_EVENTS, loadedCount: 0, complete: false, loading: Boolean(selection), error: null,
  };
  return { ...current, cancel, retry };
}
