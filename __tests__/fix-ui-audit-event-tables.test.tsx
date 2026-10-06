/**
 * UI audit 2026-10-05, finding 2 (virtualized event rows overlap and lose column alignment on
 * mobile) and finding 5 for event rows (click handlers but no focusable, named control).
 *
 * Before the fix: VirtualizedEventTable sized its header and rows with different flex rules
 * and let rows shrink with `min-w-0`, with no minimum table width and no scroll container
 * around the header; rows were `role="listitem"`, `tabIndex -1`, with no button. EventTable
 * (<= 100 events) had the same click-only rows.
 *
 * jsdom has no layout, so these tests check the structure that produces the layout (one grid
 * template defined once, a minimum width, one scroll container) and drive the keyboard model
 * with the scroll container's size stubbed where scrolling is asserted.
 */
import '@testing-library/jest-dom';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventTable } from '@/components/events/EventTable';
import { VirtualizedEventTable } from '@/components/events/VirtualizedEventTable';
import {
  EVENT_TABLE_COLUMNS,
  EVENT_TABLE_GRID_TEMPLATE,
  EVENT_TABLE_HEADER_HEIGHT,
  EVENT_TABLE_MIN_WIDTH,
  EVENT_TABLE_ROW_HEIGHT,
  type EventTableEvent,
} from '@/components/events/event-table-model';

afterEach(cleanup);

/** The Kaikoura mainshock; the label below is written out by hand from this instant. */
const KAIKOURA: EventTableEvent = {
  id: 'kaikoura',
  time: '2016-11-13T11:02:56.000Z',
  latitude: -42.737,
  longitude: 173.054,
  depth: 15.1,
  magnitude: 7.8,
  magnitude_type: 'Mw',
  location_name: 'Kaikoura',
};
const KAIKOURA_LABEL = 'Open event 2016-11-13 11:02:56 UTC, M7.8';

/**
 * `count` events one minute apart, all before the Kaikoura mainshock. With the default
 * newest-first sort, row k holds `e${count - 1 - k}`.
 */
function makeEvents(count: number): EventTableEvent[] {
  const start = Date.parse('2016-11-12T00:00:00.000Z');
  return Array.from({ length: count }, (_, i) => ({
    id: `e${i}`,
    time: new Date(start + i * 60_000).toISOString(),
    latitude: -42,
    longitude: 173,
    depth: 10,
    magnitude: 3 + (i % 10) / 10,
    magnitude_type: 'ML',
    location_name: `Place ${i}`,
  }));
}

const getTable = () => screen.getByRole('table', { name: 'Events' });
const getRows = () => within(getTable()).getAllByRole('row');
const getBodyRows = () => getRows().slice(1);
const getOpenControls = () => screen.queryAllByRole('button', { name: /^Open event / });
const getScrollContainer = () => getTable().parentElement as HTMLElement;

const TEMPLATE_CLASS = '[grid-template-columns:var(--event-table-columns)]';

type Variant = 'plain' | 'virtualized';

/** Datasets on both sides of EventTable's default 100-event threshold, plus the standalone table. */
const LAYOUTS: Array<[string, Variant, () => JSX.Element]> = [
  ['EventTable with 100 events (at the threshold, not virtualized)', 'plain',
    () => <EventTable events={makeEvents(100)} onEventClick={() => {}} />],
  ['EventTable with 101 events (virtualized)', 'virtualized',
    () => <EventTable events={makeEvents(101)} onEventClick={() => {}} />],
  ['VirtualizedEventTable used directly', 'virtualized',
    () => <VirtualizedEventTable events={makeEvents(30)} onEventClick={() => {}} height={400} />],
];

describe('finding 2: header and rows share one column definition', () => {
  it('the template gives every column a fixed pixel minimum that sums to the table minimum width', () => {
    const tracks = EVENT_TABLE_GRID_TEMPLATE.split(/ (?=minmax)/);
    expect(tracks).toHaveLength(EVENT_TABLE_COLUMNS.length);
    for (const track of tracks) expect(track).toMatch(/^minmax\(\d+px, [\d.]+fr\)$/);
    const minimums = tracks.map(track => Number(/minmax\((\d+)px/.exec(track)![1]));
    expect(minimums.reduce((a, b) => a + b, 0)).toBe(EVENT_TABLE_MIN_WIDTH);
    // Readable at phone widths: wider than a 390 px screen, so the table scrolls, not squashes.
    expect(EVENT_TABLE_MIN_WIDTH).toBeGreaterThan(900);
  });

  it.each(LAYOUTS)('%s: the template is defined once and every row reads it', (_name, variant, ui) => {
    render(ui());
    const table = getTable();
    expect(table.style.getPropertyValue('--event-table-columns')).toBe(EVENT_TABLE_GRID_TEMPLATE);
    expect(table.style.minWidth).toBe(`${EVENT_TABLE_MIN_WIDTH}px`);

    const [header, ...body] = getRows();
    expect(header).toHaveAttribute('data-event-table-header');
    expect(body.length).toBeGreaterThan(0);
    for (const row of [header, ...body]) {
      expect(row.className).toContain(TEMPLATE_CLASS);
      // No row may carry its own column sizes: that is how the header and rows drifted apart.
      expect(row.style.gridTemplateColumns).toBe('');
    }

    expect(within(header).getAllByRole('columnheader')).toHaveLength(EVENT_TABLE_COLUMNS.length);
    for (const row of body) expect(within(row).getAllByRole('cell')).toHaveLength(EVENT_TABLE_COLUMNS.length);

    // Plain renders all 100 rows; virtualized mounts only a window of them.
    if (variant === 'plain') expect(body).toHaveLength(100);
    else expect(body.length).toBeLessThan(30);
  });
});

describe('finding 2: one scroll container around both header and rows', () => {
  it.each(LAYOUTS)('%s', (_name, variant, ui) => {
    render(ui());
    const scroller = getScrollContainer();
    expect(scroller).toHaveAttribute('data-event-table-scroll');
    // The containing block of the rows' sr-only (absolute) text, so it is clipped too and
    // cannot widen the page (a 1,046 px page at a 390 px viewport before this).
    expect(scroller).toHaveClass('relative', 'overflow-auto');
    expect(scroller.className).toContain('overflow-auto');

    const [header, firstRow] = getRows();
    expect(scroller).toContainElement(header);
    expect(scroller).toContainElement(firstRow);
    // Nothing between the frame and the table scrolls separately.
    expect(header.closest('[data-event-table-scroll]')).toBe(scroller);
    expect(firstRow.closest('[data-event-table-scroll]')).toBe(scroller);

    // The frame fills its container and never forces the page wider.
    const frame = scroller.parentElement as HTMLElement;
    expect(frame.className).toEqual(expect.stringContaining('w-full'));
    expect(frame.className).toEqual(expect.stringContaining('min-w-0'));

    const headerGroup = header.parentElement as HTMLElement;
    if (variant === 'virtualized') {
      // Rows scroll vertically inside the frame under a sticky header, and the browser keeps
      // a focused row clear of that header.
      expect(scroller.style.height).not.toBe('');
      expect(scroller.style.scrollPaddingTop).toBe(`${EVENT_TABLE_HEADER_HEIGHT}px`);
      expect(headerGroup.className).toContain('sticky');
    } else {
      // The page scrolls a non-virtualized table vertically; the frame only scrolls sideways.
      expect(scroller.style.height).toBe('');
      expect(headerGroup.className).not.toContain('sticky');
    }
  });

  it('aria-rowcount counts rows the virtualized table has not mounted', () => {
    render(<EventTable events={makeEvents(150)} onEventClick={() => {}} />);
    expect(getTable()).toHaveAttribute('aria-rowcount', '151');
    const bodyRows = getBodyRows();
    const last = bodyRows[bodyRows.length - 1];
    expect(Number(last.getAttribute('aria-rowindex'))).toBeLessThan(151);
  });
});

describe('finding 5: each row has a named control that opens the event', () => {
  it.each([
    ['not virtualized', 1],
    ['virtualized', 120],
  ])('%s: the control is named by its visible UTC time and the magnitude', (_name, count) => {
    // KAIKOURA is the newest event, so it is row 0 either way.
    render(<EventTable events={[...makeEvents(count - 1), KAIKOURA]} onEventClick={() => {}} />);
    const control = screen.getByRole('button', { name: KAIKOURA_LABEL });
    expect(control).toHaveTextContent('2016-11-13 11:02:56 UTC');
    expect(control.closest('[role="row"]')).toHaveAttribute('data-event-row', '0');
  });

  it.each(LAYOUTS)('%s: one open control per mounted row, one of them tabbable', (_name, _variant, ui) => {
    render(ui());
    const rows = getBodyRows();
    for (const row of rows) {
      expect(within(row).getAllByRole('button', { name: /^Open event / })).toHaveLength(1);
    }
    const tabbable = getOpenControls().filter(control => control.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0].closest('[role="row"]')).toHaveAttribute('data-event-row', '0');
    // Focus is visible on the control itself.
    expect(tabbable[0].className).toContain('focus-visible:ring-2');
  });

  it('a table without an open handler renders no open controls and no clickable rows', () => {
    render(<EventTable events={makeEvents(3)} />);
    expect(getOpenControls()).toHaveLength(0);
    for (const row of getBodyRows()) expect(row.className).not.toContain('cursor-pointer');
    expect(screen.getAllByText(/^2016-\d\d-\d\d \d\d:\d\d:\d\d UTC$/)).toHaveLength(3);
  });
});

describe.each([
  ['not virtualized', 100],
  ['virtualized', 101],
])('finding 5 (%s, %i events): opening an event', (_name, count) => {
  it('Enter and Space on the open control open that event, once each', async () => {
    const user = userEvent.setup();
    const onEventClick = jest.fn();
    render(<EventTable events={makeEvents(count)} onEventClick={onEventClick} />);

    const control = within(getBodyRows()[2]).getByRole('button', { name: /^Open event / });
    act(() => control.focus());
    await user.keyboard('{Enter}');
    expect(onEventClick).toHaveBeenCalledTimes(1);
    expect(onEventClick.mock.calls[0][0]).toMatchObject({ id: `e${count - 3}` });

    await user.keyboard(' ');
    expect(onEventClick).toHaveBeenCalledTimes(2);
    expect(onEventClick.mock.calls[1][0]).toMatchObject({ id: `e${count - 3}` });
  });

  it('a pointer click anywhere on the row still opens it, and clicking the control opens it once', async () => {
    const user = userEvent.setup();
    const onEventClick = jest.fn();
    render(<EventTable events={makeEvents(count)} onEventClick={onEventClick} />);

    await user.click(screen.getByText(`Place ${count - 1}`));
    expect(onEventClick).toHaveBeenCalledTimes(1);
    expect(onEventClick.mock.calls[0][0]).toMatchObject({ id: `e${count - 1}` });

    await user.click(within(getBodyRows()[1]).getByRole('button', { name: /^Open event / }));
    expect(onEventClick).toHaveBeenCalledTimes(2);
    expect(onEventClick.mock.calls[1][0]).toMatchObject({ id: `e${count - 2}` });
  });

  it('Tab enters the rows once, at the first row, and the next Tab leaves them', async () => {
    const user = userEvent.setup();
    render(
      <>
        <EventTable events={makeEvents(count)} onEventClick={() => {}} />
        <button type="button">After the table</button>
      </>
    );

    // Past the header's sort and help buttons to the first row control.
    for (let i = 0; i < 20 && !document.activeElement?.hasAttribute('data-event-open'); i++) {
      await user.tab();
    }
    expect(document.activeElement).toHaveAttribute('data-event-open', '0');
    expect(document.activeElement).toHaveAccessibleName(/^Open event /);

    await user.tab();
    expect(document.activeElement).toHaveAccessibleName('After the table');
  });

  it('Up/Down, Home and End move focus between row controls', async () => {
    const user = userEvent.setup();
    const onEventClick = jest.fn();
    render(<EventTable events={makeEvents(count)} onEventClick={onEventClick} />);

    const first = within(getBodyRows()[0]).getByRole('button', { name: /^Open event / });
    act(() => first.focus());

    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toHaveAttribute('data-event-open', '1');
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}');
    expect(document.activeElement).toHaveAttribute('data-event-open', '2');

    await user.keyboard('{End}');
    expect(document.activeElement).toHaveAttribute('data-event-open', String(count - 1));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toHaveAttribute('data-event-open', String(count - 1));

    // The tab stop follows focus, so Tab leaves and Shift+Tab returns to the same row.
    expect(getOpenControls().filter(control => control.tabIndex === 0)).toEqual([document.activeElement]);

    await user.keyboard('{Enter}');
    expect(onEventClick).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'e0' }));

    await user.keyboard('{Home}');
    expect(document.activeElement).toHaveAttribute('data-event-open', '0');
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toHaveAttribute('data-event-open', '0');
  });
});

describe('finding 5: the virtualized list scrolls the focused row into view', () => {
  const VIEWPORT = 600;
  const restore: Array<() => void> = [];

  /** Give the table's scroll container real dimensions and a working scrollTo. */
  beforeEach(() => {
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    const define = (key: string, descriptor: PropertyDescriptor) => {
      const previous = Object.getOwnPropertyDescriptor(proto, key);
      Object.defineProperty(proto, key, { configurable: true, ...descriptor });
      restore.push(() => {
        if (previous) Object.defineProperty(proto, key, previous);
        else delete proto[key];
      });
    };
    const isScroller = (el: HTMLElement) => el.hasAttribute('data-event-table-scroll');
    define('clientHeight', {
      get(this: HTMLElement) { return isScroller(this) ? VIEWPORT : 0; },
    });
    define('scrollHeight', {
      get(this: HTMLElement) {
        if (!isScroller(this)) return 0;
        const body = this.querySelectorAll<HTMLElement>('[role="rowgroup"]')[1];
        return EVENT_TABLE_HEADER_HEIGHT + parseFloat(body?.style.height || '0');
      },
    });
    define('scrollTo', {
      writable: true,
      // Like a browser: an instant scroll, and a scroll event only if the position changed.
      value: jest.fn(function scrollTo(this: HTMLElement, options: ScrollToOptions) {
        if (typeof options.top !== 'number' || options.top === this.scrollTop) return;
        this.scrollTop = options.top;
        this.dispatchEvent(new Event('scroll'));
      }),
    });
  });

  afterEach(async () => {
    // Let the virtualizer's scroll-settled timer fire inside act before tearing down.
    await act(() => new Promise(resolve => setTimeout(resolve, 200)));
    cleanup();
    while (restore.length) restore.pop()!();
  });

  const COUNT = 150;
  const maxScroll = EVENT_TABLE_HEADER_HEIGHT + COUNT * EVENT_TABLE_ROW_HEIGHT - VIEWPORT;

  /** True when row `index` lies wholly inside the scrollport, below the sticky header. */
  function rowInView(index: number) {
    const top = getScrollContainer().scrollTop;
    const rowTop = EVENT_TABLE_HEADER_HEIGHT + index * EVENT_TABLE_ROW_HEIGHT;
    return rowTop >= top + EVENT_TABLE_HEADER_HEIGHT && rowTop + EVENT_TABLE_ROW_HEIGHT <= top + VIEWPORT;
  }

  it('End, Page Up/Down and arrows mount, scroll to and focus the target row', async () => {
    const user = userEvent.setup();
    const onEventClick = jest.fn();
    render(<EventTable events={makeEvents(COUNT)} onEventClick={onEventClick} />);
    expect(screen.queryByRole('button', { name: /^Open event 2016-11-12 00:00:00 UTC/ })).toBeNull();

    act(() => within(getBodyRows()[0]).getByRole('button', { name: /^Open event / }).focus());

    await user.keyboard('{End}');
    expect(document.activeElement).toHaveAttribute('data-event-open', String(COUNT - 1));
    // The oldest event, mounted only now, at the bottom of the scrollport.
    expect(document.activeElement).toHaveAccessibleName('Open event 2016-11-12 00:00:00 UTC, M3.0');
    expect(getScrollContainer().scrollTop).toBe(maxScroll);
    expect(rowInView(COUNT - 1)).toBe(true);

    await user.keyboard('{Enter}');
    expect(onEventClick).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'e0' }));

    // Page Up/Down move by the rows that fit below the header: floor((600 - 44) / 56) = 9.
    await user.keyboard('{PageUp}');
    expect(document.activeElement).toHaveAttribute('data-event-open', String(COUNT - 10));
    expect(rowInView(COUNT - 10)).toBe(true);

    await user.keyboard('{Home}');
    expect(document.activeElement).toHaveAttribute('data-event-open', '0');
    expect(getScrollContainer().scrollTop).toBe(0);

    await user.keyboard('{PageDown}');
    expect(document.activeElement).toHaveAttribute('data-event-open', '9');
    expect(rowInView(9)).toBe(true);

    // Stepping down a row at a time keeps scrolling just enough to show each row.
    for (let i = 0; i < 20; i++) await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toHaveAttribute('data-event-open', '29');
    expect(rowInView(29)).toBe(true);
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toHaveAttribute('data-event-open', '28');
    expect(rowInView(28)).toBe(true);
  });

  it('after scrolling with a pointer, Tab enters at the first row in view', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Before the table</button>
        <VirtualizedEventTable events={makeEvents(COUNT)} onEventClick={() => {}} />
      </>
    );
    const scroller = getScrollContainer();
    act(() => {
      scroller.scrollTop = 50 * EVENT_TABLE_ROW_HEIGHT;
      scroller.dispatchEvent(new Event('scroll'));
    });

    const tabbable = getOpenControls().filter(control => control.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAttribute('data-event-open', '50');

    act(() => screen.getByRole('button', { name: 'Before the table' }).focus());
    for (let i = 0; i < 20 && !document.activeElement?.hasAttribute('data-event-open'); i++) {
      await user.tab();
    }
    expect(document.activeElement).toHaveAttribute('data-event-open', '50');
    expect(rowInView(50)).toBe(true);
  });

  it('a focused row stays mounted when the list is scrolled away from it', async () => {
    render(<VirtualizedEventTable events={makeEvents(COUNT)} onEventClick={() => {}} />);
    const first = within(getBodyRows()[0]).getByRole('button', { name: /^Open event / });
    act(() => first.focus());

    const scroller = getScrollContainer();
    act(() => {
      scroller.scrollTop = 100 * EVENT_TABLE_ROW_HEIGHT;
      scroller.dispatchEvent(new Event('scroll'));
    });

    expect(document.activeElement).toBe(first);
    expect(first).toBeInTheDocument();
    expect(first).toHaveAttribute('tabindex', '0');
  });
});

describe('the sort survives a dataset crossing the 100-event threshold', () => {
  it('sorting the virtualized table by magnitude still applies once a filter leaves 100 events', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<EventTable events={makeEvents(101)} onEventClick={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^Magnitude/ }));
    const magnitudeHeader = () => screen.getAllByRole('columnheader')[1];
    expect(magnitudeHeader()).toHaveAttribute('aria-sort', 'ascending');

    rerender(<EventTable events={makeEvents(100)} onEventClick={() => {}} />);
    expect(getBodyRows()).toHaveLength(100);
    expect(magnitudeHeader()).toHaveAttribute('aria-sort', 'ascending');
    expect(within(getBodyRows()[0]).getAllByRole('cell')[1]).toHaveTextContent('3.0ML');
    expect(within(getBodyRows()[99]).getAllByRole('cell')[1]).toHaveTextContent('3.9ML');
  });
});
