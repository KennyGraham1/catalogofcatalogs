'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, ClipboardCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { MergeQcSummary } from '@/lib/merge-qc';
import { formatCount, formatOriginTimeUtc } from '@/lib/map-format';
import { MergeQcSummaryView } from './MergeQcSummaryView';
import { countOf, isMergeQcSummary } from './qc-format';

export interface MergeQcCardProps {
  catalogueId: string;
  /** For the download filenames. */
  catalogueName?: string;
  /** Start expanded (collapsed by default, so the events stay near the top of the page). */
  defaultOpen?: boolean;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'absent' }
  | { status: 'ready'; summary: MergeQcSummary }
  | { status: 'error'; message: string };

/** The route returns the summary itself; a wrapped { qc } body is accepted as well. */
function summaryFrom(body: unknown): MergeQcSummary | null {
  if (isMergeQcSummary(body)) return body;
  const wrapped = body && typeof body === 'object' ? (body as { qc?: unknown; summary?: unknown }) : null;
  if (wrapped && isMergeQcSummary(wrapped.qc)) return wrapped.qc;
  if (wrapped && isMergeQcSummary(wrapped.summary)) return wrapped.summary;
  return null;
}

/**
 * "Merge QC summary" on a merged catalogue's page: the QC summary stored with the merge
 * (GET /api/catalogues/[id]/merge-qc), collapsible. A catalogue without one (not merged, or
 * merged before summaries were kept) answers 404, and the card is not shown; so it is when
 * the viewer may not read it (401/403).
 */
export function MergeQcCard({ catalogueId, catalogueName, defaultOpen = false }: MergeQcCardProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [open, setOpen] = useState(defaultOpen);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    (async () => {
      try {
        const response = await fetch(`/api/catalogues/${encodeURIComponent(catalogueId)}/merge-qc`, { signal: controller.signal });
        // No summary (404), or none this viewer may read (401/403): nothing to show.
        if (response.status === 404 || response.status === 401 || response.status === 403) {
          setState({ status: 'absent' });
          return;
        }
        if (!response.ok) throw new Error(`The server answered ${response.status}`);
        const summary = summaryFrom(await response.json());
        if (controller.signal.aborted) return;
        setState(summary ? { status: 'ready', summary } : { status: 'error', message: 'The stored summary could not be read.' });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: error instanceof Error ? error.message : 'The summary could not be loaded.' });
      }
    })();
    return () => controller.abort();
  }, [catalogueId, attempt]);

  const retry = useCallback(() => setAttempt(n => n + 1), []);

  if (state.status === 'loading' || state.status === 'absent') return null;

  if (state.status === 'error') {
    return (
      <Card data-testid="merge-qc-card">
        <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base">Merge QC summary</CardTitle>
            <CardDescription role="alert">The merge QC summary could not be loaded. {state.message}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={retry}>Retry</Button>
        </CardHeader>
      </Card>
    );
  }

  const { summary } = state;
  const { totals } = summary;
  const generated = Date.parse(summary.generatedAt);
  return (
    <Card data-testid="merge-qc-card">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              Merge QC summary
            </CardTitle>
            <CardDescription>
              {countOf(totals.entriesBefore, 'entry', 'entries')} from {countOf(summary.sourceCatalogues.length, 'catalogue', 'catalogues')} merged
              into {countOf(totals.eventsAfter, 'event', 'events')}; {formatCount(totals.matchedGroups)} matched,{' '}
              {formatCount(totals.flaggedGroups)} flagged.
              {Number.isFinite(generated) ? ` Generated ${formatOriginTimeUtc(generated)}.` : ''}
            </CardDescription>
          </div>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0">
              {open ? 'Hide summary' : 'Show summary'}
              {open ? <ChevronUp className="ml-1 h-4 w-4" aria-hidden="true" /> : <ChevronDown className="ml-1 h-4 w-4" aria-hidden="true" />}
            </Button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>
            <MergeQcSummaryView summary={summary} catalogueId={catalogueId} fileBaseName={catalogueName || 'merged_catalogue'} />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
