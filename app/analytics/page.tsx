'use client';

import { useState, useEffect, useMemo, useCallback, useContext, useDeferredValue, useId, useTransition, memo, type ReactNode } from 'react';
import Link from 'next/link';
import { SessionContext } from 'next-auth/react';
import { useCatalogueEvents } from '@/hooks/use-catalogue-events';
import { useEventDetails } from '@/hooks/use-event-details';
import { CatalogueEventCache, EVENTS_SIGN_IN_MESSAGE, type CatalogueEvent as AnalyticsEvent } from '@/lib/catalogue-event-loader';
import { useLoginHref } from '@/lib/auth/login-href';
import { formatOriginTimeUtc } from '@/lib/map-format';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { NumericRangeInputs } from '@/components/ui/numeric-range-inputs';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart3,
  Target,
  Radio,
  Award,
  TrendingUp,
  List,
  Activity,
  Clock,
  Zap,
  MapPin,
  Calendar,
  Filter,
  RefreshCw,
  Loader2,
  Info,
  Download,
  Image as ImageIcon,
  FileJson,
  ChevronsUpDown,
  Check,
  AlertTriangle,
  LogIn,
} from 'lucide-react';
import { QualityScoreCard } from '@/components/advanced-viz/QualityScoreCard';
import { UncertaintyVisualization } from '@/components/advanced-viz/UncertaintyVisualization';
import { FocalMechanismCard } from '@/components/advanced-viz/FocalMechanismCard';
import { StationCoverageCard } from '@/components/advanced-viz/StationCoverageCard';
import { calculateQualityScore, metricsFromEvent, scoreToGrade } from '@/lib/quality-scoring';
import { resolveEventQuality, type ResolvedQuality } from '@/components/events/event-quality';
import { parseFocalMechanism } from '@/lib/focal-mechanism-utils';
import { parseStationData } from '@/lib/station-coverage-utils';
import { EventTable } from '@/components/events/EventTable';
import { InfoTooltip, TechnicalTermTooltip } from '@/components/ui/info-tooltip';
import {
  type EarthquakeEvent,
  calculateMFDComparison,
  type MFDComparisonResult,
  summariseMagnitudeTypes,
  type MagnitudeTypeSummary,
  type McMethod,
  type RateIntervalOption,
  type RateInterval,
  type SeismicityTimeSeriesResult,
  DEFAULT_MAXC_CORRECTION,
  magnitudeAtOrAbove,
  magnitudeAtOrBelow,
} from '@/lib/seismological-analysis';
import { type MergedCatalogue } from '@/lib/db';
import { useCatalogues } from '@/contexts/CatalogueContext';
import { formatLastSuccess } from '@/contexts/catalogue-load-status';
import { useSeismologicalAnalyses } from '@/hooks/use-seismological-worker';
import {
  MagnitudeDistributionChart,
  DepthDistributionChart,
  RegionDistributionChart,
  CatalogueDistributionChart,
  MagnitudeDepthScatter,
  MagnitudeTimeScatter,
  EventTimelineChart,
  GutenbergRichterChart,
  CompletenessChart,
  TemporalSeriesChart,
  MomentReleaseChart,
  CumulativeReleaseChart,
  GoodnessOfFitChart,
  BValueStabilityChart,
  MFDComparisonChart,
} from '@/components/charts';
import { aggregateEventTimeline } from '@/lib/event-timeline';
import {
  MFD_CATALOGUE_COLORS,
} from '@/lib/chart-config';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

/**
 * Origin times are UTC by definition (QuakeML 1.2 / ISO 8601 "Z"), so they are rendered
 * in UTC with the zone shown - formatting them in the browser's zone puts an event on the
 * wrong calendar day for 13 of every 24 hours under NZDT (UTC+13).
 *
 * Hoisted to module scope on purpose: these render once per event over lists of thousands of
 * events, and constructing an Intl.DateTimeFormat per row costs ~82 ms per 1000 rows.
 */
/** An origin time in UTC as ISO 8601 ("2016-11-13 11:02:56 UTC"); unparseable values verbatim. */
function formatOriginTime(time: string): string {
  return formatOriginTimeUtc(time);
}

/** Filter label for a slider range; a handle left at its end applies no bound. */
function describeRange(range: number[], ends: [number, number], format: (value: number) => string, unit: string): string {
  const lower = range[0] > ends[0];
  const upper = range[1] < ends[1];
  if (lower && upper) return `${format(range[0])} to ${format(range[1])}${unit}`;
  if (lower) return `≥ ${format(range[0])}${unit}`;
  if (upper) return `≤ ${format(range[1])}${unit}`;
  return 'all';
}

/**
 * States the Utsu binning correction the b-value used. It follows the step the
 * magnitudes were reported at (0 for continuous magnitudes), so the reader can see
 * which case applied rather than assume the textbook dM/2 = 0.05.
 */
function describeBinningCorrection(resolution: number, correction: number): string {
  if (resolution === 0 && Math.abs(correction) < 0.0005) {
    return 'none (magnitudes are reported at full precision)';
  }
  if (resolution > 0 && Math.abs(correction - resolution / 2) < 0.0005) {
    return `ΔM/2 = ${correction.toFixed(3)} (magnitudes reported to ${resolution})`;
  }
  return `${correction.toFixed(3)} (magnitudes reported at mixed resolutions, or a cut-off between reported values)`;
}

/**
 * Map tab height: at least 640 px on desktop, otherwise the viewport under the fixed header
 * and the tab bar (capped at 920 px); the filter sidebar takes the same height so the two
 * cards line up. Smaller fixed heights on phones and tablets keep the page scrollable.
 */
const MAP_TAB_DESKTOP_HEIGHT = 'lg:h-[clamp(640px,calc(100vh_-_12rem),920px)]';
const MAP_TAB_MAP_HEIGHT = `h-[480px] sm:h-[560px] ${MAP_TAB_DESKTOP_HEIGHT}`;

// Dynamically import unified map component to avoid SSR issues
const UnifiedEarthquakeMap = dynamic(() => import('@/components/visualize/UnifiedEarthquakeMap'), {
  ssr: false,
  loading: () => <div className={`${MAP_TAB_MAP_HEIGHT} w-full bg-muted animate-pulse flex items-center justify-center text-muted-foreground`}>Loading map...</div>
});

// Performance constants
const MAX_TIMELINE_POINTS = 365; // Max days for timeline chart

const FILTER_DEBOUNCE_MS = 150; // Debounce delay for filter changes

// Filter slider ends span everything the validator accepts (lib/validation.ts:
// magnitude -3 to 10, depth -5 to 1000 km), and a handle left at its end applies no
// bound, so the default position excludes nothing. The old defaults (M >= -2 and a
// 0-700 km depth range that also required a depth) silently removed unknown depths,
// above-sea-level volcanic events, events deeper than 700 km and M < -2 from every
// analysis, although b, Mc, rates and moment do not depend on depth at all.
const MAGNITUDE_SLIDER: [number, number] = [-3, 10];
const DEPTH_SLIDER: [number, number] = [-5, 700];

// Magnitude bin width the analysis workers use (their default); one bin width is
// a lower bound on the uncertainty of an estimated Mc (Woessner & Wiemer, 2005).
const ANALYSIS_BIN_WIDTH = 0.1;

// Quality (Q, 0-100) and azimuthal-gap filter sliders. As above, a handle left at its
// end applies no bound: Q >= 0 and a gap up to 360 degrees admit every event.
const QUALITY_SLIDER: [number, number] = [0, 100];
const GAP_SLIDER: [number, number] = [0, 360];

// MAXC corrections the Mc settings offer, within lib MAXC_CORRECTION_RANGE (0-0.5).
const MAXC_CORRECTION_CHOICES = [0, 0.1, 0.2, 0.3, 0.4, 0.5];

const DAY_MS = 86_400_000;

/**
 * Agency event types that say a record is not a real, located earthquake (SeisComP,
 * which GeoNet runs): a second record of an event catalogued under another id, an
 * analyst-rejected false event, and an event that could not be located. They are kept
 * verbatim in source_event_type (contract C8); QuakeML 1.2 has only "not existing" of
 * the three, so a normalised event_type of that value flags a record too. Counted in
 * rates, b-values and declustering they are phantom or double-counted earthquakes, so
 * the page leaves them out unless the user includes them.
 */
const AGENCY_FLAGGED_TYPES = new Set(['duplicate', 'not existing', 'not locatable']);

function isAgencyFlagged(event: { source_event_type?: string | null; event_type?: string | null }): boolean {
  const raw = typeof event.source_event_type === 'string' ? event.source_event_type.trim().toLowerCase() : '';
  if (AGENCY_FLAGGED_TYPES.has(raw)) return true;
  return typeof event.event_type === 'string' && event.event_type.trim().toLowerCase() === 'not existing';
}

/** Magnitude type as summariseMagnitudeTypes keys it: trimmed, '' when none is stated. */
function magnitudeTypeKey(event: { magnitude_type?: string | null }): string {
  return (event.magnitude_type ?? '').trim();
}

/** How an Mc was obtained, for labels ("maximum curvature + 0.2", ...). */
interface McProvenance {
  method?: string;
  mcSource?: string;
  requestedMethod?: McMethod;
  requestedMcMethod?: McMethod;
  maxcCorrection?: number;
  gftLevel?: 95 | 90 | null;
  fallbackReason?: string;
}

/** Names of the Mc methods, as the Mc settings offer them and as prose. */
const MC_METHOD_LABELS: Record<McMethod, string> = {
  MBS: 'b-value stability (MBS)',
  GFT: 'Goodness of fit (GFT)',
  MAXC: 'Maximum curvature (MAXC)',
};
const MC_METHOD_NAMES: Record<McMethod, string> = {
  MBS: 'b-value stability',
  GFT: 'Goodness-of-fit test',
  MAXC: 'Maximum curvature',
};

/** A short statement of how Mc was estimated, for the G-R, Mc and Temporal tabs. */
function describeMcEstimate(result: McProvenance): string {
  const method = result.mcSource ?? result.method;
  const requested = result.requestedMcMethod ?? result.requestedMethod;
  const correction = Number((result.maxcCorrection ?? DEFAULT_MAXC_CORRECTION).toFixed(2));
  if (method === 'MBS') return 'b-value stability';
  if (method === 'GFT') {
    const gft = `the goodness-of-fit test at the ${result.gftLevel ?? 95}% level`;
    return requested === 'MBS' ? `${gft} (b-value stability found no stable cut-off)` : gft;
  }
  const maxc = `maximum curvature + ${correction}`;
  if (requested === 'MBS') return `${maxc} (neither b-value stability nor the goodness-of-fit test found an Mc)`;
  return requested === 'GFT' ? `${maxc} (the goodness-of-fit test reached no 90% fit)` : maxc;
}

/** How the Mc tab's method card explains the method that produced Mc. */
function describeMcMethodCard(result: {
  mc: number; method: McMethod; maxcCorrection?: number; gftLevel?: 95 | 90 | null; gftFit?: number | null;
  mbsCurve?: { magnitude: number; b: number; deltaB: number; bAve: number | null }[];
}): string {
  if (result.method === 'MBS') {
    const at = result.mbsCurve?.find(point => Math.abs(point.magnitude - result.mc) < 1e-6);
    const values = at && at.bAve != null
      ? ` (b = ${at.b.toFixed(3)} ± ${at.deltaB.toFixed(3)}, mean ${at.bAve.toFixed(3)})`
      : '';
    return `Lowest cut-off where b is within its uncertainty of the mean b over the next 0.5 units${values}`;
  }
  if (result.method === 'GFT') {
    return `Lowest cut-off whose Gutenberg-Richter fit reproduces ${result.gftLevel}% of the observed cumulative counts (R = ${result.gftFit?.toFixed(1)}%)`;
  }
  return `Maximum curvature of the FMD + ${Number((result.maxcCorrection ?? DEFAULT_MAXC_CORRECTION).toFixed(2))}`;
}

/** What one bin of the seismicity-rate series spans. */
function describeRateInterval(interval: RateInterval): string {
  return interval === 'day' ? 'UTC day' : interval === 'week' ? 'ISO week (Monday to Sunday, UTC)' : 'calendar month (UTC)';
}

/** Which events the seismicity-rate series counts, and per what. */
function describeRateSeries(series: SeismicityTimeSeriesResult): string {
  const { rate } = series;
  const per = `counted per ${describeRateInterval(series.interval)}`;
  if (rate.threshold == null) return `All ${rate.eventCount.toLocaleString()} events, ${per}.`;
  const threshold = rate.threshold.toFixed(1);
  if (rate.thresholdSource === 'cutoff') {
    return `${rate.eventCount.toLocaleString()} events at or above your magnitude cut-off, M ≥ ${threshold}, ${per}.`;
  }
  const estimate = describeMcEstimate({
    method: rate.mcMethod, requestedMethod: rate.requestedMcMethod,
    maxcCorrection: rate.maxcCorrection, gftLevel: rate.gftLevel,
  });
  return `${rate.eventCount.toLocaleString()} events at or above Mc = ${threshold} (${estimate}), ${per}.`;
}

/** Series name of the rate chart, e.g. "Events ≥ M2.3 per week". */
function rateSeriesName(series: SeismicityTimeSeriesResult): string {
  const threshold = series.rate.threshold != null ? ` ≥ M${series.rate.threshold.toFixed(1)}` : '';
  return `Events${threshold} per ${series.interval}`;
}

/** Which events the cumulative release sums: the Moment tab's eligibility rule. */
function describeReleaseEligibility(release: SeismicityTimeSeriesResult['release']): string {
  const plural = (n: number) => `${n.toLocaleString()} event${n === 1 ? '' : 's'}`;
  let text = `${plural(release.usedCount)} summed, Mw as reported`;
  if (release.assumedMwCount > 0) {
    text += `; ${release.assumedMwCount.toLocaleString()} of them with ML, GeoNet M or no stated scale, under the ML ≈ Mw assumption`;
  }
  text += '.';
  if (release.excludedCount > 0) {
    text += ` ${plural(release.excludedCount)} excluded: no moment relation is applied here to their stated scale (mb, Ms, Md, or another type such as Me).`;
  }
  return text;
}

// Debounce hook for filter updates
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

const AxisLegendHints = memo(function AxisLegendHints({
  axes,
  legend,
}: {
  axes: string;
  legend?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <span>Axes</span>
        <InfoTooltip content={axes} />
      </div>
      {legend && (
        <div className="flex items-center gap-1.5">
          <span>Legend</span>
          <InfoTooltip content={legend} />
        </div>
      )}
    </div>
  );
});

// States which events an analysis actually consumed. The seismological workers
// run on the filtered set, so the b-value, Mc, rates and moment totals describe
// that subset and not the whole catalogue - say so next to every such heading.
const FilterScopeNote = memo(function FilterScopeNote({
  analysed,
  total,
  detail,
  filters,
}: {
  analysed: number;
  total: number;
  detail?: string;
  /** The filters that shaped the analysed set, named so a result can be reproduced. */
  filters?: string[];
}) {
  return (
    <p className="text-xs text-muted-foreground mt-1">
      Computed from {analysed.toLocaleString()} of {total.toLocaleString()} loaded events
      {filters && filters.length > 0 ? ` (filters: ${filters.join('; ')})`
        : analysed < total ? ' (current filters applied)' : detail ? '' : ' (no filters applied)'}.
      {detail && <> {detail}</>}
    </p>
  );
});

// Catalogues overlap: a merged catalogue repeats its sources' events, and agencies
// such as GeoNet and ISC report the same earthquakes, so a pooled set counts one
// earthquake once per catalogue holding it. b and Mc, rates, declustering and
// summed moment all assume each earthquake appears once (near-identical copies
// even fall inside each other's Gardner-Knopoff windows and read as bursts), so
// these analyses are withheld for a pooled set rather than computed from it.
const PooledCataloguesNotice = memo(function PooledCataloguesNotice({ count }: { count: number }) {
  return (
    <div role="note" className="p-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 text-left">
      <p className="font-medium text-foreground">Withheld: the analysed events span {count} catalogues</p>
      <p className="text-sm text-muted-foreground mt-1">
        Catalogues overlap. A merged catalogue repeats the events of its sources, and agencies such as
        GeoNet and ISC report the same earthquakes, so pooling catalogues counts one earthquake once per
        catalogue that holds it. The b-value, Mc, event rates, declustering and summed moment all assume
        each earthquake appears once. Select a single catalogue, analyse a merged catalogue (merging
        matches duplicate events), or tick one catalogue in the Catalogues filter. The MFD tab compares
        catalogues side by side.
      </p>
    </div>
  );
});

// Record counts pooled across catalogues are shown, but labelled for what they are.
const PooledRecordsNote = memo(function PooledRecordsNote({ count }: { count: number }) {
  return (
    <p role="note" className="text-xs text-amber-700 dark:text-amber-400">
      Counts are event records from {count} catalogues: an earthquake held by several catalogues is
      counted once in each.
    </p>
  );
});

// b and Mc read off a sample that pools magnitude scales inherit the scales'
// different saturation behaviour; say so, with the counts, where they are shown.
const MixedScaleWarning = memo(function MixedScaleWarning({ summary }: { summary: MagnitudeTypeSummary | null }) {
  if (!summary || summary.families.length < 2) return null;
  const shown = summary.types.slice(0, 8);
  return (
    <div role="note" className="p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 text-sm">
      <p className="font-medium">Mixed magnitude scales in the analysed events</p>
      <p className="text-muted-foreground mt-1">
        {shown.map(({ type, count }, index) => (
          <span key={type || '(none)'}>
            {index > 0 && ' · '}
            <span className="font-mono">{type || 'no type'} {count.toLocaleString()}</span>
          </span>
        ))}
        {summary.types.length > shown.length && ` · ${summary.types.length - shown.length} more types`}
      </p>
      <p className="text-muted-foreground mt-1">
        Scales saturate at different sizes, so pooling them distorts the frequency-magnitude
        distribution and can bias b and Mc; the ± on b is sampling error only. Homogenise the
        catalogue to one scale (ideally Mw) before interpreting these values.
      </p>
    </div>
  );
});

// The magnitude-type make-up of the analysed set, shown on every tab: the paper's bias
// guidance is to inspect it before fitting, and to split by type when scales cannot be
// converted to one (the Magnitude types filter does that).
const MagnitudeTypeTable = memo(function MagnitudeTypeTable({
  summary,
  scope,
}: {
  summary: MagnitudeTypeSummary;
  scope: string;
}) {
  const total = summary.types.reduce((sum, t) => sum + t.count, 0);
  const shown = summary.types.slice(0, 10);
  const other = summary.types.slice(10).reduce((sum, t) => sum + t.count, 0);
  const share = (count: number) => total > 0 ? `${((count / total) * 100).toFixed(1)}%` : '—';
  return (
    <section aria-label="Magnitude types of the analysed events" className="rounded-lg border px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-medium">
          Magnitude types <span className="text-xs font-normal text-muted-foreground">in {scope} ({total.toLocaleString()} events)</span>
        </h2>
        <p className="text-xs text-muted-foreground">
          {summary.families.length > 1
            ? `${summary.families.length} magnitude scales pooled; the Magnitude types filter (Map tab) analyses one at a time`
            : 'Use the Magnitude types filter (Map tab) to analyse one type at a time'}
        </p>
      </div>
      {total === 0 ? (
        <p className="text-xs text-muted-foreground mt-2">No events in the analysed set.</p>
      ) : (
        <div className="overflow-x-auto mt-2">
          <table className="text-xs tabular-nums">
            <thead>
              <tr className="text-muted-foreground">
                <th scope="row" className="text-left font-medium pr-4">Type</th>
                {shown.map(({ type }) => <th key={type || '(none)'} scope="col" className="font-mono font-medium px-3 text-right">{type || 'none stated'}</th>)}
                {other > 0 && <th scope="col" className="font-medium px-3 text-right">{summary.types.length - shown.length} more</th>}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="text-left font-normal text-muted-foreground pr-4">Events</th>
                {shown.map(({ type, count }) => <td key={type || '(none)'} className="px-3 text-right">{count.toLocaleString()}</td>)}
                {other > 0 && <td className="px-3 text-right">{other.toLocaleString()}</td>}
              </tr>
              <tr>
                <th scope="row" className="text-left font-normal text-muted-foreground pr-4">Share</th>
                {shown.map(({ type, count }) => <td key={type || '(none)'} className="px-3 text-right">{share(count)}</td>)}
                {other > 0 && <td className="px-3 text-right">{share(other)}</td>}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
});

// Mc estimation settings shared by the G-R and Mc tabs (and the Temporal tab's rate
// threshold): the method, and the correction added to the MAXC bin, offered only when
// MAXC is chosen or a fallback used it (`usedMaxc`).
const McSettings = memo(function McSettings({
  method,
  onMethodChange,
  correction,
  onCorrectionChange,
  usedMaxc = false,
}: {
  method: McMethod;
  onMethodChange: (method: McMethod) => void;
  correction: number;
  onCorrectionChange: (correction: number) => void;
  usedMaxc?: boolean;
}) {
  const methodLabelId = useId();
  const correctionLabelId = useId();
  return (
    <div className="flex flex-wrap items-end gap-4 p-3 rounded-lg border bg-muted/30" aria-label="Mc estimation settings" role="group">
      <div className="w-full min-w-0 space-y-1 sm:w-auto">
        <div className="flex items-center gap-1.5">
          <Label id={methodLabelId} className="text-xs font-medium">Mc method</Label>
          <InfoTooltip content="b-value stability (MBS): the lowest cut-off whose b-value is within its uncertainty of the mean b over the next 0.5 units (Cao & Gao, 2002; Woessner & Wiemer, 2005); falls back to GFT. Goodness of fit (GFT): the lowest cut-off above which a fitted Gutenberg-Richter law reproduces 95% (else 90%) of the observed cumulative counts (Wiemer & Wyss, 2000); falls back to MAXC. Maximum curvature (MAXC): the fullest magnitude bin plus a correction (Wiemer & Wyss, 2000)." />
        </div>
        <Select value={method} onValueChange={value => onMethodChange(value as McMethod)}>
          <SelectTrigger aria-labelledby={methodLabelId} className="h-8 w-full text-xs sm:w-[280px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MBS">{MC_METHOD_LABELS.MBS}</SelectItem>
            <SelectItem value="GFT">{MC_METHOD_LABELS.GFT}</SelectItem>
            <SelectItem value="MAXC">{MC_METHOD_LABELS.MAXC}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {(method === 'MAXC' || usedMaxc) && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Label id={correctionLabelId} className="text-xs font-medium">MAXC correction</Label>
            <InfoTooltip content="Added to the MAXC bin, because maximum curvature underestimates Mc by about 0.1-0.2 for typical networks (Woessner & Wiemer, 2005). Default +0.2. Also applies when another method falls back to MAXC." />
          </div>
          <Select value={String(correction)} onValueChange={value => onCorrectionChange(Number(value))}>
            <SelectTrigger aria-labelledby={correctionLabelId} className="h-8 w-[160px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MAXC_CORRECTION_CHOICES.map(choice => (
                <SelectItem key={choice} value={String(choice)}>
                  +{choice.toFixed(1)}{choice === DEFAULT_MAXC_CORRECTION ? ' (default)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
});

// One panel's analysis still running, or its error.
const SectionStatus = memo(function SectionStatus({ error, pending }: { error: string | null; pending: string }) {
  return error ? (
    <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>
  ) : (
    <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{pending}</span>
    </div>
  );
});

// Loading skeleton for statistics cards
const StatisticsCardSkeleton = memo(function StatisticsCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4 rounded" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16 mb-2" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
});

// Ids of the visible labels that name the filter controls (their thumbs and selects
// point at them with aria-labelledby, so a control is named by its purpose).
const FILTER_LABEL_IDS = {
  magnitude: 'analytics-filter-magnitude-label',
  depth: 'analytics-filter-depth-label',
  time: 'analytics-filter-time-label',
  quality: 'analytics-filter-quality-label',
  gap: 'analytics-filter-gap-label',
} as const;

/** Spoken value of a range thumb; a thumb left at its end applies no bound. */
function boundValueText(value: number, index: number, ends: [number, number], text: string): string {
  if (index === 0 && value <= ends[0]) return `${text}, no lower bound`;
  if (index === 1 && value >= ends[1]) return `${text}, no upper bound`;
  return text;
}

/** How long the page keeps a shared catalogue list before refreshing it on opening. */
const CATALOGUE_LIST_MAX_AGE_MS = 10 * 60 * 1000;

/** A request that failed, described for the reader. */
interface RequestFailure {
  /** The failure as reported: the catalogue list and event loader give a sentence. */
  message: string;
  /** HTTP status, when the server answered. */
  status: number | null;
  /** Refused for want of a session (HTTP 401): signing in, not retrying, is the remedy. */
  needsSignIn: boolean;
}

function describeRequestFailure(error: unknown, knownStatus: number | null = null): RequestFailure | null {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  // The catalogue list reports its status (CatalogueContext errorStatus); the event loader
  // only says "(HTTP 500)" in its message, so that is read as a fallback.
  const match = /\bHTTP\s*(\d{3})\b/i.exec(message);
  const status = knownStatus ?? (match ? Number(match[1]) : null);
  return { message, status, needsSignIn: status === 401 };
}

/** A catalogue's stored event count, or null where the list does not give one. */
function storedEventCount(catalogue: { event_count?: number | null }): number | null {
  return typeof catalogue.event_count === 'number' && Number.isFinite(catalogue.event_count) ? catalogue.event_count : null;
}

function describeEventCount(count: number | null): string {
  return count == null ? 'event count unavailable' : `${count.toLocaleString()} events`;
}

/**
 * Event records summed over the listed catalogues. A catalogue without a stored count
 * makes the sum a lower bound, and none known makes it unavailable: an unknown count
 * is never shown as 0.
 */
function describeEventRecordTotal(list: { event_count?: number | null }[]): string {
  let total = 0;
  let unknown = 0;
  for (const catalogue of list) {
    const count = storedEventCount(catalogue);
    if (count == null) unknown++;
    else total += count;
  }
  if (list.length > 0 && unknown === list.length) return 'event record count unavailable';
  return `${unknown > 0 ? 'at least ' : ''}${total.toLocaleString()} event records`;
}

/** The page title, the one h1, shown in every state of the page. */
function AnalyticsPageHeader({ description, children }: { description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 md:flex-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Visualization &amp; Analytics</h1>
        {description && <p className="break-words text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/** A whole-page state (failed, empty, sign-in needed) under the page title. */
function StatePanel({ icon, title, live, children, actions }: {
  icon: ReactNode;
  title: string;
  /** role for the title and message: 'alert' for a failure, 'status' otherwise. */
  live?: 'alert' | 'status';
  children: ReactNode;
  actions?: ReactNode;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 rounded-lg border bg-card p-6 text-center">
      {icon}
      <div role={live} className="space-y-2">
        <h2 id={titleId} className="text-xl font-semibold">{title}</h2>
        <div className="space-y-2 text-sm text-muted-foreground">{children}</div>
      </div>
      {actions && <div className="flex flex-wrap justify-center gap-2">{actions}</div>}
    </section>
  );
}

function SignInButton({ href }: { href: string }) {
  return (
    <Button asChild>
      <Link href={href}><LogIn className="mr-2 h-4 w-4" aria-hidden="true" />Sign in</Link>
    </Button>
  );
}

/** The list shown is the last one that loaded; the latest refresh failed. */
function StaleListNotice({ failure, loadedAt, onRetry, retrying }: {
  failure: RequestFailure;
  loadedAt: Date | null;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div role="status" className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30 sm:flex-row sm:items-center sm:justify-between">
      <p>
        <span className="font-medium">The catalogue list may be out of date.</span>{' '}
        The latest refresh failed: {failure.message} The catalogues shown are from the last successful
        load{loadedAt ? `, at ${formatLastSuccess(loadedAt)}` : ''}.
      </p>
      <Button size="sm" variant="outline" className="shrink-0" onClick={onRetry} disabled={retrying}>
        {retrying ? 'Refreshing...' : 'Try again'}
      </Button>
    </div>
  );
}

export default function AnalyticsPage() {
  // Core state
  const [selectedCatalogue, setSelectedCatalogue] = useState<string>(''); // Empty by default - user must select
  const [catalogueSelectOpen, setCatalogueSelectOpen] = useState(false);
  const [catalogueSearchTerm, setCatalogueSearchTerm] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<AnalyticsEvent | null>(null);
  // Note: Events from API may have null depth values, which are handled in filtering/display logic
  const [activeTab, setActiveTab] = useState('map');
  const [isPending, startTransition] = useTransition();

  // Visualize page filters - default to showing ALL events
  const [magnitudeRange, setMagnitudeRange] = useState<number[]>([...MAGNITUDE_SLIDER]);
  const [depthRange, setDepthRange] = useState<number[]>([...DEPTH_SLIDER]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedCataloguesFilter, setSelectedCataloguesFilter] = useState<string[]>([]);
  const [timeFilter, setTimeFilter] = useState('all');
  // Analysis filters from the paper's bias guidance: minimum quality score, maximum
  // azimuthal gap, and magnitude type(s); agency-flagged records are excluded by default.
  const [qualityRange, setQualityRange] = useState<number[]>([QUALITY_SLIDER[0]]);
  const [gapRange, setGapRange] = useState<number[]>([GAP_SLIDER[1]]);
  const [selectedMagnitudeTypes, setSelectedMagnitudeTypes] = useState<string[]>([]);
  const [includeFlagged, setIncludeFlagged] = useState(false);

  // Mc estimation (G-R and Mc tabs, and the Temporal tab's rate threshold) and the
  // Temporal tab's time bins and release quantity.
  const [mcMethod, setMcMethod] = useState<McMethod>('MBS');
  const [maxcCorrection, setMaxcCorrection] = useState<number>(DEFAULT_MAXC_CORRECTION);
  const [rateInterval, setRateInterval] = useState<RateIntervalOption>('auto');
  const [releaseQuantity, setReleaseQuantity] = useState<'moment' | 'energy'>('moment');

  // MFD (Magnitude-Frequency Distribution) state
  const [mfdSelectedCatalogues, setMfdSelectedCatalogues] = useState<string[]>([]);
  const [mfdShowCumulative, setMfdShowCumulative] = useState(true);
  const [mfdShowHistogram, setMfdShowHistogram] = useState(true);
  const [mfdLogScale, setMfdLogScale] = useState(true);
  const [mfdBinWidth, setMfdBinWidth] = useState<number>(0.1);
  const [mfdMinMagnitude, setMfdMinMagnitude] = useState<number | undefined>(undefined);
  const [mfdCumulativeStyle, setMfdCumulativeStyle] = useState<'solid' | 'dotted'>('solid');

  // Debounced filter values for expensive operations
  const debouncedMagnitudeRange = useDebounce(magnitudeRange, FILTER_DEBOUNCE_MS);
  const debouncedDepthRange = useDebounce(depthRange, FILTER_DEBOUNCE_MS);
  const debouncedQualityRange = useDebounce(qualityRange, FILTER_DEBOUNCE_MS);
  const debouncedGapRange = useDebounce(gapRange, FILTER_DEBOUNCE_MS);

  // Use deferred value for non-critical UI updates
  const deferredMagnitudeRange = useDeferredValue(debouncedMagnitudeRange);
  const deferredDepthRange = useDeferredValue(debouncedDepthRange);
  const deferredQualityRange = useDeferredValue(debouncedQualityRange);
  const deferredGapRange = useDeferredValue(debouncedGapRange);

  useEffect(() => {
    if (!catalogueSelectOpen) {
      setCatalogueSearchTerm('');
    }
  }, [catalogueSelectOpen]);

  // The shared catalogue list (CatalogueProvider): refreshed on an interval and after
  // this tab's own changes, kept on screen when a refresh fails (status 'stale').
  const {
    catalogues: sharedCatalogues,
    status: sharedListStatus,
    error: listError,
    errorStatus: listErrorStatus,
    refreshing: listRefreshing,
    lastSuccessAt: listLastSuccessAt,
    retry: retrySharedList,
  } = useCatalogues();

  // The provider replaces its array on every refresh. Rebuild the page's list only when
  // its content changes, so a refresh that changes nothing does not restart the selected
  // catalogue's event loading (useCatalogueEvents reloads on a new list).
  const catalogueListKey = useMemo(() => JSON.stringify(sharedCatalogues), [sharedCatalogues]);
  const catalogues = useMemo(() => JSON.parse(catalogueListKey) as MergedCatalogue[], [catalogueListKey]);

  // The page used to cache the list for 10 minutes; on opening it, refresh a shared
  // list older than that.
  useEffect(() => {
    if (listLastSuccessAt && Date.now() - listLastSuccessAt.getTime() > CATALOGUE_LIST_MAX_AGE_MS) {
      void retrySharedList();
    }
  }, [listLastSuccessAt, retrySharedList]);

  // A failed request is not an empty list: 'failed' until a list loads; a list loaded
  // earlier stays on screen, marked stale, when a later refresh fails.
  const listFailure = useMemo(() => describeRequestFailure(listError, listErrorStatus ?? null), [listError, listErrorStatus]);
  const listStatus: 'loading' | 'failed' | 'empty' | 'ready' =
    sharedListStatus === 'failed' ? 'failed'
      : sharedListStatus === 'loading' ? 'loading'
        : catalogues.length > 0 ? 'ready' : 'empty';
  const listStale = sharedListStatus === 'stale' && listFailure != null;
  const cataloguesLoading = listStatus === 'loading';
  const retryCatalogueList = useCallback(() => { void retrySharedList(); }, [retrySharedList]);

  // A guest can browse the catalogue list, but the events behind every view need a
  // signed-in account (the events API answers 401). Read without useSession, which
  // throws outside a SessionProvider; no provider means the session is unknown.
  const sessionContext = useContext(SessionContext);
  const isGuest = sessionContext?.status === 'unauthenticated';
  const loginHref = useLoginHref();

  const [eventCache] = useState(() => new CatalogueEventCache());
  const { events, loading, complete: eventsLoaded, loadedCount, error: eventsError,
    cancel: cancelEventLoading, retry: reloadEvents } = useCatalogueEvents(catalogues, selectedCatalogue, eventCache);
  // Comparisons can include catalogues outside the main map selection. Fetch only
  // those additional catalogues and reuse successful loads across both views.
  const mfdAdditionalCatalogues = useMemo(() => catalogues.filter(catalogue =>
    mfdSelectedCatalogues.includes(catalogue.id) && selectedCatalogue !== 'all' && catalogue.id !== selectedCatalogue
  ), [catalogues, mfdSelectedCatalogues, selectedCatalogue]);
  const mfdLoading = useCatalogueEvents(mfdAdditionalCatalogues,
    activeTab === 'mfd' && mfdAdditionalCatalogues.length > 0 ? 'all' : '', eventCache);
  const mfdReady = eventsLoaded && (mfdAdditionalCatalogues.length === 0 || mfdLoading.complete);
  const expectedEvents = catalogues.reduce((sum, catalogue) =>
    sum + (selectedCatalogue === 'all' || selectedCatalogue === catalogue.id ? catalogue.event_count || 0 : 0), 0);
  const loadingProgress = eventsLoaded ? 100 : expectedEvents > 0 ? Math.min(99, Math.round(loadedCount / expectedEvents * 100)) : 0;
  const loadingMessage = loadedCount > 0
    ? `Loaded ${loadedCount.toLocaleString()}${expectedEvents ? ` of approximately ${expectedEvents.toLocaleString()}` : ''} events`
    : 'Loading the first events...';

  const handleCatalogueChange = useCallback((value: string) => {
    cancelEventLoading();
    setSelectedCatalogue(value);
    setSelectedEvent(null);
    setActiveTab('map');
    // Region and catalogue choices name values of the previous selection. Kept, they
    // silently subset (or empty) every view of the new one, and a region missing
    // from its checkbox list could not even be unticked.
    setSelectedRegions([]);
    setSelectedCataloguesFilter([]);
    setSelectedMagnitudeTypes([]);
  }, [cancelEventLoading]);

  useEffect(() => {
    if (eventsLoaded) setSelectedEvent(previous => previous ?? events[0] ?? null);
  }, [events, eventsLoaded]);

  const { data: eventDetails, loading: detailsLoading, error: detailsError } = useEventDetails(
    selectedEvent?.catalogueId, selectedEvent?.id, activeTab === 'event-details'
  );
  const detailedEvent = eventDetails ?? selectedEvent;

  // Filter events based on selected catalogue (fast operation)
  // With lazy loading, events are already filtered by catalogue when loaded
  const displayEvents = useMemo(() => {
    // If "all" is selected, events contain all catalogues, otherwise single catalogue
    return events;
  }, [events]);

  // A slider handle left at its end applies no bound (see MAGNITUDE_SLIDER).
  const magnitudeCutoff = deferredMagnitudeRange[0] > MAGNITUDE_SLIDER[0] ? deferredMagnitudeRange[0] : undefined;
  const magnitudeCeiling = deferredMagnitudeRange[1] < MAGNITUDE_SLIDER[1] ? deferredMagnitudeRange[1] : undefined;
  const depthFloor = deferredDepthRange[0] > DEPTH_SLIDER[0] ? deferredDepthRange[0] : undefined;
  const depthCeiling = deferredDepthRange[1] < DEPTH_SLIDER[1] ? deferredDepthRange[1] : undefined;
  const minQuality = deferredQualityRange[0] > QUALITY_SLIDER[0] ? deferredQualityRange[0] : undefined;
  const maxGap = deferredGapRange[0] < GAP_SLIDER[1] ? deferredGapRange[0] : undefined;

  // Quality score Q and grade of every loaded event, resolved once per load: the stored
  // score (contract C1) or, for rows stored before scores were saved, one computed from
  // the event's fields. The Q filter and the quality statistics both read it.
  const eventQuality = useMemo(() => {
    const quality = new Map<AnalyticsEvent, ResolvedQuality>();
    for (const event of events) quality.set(event, resolveEventQuality(event));
    return quality;
  }, [events]);

  // Records the source agency flagged as not real, located earthquakes.
  const flaggedCount = useMemo(() => {
    let count = 0;
    for (const event of events) if (isAgencyFlagged(event)) count++;
    return count;
  }, [events]);

  // The time filter's window, [now - week/month/year, now], fixed when the filter is
  // chosen, so the filter and the time series' coverage period are the same window.
  const timeWindow = useMemo(() => {
    if (timeFilter === 'all') return null;
    const end = new Date();
    const start = new Date(end);
    switch (timeFilter) {
      case 'week':
        start.setDate(end.getDate() - 7);
        break;
      case 'month':
        start.setMonth(end.getMonth() - 1);
        break;
      case 'year':
        start.setFullYear(end.getFullYear() - 1);
        break;
    }
    return { start: start.getTime(), end: end.getTime() };
  }, [timeFilter]);

  // Every filter except the magnitude bounds. The G-R and Mc fits take this set and
  // treat the lower bound as an explicit cut-off (see useSeismologicalAnalyses). The
  // upper bound stays out too: the maximum-likelihood b and Mc assume the distribution
  // runs on above them, and fitting a set cut at M3 returned b = 1.34 for b = 1.
  // Events are already filtered by catalogue on load, so no need to filter again
  const fitEarthquakes = useMemo(() => {
    let filtered = events;

    // Depth filter, only once narrowed. An event of unknown depth cannot be placed
    // inside a depth range, so it is dropped then, and only then.
    if (depthFloor != null || depthCeiling != null) {
      filtered = filtered.filter(eq => eq.depth != null &&
        (depthFloor == null || eq.depth >= depthFloor) &&
        (depthCeiling == null || eq.depth <= depthCeiling));
    }

    // Region filter
    if (selectedRegions.length > 0) {
      filtered = filtered.filter(eq => selectedRegions.includes(eq.region || 'Unknown'));
    }

    // Additional catalogue filter (only when "all" is selected and we have all catalogues loaded)
    if (selectedCataloguesFilter.length > 0 && selectedCatalogue === 'all') {
      filtered = filtered.filter(eq => selectedCataloguesFilter.includes(eq.catalogue || 'Unknown'));
    }

    // Records the agency itself says are not separate, located earthquakes.
    if (!includeFlagged) {
      filtered = filtered.filter(eq => !isAgencyFlagged(eq));
    }

    // Minimum quality score Q (stored, or computed for legacy rows).
    if (minQuality != null) {
      filtered = filtered.filter(eq => (eventQuality.get(eq) ?? resolveEventQuality(eq)).score >= minQuality);
    }

    // Maximum azimuthal gap, 0 <= gap <= max as the server-side filter (C4). An event
    // with no reported gap cannot be shown to meet it, so it is dropped while the bound
    // is set, as unknown depths are for a depth range.
    if (maxGap != null) {
      filtered = filtered.filter(eq => typeof eq.azimuthal_gap === 'number' &&
        eq.azimuthal_gap >= 0 && eq.azimuthal_gap <= maxGap);
    }

    // Magnitude types (none ticked keeps every type).
    if (selectedMagnitudeTypes.length > 0) {
      const types = new Set(selectedMagnitudeTypes);
      filtered = filtered.filter(eq => types.has(magnitudeTypeKey(eq)));
    }

    // Time filter
    if (timeWindow) {
      filtered = filtered.filter(eq => Date.parse(eq.time) >= timeWindow.start);
    }

    return filtered;
  }, [events, selectedCatalogue, depthFloor, depthCeiling, selectedRegions, selectedCataloguesFilter, timeWindow,
    includeFlagged, minQuality, eventQuality, maxGap, selectedMagnitudeTypes]);

  // The events every view on the page draws: all filters, both magnitude bounds
  // included, under the engine's tolerant comparison (so the displayed set above a
  // cut-off is exactly the set the G-R fit counts).
  const filteredEarthquakes = useMemo(() => {
    if (magnitudeCutoff == null && magnitudeCeiling == null) return fitEarthquakes;
    return fitEarthquakes.filter(eq =>
      (magnitudeCutoff == null || magnitudeAtOrAbove(eq.magnitude, magnitudeCutoff)) &&
      (magnitudeCeiling == null || magnitudeAtOrBelow(eq.magnitude, magnitudeCeiling)));
  }, [fitEarthquakes, magnitudeCutoff, magnitudeCeiling]);

  // The events the G-R fit uses: the fit set at or above an explicit cut-off, as the
  // worker selects them, else the whole fit set.
  const grFitSample = useMemo(
    () => magnitudeCutoff == null ? fitEarthquakes : fitEarthquakes.filter(eq => magnitudeAtOrAbove(eq.magnitude, magnitudeCutoff)),
    [fitEarthquakes, magnitudeCutoff]
  );

  // Physical totals are withheld for a set that spans catalogues (PooledCataloguesNotice).
  const loadedCatalogueCount = useMemo(() => new Set(events.map(eq => eq.catalogueId)).size, [events]);
  const fitCatalogueCount = useMemo(() => new Set(fitEarthquakes.map(eq => eq.catalogueId)).size, [fitEarthquakes]);
  const filteredCatalogueCount = useMemo(() => new Set(filteredEarthquakes.map(eq => eq.catalogueId)).size, [filteredEarthquakes]);
  const pooledCatalogueCount = (tab: string) =>
    tab === 'gutenberg-richter' || tab === 'completeness' ? fitCatalogueCount
      : tab === 'temporal' || tab === 'moment' ? filteredCatalogueCount : 1;

  // Magnitude types of the set the active tab analyses (also behind the G-R and Mc tabs'
  // MixedScaleWarning): on the G-R tab the events actually fitted, at or above any
  // cut-off; on the Mc tab the untruncated sample Mc is estimated from; elsewhere the
  // filtered events.
  const analysesFitSample = activeTab === 'gutenberg-richter' || activeTab === 'completeness';
  const analysedSample = activeTab === 'gutenberg-richter' ? grFitSample
    : activeTab === 'completeness' ? fitEarthquakes : filteredEarthquakes;
  const analysedSampleScope = activeTab === 'gutenberg-richter'
    ? (magnitudeCutoff != null ? `the G-R fit sample (M ≥ ${magnitudeCutoff.toFixed(1)})` : 'the G-R fit sample')
    : activeTab === 'completeness' ? 'the Mc estimation sample' : 'the filtered events';
  const analysedMagnitudeTypes = useMemo(() => summariseMagnitudeTypes(analysedSample), [analysedSample]);
  const fitMagnitudeTypes = analysesFitSample ? analysedMagnitudeTypes : null;

  // The period the analysed events are known to cover, against which the time series
  // measure partial first and last bins: the time filter's window, intersected with the
  // catalogue's declared time_period_start/end when the events come from one catalogue
  // that declares it. Without either, a partial bin's coverage could only be read off
  // its first or last event, so it is shown at its raw count instead of scaled.
  const analysisPeriod = useMemo(() => {
    const windows: { start: number; end: number }[] = [];
    if (timeWindow) windows.push(timeWindow);
    if (filteredCatalogueCount === 1 && filteredEarthquakes.length > 0) {
      const catalogue = catalogues.find(c => c.id === filteredEarthquakes[0].catalogueId);
      const start = Date.parse(catalogue?.time_period_start ?? '');
      let end = Date.parse(catalogue?.time_period_end ?? '');
      // The period is end-exclusive; a declared end at 00:00 UTC is a date, and the
      // catalogue covers that whole day.
      if (Number.isFinite(end) && end % DAY_MS === 0) end += DAY_MS;
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) windows.push({ start, end });
    }
    if (windows.length === 0) return undefined;
    const start = Math.max(...windows.map(w => w.start));
    const end = Math.min(...windows.map(w => w.end));
    return end > start ? { start: new Date(start).toISOString(), end: new Date(end).toISOString() } : undefined;
  }, [timeWindow, filteredCatalogueCount, filteredEarthquakes, catalogues]);

  // Magnitude types present in the loaded events, for the filter's checkboxes.
  const availableMagnitudeTypes = useMemo(() => summariseMagnitudeTypes(events).types, [events]);

  // The filters in force, named for the analysis tabs' scope notes. The G-R and Mc fits
  // take neither magnitude bound as a filter (the lower one is the G-R cut-off).
  const describeFilters = (includeMagnitudeBounds: boolean): string[] => {
    const labels: string[] = [];
    const magnitude = describeRange(magnitudeRange, MAGNITUDE_SLIDER, value => value.toFixed(1), '');
    if (includeMagnitudeBounds && magnitude !== 'all') labels.push(`M ${magnitude}`);
    const depth = describeRange(depthRange, DEPTH_SLIDER, value => String(value), ' km');
    if (depth !== 'all') labels.push(`depth ${depth}`);
    if (timeFilter !== 'all') labels.push(`last ${timeFilter}`);
    if (selectedRegions.length > 0) labels.push(`${selectedRegions.length} region${selectedRegions.length === 1 ? '' : 's'}`);
    if (selectedCataloguesFilter.length > 0 && selectedCatalogue === 'all') {
      labels.push(`${selectedCataloguesFilter.length} catalogue${selectedCataloguesFilter.length === 1 ? '' : 's'}`);
    }
    if (qualityRange[0] > QUALITY_SLIDER[0]) labels.push(`Q ≥ ${qualityRange[0]}`);
    if (gapRange[0] < GAP_SLIDER[1]) labels.push(`azimuthal gap ≤ ${gapRange[0]}°`);
    if (selectedMagnitudeTypes.length > 0) {
      labels.push(`magnitude type ${selectedMagnitudeTypes.map(type => type || 'none stated').join(', ')}`);
    }
    if (!includeFlagged && flaggedCount > 0) {
      labels.push(`${flaggedCount.toLocaleString()} agency-flagged record${flaggedCount === 1 ? '' : 's'} excluded`);
    }
    return labels;
  };

  // Visualization data calculations (optimized with sampling)
  const availableRegions = useMemo(() => {
    return Array.from(new Set(events.map(e => e.region || 'Unknown'))).sort();
  }, [events]);

  const availableCatalogues = useMemo(() => {
    return Array.from(new Set(events.map(e => e.catalogue || 'Unknown'))).sort();
  }, [events]);

  const magnitudeDistribution = useMemo(() => {
    if (activeTab !== 'charts') return [];
    // Bins span every magnitude the filter admits: open at the bottom (NZ
    // catalogues are dominated by sub-M2 events, which the old M2.0 floor
    // dropped silently) and open at the top, so the bars sum to the filtered
    // event total the tooltip uses as its percentage denominator.
    const bins = [
      { range: '< 2.0', min: -Infinity, max: 2.0, count: 0 },
      { range: '2.0-2.5', min: 2.0, max: 2.5, count: 0 },
      { range: '2.5-3.0', min: 2.5, max: 3.0, count: 0 },
      { range: '3.0-3.5', min: 3.0, max: 3.5, count: 0 },
      { range: '3.5-4.0', min: 3.5, max: 4.0, count: 0 },
      { range: '4.0-4.5', min: 4.0, max: 4.5, count: 0 },
      { range: '4.5-5.0', min: 4.5, max: 5.0, count: 0 },
      { range: '5.0+', min: 5.0, max: Infinity, count: 0 },
    ];

    filteredEarthquakes.forEach(eq => {
      const bin = bins.find(b => eq.magnitude >= b.min && eq.magnitude < b.max);
      if (bin) bin.count++;
    });

    return bins;
  }, [filteredEarthquakes, activeTab]);

  const depthDistribution = useMemo(() => {
    if (activeTab !== 'charts') return [];
    // Split at 70 and 300 km, the shallow/intermediate/deep-focus boundaries: NZ
    // catalogues hold intermediate and deep Hikurangi and Kermadec slab seismicity,
    // which one '40+ km' bar hid (and its tooltip badged shallow). The first bin is
    // open below so above-sea-level (negative-depth) events are counted.
    const bins = [
      { range: '< 10 km', min: -Infinity, max: 10, count: 0 },
      { range: '10-20 km', min: 10, max: 20, count: 0 },
      { range: '20-30 km', min: 20, max: 30, count: 0 },
      { range: '30-40 km', min: 30, max: 40, count: 0 },
      { range: '40-70 km', min: 40, max: 70, count: 0 },
      { range: '70-300 km', min: 70, max: 300, count: 0 },
      { range: '300+ km', min: 300, max: Infinity, count: 0 },
    ];

    filteredEarthquakes.forEach(eq => {
      if (eq.depth == null) return;
      const bin = bins.find(b => eq.depth! >= b.min && eq.depth! < b.max);
      if (bin) bin.count++;
    });

    return bins;
  }, [filteredEarthquakes, activeTab]);

  const regionDistribution = useMemo(() => {
    if (activeTab !== 'distribution') return [];
    const regionCounts: Record<string, number> = {};
    filteredEarthquakes.forEach(eq => {
      const region = eq.region || 'Unknown';
      regionCounts[region] = (regionCounts[region] || 0) + 1;
    });

    return Object.entries(regionCounts)
      .map(([region, count]) => ({ region, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filteredEarthquakes, activeTab]);

  const catalogueDistribution = useMemo(() => {
    if (activeTab !== 'distribution') return [];
    const catalogueCounts: Record<string, number> = {};
    filteredEarthquakes.forEach(eq => {
      const catalogue = eq.catalogue || 'Unknown';
      catalogueCounts[catalogue] = (catalogueCounts[catalogue] || 0) + 1;
    });

    return Object.entries(catalogueCounts)
      .map(([catalogue, count]) => ({ catalogue, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredEarthquakes, activeTab]);

  const { data: timeSeriesData, daysPerBin: timelineDaysPerBin } = useMemo(
    () => activeTab === 'timeline'
      ? aggregateEventTimeline(filteredEarthquakes, MAX_TIMELINE_POINTS, { period: analysisPeriod })
      : { data: [], daysPerBin: 1 },
    [filteredEarthquakes, activeTab, analysisPeriod]
  );
  const timelineSeriesName = timelineDaysPerBin === 1 ? 'Events per Day' : `Events per ${timelineDaysPerBin} Days`;
  const timelinePartialDays = timeSeriesData[timeSeriesData.length - 1]?.coveredDays;
  const timelinePartialCount = timeSeriesData.filter(bin => bin.coveredDays != null).length;

  const handleResetFilters = useCallback(() => {
    startTransition(() => {
      setMagnitudeRange([...MAGNITUDE_SLIDER]);
      setDepthRange([...DEPTH_SLIDER]);
      setSelectedRegions([]);
      setSelectedCataloguesFilter([]);
      setTimeFilter('all');
      setQualityRange([QUALITY_SLIDER[0]]);
      setGapRange([GAP_SLIDER[1]]);
      setSelectedMagnitudeTypes([]);
      setIncludeFlagged(false);
    });
  }, []);

  const handleMagnitudeTypeToggle = useCallback((type: string) => {
    startTransition(() => {
      setSelectedMagnitudeTypes(prev =>
        prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
      );
    });
  }, []);

  const handleRegionToggle = useCallback((region: string) => {
    startTransition(() => {
      setSelectedRegions(prev =>
        prev.includes(region)
          ? prev.filter(r => r !== region)
          : [...prev, region]
      );
    });
  }, []);

  const handleCatalogueToggle = useCallback((catalogue: string) => {
    startTransition(() => {
      setSelectedCataloguesFilter(prev =>
        prev.includes(catalogue)
          ? prev.filter(c => c !== catalogue)
          : [...prev, catalogue]
      );
    });
  }, []);

  // Calculate statistics - optimized with single pass and sampling
  const statistics = useMemo(() => {
    if (!eventsLoaded || displayEvents.length === 0) return null;

    const totalEvents = displayEvents.length;

    // Every event is scored (no subsample, so grade counts are exact); the scorer used
    // here returns overall and grade only, which keeps the pass to ~0.25 s at 200k.

    // Single pass for counting and sampling
    let withUncertainty = 0;
    let withFocalMechanism = 0;
    let withStationData = 0;
    const sampledEvents: any[] = [];

    for (let i = 0; i < totalEvents; i++) {
      const e = displayEvents[i];

      // Count uncertainty data
      if (e.latitude_uncertainty != null || e.longitude_uncertainty != null || e.depth_uncertainty != null) {
        withUncertainty++;
      }

      // Fast check for focal mechanism (avoid expensive parsing)
      // Just check if the field exists and is non-empty
      // Note: focal_mechanisms can be JSON string or parsed array/object depending on API response
      const fm = e.focal_mechanisms as string | unknown[] | object | null | undefined;
      if (fm &&
        (typeof fm === 'string' ? fm.length > 2 :
          Array.isArray(fm) ? fm.length > 0 :
            typeof fm === 'object')) {
        withFocalMechanism++;
      }

      // Count station data
      if (e.used_station_count && e.used_station_count > 0) {
        withStationData++;
      }

      sampledEvents.push(e);
    }

    // The stored Q and grade (contract C1), computed only for legacy rows without one;
    // resolved once per load in eventQuality.
    const qualityScores = sampledEvents.map(e => eventQuality.get(e) ?? resolveEventQuality(e));
    const avgQuality = qualityScores.length > 0
      ? qualityScores.reduce((sum, s) => sum + s.score, 0) / qualityScores.length
      : 0;

    const gradeDistribution = qualityScores.reduce((acc, s) => {
      acc[s.grade] = (acc[s.grade] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalEvents,
      avgQuality: avgQuality.toFixed(1),
      gradeDistribution,
      withUncertainty,
      withFocalMechanism,
      withStationData,
      percentageWithUncertainty: ((withUncertainty / totalEvents) * 100).toFixed(1),
      percentageWithFocalMechanism: ((withFocalMechanism / totalEvents) * 100).toFixed(1),
      percentageWithStationData: ((withStationData / totalEvents) * 100).toFixed(1),
    };
  }, [displayEvents, eventsLoaded, eventQuality]);

  // Use web workers for seismological analysis (non-blocking).
  // The analyses run on `filteredEarthquakes`, the same set every chart, map and
  // count on this page draws, so the headline statistics (b-value, Mc, rates,
  // total moment) always describe the catalogue subset the user can see. Feeding
  // the unfiltered `displayEvents` here made those numbers disagree with the rest
  // of the page whenever any filter was narrowed. The G-R and Mc fits take the same
  // set without the magnitude lower bound, which becomes the G-R fit's explicit
  // cut-off. Nothing runs for a set pooled across catalogues.
  const {
    grAnalysis: grWorkerResult,
    completeness: completenessWorkerResult,
    temporalAnalysis: temporalWorkerResult,
    timeSeriesAnalysis: timeSeriesWorkerResult,
    momentAnalysis: momentWorkerResult,
    anyLoading: analysisLoading
  } = useSeismologicalAnalyses(
    filteredEarthquakes as EarthquakeEvent[],
    eventsLoaded && pooledCatalogueCount(activeTab) <= 1 ? activeTab : 'map',
    {
      fitEvents: fitEarthquakes as EarthquakeEvent[],
      minMagnitude: magnitudeCutoff,
      mcMethod,
      maxcCorrection,
      rateInterval,
      period: analysisPeriod,
    }
  );

  // Extract data from worker results
  const grAnalysis = grWorkerResult.data;
  const completeness = completenessWorkerResult.data;
  const temporalAnalysis = temporalWorkerResult.data;
  const timeSeriesAnalysis = timeSeriesWorkerResult.data;
  const momentAnalysis = momentWorkerResult.data;

  // Calculate MFD comparison for selected catalogues
  const mfdComparison = useMemo((): MFDComparisonResult | null => {
    if (!mfdReady || activeTab !== 'mfd' || mfdSelectedCatalogues.length === 0) {
      return null;
    }

    // Group once rather than scanning every event again for each catalogue.
    const grouped = new Map<string, AnalyticsEvent[]>();
    for (const catalogueId of mfdSelectedCatalogues) grouped.set(catalogueId, []);
    for (const event of events) grouped.get(event.catalogueId)?.push(event);
    for (const event of mfdLoading.events) grouped.get(event.catalogueId)?.push(event);
    const catalogueData = mfdSelectedCatalogues.map((catalogueId, index) => {
      const catalogue = catalogues.find(c => c.id === catalogueId);
      return {
        events: (grouped.get(catalogueId) ?? []) as EarthquakeEvent[],
        catalogueId,
        catalogueName: catalogue?.name || `Catalogue ${index + 1}`,
        color: MFD_CATALOGUE_COLORS[index % MFD_CATALOGUE_COLORS.length],
      };
    });

    return calculateMFDComparison(catalogueData, mfdBinWidth, mfdMinMagnitude);
  }, [mfdReady, activeTab, mfdSelectedCatalogues, events, mfdLoading.events, catalogues, mfdBinWidth, mfdMinMagnitude]);

  // Handle MFD catalogue selection toggle
  const handleMfdCatalogueToggle = useCallback((catalogueId: string) => {
    setMfdSelectedCatalogues(prev => {
      if (prev.includes(catalogueId)) {
        return prev.filter(id => id !== catalogueId);
      }
      return [...prev, catalogueId];
    });
  }, []);

  // Select all catalogues for MFD
  const handleMfdSelectAll = useCallback(() => {
    setMfdSelectedCatalogues(catalogues.map(c => c.id));
  }, [catalogues]);

  // Clear all MFD selections
  const handleMfdClearAll = useCallback(() => {
    setMfdSelectedCatalogues([]);
  }, []);

  // Handle tab change with transition
  const handleTabChange = useCallback((value: string) => {
    startTransition(() => {
      setActiveTab(value);
    });
  }, []);

  const pageDescription = 'Comprehensive visualization, quality assessment, and seismological analysis';

  const staleListNotice = listStale && listFailure
    ? <StaleListNotice failure={listFailure} loadedAt={listLastSuccessAt} onRetry={retryCatalogueList} retrying={listRefreshing} />
    : null;

  // The catalogue list failed and no list loaded earlier. Say so: a failed request is
  // not an empty inventory, and its counts are unknown, not zero.
  if (listStatus === 'failed' && listFailure) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <AnalyticsPageHeader description={pageDescription} />
        {listFailure.needsSignIn ? (
          <StatePanel
            icon={<LogIn className="h-10 w-10 text-muted-foreground" aria-hidden="true" />}
            title="Sign in to view analytics"
            live="status"
            actions={<SignInButton href={loginHref} />}
          >
            <p>Viewing analytics needs an account. After signing in you return to this page.</p>
          </StatePanel>
        ) : (
          <StatePanel
            icon={<AlertTriangle className="h-10 w-10 text-amber-600 dark:text-amber-400" aria-hidden="true" />}
            title="The catalogue list could not be loaded"
            live="alert"
            actions={<Button onClick={retryCatalogueList}>Retry</Button>}
          >
            <p>{listFailure.message}</p>
            <p>This does not mean there are no catalogues: none can be shown until the list loads.</p>
          </StatePanel>
        )}
      </div>
    );
  }

  // The list loaded and holds no catalogues.
  if (listStatus === 'empty') {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <AnalyticsPageHeader description={pageDescription} />
        {staleListNotice}
        <StatePanel
          icon={<MapPin className="h-10 w-10 text-muted-foreground" aria-hidden="true" />}
          title="No catalogues available"
          live="status"
          actions={<Button asChild><Link href="/upload">Upload Catalogue</Link></Button>}
        >
          <p>The catalogue list loaded and holds no catalogues. Upload or import a catalogue, or create a merged catalogue, to visualize and analyse its events.</p>
        </StatePanel>
      </div>
    );
  }

  // Event records summed from the catalogue list (an unknown count is never shown as 0).
  const eventRecordTotal = describeEventRecordTotal(catalogues);
  const knownEventCounts = catalogues.map(storedEventCount).filter((count): count is number => count != null);
  const knownEventSum = knownEventCounts.reduce((sum, count) => sum + count, 0);
  const unavailable = <>—<span className="sr-only"> (unavailable)</span></>;

  // No catalogue selected - show selection prompt (immediately, with loading state for catalogue list)
  if (!selectedCatalogue) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <AnalyticsPageHeader description={pageDescription} />
        {staleListNotice}

        {isGuest && (
          <div role="note" className="mx-auto flex max-w-2xl flex-col gap-3 rounded-lg border p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p>
              <span className="font-medium">Viewing analytics needs an account.</span>{' '}
              You can browse the catalogue list as a guest; a catalogue&apos;s events and analyses are shown after you sign in.
            </p>
            <SignInButton href={loginHref} />
          </div>
        )}

        {/* Catalogue Selection Card */}
        <Card className="max-w-2xl mx-auto mt-6 sm:mt-12">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-4 bg-primary/10 rounded-full w-fit">
              <BarChart3 className="h-12 w-12 text-primary" />
            </div>
            <CardTitle className="text-2xl">Select a Catalogue to Analyze</CardTitle>
            <CardDescription>
              Choose a specific catalogue for fast analysis, or load all catalogues for comprehensive comparison.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label id="analytics-catalogue-picker-label">Catalogue to analyse</Label>
              {cataloguesLoading ? (
                <div className="space-y-2" role="status">
                  <Skeleton className="h-10 w-full" />
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading catalogues...</span>
                  </div>
                </div>
              ) : (
                <Popover open={catalogueSelectOpen} onOpenChange={setCatalogueSelectOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={catalogueSelectOpen}
                      aria-labelledby="analytics-catalogue-picker-label"
                      className="w-full justify-between"
                    >
                      <span className="truncate">Select a catalogue...</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search catalogues..."
                        value={catalogueSearchTerm}
                        onValueChange={setCatalogueSearchTerm}
                      />
                      <CommandList>
                        <CommandEmpty>No catalogues found.</CommandEmpty>
                        <CommandGroup>
                          {catalogues.map((cat) => (
                            <CommandItem
                              key={cat.id}
                              value={`${cat.name} ${cat.id}`}
                              onSelect={() => {
                                handleCatalogueChange(cat.id);
                                setCatalogueSelectOpen(false);
                              }}
                              className="flex items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Check
                                  className={`h-4 w-4 ${selectedCatalogue === cat.id ? 'opacity-100' : 'opacity-0'}`}
                                />
                                <span className="truncate">{cat.name}</span>
                              </div>
                              <Badge variant="secondary" className="ml-2 shrink-0">
                                {describeEventCount(storedEventCount(cat))}
                              </Badge>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <Button
              variant="outline"
              className="h-auto min-h-10 w-full whitespace-normal"
              onClick={() => handleCatalogueChange('all')}
              disabled={cataloguesLoading}
            >
              {cataloguesLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Activity className="h-4 w-4 mr-2 shrink-0" />
                  Load All Catalogues ({eventRecordTotal})
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Loading all catalogues may take longer for large datasets
            </p>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <section className="max-w-2xl mx-auto" aria-labelledby="analytics-summary-heading">
          <h2 id="analytics-summary-heading" className="text-sm font-medium text-muted-foreground mb-3">Available Catalogues Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {cataloguesLoading ? (
              <>
                <Card><CardContent className="p-4"><Skeleton className="h-8 w-12 mb-1" /><Skeleton className="h-3 w-16" /></CardContent></Card>
                <Card><CardContent className="p-4"><Skeleton className="h-8 w-16 mb-1" /><Skeleton className="h-3 w-16" /></CardContent></Card>
                <Card><CardContent className="p-4"><Skeleton className="h-8 w-12 mb-1" /><Skeleton className="h-3 w-20" /></CardContent></Card>
                <Card><CardContent className="p-4"><Skeleton className="h-8 w-16 mb-1" /><Skeleton className="h-3 w-20" /></CardContent></Card>
              </>
            ) : (
              <>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">{catalogues.length}</div>
                    <div className="text-xs text-muted-foreground">Catalogues</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">
                      {knownEventCounts.length === 0 ? unavailable
                        : `${knownEventCounts.length < catalogues.length ? '≥ ' : ''}${knownEventSum.toLocaleString()}`}
                    </div>
                    {/* Summed over every catalogue, merged ones included: records, not distinct earthquakes. */}
                    <div className="text-xs text-muted-foreground">Event records</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">
                      {knownEventCounts.length === 0 ? unavailable
                        : Math.round(knownEventSum / knownEventCounts.length).toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">Avg Events/Catalogue</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">
                      {knownEventCounts.length === 0 ? unavailable : Math.max(...knownEventCounts).toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">Largest Catalogue</div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </section>
      </div>
    );
  }

  // Loading events for selected catalogue
  if (loading && events.length === 0) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <AnalyticsPageHeader description={pageDescription} />
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-18rem)]">
          <Card className="w-full max-w-md border-0 shadow-lg bg-gradient-to-br from-background to-muted/30">
            <CardContent className="pt-8 pb-6">
              <div className="flex flex-col items-center gap-6">
                {/* Animated seismic wave loader */}
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: '1.5s' }} />
                  <div className="absolute inset-2 rounded-full bg-primary/30 animate-ping" style={{ animationDuration: '1.5s', animationDelay: '0.2s' }} />
                  <div className="relative flex items-center justify-center h-20 w-20 rounded-full bg-gradient-to-br from-primary to-primary/80 shadow-lg">
                    <Activity className="h-10 w-10 text-primary-foreground animate-pulse" />
                  </div>
                </div>

                {/* Loading message */}
                <div className="text-center space-y-2" role="status">
                  <h2 className="text-lg font-semibold">
                    {loadingMessage || 'Loading earthquake data...'}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Fetching seismic events from the database
                  </p>
                </div>

                {/* Progress indicator */}
                {loadingProgress > 0 && loadingProgress < 100 ? (
                  <div className="w-full space-y-2">
                    <div className="relative">
                      <Progress value={loadingProgress} className="h-2" aria-label="Loading events" />
                      <div
                        className="absolute top-0 h-2 bg-primary/30 rounded-full animate-pulse"
                        style={{ width: `${Math.min(loadingProgress + 10, 100)}%`, opacity: 0.5 }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Processing...</span>
                      <span className="font-medium">{loadingProgress}%</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="flex gap-1">
                      <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span>Connecting to database</span>
                  </div>
                )}

                {/* Cancel button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    handleCatalogueChange('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // The events request was refused for want of a session: signing in is the remedy, so
  // it is the action offered (retrying would be refused again).
  const eventsNeedSignIn = eventsError === EVENTS_SIGN_IN_MESSAGE;

  if (eventsError && events.length === 0) {
    const eventsFailure = describeRequestFailure(eventsError);
    return (
      <div className="container mx-auto py-6 space-y-6">
        <AnalyticsPageHeader description={pageDescription} />
        {staleListNotice}
        {eventsNeedSignIn ? (
          <StatePanel
            icon={<LogIn className="h-10 w-10 text-muted-foreground" aria-hidden="true" />}
            title="Sign in to view analytics"
            live="status"
            actions={<>
              <SignInButton href={loginHref} />
              <Button variant="outline" onClick={() => handleCatalogueChange('')}>Back to catalogue selection</Button>
            </>}
          >
            <p>
              Viewing a catalogue&apos;s events and analyses needs an account. The catalogue list can be browsed
              without one. If you were signed in, your session may have expired.
            </p>
            <p>After signing in you return to this page.</p>
          </StatePanel>
        ) : (
          <StatePanel
            icon={<AlertTriangle className="h-10 w-10 text-amber-600 dark:text-amber-400" aria-hidden="true" />}
            title={eventsError === 'Event loading cancelled' ? 'Event loading cancelled' : 'The events could not be loaded'}
            live="alert"
            actions={<>
              <Button onClick={reloadEvents}>Retry loading events</Button>
              <Button variant="outline" onClick={() => handleCatalogueChange('')}>Select Different Catalogue</Button>
            </>}
          >
            <p>{eventsError}</p>
            {eventsFailure?.status != null && eventsFailure.status >= 500 && (
              <p>The server could not complete the request. No analysis is shown from a failed load.</p>
            )}
          </StatePanel>
        )}
      </div>
    );
  }

  // Events loaded but empty (shouldn't normally happen)
  if (eventsLoaded && events.length === 0) {
    const currentCatalogue = catalogues.find(c => c.id === selectedCatalogue);
    return (
      <div className="container mx-auto py-6 space-y-6">
        <AnalyticsPageHeader description={pageDescription} />
        <StatePanel
          icon={<MapPin className="h-10 w-10 text-muted-foreground" aria-hidden="true" />}
          title="No Events Found"
          live="status"
          actions={<Button variant="outline" onClick={() => handleCatalogueChange('')}>Select Different Catalogue</Button>}
        >
          <p>
            {selectedCatalogue === 'all'
              ? 'No events found in any catalogue.'
              : `No events found in "${currentCatalogue?.name || 'selected catalogue'}".`}
          </p>
        </StatePanel>
      </div>
    );
  }

  // Get current catalogue name for display
  const currentCatalogueName = selectedCatalogue === 'all'
    ? 'All Catalogues'
    : catalogues.find(c => c.id === selectedCatalogue)?.name || 'Selected Catalogue';

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header: title and catalogue selector stack below md, the selector full width. */}
      <AnalyticsPageHeader
        description={<>
          Analyzing: <span className="font-medium text-foreground">{currentCatalogueName}</span>
          {' '}({events.length.toLocaleString()} {loadedCatalogueCount > 1 ? 'event records' : 'events'})
        </>}
      >
        <div className="flex w-full min-w-0 flex-col gap-1 md:w-80 md:flex-none">
          <Label id="analytics-catalogue-select-label" className="text-xs font-medium">Catalogue to analyse</Label>
          <Select value={selectedCatalogue} onValueChange={handleCatalogueChange}>
            <SelectTrigger
              aria-labelledby="analytics-catalogue-select-label"
              aria-describedby="analytics-catalogue-select-hint"
              className="w-full min-w-0 text-left [&>span]:min-w-0"
            >
              <SelectValue placeholder="Select catalogue" />
            </SelectTrigger>
            <SelectContent className="max-w-[calc(100vw-2rem)]">
              <SelectItem value="all">
                All Catalogues ({eventRecordTotal})
              </SelectItem>
              {catalogues.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name} ({describeEventCount(storedEventCount(cat))})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p id="analytics-catalogue-select-hint" className="text-xs text-muted-foreground">
            {selectedCatalogue === 'all' ? 'Comparing all catalogues' : 'Switch catalogue to analyze different data'}
          </p>
        </div>
      </AnalyticsPageHeader>

      {staleListNotice}

      {!eventsLoaded && (loading || eventsError) && <div className="rounded-lg border bg-muted/50 p-4 space-y-2" role={eventsError && !eventsNeedSignIn ? 'alert' : 'status'}>
        {eventsNeedSignIn ? (
          <p>
            Loading stopped: viewing a catalogue&apos;s events needs an account, and your session may have expired.
            Sign in to load the remaining events. The {events.length.toLocaleString()} events shown are a partial preview.
          </p>
        ) : (
          <p>{eventsError || `${loadingMessage}. Showing a preview while the remaining events load.`}</p>
        )}
        {loading && <Progress value={loadingProgress} className="h-2" aria-label="Loading events" />}
        <p className="text-sm text-muted-foreground">Charts and analyses become available when loading finishes.</p>
        {eventsNeedSignIn && !loading ? (
          <SignInButton href={loginHref} />
        ) : (
          <Button size="sm" variant="outline" onClick={loading ? cancelEventLoading : reloadEvents}>
            {loading ? 'Cancel loading' : 'Retry loading events'}
          </Button>
        )}
      </div>}

      {/* Performance indicator */}
      {(isPending || analysisLoading || filteredEarthquakes.length > 5000) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-4 py-2 rounded-lg">
          {(isPending || analysisLoading) && <Loader2 className="h-4 w-4 animate-spin" />}
          {!isPending && !analysisLoading && <Info className="h-4 w-4" />}
          {isPending ? (
            <span>Processing filter changes...</span>
          ) : analysisLoading ? (
            <span>Computing seismological analysis in background...</span>
          ) : (
            <span>
              Displaying {filteredEarthquakes.length.toLocaleString()} events.
              Large datasets may use sampling for optimal performance.
            </span>
          )}
        </div>
      )}

      {/* Statistics Cards */}
      <section aria-labelledby="analytics-loaded-summary-heading">
      <h2 id="analytics-loaded-summary-heading" className="sr-only">Summary of the loaded events</h2>
      {statistics ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle as="h3" className="text-sm font-medium">{loadedCatalogueCount > 1 ? 'Event records' : 'Total Events'}</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.totalEvents.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                Avg Quality: {statistics.avgQuality}/100
              </p>
              {loadedCatalogueCount > 1 && (
                <p className="text-xs text-muted-foreground">
                  From {loadedCatalogueCount} catalogues; an earthquake held by several is counted in each
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle as="h3" className="text-sm font-medium">With Uncertainty Data</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.withUncertainty.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {statistics.percentageWithUncertainty}% of events
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle as="h3" className="text-sm font-medium">With Focal Mechanisms</CardTitle>
              <Award className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.withFocalMechanism.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {statistics.percentageWithFocalMechanism}% of events
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle as="h3" className="text-sm font-medium">With Station Data</CardTitle>
              <Radio className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.withStationData.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {statistics.percentageWithStationData}% of events
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatisticsCardSkeleton />
          <StatisticsCardSkeleton />
          <StatisticsCardSkeleton />
          <StatisticsCardSkeleton />
        </div>
      )}
      </section>

      {eventsLoaded && (
        <MagnitudeTypeTable summary={analysedMagnitudeTypes} scope={analysedSampleScope} />
      )}

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="flex w-full justify-start gap-1 overflow-x-auto h-auto flex-nowrap">
          <TabsTrigger value="map" className="text-xs">
            <MapPin className="h-3 w-3 mr-1" />
            Map
          </TabsTrigger>
          <TabsTrigger value="charts" disabled={!eventsLoaded} className="text-xs">
            <BarChart3 className="h-3 w-3 mr-1" />
            Charts
          </TabsTrigger>
          <TabsTrigger value="distribution" disabled={!eventsLoaded} className="text-xs">
            <Activity className="h-3 w-3 mr-1" />
            Distribution
          </TabsTrigger>
          <TabsTrigger value="timeline" disabled={!eventsLoaded} className="text-xs">
            <Calendar className="h-3 w-3 mr-1" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="event-list" disabled={!eventsLoaded} className="text-xs">
            <List className="h-3 w-3 mr-1" />
            Events
          </TabsTrigger>
          <TabsTrigger value="event-details" disabled={!eventsLoaded} className="text-xs">
            <Target className="h-3 w-3 mr-1" />
            Details
          </TabsTrigger>
          <TabsTrigger value="quality" disabled={!eventsLoaded} className="text-xs">
            <TrendingUp className="h-3 w-3 mr-1" />
            Quality
          </TabsTrigger>
          <TabsTrigger value="gutenberg-richter" disabled={!eventsLoaded} className="text-xs">
            <Activity className="h-3 w-3 mr-1" />
            G-R
          </TabsTrigger>
          <TabsTrigger value="completeness" disabled={!eventsLoaded} className="text-xs">
            <BarChart3 className="h-3 w-3 mr-1" />
            Mc
          </TabsTrigger>
          <TabsTrigger value="temporal" disabled={!eventsLoaded} className="text-xs">
            <Clock className="h-3 w-3 mr-1" />
            Temporal
          </TabsTrigger>
          <TabsTrigger value="moment" disabled={!eventsLoaded} className="text-xs">
            <Zap className="h-3 w-3 mr-1" />
            Moment
          </TabsTrigger>
          <TabsTrigger value="mfd" disabled={!eventsLoaded} className="text-xs">
            <BarChart3 className="h-3 w-3 mr-1" />
            MFD
          </TabsTrigger>
        </TabsList>

        {/* Unified Map Tab */}
        <TabsContent value="map" className="space-y-4">
          {/* Filters sidebar (fixed width) beside the map; on desktop both cards share one
              height, the filter list scrolling inside its card, so their edges line up. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
            {/* Filters Sidebar */}
            <Card className={`flex flex-col overflow-hidden ${MAP_TAB_DESKTOP_HEIGHT}`}>
              <CardHeader className="flex-shrink-0 space-y-0.5 border-b px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    Filters
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleResetFilters}
                    aria-label="Reset filters"
                    title="Reset filters"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <CardDescription className="text-xs tabular-nums">
                  {filteredEarthquakes.length.toLocaleString()} of {events.length.toLocaleString()} events
                </CardDescription>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                {/* Magnitude Range: a thumb for each bound, named by the visible label
                    ("Minimum Magnitude" / "Maximum Magnitude"), and exact inputs. */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label id={FILTER_LABEL_IDS.magnitude} className="text-xs font-medium">Magnitude</Label>
                    <TechnicalTermTooltip term="magnitude" />
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      {describeRange(magnitudeRange, MAGNITUDE_SLIDER, value => value.toFixed(1), '')}
                    </span>
                  </div>
                  <Slider
                    aria-labelledby={FILTER_LABEL_IDS.magnitude}
                    getAriaValueText={(value, index) => boundValueText(value, index, MAGNITUDE_SLIDER, `M ${value.toFixed(1)}`)}
                    min={MAGNITUDE_SLIDER[0]}
                    max={MAGNITUDE_SLIDER[1]}
                    step={0.1}
                    value={magnitudeRange}
                    onValueChange={setMagnitudeRange}
                    className="w-full"
                  />
                  <NumericRangeInputs
                    label="magnitude"
                    value={magnitudeRange}
                    min={MAGNITUDE_SLIDER[0]}
                    max={MAGNITUDE_SLIDER[1]}
                    step={0.1}
                    onValueChange={setMagnitudeRange}
                  />
                </div>

                {/* Depth Range */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label id={FILTER_LABEL_IDS.depth} className="text-xs font-medium">Depth (km)</Label>
                    <TechnicalTermTooltip term="depth" />
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      {describeRange(depthRange, DEPTH_SLIDER, value => String(value), ' km')}
                    </span>
                  </div>
                  <Slider
                    aria-labelledby={FILTER_LABEL_IDS.depth}
                    getAriaValueText={(value, index) => boundValueText(value, index, DEPTH_SLIDER, `${value} km`)}
                    min={DEPTH_SLIDER[0]}
                    max={DEPTH_SLIDER[1]}
                    step={5}
                    value={depthRange}
                    onValueChange={setDepthRange}
                    className="w-full"
                  />
                  <NumericRangeInputs
                    label="depth"
                    unit="km"
                    value={depthRange}
                    min={DEPTH_SLIDER[0]}
                    max={DEPTH_SLIDER[1]}
                    step={5}
                    onValueChange={setDepthRange}
                  />
                  {(depthRange[0] > DEPTH_SLIDER[0] || depthRange[1] < DEPTH_SLIDER[1]) && (
                    <p className="text-xs text-muted-foreground">Events of unknown depth are excluded while a depth range is set.</p>
                  )}
                </div>

                {/* Time Filter */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label id={FILTER_LABEL_IDS.time} className="text-xs font-medium">Time Period</Label>
                    <InfoTooltip content="Limits events to a relative time window based on origin time." />
                  </div>
                  <Select value={timeFilter} onValueChange={setTimeFilter}>
                    <SelectTrigger aria-labelledby={FILTER_LABEL_IDS.time} className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="week">Last Week</SelectItem>
                      <SelectItem value="month">Last Month</SelectItem>
                      <SelectItem value="year">Last Year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Minimum quality score */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label id={FILTER_LABEL_IDS.quality} className="text-xs font-medium">Minimum quality (Q)</Label>
                    <InfoTooltip content="Keeps events whose quality score Q (0-100) is at least this value: the score stored with the event, or one computed from its fields for events stored before scores were saved. The paper's guidance is to filter (e.g. Q ≥ 50) before statistical analysis." />
                    <span className="ml-auto text-right text-xs tabular-nums text-muted-foreground">
                      {qualityRange[0] > QUALITY_SLIDER[0]
                        ? `Q ≥ ${qualityRange[0]} (grade ${scoreToGrade(qualityRange[0])} or better)`
                        : 'any'}
                    </span>
                  </div>
                  <Slider
                    aria-labelledby={FILTER_LABEL_IDS.quality}
                    getAriaValueText={value => value > QUALITY_SLIDER[0]
                      ? `Q ${value} or higher, grade ${scoreToGrade(value)} or better`
                      : `Q ${value}, any quality`}
                    min={QUALITY_SLIDER[0]}
                    max={QUALITY_SLIDER[1]}
                    step={5}
                    value={qualityRange}
                    onValueChange={setQualityRange}
                    className="w-full"
                  />
                </div>

                {/* Maximum azimuthal gap */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label id={FILTER_LABEL_IDS.gap} className="text-xs font-medium">Maximum azimuthal gap (°)</Label>
                    <InfoTooltip content="Keeps events whose largest azimuthal gap between recording stations is at most this value. Gaps above 180° mean the network did not surround the event, so its location is poorly constrained." />
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      {gapRange[0] < GAP_SLIDER[1] ? `≤ ${gapRange[0]}°` : 'any'}
                    </span>
                  </div>
                  <Slider
                    aria-labelledby={FILTER_LABEL_IDS.gap}
                    getAriaValueText={value => value < GAP_SLIDER[1] ? `${value}° or less` : `${value}°, any gap`}
                    min={GAP_SLIDER[0]}
                    max={GAP_SLIDER[1]}
                    step={10}
                    value={gapRange}
                    onValueChange={setGapRange}
                    className="w-full"
                  />
                  {gapRange[0] < GAP_SLIDER[1] && (
                    <p className="text-xs text-muted-foreground">Events without a reported azimuthal gap are excluded while a maximum is set.</p>
                  )}
                </div>

                {/* Magnitude types */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs font-medium">Magnitude types ({selectedMagnitudeTypes.length} selected)</Label>
                    <InfoTooltip content="Analyse one magnitude type at a time: scales such as ML, mb and Mw saturate differently, so pooling them biases b and Mc. When they cannot be converted to one scale, fit each type separately. None ticked keeps every type." />
                  </div>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto border rounded-md p-2">
                    {availableMagnitudeTypes.map(({ type, count }) => (
                      <div key={type || '(none)'} className="flex items-center space-x-2">
                        <Checkbox
                          id={`magnitude-type-${encodeURIComponent(type) || 'none'}`}
                          // Named by its label (a Radix checkbox is a button: name it explicitly).
                          aria-labelledby={`magnitude-type-${encodeURIComponent(type) || 'none'}-label`}
                          checked={selectedMagnitudeTypes.includes(type)}
                          onCheckedChange={() => handleMagnitudeTypeToggle(type)}
                        />
                        <label
                          id={`magnitude-type-${encodeURIComponent(type) || 'none'}-label`}
                          htmlFor={`magnitude-type-${encodeURIComponent(type) || 'none'}`}
                          className="text-xs cursor-pointer flex-1"
                        >
                          <span className="font-mono">{type || 'No type stated'}</span>{' '}
                          <span className="text-muted-foreground">({count.toLocaleString()})</span>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Agency-flagged records */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="include-agency-flagged"
                      aria-labelledby="include-agency-flagged-label"
                      checked={includeFlagged}
                      disabled={flaggedCount === 0}
                      onCheckedChange={checked => startTransition(() => setIncludeFlagged(checked === true))}
                    />
                    <label id="include-agency-flagged-label" htmlFor="include-agency-flagged" className="text-xs cursor-pointer flex-1">
                      Include agency-flagged records ({flaggedCount.toLocaleString()})
                    </label>
                    <InfoTooltip content="Records the source agency typed duplicate, not existing or not locatable: a second record of an earthquake catalogued under another id, a false event, or an event that could not be located. They are excluded by default because they would count phantom or duplicate earthquakes." />
                  </div>
                  {flaggedCount > 0 && !includeFlagged && (
                    <p className="text-xs text-muted-foreground" role="note">
                      {flaggedCount.toLocaleString()} record{flaggedCount === 1 ? '' : 's'} the source agency flagged as duplicate, not existing or not locatable {flaggedCount === 1 ? 'is' : 'are'} excluded from the map, charts and analyses.
                    </p>
                  )}
                </div>

                {/* Region Filter */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs font-medium">Regions ({selectedRegions.length} selected)</Label>
                    <InfoTooltip content="Region names derived from event metadata or location lookup." />
                  </div>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto border rounded-md p-2">
                    {availableRegions.slice(0, 10).map(region => (
                      <div key={region} className="flex items-center space-x-2">
                        <Checkbox
                          // Encoded: region names contain spaces, which are not valid in an id.
                          id={`region-${encodeURIComponent(region)}`}
                          aria-labelledby={`region-${encodeURIComponent(region)}-label`}
                          checked={selectedRegions.includes(region)}
                          onCheckedChange={() => handleRegionToggle(region)}
                        />
                        <label
                          id={`region-${encodeURIComponent(region)}-label`}
                          htmlFor={`region-${encodeURIComponent(region)}`}
                          className="text-xs cursor-pointer flex-1"
                        >
                          {region}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Catalogue Filter - only show when "All Catalogues" is selected */}
                {selectedCatalogue === 'all' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs font-medium">Catalogues ({selectedCataloguesFilter.length} selected)</Label>
                      <InfoTooltip content="Filter events to a subset of catalogues when viewing all." />
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto border rounded-md p-2">
                      {availableCatalogues.map(catalogue => (
                        <div key={catalogue} className="flex items-center space-x-2">
                          <Checkbox
                            id={`catalogue-${catalogue}`}
                            checked={selectedCataloguesFilter.includes(catalogue)}
                            onCheckedChange={() => handleCatalogueToggle(catalogue)}
                          />
                          <label
                            htmlFor={`catalogue-${catalogue}`}
                            className="text-xs cursor-pointer flex-1"
                          >
                            {catalogue}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedCatalogue !== 'all' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs font-medium">Catalogue Filter</Label>
                      <InfoTooltip content="Shows the currently selected catalogue." />
                    </div>
                    <p className="text-xs text-muted-foreground p-2 border rounded-md bg-muted/50">
                      Showing events from: <strong>{catalogues.find(c => c.id === selectedCatalogue)?.name || 'Selected catalogue'}</strong>
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Map View: the card is the map (no second title), filling it to its rounded
                edge; colour mode, overlays and detail live in the map's Style panel. On
                phones the map comes first. */}
            <Card className="order-first overflow-hidden lg:order-none">
              <UnifiedEarthquakeMap
                key={`map-${selectedCatalogue}`}
                earthquakes={filteredEarthquakes as any}
                showFocalMechanisms={true}
                showFaultLines={true}
                className={MAP_TAB_MAP_HEIGHT}
              />
            </Card>
          </div>
        </TabsContent>

        {/* Charts Tab */}
        <TabsContent value="charts" className="space-y-4">
          {filteredCatalogueCount > 1 && <PooledRecordsNote count={filteredCatalogueCount} />}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Magnitude Distribution</CardTitle>
                  <TechnicalTermTooltip term="magnitudeFrequencyDistribution" />
                </div>
                <CardDescription className="text-xs">Number of events by magnitude range</CardDescription>
                <AxisLegendHints
                  axes="X: magnitude range bins (open-ended below M2.0 and above M5.0). Y: event count."
                  legend="Color indicates relative magnitude bin; every filtered event falls in exactly one bin."
                />
              </CardHeader>
              <CardContent>
                <MagnitudeDistributionChart data={magnitudeDistribution} />
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Depth Distribution</CardTitle>
                  <TechnicalTermTooltip term="depth" />
                </div>
                <CardDescription className="text-xs">Number of events by depth range</CardDescription>
                <AxisLegendHints
                  axes="X: depth range (km). Y: event count."
                  legend="Bins split at 70 and 300 km, the shallow, intermediate and deep-focus boundaries. The first bin includes events above sea level (negative depths); events without a depth are not counted."
                />
              </CardHeader>
              <CardContent>
                <DepthDistributionChart data={depthDistribution} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Distribution Tab */}
        <TabsContent value="distribution" className="space-y-4">
          {filteredCatalogueCount > 1 && <PooledRecordsNote count={filteredCatalogueCount} />}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Top Regions</CardTitle>
                  <InfoTooltip content="Regions derived from event metadata or geocoding." />
                </div>
                <CardDescription className="text-xs">Events by region (top 10)</CardDescription>
                <AxisLegendHints
                  axes="X: event count. Y: region name."
                  legend="Only the ten largest regions are drawn; tooltip percentages are shares of all filtered events, not of the ten shown."
                />
              </CardHeader>
              <CardContent>
                <RegionDistributionChart data={regionDistribution} total={filteredEarthquakes.length} />
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Catalogue Distribution</CardTitle>
                  <InfoTooltip content="Event counts grouped by catalogue source." />
                </div>
                <CardDescription className="text-xs">Events by catalogue</CardDescription>
                <AxisLegendHints
                  axes="Slice size shows event count by catalogue."
                  legend="Labels show percent share of events."
                />
              </CardHeader>
              <CardContent>
                <CatalogueDistributionChart data={catalogueDistribution} />
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Magnitude vs Depth</CardTitle>
                  <InfoTooltip content="Scatter plot of event magnitude against hypocentral depth." />
                </div>
                <CardDescription className="text-xs">
                  Scatter plot showing relationship between magnitude and depth
                </CardDescription>
                <AxisLegendHints
                  axes="X: magnitude. Y: depth in km (inverted)."
                  legend="Points represent events."
                />
              </CardHeader>
              <CardContent>
                <MagnitudeDepthScatter data={filteredEarthquakes} height={350} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="space-y-4">
          {filteredCatalogueCount > 1 && <PooledRecordsNote count={filteredCatalogueCount} />}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Earthquake Timeline</CardTitle>
              <CardDescription className="text-xs">
                Number of events over time
                {timeSeriesData.length > 0 && (
                  <span className="ml-2">({timeSeriesData.length} data points)</span>
                )}
                {timelineDaysPerBin > 1 && (
                  <span className="ml-2 text-amber-700 dark:text-amber-400">({timelineDaysPerBin} days per point)</span>
                )}
              </CardDescription>
              <AxisLegendHints
                axes="X: date (UTC). Y: event count."
                legend={`Each point shows totals over ${timelineDaysPerBin} ${timelineDaysPerBin === 1 ? 'day' : 'days'}.` +
                  (timelinePartialCount > 0 && analysisPeriod
                    ? ` ${timelinePartialCount === 1 ? 'A point' : 'Points'} the analysed period covers only in part ${timelinePartialCount === 1 ? 'is' : 'are'} scaled to ${timelineDaysPerBin} days and drawn dashed with a hollow marker; the tooltip gives the raw count and the days covered.`
                    : timelinePartialDays != null
                      ? ` The last point covers only ${timelinePartialDays} ${timelinePartialDays === 1 ? 'day' : 'days'} up to the last event and is drawn dashed with a hollow marker at its raw count: without a known catalogue period (a time filter, or the catalogue's declared time period) its coverage cannot be measured, so it is not scaled and may understate the rate.`
                      : '')}
              />
            </CardHeader>
            <CardContent>
              <EventTimelineChart data={timeSeriesData} seriesName={timelineSeriesName} daysPerBin={timelineDaysPerBin}
                partialBins={analysisPeriod ? 'scale' : 'mark'} height={400} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Event List Tab */}
        <TabsContent value="event-list" className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Event List</CardTitle>
              <CardDescription className="text-xs">
                Sortable table of all events in the selected catalogue. Click column headers to sort.
                {displayEvents.length > 100 && (
                  <span className="ml-2 text-blue-700 dark:text-blue-400">(Virtual scrolling enabled for {displayEvents.length.toLocaleString()} events)</span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {activeTab === 'event-list' && displayEvents.length > 0 ? (
                <EventTable
                  events={displayEvents.map(e => ({
                    id: e.id,
                    time: e.time,
                    latitude: e.latitude,
                    longitude: e.longitude,
                    depth: e.depth,
                    magnitude: e.magnitude,
                    magnitude_type: e.magnitude_type || null,
                    location_name: e.region || e.location_name || null,
                    event_type: e.event_type || null,
                    azimuthal_gap: e.azimuthal_gap ?? null,
                    used_station_count: e.used_station_count ?? null,
                    public_id: e.event_public_id || null,
                  }))}
                  onEventClick={(event) => {
                    const fullEvent = displayEvents.find(e => e.id === event.id);
                    if (fullEvent) {
                      setSelectedEvent(fullEvent);
                      handleTabChange('event-details');
                    }
                  }}
                />
              ) : (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  No events to display
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Event Details Tab */}
        <TabsContent value="event-details" className="space-y-4">
          {selectedEvent ? (
            <>
              {/* Event Selector */}
              <Card>
                <CardHeader>
                  <CardTitle id="analytics-event-select-label">Event to inspect</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select
                    value={selectedEvent.id}
                    onValueChange={(id) => {
                      const event = events.find(e => e.id === id);
                      if (event) setSelectedEvent(event);
                    }}
                  >
                    <SelectTrigger aria-labelledby="analytics-event-select-label" className="min-w-0 text-left [&>span]:min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-w-[calc(100vw-2rem)]">
                      {/* Only show first 100 events in dropdown to prevent performance issues */}
                      {events.slice(0, 100).filter((event) => event.id && event.id !== '').map((event) => (
                        <SelectItem key={event.id} value={event.id}>
                          M{event.magnitude.toFixed(1)} - {formatOriginTime(event.time)} - {event.region || 'Unknown'}
                        </SelectItem>
                      ))}
                      {events.length > 100 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground text-center">
                          ... and {(events.length - 100).toLocaleString()} more events (use Events tab to browse all)
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {detailsLoading && <p role="status" className="text-sm text-muted-foreground">Loading event details...</p>}
              {detailsError && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{detailsError}</p>}
              {/* Event Analysis Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <QualityScoreCard score={calculateQualityScore(metricsFromEvent(detailedEvent))} />
                <UncertaintyVisualization data={detailedEvent!} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {parseFocalMechanism(detailedEvent?.focal_mechanisms, detailedEvent?.preferred_focal_mechanism_id) && (
                  <FocalMechanismCard
                    mechanism={parseFocalMechanism(detailedEvent?.focal_mechanisms, detailedEvent?.preferred_focal_mechanism_id)!}
                  />
                )}

                {/* picks/arrivals are stripped by the summary projection: detail record only. */}
                {parseStationData(eventDetails?.picks, eventDetails?.arrivals, selectedEvent.latitude, selectedEvent.longitude, {
                  usedStationCount: eventDetails?.used_station_count ?? selectedEvent.used_station_count,
                  azimuthalGap: eventDetails?.azimuthal_gap ?? selectedEvent.azimuthal_gap,
                }) && (
                  <StationCoverageCard
                    coverage={parseStationData(eventDetails?.picks, eventDetails?.arrivals, selectedEvent.latitude, selectedEvent.longitude, {
                      usedStationCount: eventDetails?.used_station_count ?? selectedEvent.used_station_count,
                      azimuthalGap: eventDetails?.azimuthal_gap ?? selectedEvent.azimuthal_gap,
                    })!}
                  />
                )}
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No event selected
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Quality Analysis Tab */}
        <TabsContent value="quality" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Catalogue Quality Distribution</CardTitle>
                <TechnicalTermTooltip term="qualityGrade" />
              </div>
              <CardDescription>
                Distribution of quality grades across all events in the catalogue
              </CardDescription>
            </CardHeader>
            <CardContent>
              {statistics && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {(['A+', 'A', 'B+', 'B', 'C', 'D', 'F'] as const).map(grade => (
                      <div key={grade} className="text-center p-4 border rounded-lg">
                        <div className="text-3xl font-bold">{(statistics.gradeDistribution[grade] || 0).toLocaleString()}</div>
                        <div className="text-sm text-muted-foreground">Grade {grade}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {((((statistics.gradeDistribution[grade] || 0) / statistics.totalEvents) * 100).toFixed(1))}%
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t">
                    <h3 className="font-semibold mb-2">Data Completeness</h3>
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <div className="flex items-center gap-1.5">
                            <span>Events with Uncertainty Data</span>
                            <TechnicalTermTooltip term="uncertainty" />
                          </div>
                          <span>{statistics.percentageWithUncertainty}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${statistics.percentageWithUncertainty}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <div className="flex items-center gap-1.5">
                            <span>Events with Focal Mechanisms</span>
                            <TechnicalTermTooltip term="focalMechanism" />
                          </div>
                          <span>{statistics.percentageWithFocalMechanism}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className="bg-green-500 h-2 rounded-full"
                            style={{ width: `${statistics.percentageWithFocalMechanism}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <div className="flex items-center gap-1.5">
                            <span>Events with Station Data</span>
                            <InfoTooltip content="Events with a reported count of stations used in the solution." />
                          </div>
                          <span>{statistics.percentageWithStationData}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className="bg-purple-500 h-2 rounded-full"
                            style={{ width: `${statistics.percentageWithStationData}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Gutenberg-Richter Tab */}
        <TabsContent value="gutenberg-richter" className="space-y-4">
          <Card className="border-0 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-violet-500/10 to-purple-500/10 rounded-t-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-500/20 rounded-lg">
                  <Activity className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle>Gutenberg-Richter Analysis</CardTitle>
                    <InfoTooltip content="Relates earthquake frequency to magnitude using a log-linear model." />
                  </div>
                  <CardDescription>
                    Frequency-magnitude distribution following log₁₀(N) = a - bM relationship
                  </CardDescription>
                  <FilterScopeNote
                    analysed={fitEarthquakes.length}
                    total={events.length}
                    filters={describeFilters(false)}
                    detail={[
                      magnitudeCutoff != null
                        ? `Fitted above the magnitude filter's lower bound, M ≥ ${magnitudeCutoff.toFixed(1)}, used as the cut-off.`
                        : '',
                      magnitudeCeiling != null
                        ? `The magnitude filter's upper bound (M ≤ ${magnitudeCeiling.toFixed(1)}) is not applied: the maximum-likelihood b-value needs the distribution's upper tail.`
                        : '',
                    ].filter(Boolean).join(' ') || undefined}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {pooledCatalogueCount('gutenberg-richter') > 1 ? (
                <PooledCataloguesNotice count={pooledCatalogueCount('gutenberg-richter')} />
              ) : (
                <div className="space-y-6">
                  {magnitudeCutoff == null ? (
                    <McSettings method={mcMethod} onMethodChange={setMcMethod} correction={maxcCorrection} onCorrectionChange={setMaxcCorrection}
                      usedMaxc={grAnalysis?.mcSource === 'MAXC'} />
                  ) : (
                    <p role="note" className="text-xs text-muted-foreground">
                      The Mc settings do not apply while the magnitude filter&apos;s lower bound, M ≥ {magnitudeCutoff.toFixed(1)}, is the fit&apos;s cut-off.
                    </p>
                  )}
                  {grAnalysis ? (
                    <div className="space-y-6">
                      <MixedScaleWarning summary={fitMagnitudeTypes} />
                      {/* Summary Cards with professional styling */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <Card className="bg-gradient-to-br from-violet-50 to-violet-100/50 dark:from-violet-950/50 dark:to-violet-900/30 border-violet-200 dark:border-violet-800">
                          <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                              <CardTitle as="h3" className="text-sm font-medium text-violet-700 dark:text-violet-300 flex items-center gap-2">
                                <span className="w-2 h-2 bg-violet-500 rounded-full"></span>
                                b-value
                              </CardTitle>
                              <TechnicalTermTooltip term="bValue" />
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="text-3xl font-bold text-violet-900 dark:text-violet-100 font-mono">
                              {grAnalysis.bValue.toFixed(3)}
                              {grAnalysis.bUncertainty != null && (
                                <span className="text-base font-normal text-muted-foreground"> ± {grAnalysis.bUncertainty.toFixed(3)}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge
                                variant={grAnalysis.bValue < 0.8 ? 'destructive' : grAnalysis.bValue > 1.2 ? 'secondary' : 'default'}
                                className="text-xs"
                              >
                                {grAnalysis.bValue < 0.8 ? 'Low' : grAnalysis.bValue > 1.2 ? 'High' : 'Normal'}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {grAnalysis.bValue < 0.8 ? 'Stress accumulation' : grAnalysis.bValue > 1.2 ? 'Heterogeneous' : 'Typical range'}
                              </span>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/50 dark:to-blue-900/30 border-blue-200 dark:border-blue-800">
                          <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                              <CardTitle as="h3" className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center gap-2">
                                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                                a-value
                              </CardTitle>
                              <TechnicalTermTooltip term="aValue" />
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="text-3xl font-bold text-blue-900 dark:text-blue-100 font-mono">
                              {grAnalysis.aValue.toFixed(2)}
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">Seismic productivity index</p>
                          </CardContent>
                        </Card>

                        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/50 dark:to-emerald-900/30 border-emerald-200 dark:border-emerald-800">
                          <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                              <CardTitle as="h3" className="text-sm font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                                <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                                R² Goodness of Fit
                              </CardTitle>
                              <TechnicalTermTooltip term="rSquared" />
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="text-3xl font-bold text-emerald-900 dark:text-emerald-100 font-mono">
                              {grAnalysis.rSquared.toFixed(3)}
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge
                                variant={grAnalysis.rSquared > 0.95 ? 'default' : grAnalysis.rSquared > 0.90 ? 'secondary' : 'outline'}
                                className="text-xs"
                              >
                                {grAnalysis.rSquared > 0.95 ? 'Excellent' : grAnalysis.rSquared > 0.90 ? 'Good' : 'Fair'}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/50 dark:to-amber-900/30 border-amber-200 dark:border-amber-800">
                          <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                              <CardTitle as="h3" className="text-sm font-medium text-amber-700 dark:text-amber-300 flex items-center gap-2">
                                <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                                {magnitudeCutoff != null ? 'Magnitude cut-off' : 'Mc (Completeness)'}
                              </CardTitle>
                              <TechnicalTermTooltip term="completenessMagnitude" />
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="text-3xl font-bold text-amber-900 dark:text-amber-100 font-mono">
                              M{grAnalysis.completeness.toFixed(1)}
                              {magnitudeCutoff == null && (
                                <span className="text-base font-normal text-muted-foreground"> ± {ANALYSIS_BIN_WIDTH}</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              {magnitudeCutoff != null
                                ? 'Your cut-off from the magnitude filter, fitted as given; see the Mc tab for the estimated Mc'
                                : `Estimated by ${describeMcEstimate(grAnalysis)}; ± one bin width is a lower bound on its uncertainty`}
                            </p>
                          </CardContent>
                        </Card>
                      </div>

                      {/* G-R Plot with professional styling */}
                      <Card className="border border-border/50">
                        <CardHeader className="pb-2">
                          <div className="flex items-center gap-2">
                            <CardTitle as="h3" className="text-base">Frequency-Magnitude Relationship</CardTitle>
                            <TechnicalTermTooltip term="magnitudeFrequencyDistribution" />
                          </div>
                          <CardDescription>
                            log₁₀(N) = {grAnalysis.aValue.toFixed(2)} - {grAnalysis.bValue.toFixed(3)} × M
                          </CardDescription>
                          <AxisLegendHints
                            axes="X: magnitude. Y: log10 cumulative event count."
                            legend="Points are observed data; line is G-R fit; dashed line marks Mc."
                          />
                        </CardHeader>
                        <CardContent>
                          <GutenbergRichterChart result={grAnalysis} height={420} />
                        </CardContent>
                      </Card>

                      {/* Interpretation panel */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-900/50 dark:to-slate-800/30 rounded-lg border">
                          <h3 className="font-semibold mb-3 flex items-center gap-2">
                            <Info className="h-4 w-4 text-blue-500" />
                            Parameter Interpretation
                          </h3>
                          <ul className="space-y-2 text-sm">
                            <li className="flex items-start gap-2">
                              <span className="w-1.5 h-1.5 bg-violet-500 rounded-full mt-2"></span>
                              <span><strong>b-value ≈ 1.0:</strong> Global average for tectonic earthquakes</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="w-1.5 h-1.5 bg-violet-500 rounded-full mt-2"></span>
                              <span><strong>b &lt; 0.8:</strong> May indicate high stress or asperities</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="w-1.5 h-1.5 bg-violet-500 rounded-full mt-2"></span>
                              <span><strong>b &gt; 1.2:</strong> Often seen in volcanic or geothermal areas</span>
                            </li>
                          </ul>
                        </div>
                        <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-900/50 dark:to-slate-800/30 rounded-lg border">
                          <h3 className="font-semibold mb-3 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-emerald-500" />
                            Analysis Summary
                          </h3>
                          <ul className="space-y-2 text-sm">
                            <li className="flex items-start gap-2">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2"></span>
                              <span>Events considered: <strong>{fitEarthquakes.length.toLocaleString()}</strong></span>
                            </li>
                            {grAnalysis.eventsAboveMc != null && (
                              <li className="flex items-start gap-2">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2"></span>
                                <span>
                                  Events at or above {magnitudeCutoff != null ? 'the cut-off' : 'Mc'} (the N behind b and σ_b):{' '}
                                  <strong>{grAnalysis.eventsAboveMc.toLocaleString()}</strong>
                                </span>
                              </li>
                            )}
                            <li className="flex items-start gap-2">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2"></span>
                              <span>Fit quality: <strong>{grAnalysis.rSquared > 0.95 ? 'Excellent' : grAnalysis.rSquared > 0.90 ? 'Good' : 'Fair'}</strong> (R² = {grAnalysis.rSquared.toFixed(3)})</span>
                            </li>
                            {grAnalysis.binningCorrection != null && (
                              <li className="flex items-start gap-2">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2"></span>
                                <span>Binning correction: <strong>{describeBinningCorrection(grAnalysis.magnitudeResolution, grAnalysis.binningCorrection)}</strong></span>
                              </li>
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-16 text-muted-foreground">
                      {grWorkerResult.error ? (
                        <p role="alert">{grWorkerResult.error}</p>
                      ) : fitEarthquakes.length === 0 ? (
                        <div className="flex flex-col items-center gap-3">
                          <Activity className="h-12 w-12 opacity-30" />
                          <span>No events available</span>
                        </div>
                      ) : fitEarthquakes.length < (magnitudeCutoff == null ? 50 : 10) ? (
                        <div className="flex flex-col items-center gap-3">
                          <Activity className="h-12 w-12 opacity-30" />
                          <span>
                            {magnitudeCutoff == null
                              ? 'Insufficient data to estimate Mc (need at least 50 events, or raise the magnitude lower bound to fit above an explicit cut-off)'
                              : 'Insufficient data (need at least 10 events)'}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-3">
                          <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
                          <span className="font-medium">Computing Gutenberg-Richter analysis...</span>
                          <span className="text-xs">Fitting frequency-magnitude distribution</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Completeness Tab */}
        <TabsContent value="completeness" className="space-y-4">
          <Card className="border-0 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-cyan-500/10 to-teal-500/10 rounded-t-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/20 rounded-lg">
                  <Target className="h-5 w-5 text-cyan-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle>Completeness Magnitude (Mc)</CardTitle>
                    <TechnicalTermTooltip term="completenessMagnitude" />
                  </div>
                  <CardDescription>
                    Threshold magnitude above which the catalogue records all events
                  </CardDescription>
                  <FilterScopeNote
                    analysed={fitEarthquakes.length}
                    total={events.length}
                    filters={describeFilters(false)}
                    detail={magnitudeCutoff != null || magnitudeCeiling != null
                      ? `The magnitude filter (${describeRange(magnitudeRange, MAGNITUDE_SLIDER, value => value.toFixed(1), '')}) is not applied: Mc estimation needs the untruncated distribution.`
                      : undefined}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {pooledCatalogueCount('completeness') > 1 ? (
                <PooledCataloguesNotice count={pooledCatalogueCount('completeness')} />
              ) : (
                <div className="space-y-6">
                  <McSettings method={mcMethod} onMethodChange={setMcMethod} correction={maxcCorrection} onCorrectionChange={setMaxcCorrection}
                    usedMaxc={completeness?.method === 'MAXC'} />
                  {completeness ? (
                    <div className="space-y-6">
                      <MixedScaleWarning summary={fitMagnitudeTypes} />
                      {magnitudeCutoff != null && (
                        <p role="note" className="text-sm text-muted-foreground">
                          {magnitudeCutoff < completeness.mc
                            ? `Your magnitude cut-off (M ≥ ${magnitudeCutoff.toFixed(1)}) is below this Mc, so the G-R fit above it includes incomplete magnitudes and its b-value is biased low.`
                            : `Your magnitude cut-off (M ≥ ${magnitudeCutoff.toFixed(1)}) is at or above this Mc.`}
                        </p>
                      )}
                      {/* Summary Cards with professional styling */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="bg-gradient-to-br from-cyan-50 to-cyan-100/50 dark:from-cyan-950/50 dark:to-cyan-900/30 border-cyan-200 dark:border-cyan-800">
                          <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                              <CardTitle as="h3" className="text-sm font-medium text-cyan-700 dark:text-cyan-300 flex items-center gap-2">
                                <span className="w-2 h-2 bg-cyan-500 rounded-full"></span>
                                Completeness Magnitude
                              </CardTitle>
                              <TechnicalTermTooltip term="completenessMagnitude" />
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="text-4xl font-bold text-cyan-900 dark:text-cyan-100 font-mono">
                              M{completeness.mc.toFixed(1)}
                              <span className="text-base font-normal text-muted-foreground"> ± {completeness.binWidth ?? ANALYSIS_BIN_WIDTH}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              Estimated by {describeMcEstimate(completeness)}; ± one bin width is a lower bound on its uncertainty
                            </p>
                          </CardContent>
                        </Card>

                        <Card className="bg-gradient-to-br from-teal-50 to-teal-100/50 dark:from-teal-950/50 dark:to-teal-900/30 border-teal-200 dark:border-teal-800">
                          <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                              <CardTitle as="h3" className="text-sm font-medium text-teal-700 dark:text-teal-300 flex items-center gap-2">
                                <span className="w-2 h-2 bg-teal-500 rounded-full"></span>
                                Events at or above Mc
                              </CardTitle>
                              <InfoTooltip content="Share of the analysed events at or above Mc: the sample a b-value fit keeps. It is not a completeness score: events below Mc are set aside whether or not they are complete (MAXC + 0.2 alone sets aside about 37% of a perfectly complete b = 1 catalogue)." />
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="text-4xl font-bold text-teal-900 dark:text-teal-100 font-mono">
                              {(completeness.confidence * 100).toFixed(1)}%
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              {completeness.eventsAboveMc != null
                                ? `${completeness.eventsAboveMc.toLocaleString()} of ${fitEarthquakes.length.toLocaleString()} events: the sample kept for a b-value fit`
                                : 'Share of events kept for a b-value fit'}
                            </p>
                          </CardContent>
                        </Card>

                        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/50 dark:to-emerald-900/30 border-emerald-200 dark:border-emerald-800">
                          <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                              <CardTitle as="h3" className="text-sm font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                                <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                                Detection Method
                              </CardTitle>
                              <InfoTooltip content="Method that produced Mc: b-value stability (MBS), the goodness-of-fit test (GFT), or maximum curvature plus a correction (MAXC). Choose it in the Mc settings above." />
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
                              {completeness.method === 'GFT' ? `GFT (${completeness.gftLevel}%)` : completeness.method}
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              {describeMcMethodCard(completeness)}
                            </p>
                            {completeness.fallbackReason && (
                              <p role="note" className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                                {MC_METHOD_NAMES[completeness.requestedMethod as McMethod] ?? 'Another method'} requested: {completeness.fallbackReason}.
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      </div>

                      {/* Magnitude Distribution Chart */}
                      <Card className="border border-border/50">
                        <CardHeader className="pb-2">
                          <div className="flex items-center gap-2">
                            <CardTitle as="h3" className="text-base">Frequency-Magnitude Distribution</CardTitle>
                            <TechnicalTermTooltip term="magnitudeFrequencyDistribution" />
                          </div>
                          <CardDescription>
                            Events per magnitude bin, bins centred on multiples of {completeness.binWidth ?? ANALYSIS_BIN_WIDTH}; the tallest is the maximum-curvature peak
                          </CardDescription>
                          <AxisLegendHints
                            axes="X: bin centre magnitude. Y: event count."
                            legend="Bars above Mc are complete; dashed line marks Mc."
                          />
                        </CardHeader>
                        <CardContent>
                          <CompletenessChart distribution={completeness.magnitudeDistribution} mc={completeness.mc} binWidth={completeness.binWidth} height={420} />
                        </CardContent>
                      </Card>

                      {Array.isArray(completeness.mbsCurve) && (
                        <Card className="border border-border/50">
                          <CardHeader className="pb-2">
                            <CardTitle as="h3" className="text-base">b-value stability</CardTitle>
                            <CardDescription>
                              b above each cut-off Mi with its Shi &amp; Bolt (1982) uncertainty δb, and the mean b over Mi to Mi + 0.5
                              (Woessner &amp; Wiemer, 2005); MBS takes the lowest Mi where |b̄ − b| ≤ δb.
                            </CardDescription>
                            <AxisLegendHints
                              axes="X: cut-off magnitude Mi. Y: b-value."
                              legend="Points: b ± δb. Line: mean b over the next 0.5 units. Dashed line marks Mc. Cut-offs with fewer than 50 events above them are not shown."
                            />
                          </CardHeader>
                          <CardContent>
                            {completeness.mbsCurve.length > 0 ? (
                              <BValueStabilityChart curve={completeness.mbsCurve} mc={completeness.mc} height={300} />
                            ) : (
                              <p className="text-sm text-muted-foreground py-6 text-center">
                                No cut-off has at least 50 events in 3 populated bins above it.
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      {Array.isArray(completeness.gftCurve) && (
                        <Card className="border border-border/50">
                          <CardHeader className="pb-2">
                            <CardTitle as="h3" className="text-base">Goodness-of-Fit Test</CardTitle>
                            <CardDescription>
                              R = 100 − 100·Σ|Bᵢ − Sᵢ| / ΣBᵢ: how much of the observed cumulative counts Bᵢ above each
                              candidate cut-off a Gutenberg-Richter law fitted by maximum likelihood above it (Sᵢ) reproduces
                              (Wiemer &amp; Wyss, 2000)
                            </CardDescription>
                            <AxisLegendHints
                              axes="X: candidate cut-off (bin lower edge). Y: goodness of fit R in percent."
                              legend="Dashed lines mark the 95% and 90% levels; Mc is the lowest cut-off reaching 95%, else 90%. Candidates with fewer than 10 events or 3 populated bins above them are not tried."
                            />
                          </CardHeader>
                          <CardContent>
                            {completeness.gftCurve.length > 0 ? (
                              <GoodnessOfFitChart curve={completeness.gftCurve} mc={completeness.method === 'GFT' ? completeness.mc : null} height={300} />
                            ) : (
                              <p className="text-sm text-muted-foreground py-6 text-center">
                                No candidate cut-off has at least 10 events in 3 populated bins above it.
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      {/* Interpretation panel */}
                      <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-900/50 dark:to-slate-800/30 rounded-lg border">
                        <h3 className="font-semibold mb-3 flex items-center gap-2">
                          <Info className="h-4 w-4 text-cyan-500" />
                          Understanding Mc
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="mb-2"><strong>What is Mc?</strong></p>
                            <p className="text-muted-foreground">
                              The magnitude of completeness (Mc) is the lowest magnitude at which 100% of
                              earthquakes in a space-time volume are detected. Below Mc, network sensitivity
                              limitations cause some events to be missed.
                            </p>
                          </div>
                          <div>
                            <p className="mb-2"><strong>Why it matters</strong></p>
                            <ul className="space-y-1 text-muted-foreground">
                              <li>• Statistical analyses should use M ≥ Mc only</li>
                              <li>• Lower Mc indicates better network coverage</li>
                              <li>• Mc may vary spatially and temporally</li>
                              <li>• b-value stability (the default) takes the lowest cut-off whose b is within δb of the mean b over the next 0.5 units; the goodness-of-fit test, the lowest above which a Gutenberg-Richter law reproduces 95% (else 90%) of the counts; MAXC, the fullest bin plus a correction. Check any of them against the plots.</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-16 text-muted-foreground">
                      {completenessWorkerResult.error ? (
                        <p role="alert">{completenessWorkerResult.error}</p>
                      ) : fitEarthquakes.length === 0 ? (
                        <div className="flex flex-col items-center gap-3">
                          <Target className="h-12 w-12 opacity-30" />
                          <span>No events available</span>
                        </div>
                      ) : fitEarthquakes.length < 50 ? (
                        <div className="flex flex-col items-center gap-3">
                          <Target className="h-12 w-12 opacity-30" />
                          <span>Insufficient data (need at least 50 events)</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-3">
                          <Loader2 className="h-10 w-10 animate-spin text-cyan-500" />
                          <span className="font-medium">Computing completeness magnitude...</span>
                          <span className="text-xs">Analyzing frequency-magnitude distribution</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Temporal Tab */}
        <TabsContent value="temporal" className="space-y-4">
          <Card className="border-0 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 rounded-t-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Clock className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle>Temporal Analysis</CardTitle>
                  <CardDescription>
                    Time series evolution and seismicity cluster detection
                  </CardDescription>
                  <FilterScopeNote analysed={filteredEarthquakes.length} total={events.length} filters={describeFilters(true)} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {pooledCatalogueCount('temporal') > 1 ? (
                <PooledCataloguesNotice count={pooledCatalogueCount('temporal')} />
              ) : filteredEarthquakes.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <div className="flex flex-col items-center gap-3">
                    <Clock className="h-12 w-12 opacity-30" />
                    <span>No events available</span>
                  </div>
                </div>
              ) : temporalAnalysis || timeSeriesAnalysis ? (
                <div className="space-y-6">
                  {/* Summary Cards with professional styling */}
                  {temporalAnalysis ? (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/50 dark:to-blue-900/30 border-blue-200 dark:border-blue-800">
                        <CardHeader className="pb-2">
                          <CardTitle as="h3" className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            Time Span
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-bold text-blue-900 dark:text-blue-100 font-mono">
                            {temporalAnalysis.timeSpanDays.toFixed(0)}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            days ({(temporalAnalysis.timeSpanDays / 365.25).toFixed(1)} years)
                          </p>
                        </CardContent>
                      </Card>

                      <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 dark:from-indigo-950/50 dark:to-indigo-900/30 border-indigo-200 dark:border-indigo-800">
                        <CardHeader className="pb-2">
                          <CardTitle as="h3" className="text-sm font-medium text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" />
                            Daily Rate
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-bold text-indigo-900 dark:text-indigo-100 font-mono">
                            {temporalAnalysis.eventsPerDay.toFixed(2)}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">events per day, all analysed magnitudes</p>
                        </CardContent>
                      </Card>

                      <Card className="bg-gradient-to-br from-violet-50 to-violet-100/50 dark:from-violet-950/50 dark:to-violet-900/30 border-violet-200 dark:border-violet-800">
                        <CardHeader className="pb-2">
                          <CardTitle as="h3" className="text-sm font-medium text-violet-700 dark:text-violet-300 flex items-center gap-2">
                            <Activity className="h-4 w-4" />
                            Monthly Rate
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-bold text-violet-900 dark:text-violet-100 font-mono">
                            {temporalAnalysis.eventsPerMonth.toFixed(1)}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">events per month, all analysed magnitudes</p>
                        </CardContent>
                      </Card>

                      <Card className="bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-950/50 dark:to-orange-900/30 border-orange-200 dark:border-orange-800">
                        <CardHeader className="pb-2">
                          <CardTitle as="h3" className="text-sm font-medium text-orange-700 dark:text-orange-300 flex items-center gap-2">
                            <Zap className="h-4 w-4" />
                            Clusters
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-bold text-orange-900 dark:text-orange-100 font-mono">
                            {temporalAnalysis.clusters.length}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {temporalAnalysis.clusters.length === 0 ? 'No clusters' :
                              temporalAnalysis.clusters.length === 1 ? 'cluster detected' : 'clusters detected'}
                          </p>
                        </CardContent>
                      </Card>
                    </div>
                  ) : (
                    <SectionStatus error={temporalWorkerResult.error} pending="Computing rates and detecting clusters..." />
                  )}

                  {/* Time bins of the rate and release series (paper, sec:viz) */}
                  <div className="flex flex-wrap items-end gap-4 p-3 rounded-lg border bg-muted/30" role="group" aria-label="Time series settings">
                    <div className="w-full min-w-0 space-y-1 sm:w-auto">
                      <div className="flex items-center gap-1.5">
                        <Label id="analytics-time-bins-label" className="text-xs font-medium">Time bins</Label>
                        <InfoTooltip content="Bins of the seismicity-rate and cumulative-release series, in UTC: calendar days, ISO weeks (Monday to Sunday) or calendar months. Auto uses days for a span of up to 365 days and weeks beyond." />
                      </div>
                      <Select value={rateInterval} onValueChange={value => setRateInterval(value as RateIntervalOption)}>
                        <SelectTrigger aria-labelledby="analytics-time-bins-label" className="h-8 w-full text-xs sm:w-[260px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto (daily up to a year, else weekly)</SelectItem>
                          <SelectItem value="day">Day (UTC)</SelectItem>
                          <SelectItem value="week">Week (ISO, Monday to Sunday)</SelectItem>
                          <SelectItem value="month">Month (calendar, UTC)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {timeSeriesAnalysis && (
                      <p className="text-xs text-muted-foreground">
                        {timeSeriesAnalysis.rate.bins.length.toLocaleString()} bins of one {describeRateInterval(timeSeriesAnalysis.interval)},
                        {' '}{timeSeriesAnalysis.startDate} to {timeSeriesAnalysis.endDate}
                        {timeSeriesAnalysis.coverage === 'period'
                          ? ' (the analysed period)'
                          : ' (first to last event: no time filter or declared catalogue period)'}
                        {timeSeriesAnalysis.untimedEvents > 0 && `; ${timeSeriesAnalysis.untimedEvents.toLocaleString()} events without a valid origin time are not placed`}
                      </p>
                    )}
                  </div>

                  {/* Seismicity rate above Mc (paper, temporal pattern analysis) */}
                  <Card className="border border-border/50">
                    <CardHeader className="pb-2">
                      <CardTitle as="h3" className="text-base">Seismicity Rate</CardTitle>
                      <CardDescription>
                        {timeSeriesAnalysis ? describeRateSeries(timeSeriesAnalysis) : 'Events at or above Mc per time bin'}
                      </CardDescription>
                      {timeSeriesAnalysis?.rate.note && (
                        <p role="note" className="text-xs text-amber-700 dark:text-amber-400">
                          {timeSeriesAnalysis.rate.note}; the rate therefore also follows changes in detection.
                        </p>
                      )}
                      <AxisLegendHints
                        axes="X: bin start date (UTC). Y: events at or above the threshold in the bin."
                        legend={'Sudden rate changes often mark network upgrades, station outages or processing changes. ' +
                          (timeSeriesAnalysis?.coverage === 'period'
                            ? 'A first or last bin the analysed period covers only in part is scaled to a full bin and drawn dashed with a hollow marker; its tooltip gives the raw count and the days covered.'
                            : 'A first or last bin cut by the first or last event is drawn dashed with a hollow marker at its raw count, not scaled: without a time filter or the catalogue\'s declared time period its coverage cannot be measured, so the count may understate the rate.')}
                      />
                    </CardHeader>
                    <CardContent>
                      {timeSeriesAnalysis ? (
                        <EventTimelineChart
                          data={timeSeriesAnalysis.rate.bins}
                          daysPerBin={timeSeriesAnalysis.interval === 'day' ? 1 : timeSeriesAnalysis.interval === 'week' ? 7 : undefined}
                          seriesName={rateSeriesName(timeSeriesAnalysis)}
                          exportName="seismicity-rate"
                          ariaLabel="Seismicity rate"
                          partialBins={timeSeriesAnalysis.coverage === 'period' ? 'scale' : 'mark'}
                          height={360}
                        />
                      ) : (
                        <SectionStatus error={timeSeriesWorkerResult.error} pending="Binning the seismicity rate..." />
                      )}
                    </CardContent>
                  </Card>

                  {/* Cumulative event count */}
                  {temporalAnalysis && (
                    <Card className="border border-border/50">
                      <CardHeader className="pb-2">
                        <CardTitle as="h3" className="text-base">Cumulative Event Time Series</CardTitle>
                        <CardDescription>
                          Temporal evolution of seismicity showing cumulative events over time
                        </CardDescription>
                        <AxisLegendHints
                          axes="X: end of each time bin (UTC calendar day, or ISO week for catalogues spanning more than a year). Y: cumulative events up to that point."
                          legend={temporalAnalysis.untimedEvents > 0
                            ? `${temporalAnalysis.untimedEvents.toLocaleString()} events without a valid origin time are left out of the time series and rates.`
                            : undefined}
                        />
                      </CardHeader>
                      <CardContent>
                        <TemporalSeriesChart data={temporalAnalysis.timeSeries} binDays={temporalAnalysis.binDays ?? 1} height={420} />
                      </CardContent>
                    </Card>
                  )}

                  {/* Magnitude against time (paper, sec:viz) */}
                  <Card className="border border-border/50">
                    <CardHeader className="pb-2">
                      <CardTitle as="h3" className="text-base">Magnitude vs Time</CardTitle>
                      <CardDescription>
                        Magnitude of every analysed event against its origin time (UTC)
                      </CardDescription>
                      <AxisLegendHints
                        axes="X: origin time (UTC). Y: magnitude."
                        legend="Colour and size follow magnitude. The dashed line marks the seismicity-rate threshold (Mc or your cut-off). A step in the smallest magnitudes recorded over time marks a change in completeness."
                      />
                    </CardHeader>
                    <CardContent>
                      <MagnitudeTimeScatter
                        data={filteredEarthquakes}
                        threshold={timeSeriesAnalysis?.rate.threshold ?? null}
                        thresholdLabel={timeSeriesAnalysis?.rate.threshold != null
                          ? timeSeriesAnalysis.rate.thresholdSource === 'cutoff'
                            ? `Cut-off M ${timeSeriesAnalysis.rate.threshold.toFixed(1)}`
                            : `Mc = ${timeSeriesAnalysis.rate.threshold.toFixed(1)}`
                          : undefined}
                        height={360}
                      />
                    </CardContent>
                  </Card>

                  {/* Cumulative moment / energy release (paper, sec:viz; docs: energy release) */}
                  <Card className="border border-border/50">
                    <CardHeader className="pb-2">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <CardTitle as="h3" className="text-base">
                            {releaseQuantity === 'moment' ? 'Cumulative Seismic Moment Release' : 'Cumulative Radiated Energy Release'}
                          </CardTitle>
                          <CardDescription>
                            {releaseQuantity === 'moment'
                              ? 'M₀ = 10^(1.5·Mw + 9.1) N·m (Hanks & Kanamori, 1979), summed per time bin and accumulated'
                              : "E from log₁₀E = 1.5·M + 4.8 (E in joules; Gutenberg & Richter, 1956), summed per time bin and accumulated. For Mw this is Kanamori's (1977) E = M₀ / (2 × 10⁴), so the curve is the moment curve scaled by 5 × 10⁻⁵"}
                          </CardDescription>
                        </div>
                        <div className="w-full min-w-0 space-y-1 sm:w-auto">
                          <Label id="analytics-release-quantity-label" className="text-xs font-medium">Quantity</Label>
                          <Select value={releaseQuantity} onValueChange={value => setReleaseQuantity(value as 'moment' | 'energy')}>
                            <SelectTrigger aria-labelledby="analytics-release-quantity-label" className="h-8 w-full text-xs sm:w-[200px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="moment">Seismic moment (N·m)</SelectItem>
                              <SelectItem value="energy">Radiated energy (J)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {timeSeriesAnalysis && (
                        <p className="text-xs text-muted-foreground" role="note">
                          {describeReleaseEligibility(timeSeriesAnalysis.release)}
                        </p>
                      )}
                      <AxisLegendHints axes={`X: end of each time bin (UTC). Y: cumulative ${releaseQuantity === 'moment' ? 'seismic moment (N·m)' : 'radiated energy (J)'} up to that point.`} />
                    </CardHeader>
                    <CardContent>
                      {timeSeriesAnalysis ? (
                        timeSeriesAnalysis.release.usedCount > 0 ? (
                          <CumulativeReleaseChart data={timeSeriesAnalysis.release.bins} quantity={releaseQuantity} height={380} />
                        ) : (
                          <p className="text-sm text-muted-foreground py-6 text-center">
                            No Mw or ML magnitudes to release moment from (mb, Ms, Md and other stated scales have no moment relation here).
                          </p>
                        )
                      ) : (
                        <SectionStatus error={timeSeriesWorkerResult.error} pending="Summing moment release..." />
                      )}
                    </CardContent>
                  </Card>

                  {temporalAnalysis && (
                    <>
                      {/* Clusters - Gardner-Knopoff Declustering Results */}
                      {temporalAnalysis.clusters && temporalAnalysis.clusters.length > 0 && (
                        <Card className="border border-border/50">
                          <CardHeader className="pb-3">
                            <CardTitle as="h3" className="text-base flex items-center gap-2">
                              <Zap className="h-4 w-4 text-orange-500" />
                              Detected Seismicity Clusters
                              <Badge variant="outline" className="ml-2 text-xs font-normal">
                                Gardner-Knopoff Method
                              </Badge>
                            </CardTitle>
                            <CardDescription>
                              Mainshock-aftershock sequences identified using space-time windowing (Gardner & Knopoff, 1974; Uhrhammer, 1986)
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-4">
                              {temporalAnalysis.clusters.map((cluster: {
                                id: number;
                                startDate: string;
                                endDate: string;
                                eventCount: number;
                                maxMagnitude: number;
                                mainshock?: { id: number | string; time: string; magnitude: number; latitude: number; longitude: number; depth: number };
                                aftershockCount?: number;
                                foreshockCount?: number;
                                durationDays?: number;
                                spatialExtentKm?: number;
                                clusterType?: 'mainshock-aftershock' | 'swarm' | 'burst';
                                bValue?: number;
                              }, idx: number) => (
                                <div
                                  key={cluster.id ?? idx}
                                  className="p-4 bg-gradient-to-r from-orange-50/50 to-amber-50/50 dark:from-orange-950/30 dark:to-amber-950/30 rounded-lg border border-orange-200/50 dark:border-orange-800/50"
                                >
                                  {/* Header row */}
                                  <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                      <div className="p-2 bg-orange-500/20 rounded-lg">
                                        <span className="text-lg font-bold text-orange-600 dark:text-orange-400">#{idx + 1}</span>
                                      </div>
                                      <div>
                                        <div className="font-semibold flex items-center gap-2">
                                          Mainshock M{cluster.mainshock?.magnitude?.toFixed(1) ?? cluster.maxMagnitude.toFixed(1)}
                                          {cluster.clusterType && (
                                            <Badge
                                              variant={cluster.clusterType === 'swarm' ? 'secondary' : cluster.clusterType === 'burst' ? 'outline' : 'default'}
                                              className="text-xs"
                                            >
                                              {cluster.clusterType === 'mainshock-aftershock' ? 'Sequence' :
                                                cluster.clusterType === 'swarm' ? 'Swarm' : 'Burst'}
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                          <Calendar className="h-3 w-3" />
                                          {formatOriginTime(cluster.mainshock?.time ?? cluster.startDate)}
                                        </div>
                                      </div>
                                    </div>
                                    <Badge
                                      variant={cluster.maxMagnitude >= 5 ? 'destructive' : cluster.maxMagnitude >= 4 ? 'default' : 'secondary'}
                                      className="font-mono text-sm"
                                    >
                                      M{cluster.maxMagnitude.toFixed(1)}
                                    </Badge>
                                  </div>

                                  {/* Statistics grid */}
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 pt-3 border-t border-orange-200/50 dark:border-orange-700/50">
                                    <div className="text-center p-2 bg-background/50 rounded">
                                      <div className="font-mono font-bold text-lg">{cluster.eventCount}</div>
                                      <div className="text-xs text-muted-foreground">Total Events</div>
                                    </div>
                                    {cluster.aftershockCount !== undefined && (
                                      <div className="text-center p-2 bg-background/50 rounded">
                                        <div className="font-mono font-bold text-lg">{cluster.aftershockCount}</div>
                                        <div className="text-xs text-muted-foreground">Aftershocks</div>
                                      </div>
                                    )}
                                    {cluster.foreshockCount !== undefined && cluster.foreshockCount > 0 && (
                                      <div className="text-center p-2 bg-background/50 rounded">
                                        <div className="font-mono font-bold text-lg">{cluster.foreshockCount}</div>
                                        <div className="text-xs text-muted-foreground">Foreshocks</div>
                                      </div>
                                    )}
                                    {cluster.durationDays !== undefined && (
                                      <div className="text-center p-2 bg-background/50 rounded">
                                        <div className="font-mono font-bold text-lg">
                                          {cluster.durationDays < 1 ? `${(cluster.durationDays * 24).toFixed(1)}h` :
                                            cluster.durationDays.toFixed(1)}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          {cluster.durationDays < 1 ? 'Duration' : 'Days'}
                                        </div>
                                      </div>
                                    )}
                                    {cluster.spatialExtentKm !== undefined && cluster.spatialExtentKm > 0 && (
                                      <div className="text-center p-2 bg-background/50 rounded">
                                        <div className="font-mono font-bold text-lg">{cluster.spatialExtentKm.toFixed(1)}</div>
                                        <div className="text-xs text-muted-foreground">km Extent</div>
                                      </div>
                                    )}
                                    {cluster.bValue !== undefined && (
                                      <div className="text-center p-2 bg-background/50 rounded">
                                        <div className="font-mono font-bold text-lg">{cluster.bValue.toFixed(2)}</div>
                                        <div className="text-xs text-muted-foreground">b-value</div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Location info */}
                                  {cluster.mainshock?.latitude && cluster.mainshock?.longitude && (
                                    <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                                      <MapPin className="h-3 w-3" />
                                      {cluster.mainshock.latitude.toFixed(3)}°, {cluster.mainshock.longitude.toFixed(3)}°
                                      {cluster.mainshock.depth && ` • ${cluster.mainshock.depth.toFixed(1)} km depth`}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* No clusters message */}
                      {temporalAnalysis.clusters && temporalAnalysis.clusters.length === 0 && (
                        <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-900/50 dark:to-slate-800/30 rounded-lg border">
                          <div className="flex items-start gap-3">
                            <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                            <div>
                              <p className="font-medium">No significant earthquake sequences detected</p>
                              <p className="text-sm text-muted-foreground mt-1">
                                Gardner-Knopoff declustering found no mainshock-aftershock sequences with 3+ events.
                                This suggests the catalogue contains mostly independent (background) seismicity.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : temporalWorkerResult.error || timeSeriesWorkerResult.error ? (
                <div className="text-center py-16 text-muted-foreground">
                  <p role="alert">
                    {Array.from(new Set([temporalWorkerResult.error, timeSeriesWorkerResult.error].filter(Boolean))).join(' ')}
                  </p>
                </div>
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                    <span className="font-medium">Computing temporal analysis...</span>
                    <span className="text-xs">Binning the time series and detecting clusters</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Seismic Moment Tab */}
        <TabsContent value="moment" className="space-y-4">
          <Card className="border-0 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-red-500/10 to-orange-500/10 rounded-t-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/20 rounded-lg">
                  <Zap className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle>Seismic Moment Analysis</CardTitle>
                    <TechnicalTermTooltip term="seismicMoment" />
                  </div>
                  <CardDescription>
                    Seismic moment totals and magnitude distribution
                  </CardDescription>
                  <FilterScopeNote analysed={filteredEarthquakes.length} total={events.length} filters={describeFilters(true)} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {pooledCatalogueCount('moment') > 1 ? (
                <PooledCataloguesNotice count={pooledCatalogueCount('moment')} />
              ) : momentAnalysis ? (
                <div className="space-y-6">
                  {/* Summary Cards with professional styling */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/50 dark:to-red-900/30 border-red-200 dark:border-red-800">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <CardTitle as="h3" className="text-sm font-medium text-red-700 dark:text-red-300 flex items-center gap-2">
                            <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                            Total Seismic Moment
                          </CardTitle>
                          <TechnicalTermTooltip term="seismicMoment" />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-red-900 dark:text-red-100 font-mono">
                          {momentAnalysis.totalMoment.toExponential(2)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">Newton-meters (N·m)</p>
                        {(momentAnalysis.excludedCount > 0 || momentAnalysis.assumedMwCount > 0) && (
                          <p className="text-xs text-muted-foreground mt-1" role="note">
                            {momentAnalysis.excludedCount > 0 && (
                              <>{momentAnalysis.excludedCount.toLocaleString()} event{momentAnalysis.excludedCount === 1 ? '' : 's'} excluded: no moment relation is applied here to their stated scale (mb, Ms, Md, or another type such as Me). </>
                            )}
                            {momentAnalysis.assumedMwCount > 0 && (
                              <>{momentAnalysis.assumedMwCount.toLocaleString()} event{momentAnalysis.assumedMwCount === 1 ? '' : 's'} with ML, GeoNet M or no stated scale counted under the ML ≈ Mw assumption.</>
                            )}
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-950/50 dark:to-orange-900/30 border-orange-200 dark:border-orange-800">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <CardTitle as="h3" className="text-sm font-medium text-orange-700 dark:text-orange-300 flex items-center gap-2">
                            <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                            Equivalent Magnitude
                          </CardTitle>
                          <TechnicalTermTooltip term="momentMagnitude" />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-4xl font-bold text-orange-900 dark:text-orange-100 font-mono">
                          Mw {momentAnalysis.totalMomentMagnitude.toFixed(2)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Single event equivalent
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/50 dark:to-amber-900/30 border-amber-200 dark:border-amber-800">
                      <CardHeader className="pb-2">
                        <CardTitle as="h3" className="text-sm font-medium text-amber-700 dark:text-amber-300 flex items-center gap-2">
                          <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                          Largest Event
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-4xl font-bold text-amber-900 dark:text-amber-100 font-mono">
                          M{momentAnalysis.largestEvent.magnitude.toFixed(1)}
                        </div>
                        <div className="mt-2">
                          <Progress value={momentAnalysis.largestEvent.percentOfTotal} className="h-2" aria-label="Largest event's share of the total seismic moment" />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {momentAnalysis.largestEvent.percentOfTotal.toFixed(1)}% of total moment
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Moment Distribution Chart */}
                  <Card className="border border-border/50">
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <CardTitle as="h3" className="text-base">Moment Release by Magnitude</CardTitle>
                        <TechnicalTermTooltip term="seismicMoment" />
                      </div>
                      <CardDescription>
                        Logarithmic distribution of seismic moment across magnitude bins
                      </CardDescription>
                      <AxisLegendHints axes="X: magnitude bin. Y: seismic moment (log scale)." />
                    </CardHeader>
                    <CardContent>
                      <MomentReleaseChart data={momentAnalysis.momentByMagnitude} totalMoment={momentAnalysis.totalMoment} height={420} />
                    </CardContent>
                  </Card>

                  {/* Key Insights */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-900/50 dark:to-slate-800/30 rounded-lg border">
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-red-500" />
                        Energy Release Summary
                      </h3>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full mt-2"></span>
                          <span>Total moment equivalent to a <strong>single Mw {momentAnalysis.totalMomentMagnitude.toFixed(2)}</strong> earthquake</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full mt-2"></span>
                          <span>Largest event (M{momentAnalysis.largestEvent.magnitude.toFixed(1)}) released <strong>{momentAnalysis.largestEvent.percentOfTotal.toFixed(1)}%</strong> of total</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full mt-2"></span>
                          <span><strong>{momentAnalysis.momentByMagnitude.length}</strong> magnitude bins analyzed</span>
                        </li>
                      </ul>
                    </div>
                    <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-900/50 dark:to-slate-800/30 rounded-lg border">
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <Info className="h-4 w-4 text-blue-500" />
                        About Seismic Moment
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Seismic moment (M₀) measures faulting strength: rigidity × rupture area × average slip.
                        It is distinct from radiated seismic energy.
                        It is proportional to the fault area, average slip, and rigidity of the rock.
                        Moment magnitude (Mw) is derived from M₀ in N·m using:
                        Mw = (log₁₀(M₀) − 9.1) / 1.5, i.e. Mw = ⅔ log₁₀(M₀) − 6.07.
                        The familiar Mw = ⅔ log₁₀(M₀) − 10.7 is the same relation with M₀ in
                        dyne·cm (1 N·m = 10⁷ dyne·cm); Hanks &amp; Kanamori (1979), IASPEI (2005).
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  {momentWorkerResult.error ? (
                    <p role="alert">{momentWorkerResult.error}</p>
                  ) : filteredEarthquakes.length === 0 ? (
                    <div className="flex flex-col items-center gap-3">
                      <Zap className="h-12 w-12 opacity-30" />
                      <span>No events available</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="h-10 w-10 animate-spin text-red-500" />
                      <span className="font-medium">Computing seismic moment analysis...</span>
                      <span className="text-xs">Calculating seismic moment distribution</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* MFD (Magnitude-Frequency Distribution) Tab */}
        <TabsContent value="mfd" className="space-y-4">
          <Card className="border-0 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-indigo-500/10 to-blue-500/10 rounded-t-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/20 rounded-lg">
                  <BarChart3 className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle>Magnitude-Frequency Distribution (MFD)</CardTitle>
                    <TechnicalTermTooltip term="magnitudeFrequencyDistribution" />
                  </div>
                  <CardDescription>
                    Compare frequency-magnitude relationships across multiple catalogues
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Catalogue Selection Sidebar */}
                <div className="lg:col-span-1 space-y-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle as="h3" className="text-sm font-medium flex items-center justify-between">
                        Select Catalogues
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={handleMfdSelectAll} className="h-6 text-xs px-2">
                            All
                          </Button>
                          <Button variant="ghost" size="sm" onClick={handleMfdClearAll} className="h-6 text-xs px-2">
                            Clear
                          </Button>
                        </div>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {mfdSelectedCatalogues.length} of {catalogues.length} selected
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
                      {catalogues.map((catalogue, index) => (
                        <div key={catalogue.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`mfd-cat-${catalogue.id}`}
                            aria-labelledby={`mfd-cat-${catalogue.id}-label`}
                            checked={mfdSelectedCatalogues.includes(catalogue.id)}
                            onCheckedChange={() => handleMfdCatalogueToggle(catalogue.id)}
                          />
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{
                              backgroundColor: mfdSelectedCatalogues.includes(catalogue.id)
                                ? MFD_CATALOGUE_COLORS[mfdSelectedCatalogues.indexOf(catalogue.id) % MFD_CATALOGUE_COLORS.length]
                                : '#94a3b8'
                            }}
                          />
                          <label
                            id={`mfd-cat-${catalogue.id}-label`}
                            htmlFor={`mfd-cat-${catalogue.id}`}
                            className="text-xs cursor-pointer flex-1 truncate"
                            title={catalogue.name}
                          >
                            {catalogue.name}
                          </label>
                          <Badge variant="outline" className="text-[10px] px-1">
                            {catalogue.event_count?.toLocaleString() ?? '—'}
                          </Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Chart Options */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle as="h3" className="text-sm font-medium">Display Options</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="mfd-cumulative"
                          aria-labelledby="mfd-cumulative-label"
                          checked={mfdShowCumulative}
                          onCheckedChange={(checked) => setMfdShowCumulative(checked as boolean)}
                        />
                        <div className="flex items-center gap-1.5">
                          <label id="mfd-cumulative-label" htmlFor="mfd-cumulative" className="text-xs cursor-pointer">
                            Show cumulative (N≥M)
                          </label>
                          <InfoTooltip content="Shows cumulative counts of events with magnitude greater than or equal to M." />
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="mfd-histogram"
                          aria-labelledby="mfd-histogram-label"
                          checked={mfdShowHistogram}
                          onCheckedChange={(checked) => setMfdShowHistogram(checked as boolean)}
                        />
                        <div className="flex items-center gap-1.5">
                          <label id="mfd-histogram-label" htmlFor="mfd-histogram" className="text-xs cursor-pointer">
                            Show histogram (filled)
                          </label>
                          <InfoTooltip content="Adds filled bars behind the line for visual density." />
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="mfd-log-scale"
                          aria-labelledby="mfd-log-scale-label"
                          checked={mfdLogScale}
                          onCheckedChange={(checked) => setMfdLogScale(checked as boolean)}
                        />
                        <div className="flex items-center gap-1.5">
                          <label id="mfd-log-scale-label" htmlFor="mfd-log-scale" className="text-xs cursor-pointer">
                            Logarithmic Y-axis
                          </label>
                          <InfoTooltip content="Uses log scale to emphasize low-frequency bins." />
                        </div>
                      </div>

                      {/* Cumulative line style */}
                      {mfdShowCumulative && (
                        <div className="pt-2 border-t space-y-1">
                          <div className="flex items-center gap-1.5">
                            <label id="analytics-mfd-line-style-label" className="text-xs text-muted-foreground">Cumulative line style</label>
                            <InfoTooltip content="Controls the line style for the cumulative curve." />
                          </div>
                          <Select
                            value={mfdCumulativeStyle}
                            onValueChange={(value) => setMfdCumulativeStyle(value as 'solid' | 'dotted')}
                          >
                            <SelectTrigger aria-labelledby="analytics-mfd-line-style-label" className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="solid">Solid line</SelectItem>
                              <SelectItem value="dotted">Dotted line</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Bin width */}
                      <div className="pt-2 border-t space-y-1">
                        <div className="flex items-center gap-1.5">
                          <label id="analytics-mfd-bin-width-label" className="text-xs text-muted-foreground">Magnitude bin width</label>
                          <InfoTooltip content="Smaller bins show more detail but can be noisier." />
                        </div>
                        <Select
                          value={mfdBinWidth.toString()}
                          onValueChange={(value) => setMfdBinWidth(parseFloat(value))}
                        >
                          <SelectTrigger aria-labelledby="analytics-mfd-bin-width-label" className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0.1">0.1 (standard)</SelectItem>
                            <SelectItem value="0.05">0.05 (fine)</SelectItem>
                            <SelectItem value="0.01">0.01 (very fine)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Min magnitude truncation */}
                      <div className="pt-2 border-t space-y-1">
                        <div className="flex items-center gap-1.5">
                          <label id="analytics-mfd-min-magnitude-label" className="text-xs text-muted-foreground">Min magnitude cutoff</label>
                          <InfoTooltip content="Exclude events below this magnitude for the analysis." />
                        </div>
                        <Select
                          value={mfdMinMagnitude?.toString() || 'none'}
                          onValueChange={(value) => setMfdMinMagnitude(value === 'none' ? undefined : parseFloat(value))}
                        >
                          <SelectTrigger aria-labelledby="analytics-mfd-min-magnitude-label" className="h-7 text-xs">
                            <SelectValue placeholder="No cutoff" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No cutoff</SelectItem>
                            <SelectItem value="-1">M ≥ -1.0</SelectItem>
                            <SelectItem value="0">M ≥ 0.0</SelectItem>
                            <SelectItem value="1">M ≥ 1.0</SelectItem>
                            <SelectItem value="2">M ≥ 2.0</SelectItem>
                            <SelectItem value="3">M ≥ 3.0</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Statistics Summary */}
                  {mfdComparison && mfdComparison.catalogues.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle as="h3" className="text-sm font-medium">Statistics</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-xs">
                        {mfdComparison.catalogues.map((cat, idx) => (
                          <div key={cat.catalogueId} className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: cat.color }}
                            />
                            <span className="flex-1 truncate" title={cat.catalogueName}>
                              {cat.catalogueName}
                            </span>
                            <span className="font-mono text-muted-foreground">
                              {cat.totalEvents.toLocaleString()}
                            </span>
                          </div>
                        ))}
                        <div className="pt-2 border-t">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Mag Range:</span>
                            <span className="font-mono">
                              M{mfdComparison.magnitudeRange.min.toFixed(1)} - {mfdComparison.magnitudeRange.max.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* MFD Chart */}
                <div className="lg:col-span-3">
                  <Card className="border border-border/50">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle as="h3" className="text-base">Frequency-Magnitude Distribution</CardTitle>
                          <CardDescription>
                            {mfdShowCumulative && mfdShowHistogram
                              ? 'Cumulative N(≥M) lines and incremental N(M) stepped areas'
                              : mfdShowCumulative
                                ? 'Cumulative distribution (N ≥ M)'
                                : 'Incremental distribution N(M), drawn as a stepped area'}
                          </CardDescription>
                          <AxisLegendHints
                            axes="X: magnitude. Y: event count (log scale when enabled)."
                            legend="Colors map to catalogues. Each catalogue contributes a separate legend entry per curve: N(≥M) is the heavier cumulative line, N(M) the lighter shaded stepped area."
                          />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {mfdSelectedCatalogues.length === 0 ? (
                        <div className="text-center py-20 text-muted-foreground">
                          <BarChart3 className="h-16 w-16 mx-auto mb-4 opacity-30" />
                          <p className="font-medium">Select catalogues to compare</p>
                          <p className="text-sm mt-2">
                            Choose one or more catalogues from the left panel to view their MFD
                          </p>
                        </div>
                      ) : mfdLoading.error ? (
                        <div className="text-center py-20 space-y-3">
                          <p role="alert">{mfdLoading.error}</p>
                          <Button onClick={mfdLoading.retry}>Retry comparison loading</Button>
                        </div>
                      ) : mfdComparison ? (
                        <div>
                          <MFDComparisonChart catalogues={mfdComparison.catalogues} magnitudeRange={mfdComparison.magnitudeRange} logScale={mfdLogScale} showHistogram={mfdShowHistogram} showCumulative={mfdShowCumulative} cumulativeStyle={mfdCumulativeStyle} height={500} />
                        </div>
                      ) : (
                        <div className="text-center py-20 text-muted-foreground">
                          <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4" />
                          <p role="status">{mfdReady ? 'Computing MFD...' : 'Loading comparison events...'}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* MFD Information */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-900/50 dark:to-slate-800/30 rounded-lg border">
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <Info className="h-4 w-4 text-indigo-500" />
                        About MFD
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        The Magnitude-Frequency Distribution shows how earthquake frequency varies with magnitude.
                        The cumulative plot (N≥M) typically follows the Gutenberg-Richter relation:
                        log₁₀(N) = a - bM, where b ≈ 1 for most tectonic regions.
                      </p>
                    </div>
                    <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-900/50 dark:to-slate-800/30 rounded-lg border">
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                        Interpreting the Plot
                      </h3>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2"></span>
                          <span>Steeper slopes indicate higher b-values (more small earthquakes)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2"></span>
                          <span>Rolloff at low magnitudes shows the completeness magnitude (Mc)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2"></span>
                          <span>Compare catalogues to assess detection capabilities</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
