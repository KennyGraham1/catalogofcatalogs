/**
 * The paper text must quote what the platform computed.
 *
 * paper/figures/generate_figures.py runs the worked example through the platform's own
 * engine and writes every number the paper reports to
 * paper/figures/worked_example_summary.json; its --screenshot-catalogues mode writes the
 * values the supplement's screen captures show to
 * paper/figures/screenshot_expected_values.json. These tests check (1) that the summary's
 * event counts add up through the pipeline, and (2) that paper/srl_paper.tex and
 * paper/srl_supplement.tex quote those numbers as computed, so a regenerated summary
 * cannot silently disagree with the text (and hand-edited text cannot drift from the
 * pipeline). Rerun the generator and update the text together. (3) The magnitude-type
 * switch of the Average values merge, as stated in the paper and the white papers, is
 * the one the merge engine applies.
 */
import * as fs from 'fs';
import * as path from 'path';
import { getMagnitudePriority } from '@/lib/merge';

const ROOT = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const summary = JSON.parse(read('paper/figures/worked_example_summary.json'));
const shots = JSON.parse(read('paper/figures/screenshot_expected_values.json'));
const paper = read('paper/srl_paper.tex');
const supplement = read('paper/srl_supplement.tex');

/** An integer as LaTeX sets it in these documents: 170\,377 (or 4{,}922 in the supplement). */
function thin(n: number, sep = '\\,'): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}
const fixed = (x: number, d: number) => x.toFixed(d);
const pm = (g: { b: number; sigma_b: number }) => `${fixed(g.b, 3)} \\pm ${fixed(g.sigma_b, 3)}`;
const pct = (x: number) => `${Math.round(x)}\\%`;

/** Every fragment appears in the text, comparing with runs of whitespace collapsed. */
function expectQuoted(text: string, fragments: string[]) {
  const squash = (x: string) => x.replace(/\s+/g, ' ');
  const body = squash(text);
  const missing = fragments.filter(f => !body.includes(squash(f)));
  expect(missing).toEqual([]);
}

describe('worked-example summary - the counts add up', () => {
  const m = summary.merge;
  const q = summary.quality;
  const a = summary.analysis;

  it('merge bookkeeping', () => {
    expect(m.merged + m.removed).toBe(m.ingested);
    expect(m.first_only + m.second_only + m.duplicate_groups).toBe(m.merged);
    expect(m.true_pairs_found + m.false_associations).toBe(m.duplicate_groups);
    expect(m.true_pairs_found + m.missed_pairs).toBe(m.injected_pairs);
    const reasons = Object.values(m.missed_by_reason as Record<string, number>).reduce((s, v) => s + v, 0);
    expect(reasons).toBe(m.missed_pairs);
    const resolved = Object.values(m.resolved_to as Record<string, number>).reduce((s, v) => s + v, 0);
    expect(resolved).toBe(m.duplicate_groups);
    expect(summary.catalogues[0].events + summary.catalogues[1].events).toBe(m.ingested);
  });

  it('filter, cut-off and declustering bookkeeping', () => {
    expect(q.retained + q.removed).toBe(m.merged);
    expect(a.retained_above + a.below_cutoff_removed).toBe(q.retained);
    expect(a.declustered + a.removed_by_gk).toBe(a.retained_above);
    expect(a.gr_retained.n).toBe(a.retained_above);
    expect(a.gr_declustered.n).toBe(a.declustered);
    expect(a.symmetric_removed).toBeGreaterThanOrEqual(a.removed_by_gk);
    expect(a.cutoff).toBe(summary.completeness.merged_stability_cutoff);
  });
});

describe('worked-example summary - the paper quotes the computed values', () => {
  const [g, b] = summary.catalogues;
  const m = summary.merge;
  const q = summary.quality;
  const c = summary.completeness;
  const a = summary.analysis;
  const byGap = (cat: any, key: string) => Math.round(cat.median_q_by_gap[key]);
  const retention = (lo: number) => q.retention_by_magnitude_pct.find((r: any) => r.lo === lo).retained_pct;

  it('abstract and conclusions round the same results', () => {
    const recall = Math.round(summary.merge_pct.recall);
    const precision = Math.round(summary.merge_pct.precision);
    const removedHighGap = Math.round(q.gap_over_180_removed_pct);
    const filterShift = fixed(a.gr_merged.b - a.gr_retained.b, 2);
    const gkShift = fixed(a.gr_retained.b - a.gr_declustered.b, 2);
    const background = `$${fixed(a.gr_merged_background.b, 2)} \\pm ${fixed(a.gr_merged_background.sigma_b, 2)}$`;
    for (const section of [paper.slice(0, paper.indexOf('\\section{Introduction}')),
                           paper.slice(paper.indexOf('\\subsection{Conclusions}'))]) {
      expectQuoted(section, [`${recall}\\%`, `${precision}\\%`, `${removedHighGap}\\%`, filterShift, gkShift, background]);
    }
    // About 3,200 true background events of M >= 2.3 a year (the construction's rate).
    expect(Math.round(summary.inputs.true_background_m23_per_year / 100) * 100).toBe(3200);
    expectQuoted(paper, ['about 3\\,200 events of $M \\geq 2.3$ per year']);
  });

  it('inputs and catalogue sizes', () => {
    expectQuoted(paper, [
      `${summary.inputs.stations_geonet_like} stations`, `${summary.inputs.stations_agency_b} stations`,
      thin(g.events), thin(b.events), thin(m.ingested),
    ]);
  });

  it('step 1: import scoring and completeness per catalogue', () => {
    expectQuoted(paper, [
      `$Q = ${g.median_q}$`,
      `${Math.round(g.gap_over_180_pct)}\\% of the GeoNet-like`, `${Math.round(b.gap_over_180_pct)}\\%`,
      `from ${byGap(g, '0-90')} for gaps below`,
      `${byGap(g, '180-270')}--${byGap(b, '180-270')} between`,
      `${byGap(g, '270-360')}--${byGap(b, '270-360')} above`,
      `$M_c = ${fixed(g.mc_maxc, 1)}$ for the GeoNet-like`, `and ${fixed(b.mc_maxc, 1)}\nfor Agency~B`,
      `gives ${fixed(g.mc_gft, 1)} for both`,
    ]);
    expect(b.median_q).toBe(g.median_q);
    expect(b.mc_gft).toBe(g.mc_gft);
  });

  it('step 2: merge', () => {
    expectQuoted(paper, [
      thin(m.duplicate_groups), thin(m.merged), thin(m.first_only), thin(m.second_only),
      thin(m.injected_pairs), thin(m.true_pairs_found), pct(summary.merge_pct.recall),
      `${summary.merge_pct.precision}\\%`, thin(m.false_associations_with_aftershock),
      thin(m.false_associations), thin(m.missed_pairs),
      thin(m.missed_by_reason['gate:magnitude_range']), thin(m.missed_by_reason['gate:depth_range']),
      `${m.missed_by_reason['outside matching window']} lie outside`,
      `in ${m.missed_by_reason['paired with a closer report']} each report`,
      thin(m.resolved_to['synthetic-agency-b']), thin(m.resolved_to['synthetic-geonet-like']),
      pct(summary.merge_pct.resolved_to_agency_b),
    ]);
  });

  it('step 3: quality filter', () => {
    expectQuoted(paper, [
      `$Q \\geq ${summary.inputs.min_quality}$`, thin(q.retained), `${q.retained_pct}\\%`,
      `${q.gap_over_180_removed_pct}\\% of the ${thin(q.gap_over_180_merged)}`,
      pct(q.removed_with_gap_over_180_pct), `${Math.round(retention(1.5))}\\% of the events of $M$1.5--2.0`,
      `${Math.round(retention(3.5))}\\%\nof those of $M$3.5--4.0`,
    ]);
  });

  it('steps 4 and 5: completeness, b-values and declustering', () => {
    expectQuoted(paper, [
      `$M_c = ${fixed(c.retained_maxc.mc, 1)}$ (MAXC`, `\\hat{b} = ${pm(c.retained_maxc)}$`,
      thin(c.retained_maxc.n), `$M_c = ${fixed(c.retained_gft.mc, 1)}$ at the ${c.retained_gft.gft_level}\\% level`,
      `\\hat{b} = ${pm(c.retained_gft)}$`, `$M$${fixed(a.cutoff, 1)}`,
      `\\hat{b} = ${pm(a.gr_merged)}$`, thin(a.gr_merged.n),
      `\\hat{b} = ${pm(a.gr_merged_background)}$`,
      `$${fixed(a.gr_retained_aftershocks.b, 2)} \\pm ${fixed(a.gr_retained_aftershocks.sigma_b, 2)}$`,
      `\\hat{b} = ${pm(a.gr_retained)}$`, thin(a.retained_above),
      `$${fixed(a.gr_retained_background.b, 3)} \\pm ${fixed(a.gr_retained_background.sigma_b, 3)}$`,
      pct(100 * a.injected_aftershock_share),
      thin(a.removed_by_gk), pct((100 * a.removed_by_gk) / a.retained_above),
      `${fixed(100 * a.gk_recall_of_injected, 1)}\\%`, thin(a.gk_background_removed),
      `$\\hat{b}$ is ${fixed(a.gk_background_removed_b, 2)}`,
      `\\hat{b} = ${pm(a.gr_declustered)}$`, `$\\hat{b} = ${pm(a.gr_symmetric)}$`,
      `a further ${thin(a.symmetric_removed - a.removed_by_gk)} events`,
    ]);
    // The rounded shifts the text quotes.
    expect(fixed(a.gr_merged.b - a.gr_retained.b, 2)).toBe('0.06');
    expect(fixed(a.gr_retained.b - a.gr_declustered.b, 2)).toBe('0.12');
    expect(fixed(a.gr_declustered.b - a.gr_symmetric.b, 2)).toBe('0.06');
  });

  it('duplicate double-counting and the funnel', () => {
    expectQuoted(paper, [
      `from ${thin(a.gr_merged.n)} to ${thin(a.concatenated_above)}`,
      `${fixed(a.gr_merged.a, 2)} to ${fixed(a.gr_concatenated.a, 2)}`,
      `${fixed(a.gr_merged.b, 2)} to\n${fixed(a.gr_concatenated.b, 2)}`,
      `{${thin(m.ingested)}}`, `{${thin(m.merged)}}`, `{${thin(q.retained)}}`,
      `{${thin(a.retained_above)}\\,}`, `{${thin(a.declustered)}\\,}`,
      `$-${thin(m.removed)}$`, `$-${thin(q.removed)}$`, `$-${thin(a.below_cutoff_removed)}$`,
      `$-${thin(a.removed_by_gk)}$`,
    ]);
  });
});

describe('supplement - the captions quote the screen-capture values', () => {
  const g = shots.catalogues[0];

  it('uses the engine that the Analysis page runs', () => {
    expect(shots.catalogues.every((cat: any) => cat.workerMatchesLibrary)).toBe(true);
  });

  it('quotes the reduced catalogues and the G-R, Mc and Quality values', () => {
    const [grB, grS] = [g.grTab.bValue, g.grTab.bUncertainty];
    expectQuoted(supplement, [
      thin(shots.catalogues[0].statistics.totalEvents, '{,}'),
      thin(shots.catalogues[1].statistics.totalEvents, '{,}'),
      `$\\hat{b} = ${grB} \\pm ${grS}$`, `$a = ${g.grTab.aValue}$`, `$R^2 = ${g.grTab.rSquared}$`,
      `$M_c = M${g.mcTab.mc.split(' ')[0].slice(1)} \\pm 0.1$`,
      `$N = ${thin(g.grTab.eventsAboveMc, '{,}')}$`,
      `$${g.mcTab.eventsAtOrAboveMc.replace('%', '')}\\,\\%$`,
      `bin of the non-cumulative distribution is $M${fixed(g.mcTab.modalBin, 1)}$`,
      `($${g.statistics.avgQuality}$)`,
      `${g.statistics.grades['A+'].count} events ($${g.statistics.grades['A+'].percent}\\,\\%$)`,
      `B ($${g.statistics.grades.B.percent}\\,\\%$)`, `C\n  ($${g.statistics.grades.C.percent}\\,\\%$)`,
      `$${g.statistics.withUncertainty.percent}\\,\\%$`,
    ]);
  });

  it('the main paper quotes the merge-preview values', () => {
    const p = shots.mergePreview;
    expect(p.config).toMatchObject({ timeThreshold: 60, distanceThreshold: 50, mergeStrategy: 'quality' });
    expectQuoted(paper, [
      `${thin(p.eventsBefore)} records form ${thin(p.duplicateGroups)} duplicate groups`,
      `merge into\n    ${thin(p.eventsAfter)} events`,
      `${thin(shots.catalogues[0].statistics.totalEvents)} GeoNet-like and ${thin(shots.catalogues[1].statistics.totalEvents)}`,
    ]);
  });
});

describe('merge magnitude preference - the text states the engine\'s switch', () => {
  // The Average values strategy ranks magnitude types by the event's size; the paper
  // and both white papers state where the ranking changes. Checked against the engine.
  const rank = (type: string, size: number) => getMagnitudePriority(type, size);

  it('the engine switches from ML-first to Ms-first at M6.2', () => {
    expect(rank('ML', 6.19)).toBeLessThan(rank('mb', 6.19));
    expect(rank('mb', 6.19)).toBeLessThan(rank('Ms', 6.19));
    expect(rank('Ms', 6.19)).toBeLessThan(rank('Md', 6.19));
    expect(rank('Ms', 6.2)).toBeLessThan(rank('mB', 6.2));
    expect(rank('mB', 6.2)).toBeLessThan(rank('ML', 6.2));
    expect(rank('ML', 6.2)).toBeLessThan(rank('mb', 6.2));
    for (const size of [3, 6.19, 6.2, 8]) {
      expect(rank('Mww', size)).toBeLessThan(rank('Mwp', size));
      expect(rank('Mwp', size)).toBeLessThan(Math.min(rank('ML', size), rank('Ms', size)));
    }
  });

  it('the paper and the white papers state the same switch', () => {
    const docs: Record<string, string> = {
      paper,
      main: read('publication/main.tex'),
      mergeStrategies: read('publication/merge_strategies.tex'),
    };
    for (const [name, text] of Object.entries(docs)) {
      const body = text.replace(/\s+/g, ' ');
      expect({ name, statesSwitch: /below \$M6\.2\$/i.test(body) && /from \$M6\.2\$/.test(body) })
        .toEqual({ name, statesSwitch: true });
      expect({ name, oldSwitch: /(below|from) \$M5\.5\$/i.test(body) }).toEqual({ name, oldSwitch: false });
    }
  });
});
