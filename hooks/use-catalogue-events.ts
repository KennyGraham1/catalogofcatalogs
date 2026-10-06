'use client';

import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { SessionContext } from 'next-auth/react';
import {
  CatalogueEventCache, loadCatalogueEvents,
  type CatalogueEvent, type CatalogueMapEvent, type EventCatalogue, type EventView,
} from '@/lib/catalogue-event-loader';

const EMPTY_EVENTS: CatalogueMapEvent[] = [];

export interface CatalogueEventsOptions {
  /**
   * Rows to load ('summary' unless given). null while it is not known yet (the session
   * is still loading): nothing is fetched and the result reports loading.
   */
  view?: EventView | null;
}

export interface CatalogueEventsResult<E> {
  events: E[];
  loading: boolean;
  complete: boolean;
  loadedCount: number;
  error: string | null;
  cancel: () => void;
  retry: () => void;
}

/**
 * The event view a public map page loads: 'map' for a signed-out visitor (the map view
 * needs no session), 'summary' for a signed-in user (as before maps were public), and null
 * while the session is loading. Read without useSession, which throws outside a
 * SessionProvider; without one the session is unknown and the summary view is used.
 */
export function useMapEventView(): EventView | null {
  const session = useContext(SessionContext);
  if (!session) return 'summary';
  if (session.status === 'loading') return null;
  // next-auth reports 'authenticated' for any non-empty session object, including a
  // revoked one that carries no user (see lib/auth/hooks.ts useAuth).
  return session.status === 'authenticated' && session.data?.user ? 'summary' : 'map';
}

export function useCatalogueEvents(
  catalogues: EventCatalogue[], selection: string, sharedCache?: CatalogueEventCache
): CatalogueEventsResult<CatalogueEvent>;
export function useCatalogueEvents(
  catalogues: EventCatalogue[], selection: string, sharedCache: CatalogueEventCache | undefined, options: CatalogueEventsOptions
): CatalogueEventsResult<CatalogueMapEvent>;
export function useCatalogueEvents(
  catalogues: EventCatalogue[], selection: string, sharedCache?: CatalogueEventCache, options: CatalogueEventsOptions = {}
): CatalogueEventsResult<CatalogueMapEvent> {
  const view = options.view === undefined ? 'summary' : options.view;
  const localCache = useRef(new CatalogueEventCache());
  const cache = sharedCache ?? localCache.current;
  const controller = useRef<AbortController | null>(null);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({
    catalogues, selection: '', view, events: EMPTY_EVENTS, loading: false, complete: false,
    loadedCount: 0, error: null as string | null,
  });

  useEffect(() => {
    const request = new AbortController();
    controller.current = request;
    const selected = selection === 'all' ? catalogues : catalogues.filter(catalogue => catalogue.id === selection);
    setState({ catalogues, selection, view, events: EMPTY_EVENTS, loading: selected.length > 0, complete: false, loadedCount: 0, error: null });
    // An unknown view waits (still loading) for the session to settle.
    if (!selection || !selected.length || view === null) return () => request.abort();
    let lastUpdate = 0;
    loadCatalogueEvents(selected, {
      signal: request.signal,
      cache,
      view,
      onProgress: (loadedCount, preview) => {
        if (request.signal.aborted) return;
        if (!preview && Date.now() - lastUpdate < 150) return;
        lastUpdate = Date.now();
        setState(previous => ({ ...previous, loadedCount, events: preview ?? previous.events }));
      },
    }).then(events => {
      if (!request.signal.aborted) setState({ catalogues, selection, view, events, loadedCount: events.length, loading: false, complete: true, error: null });
    }).catch(error => {
      if (!request.signal.aborted) setState(previous => ({ ...previous, loading: false, error: error instanceof Error ? error.message : 'Failed to load events' }));
    });
    return () => request.abort();
  }, [catalogues, selection, view, revision, cache]);

  const cancel = useCallback(() => {
    controller.current?.abort();
    setState(previous => ({ ...previous, loading: false, complete: false, error: 'Event loading cancelled' }));
  }, []);
  const retry = useCallback(() => {
    controller.current?.abort();
    setRevision(previous => previous + 1);
  }, []);
  // Rows of another selection, list or view are never shown for this one.
  const current = state.selection === selection && state.catalogues === catalogues && state.view === view ? state : {
    ...state, events: EMPTY_EVENTS, loadedCount: 0, complete: false, loading: Boolean(selection), error: null,
  };
  const { events, loading, complete, loadedCount, error } = current;
  return { events, loading, complete, loadedCount, error, cancel, retry };
}
