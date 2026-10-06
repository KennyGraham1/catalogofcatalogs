'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEventHandler,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import { Activity, ArrowDown, ArrowUp, ArrowUpDown, Calendar, Layers, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { InfoTooltip, TechnicalTermTooltip } from '@/components/ui/info-tooltip';
import { cn } from '@/lib/utils';
import { sortTableEvents } from '@/lib/event-table-sort';
import { getQualityBadgeVariant, type QualityGrade } from '@/lib/quality-scoring';
import { resolveEventQuality } from './event-quality';
import {
  EVENT_TABLE_COLUMNS,
  EVENT_TABLE_COLUMNS_VAR,
  EVENT_TABLE_GRID_TEMPLATE,
  EVENT_TABLE_HEADER_HEIGHT,
  EVENT_TABLE_MIN_WIDTH,
  EVENT_TABLE_ROW_GRID_CLASS,
  eventOpenLabel,
  formatEventTime,
  magnitudeColorClass,
  nextSortState,
  type EventColumnKey,
  type EventTableEvent,
  type SortDirection,
  type SortField,
  type SortState,
} from './event-table-model';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Resolve Quality once per event list (prefer the stored quality_score/quality_grade, C1, and
 * compute Q client-side only for legacy rows) and sort. Both tables use this, so the sort
 * survives a filter change that moves a dataset across the virtualization threshold.
 */
export function useEventTableRows(
  events: EventTableEvent[],
  defaultSortField: SortField,
  defaultSortDirection: SortDirection
) {
  const resolvedEvents = useMemo(() => events.map(event => {
    const { score, grade } = resolveEventQuality(event);
    return event.quality_score === score && event.quality_grade === grade
      ? event
      : { ...event, quality_score: score, quality_grade: grade };
  }), [events]);

  const [sort, setSort] = useState<SortState>({ field: defaultSortField, direction: defaultSortDirection });

  const rows = useMemo(
    () => sortTableEvents(resolvedEvents, sort.field, sort.direction),
    [resolvedEvents, sort]
  );

  const toggleSort = useCallback((field: SortField) => {
    setSort(current => nextSortState(current, field));
  }, []);

  return { rows, sort, toggleSort };
}

export interface RowControlProps {
  tabIndex: number;
  'data-event-open': number;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onFocus: () => void;
}

interface RowNavigationOptions {
  rowCount: number;
  /** The one row whose open control is in the Tab order (roving tabindex). */
  tabStopIndex: number;
  /** Record `index` as the active row (after a focus, click or keyboard move). */
  setActiveIndex: (index: number) => void;
  /** Bring a row into view before it is focused; a virtualized list also mounts it here. */
  revealRow?: (index: number) => void;
  /** Rows moved by Page Up / Page Down. */
  getPageSize: () => number;
  /** Element that contains the rows' open controls. */
  containerRef: RefObject<HTMLElement>;
}

/**
 * Keyboard model shared by both tables. Exactly one row's open control is tabbable, so Tab
 * enters the rows once and leaves them on the next press however many events there are.
 * Up/Down move one row, Page Up/Page Down by `getPageSize()` rows, Home/End to the first/last
 * row, and Enter/Space activate the focused control natively (it is a <button>).
 */
export function useRowNavigation({
  rowCount,
  tabStopIndex,
  setActiveIndex,
  revealRow,
  getPageSize,
  containerRef,
}: RowNavigationOptions) {
  const pendingFocusRef = useRef<number | null>(null);

  const focusControl = useCallback((index: number) => {
    const control = containerRef.current?.querySelector<HTMLElement>(`[data-event-open="${index}"]`);
    if (!control) return false;
    control.focus();
    return true;
  }, [containerRef]);

  // A virtualized row may only mount on the render after a keyboard move; focus it then.
  useIsomorphicLayoutEffect(() => {
    const index = pendingFocusRef.current;
    if (index !== null && focusControl(index)) pendingFocusRef.current = null;
  });

  const moveFocus = useCallback((from: number, to: number) => {
    if (rowCount === 0) return;
    const next = Math.max(0, Math.min(rowCount - 1, to));
    if (next === from) return;
    revealRow?.(next);
    setActiveIndex(next);
    pendingFocusRef.current = focusControl(next) ? null : next;
  }, [rowCount, revealRow, setActiveIndex, focusControl]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLElement>, index: number) => {
    // Leave browser and assistive-technology shortcuts alone; Ctrl+Home/End still work.
    if (event.altKey || event.metaKey || event.shiftKey) return;
    let target: number;
    switch (event.key) {
      case 'ArrowDown': target = index + 1; break;
      case 'ArrowUp': target = index - 1; break;
      case 'Home': target = 0; break;
      case 'End': target = rowCount - 1; break;
      case 'PageDown': target = index + getPageSize(); break;
      case 'PageUp': target = index - getPageSize(); break;
      default: return;
    }
    event.preventDefault();
    moveFocus(index, target);
  }, [rowCount, getPageSize, moveFocus]);

  const getControlProps = useCallback((index: number): RowControlProps => ({
    tabIndex: index === tabStopIndex ? 0 : -1,
    'data-event-open': index,
    onKeyDown: (event) => handleKeyDown(event, index),
    onFocus: () => setActiveIndex(index),
  }), [tabStopIndex, handleKeyDown, setActiveIndex]);

  return { getControlProps };
}

const COLUMN_HELP: Partial<Record<EventColumnKey, ReactNode>> = {
  time: <InfoTooltip content="Origin time of the event, in UTC." />,
  magnitude: <TechnicalTermTooltip term="magnitude" />,
  depth: <TechnicalTermTooltip term="depth" />,
  quality: <TechnicalTermTooltip term="qualityScore" />,
  type: <InfoTooltip content="Event classification (e.g., earthquake, quarry blast)." />,
};

const CELL_CLASS = 'flex min-w-0 items-center gap-2 px-3';

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ArrowUpDown aria-hidden="true" className="ml-1 h-3 w-3 opacity-50" />;
  return direction === 'asc'
    ? <ArrowUp aria-hidden="true" className="ml-1 h-3 w-3" />
    : <ArrowDown aria-hidden="true" className="ml-1 h-3 w-3" />;
}

function EventTableHeaderRow({ sort, onSort }: { sort: SortState; onSort: (field: SortField) => void }) {
  return (
    <div
      role="row"
      aria-rowindex={1}
      data-event-table-header=""
      className={cn(EVENT_TABLE_ROW_GRID_CLASS, 'items-center border-b text-sm font-medium text-muted-foreground')}
      style={{ height: EVENT_TABLE_HEADER_HEIGHT }}
    >
      {EVENT_TABLE_COLUMNS.map(column => {
        const sorted = column.sortField !== undefined && column.sortField === sort.field;
        return (
          <div
            key={column.key}
            role="columnheader"
            aria-sort={sorted ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
            className="flex min-w-0 items-center gap-1.5 whitespace-nowrap px-3"
          >
            {column.sortField ? (
              <Button
                variant="ghost"
                onClick={() => onSort(column.sortField as SortField)}
                className="h-auto p-0 font-medium hover:bg-transparent"
              >
                {column.label}
                <SortIcon active={sorted} direction={sort.direction} />
              </Button>
            ) : (
              <span>{column.label}</span>
            )}
            {COLUMN_HELP[column.key]}
          </div>
        );
      })}
    </div>
  );
}

function QualityBadge({ score, grade }: { score?: number | null; grade?: string | null }) {
  if (score == null || !grade) return <span className="text-muted-foreground">—</span>;
  // One 0-100 scale in both tables (getQualityBadgeVariant): a Q of 45 must read the same
  // "needs review" way whichever side of the virtualization threshold renders it.
  return (
    <Badge variant={getQualityBadgeVariant(grade as QualityGrade)} className="whitespace-nowrap text-xs">
      {`${score.toFixed(0)} ${grade}`}
    </Badge>
  );
}

interface EventTableRowProps {
  event: EventTableEvent;
  index: number;
  isLast: boolean;
  style?: CSSProperties;
  /** Present when rows can be opened: makes the row clickable and renders the open control. */
  onOpen?: (event: EventTableEvent, index: number) => void;
  controlProps?: RowControlProps;
  controlClassName?: string;
}

export function EventTableRow({
  event,
  index,
  isLast,
  style,
  onOpen,
  controlProps,
  controlClassName,
}: EventTableRowProps) {
  const timeText = formatEventTime(event.time);
  const magnitudeColor = magnitudeColorClass(event.magnitude);
  const location = event.location_name || null;

  return (
    <div
      role="row"
      aria-rowindex={index + 2}
      data-event-row={index}
      // Pointer users can click anywhere on the row. Keyboard activation of the open control
      // reaches this same handler as a bubbled click, so an event never opens twice.
      onClick={onOpen ? () => onOpen(event, index) : undefined}
      className={cn(
        EVENT_TABLE_ROW_GRID_CLASS,
        'items-center text-sm transition-colors',
        !isLast && 'border-b',
        onOpen && 'cursor-pointer hover:bg-muted/50 focus-within:bg-muted/50'
      )}
      style={style}
    >
      <div role="cell" className={CELL_CLASS}>
        <Calendar aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
        {onOpen ? (
          <button
            type="button"
            aria-label={eventOpenLabel(event)}
            className={cn(
              'whitespace-nowrap rounded-sm text-left tabular-nums underline-offset-4 hover:underline',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              controlClassName
            )}
            {...controlProps}
          >
            {timeText}
          </button>
        ) : (
          <span className="whitespace-nowrap tabular-nums">{timeText}</span>
        )}
      </div>

      <div role="cell" className={CELL_CLASS}>
        <Activity aria-hidden="true" className={cn('h-4 w-4 shrink-0', magnitudeColor)} />
        <span className={cn('whitespace-nowrap font-medium tabular-nums', magnitudeColor)}>
          {event.magnitude.toFixed(1)}
          {event.magnitude_type && (
            <span className="ml-1 text-xs text-muted-foreground">{event.magnitude_type}</span>
          )}
        </span>
      </div>

      <div role="cell" className={CELL_CLASS}>
        <Layers aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="whitespace-nowrap tabular-nums">{event.depth?.toFixed(1) ?? '—'}</span>
      </div>

      <div role="cell" className={CELL_CLASS}>
        <span className={cn('line-clamp-2 break-words', !location && 'text-muted-foreground')}>
          {location ?? 'Unknown location'}
        </span>
      </div>

      <div role="cell" className={CELL_CLASS}>
        <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="whitespace-nowrap font-mono">
          {event.latitude.toFixed(3)}, {event.longitude.toFixed(3)}
        </span>
      </div>

      <div role="cell" className={CELL_CLASS}>
        <QualityBadge score={event.quality_score} grade={event.quality_grade} />
      </div>

      <div role="cell" className={CELL_CLASS}>
        {event.event_type && (
          <Badge variant="outline" className="block max-w-full truncate text-xs">
            {event.event_type}
          </Badge>
        )}
      </div>
    </div>
  );
}

export function EventTableEmptyRow() {
  return (
    <div role="row" aria-rowindex={2} className="grid">
      <div role="cell" className="px-3 py-8 text-center text-sm text-muted-foreground">
        No events found
      </div>
    </div>
  );
}

interface EventTableFrameProps {
  rowCount: number;
  sort: SortState;
  onSort: (field: SortField) => void;
  /** Whether rows have open controls; adds the keyboard hint. */
  interactive: boolean;
  className?: string;
  scrollRef: Ref<HTMLDivElement>;
  scrollStyle?: CSSProperties;
  /** Keep the header visible while the rows scroll inside the frame (virtualized table). */
  stickyHeader?: boolean;
  bodyRef?: Ref<HTMLDivElement>;
  bodyStyle?: CSSProperties;
  onBodyFocus?: FocusEventHandler<HTMLDivElement>;
  onBodyBlur?: FocusEventHandler<HTMLDivElement>;
  children: ReactNode;
}

/**
 * Bordered frame, scroll container and table shell shared by both tables. The header and
 * the rows sit inside ONE scroll container, so they scroll sideways together and a narrow
 * screen scrolls the table, never the page. The table never shrinks below
 * EVENT_TABLE_MIN_WIDTH.
 */
export function EventTableFrame({
  rowCount,
  sort,
  onSort,
  interactive,
  className,
  scrollRef,
  scrollStyle,
  stickyHeader = false,
  bodyRef,
  bodyStyle,
  onBodyFocus,
  onBodyBlur,
  children,
}: EventTableFrameProps) {
  const hintId = useId();
  const showHint = interactive && rowCount > 0;

  return (
    <div className={cn('group w-full min-w-0 rounded-md border', className)}>
      <div
        ref={scrollRef}
        data-event-table-scroll=""
        // relative: the scroller must be the containing block of absolutely positioned
        // descendants (the rows' sr-only text), or they escape its clipping and widen the
        // page (measured: 1,046 px at a 390 px viewport for a sub-100-event catalogue).
        className="relative w-full overflow-auto rounded-[inherit] overscroll-x-contain"
        style={scrollStyle}
      >
        <div
          role="table"
          aria-label="Events"
          // Header row plus every event (or the single "No events found" row), including
          // rows a virtualized table has not mounted.
          aria-rowcount={Math.max(rowCount, 1) + 1}
          aria-describedby={showHint ? hintId : undefined}
          style={{
            minWidth: EVENT_TABLE_MIN_WIDTH,
            [EVENT_TABLE_COLUMNS_VAR as string]: EVENT_TABLE_GRID_TEMPLATE,
          } as CSSProperties}
        >
          <div role="rowgroup" className={cn('bg-muted', stickyHeader && 'sticky top-0 z-10')}>
            <EventTableHeaderRow sort={sort} onSort={onSort} />
          </div>
          <div
            role="rowgroup"
            ref={bodyRef}
            className="relative"
            style={bodyStyle}
            onFocus={onBodyFocus}
            onBlur={onBodyBlur}
          >
            {children}
          </div>
        </div>
      </div>
      {showHint && (
        // Shown while keyboard focus is inside the table; always available to screen readers.
        <p
          id={hintId}
          className="hidden border-t px-3 py-2 text-xs text-muted-foreground group-[:has(:focus-visible)]:block"
        >
          Use the Up and Down arrow keys to move between events, and Enter to open one.
        </p>
      )}
    </div>
  );
}
