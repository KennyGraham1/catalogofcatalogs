import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A single lazily mounted popup, invalidated when its source data is replaced.
 *
 * `closePopup(seq)` clears the selection when Leaflet closes that popup (its close button,
 * a map click); wire it to the Popup's `remove` event so a highlighted marker is released:
 * `<Popup key={activePopup.seq} eventHandlers={{ remove: () => closePopup(activePopup.seq) }}>`.
 * The seq guard keeps a stale close from clearing a newer selection.
 */
export function useEventMapPopup<T>(events: T[], mapKey?: string) {
  const [selection, setSelection] = useState<{
    event: T; position: [number, number]; seq: number; source: T[]; mapKey?: string;
  } | null>(null);
  // Monotonic across closes, so reopening the same event always remounts its popup.
  const sequence = useRef(0);
  useEffect(() => setSelection(null), [events, mapKey]);
  const onEventClick = useCallback((event: T, position: [number, number]) => {
    const seq = ++sequence.current;
    setSelection({ event, position, seq, source: events, mapKey });
  }, [events, mapKey]);
  const closePopup = useCallback((seq?: number) => {
    setSelection(previous => (previous && (seq === undefined || previous.seq === seq) ? null : previous));
  }, []);
  return {
    activePopup: selection?.source === events && selection.mapKey === mapKey ? selection : null,
    onEventClick,
    closePopup,
  };
}
