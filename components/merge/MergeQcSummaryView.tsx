'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { Download, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DifferenceStats, MergeQcSummary, QcPairComparison, SeparationStats } from '@/lib/merge-qc';
import { formatDateForFilename, sanitizeFilename } from '@/lib/export-utils';
import { formatCount, formatMagnitudeType, formatOriginTimeUtc } from '@/lib/map-format';
import {
  countOf, describeQcConfig, formatPercent, formatSigned, listedGroupsCsv, magnitudeOffsetNotes, plural,
  windowUseNotes,
} from './qc-format';

// ── Totals tiles ───────────────────────────────────────────────────────────────────────

/** The headline counts of a merge; the preview's statistics map onto the same tiles. */
export interface QcTotals {
  entriesBefore: number;
  eventsAfter: number;
  matchedGroups: number;
  entriesCombined: number;
  flaggedGroups: number;
  heldForReview?: number;
}

const TILE_BASE = 'flex flex-col-reverse justify-end rounded-lg border p-3 text-center sm:p-4';
const TILE_NEUTRAL = `${TILE_BASE} bg-muted/30`;
// Colour marks a flag that needs attention (a non-zero flagged or held count), nothing else.
const TILE_FLAG = `${TILE_BASE} border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100`;

interface Tile {
  label: string;
  value: number;
  help: string;
  flag?: boolean;
}

export function QcTotalsTiles({ totals, showHeld }: { totals: QcTotals; showHeld: boolean }) {
  const tiles: Tile[] = [
    { label: 'Entries before', value: totals.entriesBefore, help: 'Entries in the source catalogues' },
    { label: 'Events after', value: totals.eventsAfter, help: 'Events in the merged catalogue' },
    { label: 'Matched groups', value: totals.matchedGroups, help: 'Events with two or more matched entries' },
    {
      label: 'Entries combined',
      value: totals.entriesCombined,
      help: 'Entries combined into another event and kept with it as provenance: entries before minus events after',
    },
    { label: 'Flagged groups', value: totals.flaggedGroups, help: 'Matched groups that failed at least one consistency check', flag: true },
  ];
  // Only meaningful when the merge holds flagged groups: otherwise 0 by construction.
  if (showHeld) {
    tiles.push({
      label: 'Held for review',
      value: totals.heldForReview ?? 0,
      help: 'Flagged groups written with a provisional solution and listed for review on the catalogue page',
      flag: true,
    });
  }
  return (
    <dl className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${showHeld ? 'lg:grid-cols-6' : 'lg:grid-cols-5'}`}>
      {tiles.map(tile => {
        const flagged = tile.flag && tile.value > 0;
        return (
          <div key={tile.label} className={flagged ? TILE_FLAG : TILE_NEUTRAL} title={tile.help} data-tile={tile.label}>
            <dt className={`mt-1 text-xs ${flagged ? '' : 'text-muted-foreground'}`}>{tile.label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{formatCount(tile.value)}</dd>
          </div>
        );
      })}
    </dl>
  );
}

// ── Tables ─────────────────────────────────────────────────────────────────────────────

const HEAD = 'px-2 py-2 text-left align-bottom text-xs font-medium text-muted-foreground';
const HEAD_NUM = `${HEAD} text-right`;
const ROW_HEAD = 'px-2 py-2 text-left align-top font-medium';
const CELL_NUM = 'px-2 py-2 text-right align-top tabular-nums whitespace-nowrap';

function differenceCells(stats: DifferenceStats | null, digits: number): [string, string, string] {
  if (!stats || !stats.n) return ['0', '–', '–'];
  return [
    formatCount(stats.n),
    `${formatSigned(stats.median, digits)} ± ${stats.robustSigma.toFixed(digits)}`,
    `${formatSigned(stats.p05, digits)} to ${formatSigned(stats.p95, digits)}`,
  ];
}

function separationCells(stats: SeparationStats | null, digits: number): [string, string, string] {
  if (!stats || !stats.n) return ['0', '–', '–'];
  return [
    formatCount(stats.n),
    stats.median.toFixed(digits),
    `95 % within ${stats.p95.toFixed(digits)}; max ${stats.max.toFixed(digits)}`,
  ];
}

function PairTable({ pair }: { pair: QcPairComparison }) {
  const nameA = pair.catalogueA.name;
  const nameB = pair.catalogueB.name;
  const rows: Array<{ label: string; cells: [string, string, string]; nested?: boolean }> = [
    { label: 'Origin time (s)', cells: differenceCells(pair.originTime, 2) },
    { label: 'Epicentral separation (km)', cells: separationCells(pair.epicentre, 1) },
    { label: 'Depth (km), computed depths only', cells: differenceCells(pair.depth, 1) },
    { label: 'Magnitude, all types', cells: differenceCells(pair.magnitude, 2) },
    ...(pair.magnitudeByType ?? []).map(item => ({
      label: `Magnitude, ${formatMagnitudeType(item.typeB) || 'unknown type'} − ${formatMagnitudeType(item.typeA) || 'unknown type'}`,
      cells: differenceCells(item.stats, 2),
      nested: true,
    })),
  ];
  return (
    <div className="space-y-1" data-pair={`${pair.catalogueA.id}|${pair.catalogueB.id}`}>
      <p className="text-sm font-medium">
        <span className="break-words">{nameB}</span> − <span className="break-words">{nameA}</span>
        <span className="font-normal text-muted-foreground"> · {countOf(pair.pairs, 'matched pair', 'matched pairs')}</span>
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{`${nameB} minus ${nameA}: differences between matched solutions`}</caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className={HEAD}>Difference ({nameB} − {nameA})</th>
              <th scope="col" className={HEAD_NUM}>n</th>
              <th scope="col" className={HEAD_NUM}>Median ± robust σ</th>
              <th scope="col" className={HEAD_NUM}>5–95 % range</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.label} className="border-b last:border-0">
                <th scope="row" className={`${ROW_HEAD} ${row.nested ? 'pl-5 font-normal text-muted-foreground' : ''}`}>{row.label}</th>
                <td className={CELL_NUM}>{row.cells[0]}</td>
                <td className={CELL_NUM}>{row.cells[1]}</td>
                <td className={CELL_NUM}>{row.cells[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Downloads ──────────────────────────────────────────────────────────────────────────

function saveBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch { /* fall through to the plain filename */ }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : null;
}

// ── The summary ────────────────────────────────────────────────────────────────────────

export interface MergeQcSummaryViewProps {
  summary: MergeQcSummary;
  /** A saved merged catalogue: the CSV is then served by its merge-qc route. */
  catalogueId?: string | null;
  /** Used in the download filenames (the catalogue's name, or "merge preview"). */
  fileBaseName?: string;
  /** Show the Held for review tile; by default when the merge held, or would hold, groups. */
  showHeldTile?: boolean;
  /** Rendered under the totals (the preview's flagged-groups alert). */
  afterTotals?: ReactNode;
}

/**
 * The merge quality-control summary, read-only: totals; per-catalogue matching; the
 * differences between matched solutions per catalogue pair (robust statistics, second
 * catalogue minus first), overall and by magnitude-type pair; likely systematic magnitude
 * offsets; how close pairs came to the matching windows; and downloads. Used in the QC
 * preview, after a merge, and on a merged catalogue's page.
 */
export function MergeQcSummaryView({ summary, catalogueId, fileBaseName = 'merge', showHeldTile, afterTotals }: MergeQcSummaryViewProps) {
  const id = useId();
  const [csvBusy, setCsvBusy] = useState(false);
  const { totals } = summary;
  const showHeld = showHeldTile ?? ((totals.heldForReview ?? 0) > 0 || summary.config?.onConflict === 'hold');
  const offsetNotes = useMemo(() => magnitudeOffsetNotes(summary), [summary]);
  const windowNotes = useMemo(() => windowUseNotes(summary.windowUse), [summary]);
  const settings = describeQcConfig(summary.config);
  const listed = summary.listedGroups.length;
  const listedTotal = Math.max(summary.listedGroupsTotal ?? listed, listed);

  const generated = Date.parse(summary.generatedAt);
  const stamp = formatDateForFilename(Number.isFinite(generated) ? new Date(generated) : new Date());
  const base = sanitizeFilename(fileBaseName);
  const csvName = `${base}_merge_qc_groups_${stamp}.csv`;

  const downloadJson = () => {
    saveBlob(new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' }), `${base}_merge_qc_${stamp}.json`);
  };

  const downloadCsv = async () => {
    setCsvBusy(true);
    try {
      if (catalogueId) {
        try {
          const response = await fetch(`/api/catalogues/${encodeURIComponent(catalogueId)}/merge-qc?format=csv`);
          if (response.ok) {
            saveBlob(await response.blob(), filenameFromDisposition(response.headers.get('Content-Disposition')) ?? csvName);
            return;
          }
        } catch { /* the route is unreachable: build the same file from the summary held here */ }
      }
      saveBlob(new Blob([listedGroupsCsv(summary.listedGroups)], { type: 'text/csv;charset=utf-8' }), csvName);
    } finally {
      setCsvBusy(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="merge-qc-summary">
      <div className="space-y-3">
        <QcTotalsTiles
          showHeld={showHeld}
          totals={{
            entriesBefore: totals.entriesBefore,
            eventsAfter: totals.eventsAfter,
            matchedGroups: totals.matchedGroups,
            entriesCombined: totals.entriesCombined,
            flaggedGroups: totals.flaggedGroups,
            heldForReview: totals.heldForReview,
          }}
        />
        {(totals.keptApartEntries > 0 || totals.supersededEntries > 0) && (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {totals.keptApartEntries > 0 && (
              <li>
                {countOf(totals.keptApartEntries, 'entry was', 'entries were')} matched but kept apart
                {totals.splits > 0 ? ` (${countOf(totals.splits, 'failed group', 'failed groups')})` : ''}:
                {' '}{totals.splits === 1 ? 'the group' : 'each group'} failed the consistency checks and was published as separate events.
              </li>
            )}
            {totals.supersededEntries > 0 && (
              <li>
                {countOf(totals.supersededEntries, 'superseded entry', 'superseded entries')} (older vintages of one agency&apos;s solution, kept as provenance).
              </li>
            )}
          </ul>
        )}
        {afterTotals}
      </div>

      <section aria-labelledby={`${id}-catalogues`} className="space-y-2">
        <h4 id={`${id}-catalogues`} className="text-sm font-semibold">Per catalogue</h4>
        {summary.perCatalogue.length === 0 ? (
          <p className="text-sm text-muted-foreground">No source catalogue statistics were recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Matching per source catalogue</caption>
              <thead>
                <tr className="border-b">
                  <th scope="col" className={HEAD}>Catalogue</th>
                  <th scope="col" className={HEAD_NUM}>Entries</th>
                  <th scope="col" className={HEAD_NUM}>Matched</th>
                  <th scope="col" className={HEAD_NUM}>Only in this catalogue</th>
                  <th scope="col" className={HEAD_NUM}>Published from it</th>
                  <th scope="col" className={HEAD_NUM}>Superseded</th>
                </tr>
              </thead>
              <tbody>
                {summary.perCatalogue.map(catalogue => (
                  <tr key={catalogue.id} className="border-b last:border-0">
                    <th scope="row" className={`${ROW_HEAD} min-w-[10rem] break-words`}>{catalogue.name}</th>
                    <td className={CELL_NUM}>{formatCount(catalogue.entries)}</td>
                    <td className={CELL_NUM}>
                      {formatCount(catalogue.matched)}
                      <span className="text-muted-foreground"> ({formatPercent(catalogue.matched, catalogue.entries)})</span>
                    </td>
                    <td className={CELL_NUM}>{formatCount(catalogue.unique)}</td>
                    <td className={CELL_NUM}>{formatCount(catalogue.published)}</td>
                    <td className={CELL_NUM}>{formatCount(catalogue.superseded)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Matched: entries combined with an entry of another catalogue. Only in this catalogue: entries published on their own,
          kept-apart entries included. Published from it: matched groups whose published solution is this catalogue&apos;s entry.
          Superseded: older vintages of one agency&apos;s solution.
        </p>
      </section>

      <section aria-labelledby={`${id}-pairs`} className="space-y-3">
        <div className="space-y-1">
          <h4 id={`${id}-pairs`} className="text-sm font-semibold">Differences between matched solutions</h4>
          <p className="text-xs text-muted-foreground">
            Second catalogue minus first, in source order, over matched pairs (superseded entries excluded). Robust statistics:
            the median, σ = 1.4826 × median absolute deviation, and the 5th to 95th percentiles.
          </p>
        </div>
        {summary.pairwise.length === 0
          ? <p className="text-sm text-muted-foreground">No catalogue pair had matched solutions.</p>
          : summary.pairwise.map(pair => <PairTable key={`${pair.catalogueA.id}|${pair.catalogueB.id}`} pair={pair} />)}
      </section>

      {(offsetNotes.length > 0 || windowNotes.length > 0) && (
        <section aria-labelledby={`${id}-notes`} className="space-y-3">
          <h4 id={`${id}-notes`} className="text-sm font-semibold">Interpretation</h4>
          {offsetNotes.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm" data-testid="magnitude-offset-notes">
              <p className="flex items-center gap-2 font-medium">
                <Info className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                Likely systematic magnitude {plural(offsetNotes.length, 'offset', 'offsets')}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-6">
                {offsetNotes.map(note => <li key={note}>{note}</li>)}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                A median difference of 0.1 magnitude units or more over at least 30 pairs usually reflects a calibration or
                scale difference between the agencies rather than random scatter.
              </p>
            </div>
          )}
          {windowNotes.length > 0 && (
            <ul className="space-y-1 text-sm" data-testid="window-use-notes">
              {windowNotes.map(note => <li key={note}>{note}</li>)}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby={`${id}-downloads`} className="space-y-2">
        <h4 id={`${id}-downloads`} className="text-sm font-semibold">Downloads</h4>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={downloadJson}>
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Summary (JSON)
          </Button>
          <Button variant="outline" size="sm" onClick={downloadCsv} disabled={csvBusy || listedTotal === 0}>
            {csvBusy
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              : <Download className="mr-2 h-4 w-4" aria-hidden="true" />}
            Flagged, kept-apart and held groups (CSV)
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {listedTotal === 0
            ? 'No group was flagged, kept apart or held, so there is no group list to download.'
            : listed < listedTotal
              ? `The CSV lists the ${formatCount(listed)} most severe of ${countOf(listedTotal, 'group', 'groups')}, one row per entry.`
              : `The CSV lists ${countOf(listedTotal, 'group', 'groups')}, one row per entry.`}
        </p>
      </section>

      <p className="text-xs text-muted-foreground">
        {Number.isFinite(generated) ? `Generated ${formatOriginTimeUtc(generated)}` : 'Generated'}
        {summary.generatedBy ? ` by ${summary.generatedBy}` : ''}.
        {settings ? ` ${settings}.` : ''}
      </p>
    </div>
  );
}
