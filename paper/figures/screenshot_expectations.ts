/**
 * What the browser screen captures must show, computed with the code the pages run.
 *
 *   npx tsx paper/figures/screenshot_expectations.ts <geonet-like.xml> <agency-b.xml> <out.json>
 *
 * The two QuakeML files are the reduced-scale synthetic pair written by
 * `python paper/figures/generate_figures.py --screenshot-catalogues DIR`. Each file is
 * parsed with the upload's parser (lib/parsers parseQuakeML), every event becomes the row
 * the catalogue route stores (quakemlEventToDbFields, Q from eventQualityFields as on
 * insert), and then:
 *   - the Analysis page's header cards and Quality tab are counted as the page counts them;
 *   - the G-R and Mc tabs are run through the page's own web worker
 *     (workers/seismological-worker.ts, driven through its onmessage handler) with the
 *     default Mc settings (b-value stability, MBS, falling back to the goodness-of-fit
 *     test and then to MAXC + 0.2), and cross-checked against the library. What the Mc
 *     tab shows is read off the worker's result, whatever method produced Mc: the tallest
 *     bar of its centred FMD (the maximum-curvature peak), the stability test at Mc, and
 *     the MAXC and GFT estimates the method selector would give;
 *   - the merge preview is performMergeWithGroups, the function the preview route calls,
 *     with the settings the capture spec prescribes.
 * The values are written to <out.json> and printed.
 */
import { readFileSync, writeFileSync } from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { parseQuakeML } from '@/lib/parsers';
import { quakemlEventToDbFields } from '@/lib/quakeml-to-db';
import { eventQualityFields } from '@/lib/db';
import { catalogueAgencyOf, performMergeWithGroups } from '@/lib/merge';
import { calculateGutenbergRichter, estimateCompletenessMagnitude, type EarthquakeEvent } from '@/lib/seismological-analysis';
import type { MergeConfig, SourceCatalogue } from '@/lib/validation';

type Row = Record<string, unknown> & { id: string; time: string; latitude: number; longitude: number; magnitude: number };

/** The merge settings the capture spec prescribes for the Configure and Preview steps. */
export const CAPTURE_MERGE_CONFIG: MergeConfig = {
  timeThreshold: 60,
  distanceThreshold: 50,
  mergeStrategy: 'quality',
  // The page sends its Source Priority state with every strategy; the Quality-based
  // strategy does not read it.
  priority: 'newest',
};

/** Rows the catalogue route would store for one uploaded QuakeML file. */
export function uploadedRows(xml: string, prefix: string): Row[] {
  const parsed = parseQuakeML(xml);
  if (!parsed.success) throw new Error(`QuakeML did not parse: ${JSON.stringify(parsed.errors.slice(0, 3))}`);
  return parsed.events.map((event, i) => {
    const e = event as unknown as Record<string, unknown> & { quakeml?: Parameters<typeof quakemlEventToDbFields>[0] };
    const row: Record<string, unknown> = {
      id: `${prefix}${i}`,
      time: e.time,
      latitude: e.latitude,
      longitude: e.longitude,
      magnitude: e.magnitude,
      depth: e.depth,
    };
    if (e.quakeml) Object.assign(row, quakemlEventToDbFields(e.quakeml));
    Object.assign(row, eventQualityFields(row));
    return row as Row;
  });
}

/** Drive workers/seismological-worker.ts through its own onmessage, as the parity test does. */
function loadWorker(): (message: Record<string, unknown>) => any {
  const source = readFileSync(path.join(__dirname, '..', '..', 'workers', 'seismological-worker.ts'), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const posted: any[] = [];
  const selfStub: any = { postMessage: (message: any) => posted.push(message) };
  const moduleStub = { exports: {} as Record<string, unknown> };
  new Function('self', 'module', 'exports', 'require', js)(selfStub, moduleStub, moduleStub.exports, require);
  return (message: Record<string, unknown>) => {
    posted.length = 0;
    selfStub.onmessage({ data: message });
    return posted[posted.length - 1].result;
  };
}

/** The event fields the analyses hook posts to the worker. */
function workerEvents(rows: Row[]): EarthquakeEvent[] {
  return rows.map(r => ({
    id: r.id, time: r.time, latitude: r.latitude, longitude: r.longitude,
    depth: typeof r.depth === 'number' ? r.depth : 0, magnitude: r.magnitude,
    magnitude_type: r.magnitude_type as string | undefined,
  } as EarthquakeEvent));
}

/** The Mc tab's FMD bars (centred on the 0.1 grid): the tallest, the lowest on a tie. */
function tallestBin(distribution: Array<{ magnitude: number; count: number }>): number {
  let best = distribution[0];
  for (const bin of distribution) if (bin.count > best.count) best = bin;
  return best.magnitude;
}

/** The Mc tab's "Detection Method" card headline (app/analytics/page.tsx). */
function methodHeadline(mc: { method: string; gftLevel?: number | null }): string {
  return mc.method === 'GFT' ? `GFT (${mc.gftLevel}%)` : mc.method;
}

const GRADES = ['A+', 'A', 'B+', 'B', 'C', 'D', 'F'];

/** The Analysis page's header cards and Quality tab (app/analytics/page.tsx statistics). */
function pageStatistics(rows: Row[]) {
  const total = rows.length;
  const q = rows.map(r => Number(r.quality_score));
  const grades: Record<string, { count: number; percent: string }> = {};
  GRADES.forEach(g => {
    const count = rows.filter(r => r.quality_grade === g).length;
    grades[g] = { count, percent: ((count / total) * 100).toFixed(1) };
  });
  const withUncertainty = rows.filter(r =>
    r.latitude_uncertainty != null || r.longitude_uncertainty != null || r.depth_uncertainty != null).length;
  const withStation = rows.filter(r => typeof r.used_station_count === 'number' && r.used_station_count > 0).length;
  return {
    totalEvents: total,
    avgQuality: (q.reduce((s, v) => s + v, 0) / total).toFixed(1),
    grades,
    withUncertainty: { count: withUncertainty, percent: ((withUncertainty / total) * 100).toFixed(1) },
    withFocalMechanisms: { count: 0, percent: '0.0' },
    withStationData: { count: withStation, percent: ((withStation / total) * 100).toFixed(1) },
  };
}

function main(): void {
  const [gPath, bPath, outPath] = process.argv.slice(2);
  if (!gPath || !bPath || !outPath) {
    console.error('usage: npx tsx paper/figures/screenshot_expectations.ts <geonet-like.xml> <agency-b.xml> <out.json>');
    process.exit(2);
  }
  const log = console.log;
  const warn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  let result: Record<string, unknown>;
  try {
    const catalogues = [
      { id: 'synthetic-geonet-like', name: 'Synthetic GeoNet-like catalogue', rows: uploadedRows(readFileSync(gPath, 'utf8'), 'g') },
      { id: 'synthetic-agency-b', name: 'Synthetic Agency B catalogue', rows: uploadedRows(readFileSync(bPath, 'utf8'), 'b') },
    ];
    const run = loadWorker();
    const analysis = catalogues.map(c => {
      const events = workerEvents(c.rows);
      const gr = run({ type: 'gutenberg-richter', events });
      const mc = run({ type: 'completeness', events });
      // The other two methods of the Mc settings, for the caption's comparison.
      const maxc = run({ type: 'completeness', events, mcMethod: 'MAXC' });
      const gft = run({ type: 'completeness', events, mcMethod: 'GFT' });
      // Cross-check: the worker must agree with the library (the parity the tests enforce).
      const libGr = calculateGutenbergRichter(events);
      const libMc = estimateCompletenessMagnitude(events);
      const agrees = Math.abs(libGr.bValue - gr.bValue) < 1e-9 && libMc.mc === mc.mc && libGr.completeness === gr.completeness &&
        libMc.method === mc.method && libGr.mcSource === gr.mcSource;
      // The tallest FMD bar is the maximum-curvature peak whatever method set Mc; under
      // MAXC it is Mc less the correction.
      const modalBin = tallestBin(mc.magnitudeDistribution);
      if (Math.abs(Number((maxc.mc - maxc.maxcCorrection).toFixed(2)) - modalBin) > 1e-9) {
        throw new Error(`MAXC peak ${maxc.mc - maxc.maxcCorrection} is not the tallest FMD bar ${modalBin}`);
      }
      const stable = (mc.mbsCurve as Array<{ magnitude: number; b: number; deltaB: number; bAve: number | null; n: number }>)
        .find(p => Math.abs(p.magnitude - mc.mc) < 1e-6);
      return {
        id: c.id,
        name: c.name,
        statistics: pageStatistics(c.rows),
        grTab: {
          bValue: gr.bValue.toFixed(3),
          bUncertainty: gr.bUncertainty.toFixed(3),
          aValue: gr.aValue.toFixed(2),
          rSquared: gr.rSquared.toFixed(3),
          mc: `M${gr.completeness.toFixed(1)} ± 0.1`,
          mcSource: gr.mcSource,
          eventsAboveMc: gr.eventsAboveMc,
          magnitudeResolution: gr.magnitudeResolution,
          binningCorrection: gr.binningCorrection,
        },
        mcTab: {
          mc: `M${mc.mc.toFixed(1)} ± ${mc.binWidth}`,
          method: methodHeadline(mc),
          requestedMethod: mc.requestedMethod,
          ...(mc.fallbackReason && { fallbackReason: mc.fallbackReason }),
          eventsAtOrAboveMc: `${(mc.confidence * 100).toFixed(1)}%`,
          eventsAtOrAboveMcDetail: `${mc.eventsAboveMc.toLocaleString('en-US')} of ${events.length.toLocaleString('en-US')} events`,
          // Centre of the tallest bar of the FMD chart (the maximum-curvature peak).
          modalBin,
          // The b-value stability chart at Mc (the method card quotes these when MBS set Mc).
          stabilityAtMc: stable
            ? { b: stable.b.toFixed(3), deltaB: stable.deltaB.toFixed(3), bAve: stable.bAve == null ? null : stable.bAve.toFixed(3), n: stable.n }
            : null,
          stabilityCutoffs: mc.mbsCurve.length,
          // What the method selector's other settings give.
          maxcMc: Number(maxc.mc.toFixed(1)),
          gftMc: Number(gft.mc.toFixed(1)),
          gftMethod: methodHeadline(gft),
        },
        workerMatchesLibrary: agrees,
      };
    });

    // Merge preview, as previewMerge assembles its input (source = catalogue name for uploads).
    const events: Array<Record<string, unknown> & { time: string; latitude: number; longitude: number; magnitude: number; source: string }> = [];
    catalogues.forEach(c => {
      const source: SourceCatalogue = { id: c.id, name: c.name, events: c.rows.length, source: c.name };
      const agency = catalogueAgencyOf(source, { name: c.name } as never);
      c.rows.forEach(r => events.push({ ...r, source: c.name, catalogueId: c.id, catalogueName: c.name, _catalogueAgency: agency }));
    });
    const groups = performMergeWithGroups(events, CAPTURE_MERGE_CONFIG);
    const duplicateGroups = groups.filter(g => g.events.length > 1);
    const preview = {
      config: CAPTURE_MERGE_CONFIG,
      eventsBefore: events.length,
      eventsAfter: groups.length,
      duplicateGroups: duplicateGroups.length,
      duplicatesRemoved: events.length - groups.length,
      suspiciousMatches: groups.filter(g => g.isSuspicious).length,
      resolvedToGeoNetLike: duplicateGroups.filter(g => g.events[g.selectedEventIndex]?.catalogueId === 'synthetic-geonet-like').length,
      resolvedToAgencyB: duplicateGroups.filter(g => g.events[g.selectedEventIndex]?.catalogueId === 'synthetic-agency-b').length,
    };
    result = { catalogues: analysis, mergePreview: preview };
  } finally {
    console.log = log;
    console.warn = warn;
  }
  writeFileSync(outPath, JSON.stringify(result, null, 1) + '\n');
  console.log(JSON.stringify(result, null, 1));
}

if (require.main === module) main();
