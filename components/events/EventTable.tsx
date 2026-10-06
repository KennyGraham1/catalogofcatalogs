'use client';

import { useCallback, useRef, useState } from 'react';
import { VirtualizedEventGrid } from './VirtualizedEventTable';
import {
  EventTableEmptyRow,
  EventTableFrame,
  EventTableRow,
  useEventTableRows,
  useRowNavigation,
} from './EventTableParts';
import {
  EVENT_TABLE_ROW_HEIGHT,
  clampRowIndex,
  type EventTableEvent,
  type SortDirection,
  type SortField,
  type SortState,
} from './event-table-model';

export type { EventTableEvent } from './event-table-model';

interface EventTableProps {
  events: EventTableEvent[];
  onEventClick?: (event: EventTableEvent) => void;
  className?: string;
  defaultSortField?: SortField;
  defaultSortDirection?: SortDirection;
  virtualizationThreshold?: number; // Use virtualization if events > this number
}

/**
 * Sortable event table. Above `virtualizationThreshold` events it windows its rows
 * (VirtualizedEventGrid); at or below it, every row is rendered. Both use the same column
 * definition, frame, scroll container, sort state and keyboard model.
 */
export function EventTable({
  events,
  onEventClick,
  className,
  defaultSortField = 'time',
  defaultSortDirection = 'desc',
  virtualizationThreshold = 100
}: EventTableProps) {
  const { rows, sort, toggleSort } = useEventTableRows(events, defaultSortField, defaultSortDirection);

  if (rows.length > virtualizationThreshold) {
    return (
      <VirtualizedEventGrid
        rows={rows}
        sort={sort}
        onSort={toggleSort}
        onEventClick={onEventClick}
        className={className}
      />
    );
  }

  return (
    <PlainEventGrid
      rows={rows}
      sort={sort}
      onSort={toggleSort}
      onEventClick={onEventClick}
      className={className}
    />
  );
}

/** Rows a Page Up / Page Down moves in the non-virtualized table. */
const PLAIN_PAGE_SIZE = 10;

interface PlainEventGridProps {
  rows: EventTableEvent[];
  sort: SortState;
  onSort: (field: SortField) => void;
  onEventClick?: (event: EventTableEvent) => void;
  className?: string;
}

function PlainEventGrid({ rows, sort, onSort, onEventClick, className }: PlainEventGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const rowCount = rows.length;

  const getPageSize = useCallback(() => PLAIN_PAGE_SIZE, []);

  const { getControlProps } = useRowNavigation({
    rowCount,
    tabStopIndex: clampRowIndex(activeIndex, rowCount),
    setActiveIndex,
    getPageSize,
    containerRef: bodyRef,
  });

  const openEvent = onEventClick
    ? (event: EventTableEvent, index: number) => {
      setActiveIndex(index);
      onEventClick(event);
    }
    : undefined;

  return (
    <EventTableFrame
      rowCount={rowCount}
      sort={sort}
      onSort={onSort}
      interactive={Boolean(onEventClick)}
      className={className}
      scrollRef={scrollRef}
      bodyRef={bodyRef}
    >
      {rowCount === 0 ? (
        <EventTableEmptyRow />
      ) : (
        rows.map((event, index) => (
          <EventTableRow
            key={index}
            event={event}
            index={index}
            isLast={index === rowCount - 1}
            onOpen={openEvent}
            controlProps={openEvent ? getControlProps(index) : undefined}
            // The page scrolls this table: keep a focused row clear of the fixed site header.
            controlClassName="scroll-mt-24 scroll-mb-4"
            style={{ minHeight: EVENT_TABLE_ROW_HEIGHT }}
          />
        ))
      )}
    </EventTableFrame>
  );
}
