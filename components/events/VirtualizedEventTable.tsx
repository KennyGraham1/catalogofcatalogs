'use client';

import { useCallback, useRef, useState, type FocusEvent } from 'react';
import {
  defaultRangeExtractor,
  useVirtualizer,
  type Range,
  type Rect,
  type Virtualizer,
} from '@tanstack/react-virtual';
import {
  EventTableEmptyRow,
  EventTableFrame,
  EventTableRow,
  useEventTableRows,
  useRowNavigation,
} from './EventTableParts';
import {
  EVENT_TABLE_HEADER_HEIGHT,
  EVENT_TABLE_ROW_HEIGHT,
  clampRowIndex,
  type EventTableEvent,
  type SortDirection,
  type SortField,
  type SortState,
} from './event-table-model';

interface VirtualizedEventTableProps {
  events: EventTableEvent[];
  onEventClick?: (event: EventTableEvent) => void;
  className?: string;
  defaultSortField?: SortField;
  defaultSortDirection?: SortDirection;
  rowHeight?: number;
  height?: number;
}

/** Event table for large datasets: only the rows in (or near) view are mounted. */
export function VirtualizedEventTable({
  events,
  onEventClick,
  className,
  defaultSortField = 'time',
  defaultSortDirection = 'desc',
  rowHeight = EVENT_TABLE_ROW_HEIGHT,
  height = 600,
}: VirtualizedEventTableProps) {
  const { rows, sort, toggleSort } = useEventTableRows(events, defaultSortField, defaultSortDirection);
  return (
    <VirtualizedEventGrid
      rows={rows}
      sort={sort}
      onSort={toggleSort}
      onEventClick={onEventClick}
      className={className}
      rowHeight={rowHeight}
      height={height}
    />
  );
}

interface VirtualizedEventGridProps {
  /** Rows already quality-resolved and sorted (useEventTableRows). */
  rows: EventTableEvent[];
  sort: SortState;
  onSort: (field: SortField) => void;
  onEventClick?: (event: EventTableEvent) => void;
  className?: string;
  rowHeight?: number;
  height?: number;
}

/**
 * The header and the windowed rows share one scroll container: the header is sticky at the
 * top, both scroll sideways together, and the vertical and horizontal scrollbars sit on the
 * frame's own edges at any width. Rows are positioned below the header, so the virtualizer
 * is told the header's height (scrollMargin) and keeps rows it scrolls to clear of it
 * (scrollPaddingStart, and scroll-padding-top for the browser's own focus scrolling).
 */
export function VirtualizedEventGrid({
  rows,
  sort,
  onSort,
  onEventClick,
  className,
  rowHeight = EVENT_TABLE_ROW_HEIGHT,
  height = 600,
}: VirtualizedEventGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [focusInRows, setFocusInRows] = useState(false);
  const rowCount = rows.length;
  const active = clampRowIndex(activeIndex, rowCount);

  // Always mount the active row, even when scrolled out of view, so a focused row is never
  // unmounted from under the keyboard and Tab always has a row control to land on.
  const rangeExtractor = useCallback((range: Range) => {
    const indexes = defaultRangeExtractor(range);
    if (active < 0 || active >= range.count || indexes.includes(active)) return indexes;
    return active < indexes[0] ? [active, ...indexes] : [...indexes, active];
  }, [active]);

  // clientHeight excludes a horizontal scrollbar, so the last visible row is never hidden
  // behind it. A container that has not been laid out (or a test DOM) reports 0: fall back to
  // the requested height so rows still render.
  const observeElementRect = useCallback(
    (instance: Virtualizer<HTMLDivElement, Element>, notify: (rect: Rect) => void) => {
      const element = instance.scrollElement;
      if (!element) return undefined;
      const report = () => notify({ width: element.clientWidth, height: element.clientHeight || height });
      report();
      const ResizeObserverCtor = instance.targetWindow?.ResizeObserver;
      if (!ResizeObserverCtor) return () => {};
      const observer = new ResizeObserverCtor(report);
      observer.observe(element);
      return () => observer.disconnect();
    },
    [height]
  );

  const estimateSize = useCallback(() => rowHeight, [rowHeight]);

  const virtualizer = useVirtualizer<HTMLDivElement, Element>({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    overscan: 6,
    scrollMargin: EVENT_TABLE_HEADER_HEIGHT,
    scrollPaddingStart: EVENT_TABLE_HEADER_HEIGHT,
    initialRect: { width: 0, height },
    observeElementRect,
    rangeExtractor,
  });

  const viewportHeight = (virtualizer.scrollRect?.height || height) - EVENT_TABLE_HEADER_HEIGHT;
  const scrollOffset = virtualizer.scrollOffset ?? 0;
  const pageSize = Math.max(1, Math.floor(viewportHeight / rowHeight));

  // Roving tab stop: the active row while focus is in the rows (or while that row is in
  // view); otherwise the first row in view, so tabbing back in after scrolling with a mouse
  // or touch lands where the reader is looking instead of jumping back to the active row.
  const activeInView = active >= 0
    && (active + 1) * rowHeight > scrollOffset
    && active * rowHeight < scrollOffset + viewportHeight;
  const tabStopIndex = focusInRows || activeInView
    ? active
    : clampRowIndex(Math.ceil(scrollOffset / rowHeight), rowCount);

  const revealRow = useCallback((index: number) => {
    virtualizer.scrollToIndex(index, { align: 'auto' });
  }, [virtualizer]);

  const getPageSize = useCallback(() => pageSize, [pageSize]);

  const { getControlProps } = useRowNavigation({
    rowCount,
    tabStopIndex,
    setActiveIndex,
    revealRow,
    getPageSize,
    containerRef: bodyRef,
  });

  const openEvent = onEventClick
    ? (event: EventTableEvent, index: number) => {
      setActiveIndex(index);
      onEventClick(event);
    }
    : undefined;

  const handleBodyBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusInRows(false);
  };

  return (
    <EventTableFrame
      rowCount={rowCount}
      sort={sort}
      onSort={onSort}
      interactive={Boolean(onEventClick)}
      className={className}
      scrollRef={scrollRef}
      scrollStyle={{
        height,
        // Short screens keep the whole table, and the page around it, reachable.
        maxHeight: '75vh',
        scrollPaddingTop: EVENT_TABLE_HEADER_HEIGHT,
      }}
      stickyHeader
      bodyRef={bodyRef}
      bodyStyle={rowCount > 0 ? { height: virtualizer.getTotalSize() } : undefined}
      onBodyFocus={() => setFocusInRows(true)}
      onBodyBlur={handleBodyBlur}
    >
      {rowCount === 0 ? (
        <EventTableEmptyRow />
      ) : (
        virtualizer.getVirtualItems().map(item => (
          <EventTableRow
            key={item.index}
            event={rows[item.index]}
            index={item.index}
            isLast={item.index === rowCount - 1}
            onOpen={openEvent}
            controlProps={openEvent ? getControlProps(item.index) : undefined}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: rowHeight,
              transform: `translateY(${item.start - EVENT_TABLE_HEADER_HEIGHT}px)`,
            }}
          />
        ))
      )}
    </EventTableFrame>
  );
}
