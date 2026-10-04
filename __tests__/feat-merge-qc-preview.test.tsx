/**
 * The redesigned merge QC preview (components/merge/MergePreviewQC.tsx and its cards),
 * against mocked POST /api/merge/preview payloads (lib/merge-qc.ts MergePreviewPayload):
 *   - groups split from one failed cluster are shown together, by splitKey, with the reason
 *     and "published as N separate events";
 *   - size badges are neutral, only flags are coloured;
 *   - origin times are ISO 8601 UTC;
 *   - a Q column and a one-line reason say why the published solution won;
 *   - offsets are measured from the published solution (group.spread), not the first entry,
 *     and are not shown for a single entry;
 *   - Flagged / Kept apart / Matched lists, sorted (largest disagreement first by default, or
 *     by time), filtered by catalogue, 50 per page, with a note when the server truncated the
 *     matched list;
 *   - the wording of the tiles and alerts, and no merge buttons of the panel's own.
 */
import '@testing-library/jest-dom';
import * as React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { QcPreviewEntry, QcPreviewGroup } from '@/lib/merge-qc';

// The QC map loads through next/dynamic; record what it is asked to draw.
const mockMapProps: any[] = [];
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => function MapStub(props: any) { mockMapProps.push(props); return null; },
}));

import { MergePreviewQC, QC_PAGE_SIZE, type PreviewData } from '@/components/merge/MergePreviewQC';
import { DuplicateGroupCard } from '@/components/merge/DuplicateGroupCard';
import { groupSpread, selectionReason, splitUnits, splitReasons } from '@/components/merge/qc-format';

const A = { id: 'cat-gn', name: 'Synthetic GeoNet-like' };
const B = { id: 'cat-b', name: 'Synthetic Agency B catalogue' };
const C = { id: 'cat-c', name: 'Synthetic Agency C' };
type Cat = typeof A;

const T0 = Date.parse('2022-04-23T02:16:39.000Z');

function entry(cat: Cat, seconds: number, extra: Partial<QcPreviewEntry> = {}): QcPreviewEntry {
  return {
    id: `${cat.id}-${seconds}`, source_id: null, time: new Date(T0 + seconds * 1000).toISOString(),
    latitude: -41.3, longitude: 174.8, depth: 12, depth_type: null, magnitude: 3.4, magnitude_type: 'ML',
    quality_score: null, source: cat.name, catalogueId: cat.id, catalogueName: cat.name, ...extra,
  };
}

function group(id: string, events: QcPreviewEntry[], extra: Partial<QcPreviewGroup> = {}): QcPreviewGroup {
  return {
    id, events, selectedEventIndex: 0, isSuspicious: false, separated: false, heldForReview: false,
    validationWarnings: [], supersededEventIndexes: [], computedEpicentre: null, splitKey: null,
    discrepancy: events.length > 1 ? 0.1 : 0,
    spread: { timeS: events.length > 1 ? 0.5 : 0, distanceKm: events.length > 1 ? 1 : 0, depthKm: null, magnitude: null },
    ...extra,
  };
}

function payload(groups: QcPreviewGroup[], extra: Partial<PreviewData> = {}): PreviewData {
  // matchedListed / matchedTotal count the clean matches: not flagged, held or kept apart.
  const matched = groups.filter(g => g.events.length > 1 && !g.splitKey && !g.separated && !g.isSuspicious && !g.heldForReview).length;
  return {
    duplicateGroups: groups,
    matchedListed: matched,
    matchedTotal: matched,
    statistics: {
      totalEventsBefore: 100, totalEventsAfter: 80, duplicateGroupsCount: matched, duplicatesRemoved: 20,
      suspiciousGroupsCount: groups.filter(g => g.isSuspicious).length, heldForReviewCount: 0,
      supersededReportsCount: 0, separatedReportsCount: groups.filter(g => g.separated).length,
    },
    catalogueColors: { [A.id]: '#E69F00', [B.id]: '#56B4E9', [C.id]: '#009E73' },
    ...extra,
  };
}

const selectTab = (name: RegExp | string) => {
  act(() => { fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0, ctrlKey: false }); });
};

async function choose(select: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: select }));
  fireEvent.click(await screen.findByRole('option', { name: option }));
}

const cardTitles = () => screen.queryAllByRole('heading', { level: 4 }).map(h => h.textContent);

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});
beforeEach(() => { mockMapProps.length = 0; });
afterEach(() => cleanup());

describe('kept-apart groups are shown together, by splitKey', () => {
  // One failed cluster (k1): a salvaged pair published as one event, and an entry left on its
  // own. A second cluster (k2): two entries, each published alone.
  const salvaged = group('s1', [entry(A, 0, { quality_score: 70 }), entry(B, 1.2, { quality_score: 60 })], {
    splitKey: 'k1', discrepancy: 0.4, spread: { timeS: 1.2, distanceKm: 2, depthKm: null, magnitude: 0.1 },
  });
  const leftOver = group('s2', [entry(C, 6, { magnitude: 4.3, latitude: -41.5 })], {
    splitKey: 'k1', separated: true,
    validationWarnings: ['Matched with another entry but kept apart because the group failed consistency validation. Reason: Large magnitude range'],
  });
  const lonelyA = group('s3', [entry(A, 3600)], { splitKey: 'k2', separated: true, validationWarnings: ['Kept apart. Reason: Large spatial spread'] });
  const lonelyB = group('s4', [entry(B, 3602, { latitude: -40.9 })], { splitKey: 'k2', separated: true, validationWarnings: ['Kept apart. Reason: Large spatial spread'] });
  const data = payload([salvaged, leftOver, lonelyA, lonelyB]);

  it('groups the units by splitKey with the reason and the outcome', () => {
    render(<MergePreviewQC previewData={data} strategy="quality" />);
    // Nothing flagged: the list opens on Kept apart; two clusters, not four cards.
    expect(screen.getByRole('tab', { name: 'Kept apart (2)' })).toHaveAttribute('data-state', 'active');
    expect(cardTitles()).toEqual(['Kept apart', 'Kept apart']);
    expect(screen.queryByText('Single entry')).toBeNull();

    const outcomes = screen.getAllByTestId('split-outcome').map(node => node.textContent);
    expect(outcomes).toEqual(['Published as 2 separate events', 'Published as 2 separate events']);
    const reasons = screen.getAllByTestId('split-reason').map(node => node.textContent);
    expect(reasons).toEqual(['Kept apart because: Large magnitude range', 'Kept apart because: Large spatial spread']);
    // How far apart the published solutions are (k1: 6 s apart in time).
    expect(screen.getAllByTestId('split-separation')[0]).toHaveTextContent(/^The published solutions differ by up to Δt 6\.0 s · Δd \d+\.\d km · ΔM 0\.90$/);
  });

  it('lists each published event of a cluster as its own row group', () => {
    render(<MergePreviewQC previewData={data} strategy="quality" />);
    const card = screen.getAllByRole('heading', { name: 'Kept apart' })[0].closest('[data-split-key]') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /Show entries/ }));
    const table = within(card).getByRole('table', { name: 'Entries of the kept-apart cluster, by published event' });
    const headings = within(table).getAllByRole('rowheader').map(cell => cell.textContent);
    expect(headings[0]).toMatch(/^Event 1 of 2 · 2 entries · Published: Synthetic GeoNet-like · highest quality score \(Q 70 vs 60\)$/);
    expect(headings[1]).toBe('Event 2 of 2 · single entry (Synthetic Agency C)');
    expect(table.querySelectorAll('tr[data-published="true"]')).toHaveLength(2);
  });

  it('draws a whole cluster on one map, every published entry ringed', () => {
    render(<MergePreviewQC previewData={data} />);
    const card = screen.getAllByRole('heading', { name: 'Kept apart' })[0].closest('[data-split-key]') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /View on map/ }));
    const map = screen.getByRole('region', { name: 'Matched group map' });
    expect(within(map).getByText('Kept-apart cluster on the map')).toBeInTheDocument();
    expect(within(map).getByText(/3 entries published as 2 separate events/)).toBeInTheDocument();
    const drawn = mockMapProps.at(-1).group;
    expect(drawn.events).toHaveLength(3);
    expect(drawn.selectedEventIndex).toBe(-1);
    expect(drawn.publishedEventIndexes).toEqual([0, 2]);
  });

  it('treats a kept-apart entry from an older server (no splitKey) as a cluster of its own', () => {
    const { splitKey, ...legacy } = lonelyA;
    const units = splitUnits([{ group: legacy, index: 0 }, { group: { ...lonelyB, splitKey: null }, index: 1 }]);
    expect(units.map(unit => unit.groups.length)).toEqual([1, 1]);
    expect(splitReasons(units[0])).toEqual(['Large spatial spread']);
  });
});

describe('badges: sizes are neutral, only flags are coloured', () => {
  const four = group('g4', [entry(A, 0), entry(B, 1), entry(A, 2, { magnitude_type: 'MLv' }), entry(B, 3)], {
    isSuspicious: true, heldForReview: true, validationWarnings: ['Large magnitude range: 0.9'],
  });

  it('shows the size in a neutral badge, and Flagged and Held in amber', () => {
    render(<DuplicateGroupCard group={four} groupIndex={3} catalogueColors={{}} onViewOnMap={() => {}} />);
    const size = document.querySelector('[data-badge="size"]') as HTMLElement;
    expect(size).toHaveTextContent('4 entries · 2 catalogues');
    expect(size.className).not.toMatch(/destructive|red-|amber-|orange-/);
    const flags = Array.from(document.querySelectorAll<HTMLElement>('[data-badge="flag"]'));
    expect(flags.map(flag => flag.textContent)).toEqual(['Flagged', 'Held']);
    flags.forEach(flag => expect(flag.className).toMatch(/amber/));
    expect(document.body.innerHTML).not.toMatch(/bg-destructive/);
  });

  it('never badges a size in red, even for a single entry', () => {
    render(<DuplicateGroupCard group={group('g1', [entry(A, 0)])} groupIndex={0} catalogueColors={{}} onViewOnMap={() => {}} />);
    const size = document.querySelector('[data-badge="size"]') as HTMLElement;
    expect(size).toHaveTextContent('Single entry');
    expect(size.className).not.toMatch(/destructive|red-/);
  });
});

describe('origin times are ISO 8601 UTC', () => {
  it('in the group summary and the entry table, with no day/month ambiguity', () => {
    const pair = group('g', [entry(A, 0), entry(B, 2.5)]);
    render(<DuplicateGroupCard group={pair} groupIndex={0} catalogueColors={{}} onViewOnMap={() => {}} />);
    expect(screen.getByText(/^2022-04-23 02:16:39 UTC · ML 3\.4 · 41\.300° S, 174\.800° E · 12\.0 km$/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show entries/ }));
    const table = screen.getByRole('table', { name: 'Entries of Group #1' });
    expect(within(table).getByText('2022-04-23 02:16:39 UTC')).toBeInTheDocument();
    expect(within(table).getByText('2022-04-23 02:16:41 UTC')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
});

describe('why the published solution won', () => {
  const qualityPair = group('q', [entry(A, 0, { quality_score: 64 }), entry(B, 0.8, { quality_score: 82.4 })], { selectedEventIndex: 1 });

  it('adds a Q column and names the deciding quality score', () => {
    render(<DuplicateGroupCard group={qualityPair} groupIndex={0} catalogueColors={{}} strategy="quality" onViewOnMap={() => {}} />);
    expect(screen.getByTestId('selection-reason')).toHaveTextContent(
      'Published: Synthetic Agency B catalogue · highest quality score (Q 82 vs 64)'
    );
    fireEvent.click(screen.getByRole('button', { name: /Show entries/ }));
    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('columnheader').map(cell => cell.textContent);
    expect(headers).toContain('Q');
    const rows = within(table).getAllByRole('row').slice(1);
    const qIndex = headers.indexOf('Q');
    expect(within(rows[0]).getAllByRole('cell')[qIndex]).toHaveTextContent('64');
    expect(within(rows[1]).getAllByRole('cell')[qIndex]).toHaveTextContent('82');
    expect(rows[1]).toHaveAttribute('data-published', 'true');
    // The full catalogue name, not cut to a fixed width.
    expect(within(rows[1]).getByText('Synthetic Agency B catalogue')).not.toHaveClass('truncate');
  });

  it('does not claim the highest Q when the stored scores did not decide', () => {
    const lower = { ...qualityPair, selectedEventIndex: 0 };
    expect(selectionReason(lower, 'quality')).toBe('Published: Synthetic GeoNet-like · best-constrained on the quality metrics every entry reports');
  });

  it('gives each strategy in plain words', () => {
    expect(selectionReason(qualityPair, 'priority', 'custom')).toBe('Published: Synthetic Agency B catalogue · ranked highest in your source order');
    expect(selectionReason(qualityPair, 'priority', 'newest')).toBe('Published: Synthetic Agency B catalogue · most recently computed solution');
    expect(selectionReason(qualityPair, 'priority', 'quality')).toBe('Published: Synthetic Agency B catalogue · highest quality score (Q 82 vs 64)');
    expect(selectionReason(qualityPair, 'newest')).toBe('Published: Synthetic Agency B catalogue · most recently computed solution');
    expect(selectionReason(qualityPair, 'complete')).toBe('Published: Synthetic Agency B catalogue · most complete record (most populated fields)');
    const averaged = { ...qualityPair, selectedEventIndex: -1, computedEpicentre: { latitude: -41.3, longitude: 174.8, time: qualityPair.events[0].time } };
    expect(selectionReason(averaged, 'average')).toBe("Published: mean epicentre of 2 entries (no single entry's solution)");
    expect(selectionReason(averaged, 'median')).toBe("Published: median epicentre and origin time of 2 entries (no single entry's solution)");
    expect(selectionReason({ ...qualityPair, heldForReview: true }, 'quality')).toMatch(/^Provisionally published: Synthetic Agency B catalogue/);
  });

  it('passes the strategy from the panel to every card', () => {
    render(<MergePreviewQC previewData={payload([qualityPair])} strategy="quality" />);
    expect(screen.getByTestId('selection-reason')).toHaveTextContent('highest quality score (Q 82 vs 64)');
  });
});

describe('offsets are measured from the published solution', () => {
  it('shows the server spread, not differences from the first entry', () => {
    const g = group('g', [entry(A, 0), entry(B, 30, { latitude: -41.9 }), entry(C, 1)], {
      selectedEventIndex: 2, spread: { timeS: 29, distanceKm: 66.7, depthKm: 2, magnitude: 0.2 },
    });
    render(<DuplicateGroupCard group={g} groupIndex={0} catalogueColors={{}} onViewOnMap={() => {}} />);
    expect(screen.getByTestId('group-spread')).toHaveTextContent(
      'Largest offset from the published solution: Δt 29.0 s · Δd 66.7 km · Δz 2.0 km · ΔM 0.20'
    );
  });

  it('measures from the published entry when an older server sends no spread', () => {
    const { spread, ...legacy } = group('g', [entry(A, 0), entry(B, 5), entry(C, 6)], { selectedEventIndex: 1 });
    // From entry 1 (t = 5 s): the others are 5 s and 1 s away; from the first entry it would be 6 s.
    expect(groupSpread(legacy)).toMatchObject({ timeS: 5, distanceKm: 0, depthKm: 0, magnitude: 0 });
  });

  it('shows no offsets for a single entry', () => {
    render(<DuplicateGroupCard group={group('g', [entry(A, 0)])} groupIndex={0} catalogueColors={{}} onViewOnMap={() => {}} />);
    expect(screen.queryByTestId('group-spread')).toBeNull();
    expect(screen.queryByText(/Δt/)).toBeNull();
  });
});

describe('lists, sorting, catalogue filter and pages', () => {
  // 120 clean matches: group i has discrepancy i/120 and origin time T0 + i hours.
  const many = Array.from({ length: 120 }, (_, i) => group(`m${i}`, [entry(A, i * 3600), entry(i % 2 ? B : C, i * 3600 + 1)], {
    discrepancy: (i + 1) / 120,
  }));

  it('shows 50 groups per page, largest disagreement first', () => {
    render(<MergePreviewQC previewData={payload(many)} />);
    expect(screen.getByRole('tab', { name: 'Matched (120)' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('qc-page-range')).toHaveTextContent('Groups 1–50 of 120');
    expect(document.querySelectorAll('[data-group-id]')).toHaveLength(QC_PAGE_SIZE);
    expect(cardTitles().slice(0, 3)).toEqual(['Group #120', 'Group #119', 'Group #118']);

    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByTestId('qc-page-range')).toHaveTextContent('Groups 51–100 of 120');
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(cardTitles()[0]).toBe('Group #70');
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByTestId('qc-page-range')).toHaveTextContent('Groups 101–120 of 120');
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
  });

  it('sorts by origin time, and returns to the first page', async () => {
    render(<MergePreviewQC previewData={payload(many)} />);
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    await choose('Sort', 'Origin time, earliest first');
    expect(screen.getByTestId('qc-page-range')).toHaveTextContent('Groups 1–50 of 120');
    expect(cardTitles().slice(0, 2)).toEqual(['Group #1', 'Group #2']);
    await choose('Sort', 'Origin time, latest first');
    expect(cardTitles()[0]).toBe('Group #120');
  });

  it('filters by catalogue', async () => {
    render(<MergePreviewQC previewData={payload(many)} />);
    await choose('Catalogue', 'Synthetic Agency C');
    // Even i pair GeoNet-like with Agency C: 60 groups.
    expect(screen.getByTestId('qc-page-range')).toHaveTextContent('Groups 1–50 of 60');
    expect(cardTitles()[0]).toBe('Group #119');
  });

  it('notes when the server listed only the largest disagreements', () => {
    render(<MergePreviewQC previewData={payload(many.slice(0, 3), { matchedListed: 3, matchedTotal: 7443 })} />);
    expect(screen.getByRole('tab', { name: 'Matched (7,443)' })).toBeInTheDocument();
    expect(screen.getByTestId('matched-truncation')).toHaveTextContent('Showing the 3 largest disagreements of 7,443 matched groups.');
    cleanup();
    render(<MergePreviewQC previewData={payload(many.slice(0, 3))} />);
    expect(screen.queryByTestId('matched-truncation')).toBeNull();
  });

  it('keeps flagged groups in their own list, opened first', () => {
    const flagged = group('f1', [entry(A, 0), entry(B, 40)], { isSuspicious: true, discrepancy: 0.9, validationWarnings: ['Large time spread'] });
    render(<MergePreviewQC previewData={payload([...many.slice(0, 2), flagged])} />);
    expect(screen.getByRole('tab', { name: 'Flagged (1)' })).toHaveAttribute('data-state', 'active');
    expect(cardTitles()).toEqual(['Group #3']);
    selectTab('Matched (2)');
    expect(cardTitles()).toEqual(['Group #2', 'Group #1']);
  });
});

describe('wording and actions', () => {
  it('names the tiles as entries, events and groups', () => {
    render(<MergePreviewQC previewData={payload([group('g', [entry(A, 0), entry(B, 1)])])} />);
    for (const label of ['Entries before', 'Events after', 'Matched groups', 'Entries combined', 'Flagged groups']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    for (const old of ['Events Before', 'Events After', 'Duplicate Groups', 'Duplicates Removed', 'Suspicious Matches']) {
      expect(screen.queryByText(old)).toBeNull();
    }
    expect(screen.getByText('All matched groups passed the consistency checks.')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/appears to be working correctly|\breports?\b/i);
  });

  it('says how many flagged groups need review, with correct plurals', () => {
    const flagged = (id: string) => group(id, [entry(A, 0), entry(B, 40)], { isSuspicious: true });
    render(<MergePreviewQC previewData={payload([flagged('f1')])} />);
    expect(screen.getByText('1 flagged group needs review')).toBeInTheDocument();
    expect(screen.getByText(/It failed at least one consistency check/)).toHaveTextContent(/choose Hold for review/);
    cleanup();
    render(<MergePreviewQC previewData={payload([flagged('f1'), flagged('f2'), flagged('f3')])} holdForReview />);
    expect(screen.getByText('3 flagged groups need review')).toBeInTheDocument();
    expect(screen.getByText(/Each failed at least one consistency check/)).toHaveTextContent(/list them for review on the catalogue page/);
    expect(screen.queryByText(/All matched groups passed/)).toBeNull();
  });

  it('has no merge buttons of its own: the wizard footer starts the merge', () => {
    render(<MergePreviewQC previewData={payload([group('g', [entry(A, 0), entry(B, 1)])])} />);
    expect(screen.queryByRole('button', { name: /Proceed with Merge/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Back to Configuration/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Merge/ })).toBeNull();
  });
});
