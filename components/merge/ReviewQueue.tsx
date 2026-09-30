'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
// Origin times are UTC by definition; shown exactly as the merge QC card shows them.
import { formatOriginTime } from '@/components/map/OptimizedEventPopup';

/**
 * One contributing report of a held merged event, as the row's source_events records it
 * (contract M2): the report's stored row plus the flags saying what was published from it.
 * `superseded` marks an older vintage of the same agency's solution: kept for provenance,
 * never publishable.
 */
export interface ReviewReport {
  catalogueId?: string | number | null;
  source?: string | null;
  originalData?: Record<string, unknown> | null;
  selected?: boolean;
  superseded?: boolean;
  magnitudeSelected?: boolean;
  depthSelected?: boolean;
}

/** A queue row as GET /api/catalogues/[id]/review returns it (contract M5). */
export interface ReviewEvent {
  id: string;
  time: string;
  latitude: number;
  longitude: number;
  depth: number | null;
  magnitude: number;
  magnitude_type: string | null;
  review_status: 'pending' | 'resolved' | null;
  review_reasons: string[];
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_choice: string | null;
  merge_strategy: string | null;
  source_events: ReviewReport[];
}

interface ReviewPage {
  events: ReviewEvent[];
  nextCursor: string | null;
  pendingCount: number;
  resolvedCount: number;
}

export type ReviewChoice = 'keep' | { report: number };

export interface ReviewQueueProps {
  catalogueId: string;
  /** Editors and administrators decide; everyone else only sees the queue. */
  canReview: boolean;
  /** Source catalogue names by id, so a report is labelled by catalogue rather than by id. */
  catalogueNames?: Record<string, string>;
}

const PAGE_SIZE = 50;

/**
 * The POST response carries the stored row (source_events as JSON text, review_reasons as
 * an array); the GET route has already parsed both. Bring either form to the queue's shape.
 */
function normalizeEvent(raw: Record<string, unknown>): ReviewEvent {
  let reports: unknown = raw.source_events;
  if (typeof reports === 'string') {
    try {
      reports = JSON.parse(reports);
    } catch {
      reports = [];
    }
  }
  const reasons = Array.isArray(raw.review_reasons)
    ? raw.review_reasons.filter((reason): reason is string => typeof reason === 'string')
    : [];
  return {
    id: String(raw.id),
    time: String(raw.time ?? ''),
    latitude: Number(raw.latitude),
    longitude: Number(raw.longitude),
    depth: typeof raw.depth === 'number' ? raw.depth : null,
    magnitude: Number(raw.magnitude),
    magnitude_type: typeof raw.magnitude_type === 'string' ? raw.magnitude_type : null,
    review_status: raw.review_status === 'pending' || raw.review_status === 'resolved' ? raw.review_status : null,
    review_reasons: reasons,
    reviewed_by: typeof raw.reviewed_by === 'string' ? raw.reviewed_by : null,
    reviewed_at: typeof raw.reviewed_at === 'string' ? raw.reviewed_at : null,
    review_choice: typeof raw.review_choice === 'string' ? raw.review_choice : null,
    merge_strategy: typeof raw.merge_strategy === 'string' ? raw.merge_strategy : null,
    source_events: Array.isArray(reports) ? (reports as ReviewReport[]) : [],
  };
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === 'string') return body.error;
  } catch { /* not JSON */ }
  return fallback;
}

async function fetchReviewPage(
  catalogueId: string,
  status: 'pending' | 'resolved',
  after: string | null
): Promise<ReviewPage> {
  const query = new URLSearchParams({ status, limit: String(PAGE_SIZE) });
  if (after) query.set('after', after);
  const response = await fetch(`/api/catalogues/${encodeURIComponent(catalogueId)}/review?${query.toString()}`);
  if (!response.ok) throw new Error(await readError(response, 'Failed to load the review queue'));
  const page = await response.json();
  return {
    events: Array.isArray(page.events) ? page.events.map(normalizeEvent) : [],
    nextCursor: typeof page.nextCursor === 'string' ? page.nextCursor : null,
    pendingCount: Number(page.pendingCount) || 0,
    resolvedCount: Number(page.resolvedCount) || 0,
  };
}

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;
const fixed = (value: unknown, digits: number, suffix = ''): string => {
  const n = num(value);
  return n === null ? '—' : `${n.toFixed(digits)}${suffix}`;
};

/** The report index a stored `report:<i>` choice names; null for 'keep' or an unresolved row. */
function chosenReportIndex(choice: string | null): number | null {
  const match = choice ? /^report:(\d+)$/.exec(choice) : null;
  return match ? Number(match[1]) : null;
}

function reportLabel(report: ReviewReport, names?: Record<string, string>): string {
  const id = report.catalogueId != null ? String(report.catalogueId) : null;
  return (id && names?.[id]) || text(report.source) || (id ? `Catalogue ${id}` : 'Unknown catalogue');
}

interface ReviewEventCardProps {
  event: ReviewEvent;
  canReview: boolean;
  busy: boolean;
  catalogueNames?: Record<string, string>;
  onResolve: (event: ReviewEvent, choice: ReviewChoice) => void;
}

function ReviewEventCard({ event, canReview, busy, catalogueNames, onResolve }: ReviewEventCardProps) {
  const pending = event.review_status === 'pending';
  const decidable = canReview && pending;
  const chosen = chosenReportIndex(event.review_choice);
  const chosenReport = chosen !== null ? event.source_events[chosen] : undefined;

  return (
    <Card data-testid={`review-event-${event.id}`} className={pending ? 'border-orange-300 dark:border-orange-900/60' : ''}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-base font-medium flex flex-wrap items-center gap-2">
              <span>M{event.magnitude.toFixed(1)}{event.magnitude_type ? ` ${event.magnitude_type}` : ''}</span>
              <span className="font-normal text-muted-foreground">{formatOriginTime(event.time)}</span>
              {pending ? (
                <Badge variant="outline" className="border-orange-500 text-orange-700">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Pending
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Resolved
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {event.latitude.toFixed(4)}, {event.longitude.toFixed(4)} · depth {fixed(event.depth, 1, ' km')}
              {event.merge_strategy ? ` · ${event.merge_strategy} strategy` : ''}
            </CardDescription>
          </div>
          {decidable && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onResolve(event, 'keep')}
              title="Publish the solution the merge strategy produced for this group"
            >
              Keep provisional solution
            </Button>
          )}
        </div>

        {event.review_reasons.length > 0 && (
          <Alert className="mt-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{pending ? 'Held for review because' : 'Was held for review because'}</AlertTitle>
            <AlertDescription>
              <ul className="list-disc list-inside space-y-0.5">
                {event.review_reasons.map((reason, index) => (
                  <li key={index}>{reason}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {!pending && (
          <p className="mt-2 text-sm text-muted-foreground" data-testid="review-decision">
            {event.review_choice === 'keep'
              ? 'Decision: kept the provisional solution'
              : chosenReport
                ? `Decision: published the ${reportLabel(chosenReport, catalogueNames)} report`
                : `Decision: ${event.review_choice ?? 'unknown'}`}
            {event.reviewed_at ? ` · ${formatOriginTime(event.reviewed_at)}` : ''}
            {event.reviewed_by ? ` · by ${event.reviewed_by}` : ''}
          </p>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>Catalogue / source</TableHead>
              <TableHead>Time</TableHead>
              <TableHead className="text-right">Lat</TableHead>
              <TableHead className="text-right">Lon</TableHead>
              <TableHead className="text-right">Depth (km)</TableHead>
              <TableHead className="text-right">Magnitude</TableHead>
              <TableHead className="text-right">Stations</TableHead>
              <TableHead className="text-right">Gap</TableHead>
              <TableHead>Status</TableHead>
              {decidable && <TableHead className="text-right">Action</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {event.source_events.map((report, index) => {
              const data = report.originalData ?? {};
              const superseded = report.superseded === true;
              const published = chosen === index;
              const magnitudeType = text(data.magnitude_type);
              return (
                <TableRow
                  key={index}
                  data-testid={`review-report-${event.id}-${index}`}
                  aria-disabled={superseded || undefined}
                  className={superseded
                    ? 'opacity-50 text-muted-foreground'
                    : report.selected ? 'bg-green-50 dark:bg-green-950/40 font-medium' : ''}
                >
                  <TableCell>
                    <div>{reportLabel(report, catalogueNames)}</div>
                    {text(report.source) && <div className="text-muted-foreground font-normal">{report.source}</div>}
                  </TableCell>
                  <TableCell>{text(data.time) ? formatOriginTime(String(data.time)) : '—'}</TableCell>
                  <TableCell className="text-right">{fixed(data.latitude, 4)}</TableCell>
                  <TableCell className="text-right">{fixed(data.longitude, 4)}</TableCell>
                  <TableCell className="text-right">{fixed(data.depth, 1)}</TableCell>
                  <TableCell className="text-right">
                    {fixed(data.magnitude, 2)}
                    {magnitudeType && <span className="text-muted-foreground"> {magnitudeType}</span>}
                  </TableCell>
                  <TableCell className="text-right">{num(data.used_station_count) ?? '—'}</TableCell>
                  <TableCell className="text-right">{fixed(data.azimuthal_gap, 0, '°')}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {superseded && <Badge variant="outline">Superseded</Badge>}
                      {report.selected && (
                        <Badge variant="outline" title={pending
                          ? 'The report whose solution the merge strategy published provisionally'
                          : 'The report whose solution is published'}>
                          {pending ? 'Provisional' : 'Selected'}
                        </Badge>
                      )}
                      {published && <Badge>Published</Badge>}
                    </div>
                  </TableCell>
                  {decidable && (
                    <TableCell className="text-right">
                      {!superseded && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => onResolve(event, { report: index })}
                          title="Publish this report's solution and metadata for the merged event"
                        >
                          Publish this report
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/**
 * The merge review queue of one merged catalogue (contract M5): the rows a merge with
 * `onConflict: 'hold'` left provisional, each with the group's warnings and its reports, and
 * the decisions already taken. Decisions are posted one at a time and the lists are updated
 * from the response, so the count in the heading never needs a reload.
 */
export function ReviewQueue({ catalogueId, canReview, catalogueNames }: ReviewQueueProps) {
  const [pending, setPending] = useState<ReviewEvent[]>([]);
  const [pendingCursor, setPendingCursor] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null until the reviewer opens the list: resolved rows are fetched on demand.
  const [resolved, setResolved] = useState<ReviewEvent[] | null>(null);
  const [resolvedCursor, setResolvedCursor] = useState<string | null>(null);
  const [resolvedOpen, setResolvedOpen] = useState(false);
  const [resolvedLoading, setResolvedLoading] = useState(false);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPending([]);
    setResolved(null);
    setResolvedOpen(false);
    fetchReviewPage(catalogueId, 'pending', null)
      .then(page => {
        if (cancelled) return;
        setPending(page.events);
        setPendingCursor(page.nextCursor);
        setPendingCount(page.pendingCount);
        setResolvedCount(page.resolvedCount);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the review queue');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [catalogueId]);

  const loadMorePending = useCallback(async () => {
    if (!pendingCursor) return;
    setLoadingMore(true);
    try {
      const page = await fetchReviewPage(catalogueId, 'pending', pendingCursor);
      setPending(current => current.concat(page.events.filter(event => !current.some(e => e.id === event.id))));
      setPendingCursor(page.nextCursor);
      setPendingCount(page.pendingCount);
      setResolvedCount(page.resolvedCount);
    } catch (err) {
      toast({
        title: 'Could not load more events',
        description: err instanceof Error ? err.message : 'Failed to load the review queue',
        variant: 'destructive',
      });
    } finally {
      setLoadingMore(false);
    }
  }, [catalogueId, pendingCursor]);

  const loadResolved = useCallback(async (after: string | null) => {
    setResolvedLoading(true);
    try {
      const page = await fetchReviewPage(catalogueId, 'resolved', after);
      setResolved(current => {
        const base = after && current ? current : [];
        return base.concat(page.events.filter(event => !base.some(e => e.id === event.id)));
      });
      setResolvedCursor(page.nextCursor);
      setResolvedCount(page.resolvedCount);
      setPendingCount(page.pendingCount);
    } catch (err) {
      toast({
        title: 'Could not load resolved events',
        description: err instanceof Error ? err.message : 'Failed to load the review queue',
        variant: 'destructive',
      });
    } finally {
      setResolvedLoading(false);
    }
  }, [catalogueId]);

  const toggleResolved = useCallback(() => {
    const open = !resolvedOpen;
    setResolvedOpen(open);
    if (open && resolved === null) void loadResolved(null);
  }, [resolvedOpen, resolved, loadResolved]);

  const resolve = useCallback(async (event: ReviewEvent, choice: ReviewChoice) => {
    setBusyEventId(event.id);
    try {
      const response = await fetch(
        `/api/catalogues/${encodeURIComponent(catalogueId)}/review/${encodeURIComponent(event.id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ choice }),
        }
      );
      if (!response.ok) throw new Error(await readError(response, 'Failed to record the decision'));
      const body = await response.json();
      const updated = body && body.event && typeof body.event === 'object'
        ? normalizeEvent(body.event as Record<string, unknown>)
        : { ...event, review_status: 'resolved' as const, review_choice: choice === 'keep' ? 'keep' : `report:${choice.report}` };
      setPending(current => current.filter(e => e.id !== event.id));
      setPendingCount(typeof body?.pendingCount === 'number' ? body.pendingCount : count => Math.max(0, (count ?? 1) - 1));
      setResolvedCount(count => count + 1);
      // Only a list already fetched is updated in place; an unopened one loads fresh later.
      setResolved(current => current === null ? null : [updated, ...current.filter(e => e.id !== updated.id)]);
      toast({
        title: 'Review recorded',
        description: choice === 'keep'
          ? 'The provisional solution is now published.'
          : `Report ${choice.report + 1} is now the published solution.`,
      });
    } catch (err) {
      toast({
        title: 'Review failed',
        description: err instanceof Error ? err.message : 'Failed to record the decision',
        variant: 'destructive',
      });
    } finally {
      setBusyEventId(null);
    }
  }, [catalogueId]);

  const heading = pendingCount === null ? 'Needs review' : `Needs review (${pendingCount})`;

  return (
    <Card data-testid="review-queue">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-600" />
          {heading}
        </CardTitle>
        <CardDescription>
          Merged events whose group was flagged during the merge and held instead of published.
          {canReview
            ? ' Publish one report wholesale, or keep the solution the strategy produced.'
            : ' Editors decide which solution is published.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <p className="text-sm text-muted-foreground flex items-center gap-2" role="status">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading review queue…
          </p>
        )}
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Could not load the review queue</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!loading && !error && pending.length === 0 && (
          <p className="text-sm text-muted-foreground">No events are waiting for review.</p>
        )}
        {pending.map(event => (
          <ReviewEventCard
            key={event.id}
            event={event}
            canReview={canReview}
            busy={busyEventId === event.id}
            catalogueNames={catalogueNames}
            onResolve={resolve}
          />
        ))}
        {pendingCursor && (
          <Button variant="outline" size="sm" disabled={loadingMore} onClick={() => void loadMorePending()}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        )}

        <div className="border-t pt-3">
          <Button variant="ghost" size="sm" onClick={toggleResolved} aria-expanded={resolvedOpen} className="gap-1">
            {resolvedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Resolved ({resolvedCount})
          </Button>
          {resolvedOpen && (
            <div className="mt-3 space-y-3">
              {resolvedLoading && resolved === null && (
                <p className="text-sm text-muted-foreground" role="status">Loading resolved events…</p>
              )}
              {resolved !== null && resolved.length === 0 && !resolvedLoading && (
                <p className="text-sm text-muted-foreground">No events have been resolved yet.</p>
              )}
              {(resolved ?? []).map(event => (
                <ReviewEventCard
                  key={event.id}
                  event={event}
                  canReview={canReview}
                  busy={false}
                  catalogueNames={catalogueNames}
                  onResolve={resolve}
                />
              ))}
              {resolvedCursor && (
                <Button variant="outline" size="sm" disabled={resolvedLoading} onClick={() => void loadResolved(resolvedCursor)}>
                  {resolvedLoading ? 'Loading…' : 'Load more resolved'}
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
