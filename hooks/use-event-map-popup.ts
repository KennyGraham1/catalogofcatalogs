import { useCallback, useEffect, useState } from 'react';

/** A single lazily mounted popup, invalidated when its source data is replaced. */
export function useEventMapPopup<T>(events: T[], mapKey?: string) {
  const [selection, setSelection] = useState<{
    event: T; position: [number, number]; seq: number; source: T[]; mapKey?: string;
  } | null>(null);
  useEffect(() => setSelection(null), [events, mapKey]);
  const onEventClick = useCallback((event: T, position: [number, number]) => {
    setSelection(previous => ({ event, position, seq: (previous?.seq ?? 0) + 1, source: events, mapKey }));
  }, [events, mapKey]);
  return { activePopup: selection?.source === events && selection.mapKey === mapKey ? selection : null, onEventClick };
}
