"""
Reproduce the worked example of the CofC SRL paper and draw its three data figures.

    python paper/figures/generate_figures.py

1. synthetic_catalogues.build() makes the two seeded synthetic catalogues.  They are
   the INPUT of the example: the true earthquakes, two synthetic station networks,
   and the rules that turn a recorded earthquake into each agency's report.
2. run_worked_example.ts runs the platform's own engine on them (through
   ``npx tsx``; see worked_example_engine.ts): the quality index of equation 1, the
   duplicate matcher and the Quality-based merge strategy, the Mc estimators, the
   maximum-likelihood b-value and Gardner-Knopoff declustering, called exactly as
   the platform calls them.  Every number the paper reports is an OUTPUT of that
   engine; this script computes none of them.
3. This script draws fig1_map, fig2_gap and fig3_fmd from the engine's results,
   prints the worked-example summary and writes worked_example_summary.json (every
   quoted number, which __tests__/paper/worked-example-summary.test.ts checks
   against the paper text).

    python paper/figures/generate_figures.py --screenshot-catalogues DIR

writes the reduced-scale QuakeML pair used for the browser screen captures (the same
construction, each true earthquake kept with probability 1/23) and the values the
captured panels must show, computed by paper/figures/screenshot_expectations.ts.

Run from anywhere; the TypeScript engine runs from the repository root, whose
node_modules provide tsx.  The fig1_/fig2_/fig3_ filename prefixes are historical:
LaTeX numbers the figures in first-citation order.
"""

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import cartopy.crs as ccrs
import cartopy.feature as cfeature

sys.path.insert(0, str(Path(__file__).parent))
import synthetic_catalogues as sc  # noqa: E402

OUT = Path(__file__).parent
REPO = OUT.parent.parent
SUMMARY_PATH = OUT / 'worked_example_summary.json'
SCREENSHOT_SUMMARY_PATH = OUT / 'screenshot_expected_values.json'
SCREENSHOT_THIN = 1.0 / 23.0

# ── shared style ─────────────────────────────────────────────────────────────
plt.rcParams.update({
    'font.family': 'serif',
    'font.size': 10,
    'axes.labelsize': 10,
    'axes.titlesize': 10.5,
    'xtick.labelsize': 9,
    'ytick.labelsize': 9,
    'legend.fontsize': 8.5,
    'figure.dpi': 300,
    'savefig.bbox': 'tight',
    'savefig.pad_inches': 0.05,
    'axes.edgecolor': '#52514e',
    'axes.linewidth': 0.6,
    'xtick.color': '#52514e',
    'ytick.color': '#52514e',
})
# Matplotlib stamps a CreationDate into PDF metadata, so identical content produced
# different bytes on every run; suppressing it keeps the seeded output byte-stable.
PDF_META = {'CreationDate': None}

# Categorical slots 1-3 of the validated reference palette (all-pairs CVD-safe; the
# aqua slot sits below 3:1 on white, so it is always direct-labelled or in a legend).
BLUE, ORANGE, AQUA = '#2a78d6', '#eb6834', '#1baf7a'
INK, INK2, GRID = '#0b0b0b', '#52514e', '#d9d8d4'
POOR_ZONE = '#f6dcd4'


# ══════════════════════════════════════════════════════════════════════════════
#  Running the platform's engine
# ══════════════════════════════════════════════════════════════════════════════
def run_engine(built, workdir):
    """Write the catalogues, run run_worked_example.ts on them, return its results."""
    src = Path(workdir) / 'catalogues.json'
    dst = Path(workdir) / 'results.json'
    with open(src, 'w') as fh:
        json.dump(sc.engine_input(built), fh)
    proc = subprocess.run(
        ['npx', 'tsx', str(OUT / 'run_worked_example.ts'), str(src), str(dst)],
        cwd=REPO, capture_output=True, text=True)
    if proc.returncode != 0:
        sys.stderr.write(proc.stdout + proc.stderr)
        raise SystemExit('run_worked_example.ts failed')
    with open(dst) as fh:
        return json.load(fh)


def _bin_lower_edge(m, width=0.1):
    """The platform's magnitude binning (lib/seismological-analysis.ts binLowerEdge)."""
    return np.floor(np.asarray(m) / width + 1e-9) * width


# ══════════════════════════════════════════════════════════════════════════════
#  Figure 1 - networks, input catalogues, duplicate matching, merged provenance
# ══════════════════════════════════════════════════════════════════════════════
def _basemap(ax, ext):
    ax.set_extent(ext, crs=ccrs.PlateCarree())
    ax.add_feature(cfeature.OCEAN.with_scale('10m'), facecolor='#e3eaf1', zorder=0)
    ax.add_feature(cfeature.LAND.with_scale('10m'), facecolor='#f1efe9', zorder=0)
    ax.add_feature(cfeature.COASTLINE.with_scale('10m'), linewidth=0.4, edgecolor='#8a8983', zorder=2)
    gl = ax.gridlines(draw_labels=True, linewidth=0.3, color='white', alpha=0.7)
    gl.top_labels = gl.right_labels = False
    gl.xlabel_style = gl.ylabel_style = {'size': 7, 'color': INK2}
    # Rasterise the basemap and event scatter (zorder < 5) so the PDF stays compact.
    ax.set_rasterization_zorder(5)


def _msize(m):
    return np.clip(1.6 * 2.0 ** (np.asarray(m) - 1.5), 1.5, 60)


def make_map(built, res, rng):
    proj = ccrs.PlateCarree()
    ext = [165.8, 179.3, -47.6, -34.2]
    rep = built['reports']
    g, b = rep['GeoNet-like'], rep['Agency B']
    (gs_lat, gs_lon), (bs_lat, bs_lon) = built['stations']['GeoNet-like'], built['stations']['Agency B']

    fig = plt.figure(figsize=(9.4, 5.3))

    # ---- (a) two input catalogues and their station networks --------------------------
    ax = fig.add_subplot(1, 2, 1, projection=proj)
    _basemap(ax, ext)
    sg = rng.choice(g['lat'].size, 900, replace=False)
    sb = rng.choice(b['lat'].size, 900, replace=False)
    ax.scatter(g['lon'][sg], g['lat'][sg], s=_msize(g['mag'][sg]), c=BLUE, alpha=0.5, marker='o',
               edgecolors='none', transform=proj, zorder=3, rasterized=True,
               label=f"GeoNet-like reports ({g['lat'].size:,})")
    ax.scatter(b['lon'][sb], b['lat'][sb], s=_msize(b['mag'][sb]), c=ORANGE, alpha=0.5, marker='^',
               edgecolors='none', transform=proj, zorder=3, rasterized=True,
               label=f"Agency B reports ({b['lat'].size:,})")
    ax.scatter(gs_lon, gs_lat, s=9, marker='v', c='white', edgecolors=INK, linewidths=0.5,
               transform=proj, zorder=6, label=f'GeoNet-like stations ({gs_lat.size})')
    ax.scatter(bs_lon, bs_lat, s=9, marker='s', c=INK, edgecolors='none',
               transform=proj, zorder=6, label=f'Agency B stations ({bs_lat.size})')
    ax.set_title('(a) Networks and input catalogues (random sample)')
    ax.legend(loc='lower right', fontsize=7.2, framealpha=0.92, edgecolor=INK2, markerscale=1.1)

    # Inset: associated pairs inside a box off the Hawke's Bay coast, joined by lines.
    box = [176.4, 178.4, -40.6, -39.0]
    pairs = np.array(res['pairs'])
    inside = ((pairs[:, 1] > box[0]) & (pairs[:, 1] < box[1]) & (pairs[:, 0] > box[2]) & (pairs[:, 0] < box[3]))
    sel = pairs[inside]
    sel = sel[rng.choice(sel.shape[0], min(30, sel.shape[0]), replace=False)]
    ax.add_patch(mpatches.Rectangle((box[0], box[2]), box[1] - box[0], box[3] - box[2],
                 fill=False, ec=INK, lw=0.8, transform=proj, zorder=7))
    axI = ax.inset_axes([0.02, 0.58, 0.42, 0.37])
    for lat1, lon1, lat2, lon2 in sel:
        axI.plot([lon1, lon2], [lat1, lat2], '-', color=INK2, lw=0.6, zorder=1)
    axI.scatter(sel[:, 1], sel[:, 0], s=18, c=BLUE, marker='o', edgecolors='white', linewidths=0.3, zorder=2)
    axI.scatter(sel[:, 3], sel[:, 2], s=20, c=ORANGE, marker='^', edgecolors='white', linewidths=0.3, zorder=2)
    axI.set_xlim(box[0], box[1]); axI.set_ylim(box[2], box[3])
    axI.set_xticks([]); axI.set_yticks([])
    axI.set_facecolor('white')
    for spine in axI.spines.values():
        spine.set_edgecolor(INK)
    cfg = res['merge']['config']
    axI.set_title(f"Associated pairs (baseline $|\\Delta t|\\leq{cfg['timeThreshold']:g}$ s, "
                  f"$d\\leq{cfg['distanceThreshold']:g}$ km)", fontsize=7, pad=2)
    x0, x1 = axI.get_xlim(); y0, y1 = axI.get_ylim()
    km_deg = 20.0 / (111.32 * np.cos(np.deg2rad(39.8)))
    bx, by = x0 + 0.06 * (x1 - x0), y0 + 0.07 * (y1 - y0)
    axI.plot([bx, bx + km_deg], [by, by], '-', color=INK, lw=1.4, zorder=4)
    axI.text(bx + km_deg / 2, by + 0.025 * (y1 - y0), '20 km', ha='center', va='bottom', fontsize=6, color=INK)
    ax.indicate_inset(bounds=[box[0], box[2], box[1] - box[0], box[3] - box[2]], inset_ax=axI,
                      edgecolor=INK, linewidth=0.6, alpha=0.8, zorder=7)

    # ---- (b) merged catalogue by provenance ----------------------------------------------
    ax2 = fig.add_subplot(1, 2, 2, projection=proj)
    _basemap(ax2, ext)
    me = res['merged_events']
    prov = np.array(me['provenance'])
    lat, lon, mag = np.array(me['latitude']), np.array(me['longitude']), np.array(me['magnitude'])
    counts = {k: int((prov == k).sum()) for k in ('first-only', 'second-only')}
    n_dup = int(np.isin(prov, ['duplicate-first', 'duplicate-second']).sum())
    classes = [
        ('first-only', BLUE, 'o', f"GeoNet-like only ({counts['first-only']:,})", 3),
        (('duplicate-first', 'duplicate-second'), AQUA, 's', f'Reported by both, resolved ({n_dup:,})', 4),
        ('second-only', ORANGE, '^', f"Agency B only ({counts['second-only']:,})", 3),
    ]
    for key, colour, marker, label, z in classes:
        idx = np.where(np.isin(prov, key))[0]
        take = rng.choice(idx, min(700, idx.size), replace=False)
        ax2.scatter(lon[take], lat[take], s=_msize(mag[take]), c=colour, alpha=0.6, marker=marker,
                    edgecolors='none', transform=proj, zorder=z, rasterized=True, label=label)
    ax2.set_title('(b) Merged catalogue by provenance (random sample)')
    ax2.legend(loc='lower right', fontsize=7.2, framealpha=0.92, edgecolor=INK2, markerscale=1.1)

    fig.tight_layout(rect=[0, 0.03, 1, 1])
    fig.text(0.5, 0.012, 'Synthetic data for illustration; marker area increases with magnitude.',
             ha='center', fontsize=7, color=INK2, style='italic')
    fig.savefig(OUT / 'fig1_map.pdf', bbox_inches='tight', dpi=150, metadata=PDF_META)
    fig.savefig(OUT / 'fig1_map.png', dpi=300, bbox_inches='tight')
    plt.close(fig)
    print('Figure fig1_map saved.')


# ══════════════════════════════════════════════════════════════════════════════
#  Figure 2 - azimuthal gap, and how equation 1 relates to it
# ══════════════════════════════════════════════════════════════════════════════
def make_gap_quality(built, res):
    rep = built['reports']
    q_by = {c['id']: np.array(c['q']) for c in res['catalogues']}
    gaps = {'GeoNet-like': rep['GeoNet-like']['azimuthal_gap'], 'Agency B': rep['Agency B']['azimuthal_gap']}
    qs = {'GeoNet-like': q_by['synthetic-geonet-like'], 'Agency B': q_by['synthetic-agency-b']}

    fig, (ax, ax2) = plt.subplots(1, 2, figsize=(8.8, 3.7))
    bins = np.arange(0, 361, 15)
    ax.axvspan(180, 360, color=POOR_ZONE, alpha=0.6, zorder=0, lw=0)
    for name, colour in (('GeoNet-like', BLUE), ('Agency B', ORANGE)):
        ax.hist(gaps[name], bins=bins, density=True, histtype='step', color=colour, linewidth=1.6,
                label=f"{name}: {100 * (gaps[name] > 180).mean():.0f}% above 180°", zorder=3)
    ax.axvline(180, color=INK2, linestyle='--', linewidth=0.9, zorder=4)
    ax.set_xlabel('Azimuthal gap (degrees)'); ax.set_ylabel('Probability density')
    ax.set_xlim(0, 360); ax.set_xticks(range(0, 361, 45)); ax.set_ylim(0, None)
    ax.text(270, ax.get_ylim()[1] * 0.96, 'gap > 180°', ha='center', va='top', fontsize=8, color=INK2)
    ax.legend(loc='upper right', framealpha=0.95, bbox_to_anchor=(1.0, 0.88))
    ax.set_title('(a) Azimuthal gap of the reports')
    ax.grid(True, axis='y', lw=0.4, color=GRID); ax.set_axisbelow(True)

    # (b) Q (equation 1) against gap: median and 10-90% range per 15-degree bin.
    centres = (bins[:-1] + bins[1:]) / 2
    for name, colour, marker in (('GeoNet-like', BLUE, 'o'), ('Agency B', ORANGE, '^')):
        k = np.digitize(gaps[name], bins) - 1
        med, lo, hi, ok = [], [], [], []
        for j in range(len(centres)):
            v = qs[name][k == j]
            ok.append(v.size >= 20)
            med.append(np.median(v) if v.size else np.nan)
            lo.append(np.percentile(v, 10) if v.size else np.nan)
            hi.append(np.percentile(v, 90) if v.size else np.nan)
        ok = np.array(ok)
        ax2.fill_between(centres[ok], np.array(lo)[ok], np.array(hi)[ok], color=colour, alpha=0.13, lw=0)
        ax2.plot(centres[ok], np.array(med)[ok], '-', marker=marker, ms=3.5, color=colour, lw=1.5,
                 label=f'{name}: median Q (10–90% band)')
    gq = res['q_gap_only']
    ax2.plot([p['gap'] for p in gq], [p['q'] for p in gq], ':', color=INK, lw=1.3,
             label='Gap term alone (event ideal otherwise)')
    qmin = res['quality']['min_quality']
    ax2.axhline(qmin, color=INK2, ls='--', lw=0.9)
    ax2.text(356, qmin + 1.2, f'Q = {qmin} (filter threshold)', fontsize=7.5, color=INK2, va='bottom', ha='right')
    ax2.set_xlim(0, 360); ax2.set_xticks(range(0, 361, 45)); ax2.set_ylim(0, 102)
    ax2.set_xlabel('Azimuthal gap (degrees)'); ax2.set_ylabel('Quality index Q (equation 1)')
    ax2.set_title('(b) Q of the same reports against their gap')
    ax2.legend(loc='lower left', framealpha=0.95, fontsize=7.6)
    ax2.grid(True, lw=0.4, color=GRID); ax2.set_axisbelow(True)

    fig.tight_layout()
    fig.savefig(OUT / 'fig2_gap.pdf', metadata=PDF_META)
    fig.savefig(OUT / 'fig2_gap.png', dpi=300)
    plt.close(fig)
    print('Figure fig2_gap saved.')


# ══════════════════════════════════════════════════════════════════════════════
#  Figure 3 - completeness, b-value and declustering
# ══════════════════════════════════════════════════════════════════════════════
def _mark_cutoffs(ax, marks, cut):
    """Vertical lines at the Mc estimates, labelled just above the axes: the lower
    estimate to the left of its line and the others to the right, so that labels 0.2
    magnitude units apart do not overlap."""
    for k, (x, text) in enumerate(marks):
        ax.axvline(x, color=INK2, lw=0.8, ls='--' if x == cut else ':')
        left = k == 0
        ax.annotate(text, xy=(x, 1.0), xycoords=ax.get_xaxis_transform(), xytext=(-2 if left else 2, 2),
                    textcoords='offset points', fontsize=7, color=INK2,
                    ha='right' if left else 'left', va='bottom')


def make_fmd(res):
    me = res['merged_events']
    mag = np.array(me['magnitude'])
    retained = np.array(me['retained'])
    above = np.array(me['above_cutoff'])
    declustered = np.array(me['declustered'])
    comp, an = res['completeness'], res['analysis']
    cut = an['cutoff']
    maxc, gft = comp['retained_maxc']['mc'], comp['retained_gft']['mc']

    fig = plt.figure(figsize=(8.6, 7.4))
    layout = fig.add_gridspec(2, 2, height_ratios=[1.0, 0.95])
    axes = [fig.add_subplot(layout[0, 0]), fig.add_subplot(layout[0, 1]), fig.add_subplot(layout[1, :])]

    # (a) non-cumulative FMD of the merged and the quality-filtered catalogues.
    ax = axes[0]
    edges = np.round(np.arange(0.0, 7.01, 0.1), 1)
    def counts(m):
        k = np.round(_bin_lower_edge(m), 1)
        return np.array([(k == e).sum() for e in edges[:-1]], float)
    c_all, c_ret = counts(mag), counts(mag[retained])
    ax.bar(edges[:-1] + 0.05, c_ret, width=0.086, color=BLUE, alpha=0.85, lw=0,
           label=f'Quality-filtered (Q ≥ {res["quality"]["min_quality"]})')
    ax.step(np.append(edges[:-1], edges[-1]), np.append(c_all, c_all[-1]), where='post', color=AQUA,
            lw=1.4, label='Merged, unfiltered')
    ax.set_yscale('log'); ax.set_xlim(0.8, 5.0); ax.set_ylim(0.8, None)
    _mark_cutoffs(ax, ((maxc, f'MAXC {maxc:.1f}'), (gft, f'GFT {gft:.1f}'), (cut, f'stable {cut:.1f}')), cut)
    ax.set_xlabel('Magnitude'); ax.set_ylabel('Events per 0.1 bin')
    ax.set_title('(a) Merged and quality-filtered FMD', pad=14)
    ax.legend(loc='upper right', framealpha=0.95, fontsize=8)
    ax.grid(True, axis='y', which='major', lw=0.4, color=GRID); ax.set_axisbelow(True)

    # (b) cumulative FMD above the cut-off, before and after declustering, with the
    #     platform's maximum-likelihood fits.
    ax = axes[1]
    grid = np.round(np.arange(cut, 7.01, 0.1), 1)
    def cum(m):
        return np.array([(m >= x - 1e-9).sum() for x in grid], float)
    c_b, c_a = cum(mag[above]), cum(mag[declustered])
    top = grid[c_b > 0][-1]
    mb, ma = c_b > 0, c_a > 0
    ax.semilogy(grid[mb], c_b[mb], 'o', mfc='none', mec=BLUE, mew=1.0, ms=5.2, ls='none',
                label=f'Before declustering ({an["retained_above"]:,})')
    ax.semilogy(grid[ma], c_a[ma], 's', color=ORANGE, ms=3.4, ls='none',
                label=f'After declustering ({an["declustered"]:,})')
    fit_m = np.linspace(cut, top + 0.2, 100)
    for gr, colour, style in ((an['gr_retained'], BLUE, '--'), (an['gr_declustered'], ORANGE, '-')):
        ax.semilogy(fit_m, 10 ** (gr['a'] - gr['b'] * fit_m), style, color=colour, lw=1.3,
                    label=f"MLE fit, $\\hat{{b}}$ = {gr['b']:.2f} ± {gr['sigma_b']:.2f}")
    ax.set_xlim(cut - 0.1, top + 0.3); ax.set_ylim(0.7, c_b[0] * 2.5)
    ax.set_xlabel('Magnitude'); ax.set_ylabel(r'Cumulative $N(\geq M)$')
    ax.set_title(f'(b) Quality-filtered catalogue, M ≥ {cut:.1f}', pad=14)
    ax.legend(loc='upper right', framealpha=0.95, fontsize=7.8)
    ax.grid(True, which='major', lw=0.4, color=GRID); ax.set_axisbelow(True)

    # (c) b against the cut-off.
    ax = axes[2]
    rows = res['b_vs_cutoff']
    x = np.array([r['cutoff'] for r in rows])
    for key, colour, label in (('merged', AQUA, 'Merged, unfiltered'),
                               ('retained', BLUE, 'Quality-filtered'),
                               ('retained_declustered', ORANGE, 'Quality-filtered, declustered')):
        b = np.array([r[key]['b'] if r[key] else np.nan for r in rows])
        s = np.array([r[key]['sigma_b'] if r[key] else np.nan for r in rows])
        ax.fill_between(x, b - s, b + s, color=colour, alpha=0.18, lw=0)
        ax.plot(x, b, '-o', ms=2.8, color=colour, lw=1.4, label=label)
    ax.axhline(sc.B_BACKGROUND, color=INK, lw=0.9, ls=':')
    ax.text(x[0] + 0.02, sc.B_BACKGROUND - 0.008, f'planted background b = {sc.B_BACKGROUND:.2f}',
            fontsize=7, color=INK, va='top')
    _mark_cutoffs(ax, ((maxc, 'MAXC'), (gft, 'GFT'), (cut, 'stable')), cut)
    ax.set_xlabel('Magnitude cut-off'); ax.set_ylabel(r'$\hat{b}$ (± formal $\sigma_b$)')
    ax.set_title('(c) b-value against the cut-off', pad=14)
    ax.legend(loc='lower right', framealpha=0.95, fontsize=8)
    ax.grid(True, lw=0.4, color=GRID); ax.set_axisbelow(True)

    fig.tight_layout()
    fig.savefig(OUT / 'fig3_fmd.pdf', metadata=PDF_META)
    fig.savefig(OUT / 'fig3_fmd.png', dpi=300)
    plt.close(fig)
    print('Figure fig3_fmd saved.')


# ══════════════════════════════════════════════════════════════════════════════
#  Summary
# ══════════════════════════════════════════════════════════════════════════════
def _median_q_by_gap(q, gap):
    """Median Q of a catalogue's events in azimuthal-gap classes (degrees)."""
    classes = ((0, 90), (90, 180), (180, 270), (270, 360.01))
    return {f'{lo:g}-{min(hi, 360):g}': float(np.median(q[(gap >= lo) & (gap < hi)])) for lo, hi in classes}


def summarise(built, res):
    """Every number the paper quotes, from the engine's results (and the generator inputs)."""
    g, b = res['catalogues']
    m, q, comp, an = res['merge'], res['quality'], res['completeness'], res['analysis']
    ret_mag = q['retention_by_magnitude']
    pct = lambda x: round(100.0 * x, 1)
    summary = {
        'seed': sc.SEED,
        'inputs': {
            'stations_geonet_like': int(built['stations']['GeoNet-like'][0].size),
            'stations_agency_b': int(built['stations']['Agency B'][0].size),
            'true_events': int(built['truth']['lat'].size),
            'true_background_m23_per_year': round(float(
                ((~built['truth']['is_aftershock']) & (built['truth']['mag'] >= 2.3)).sum()
                / (sc.T_SPAN_DAYS / 365.25)), 1),
            'true_aftershocks': int(built['truth']['is_aftershock'].sum()),
            'planted_b_background': sc.B_BACKGROUND,
            'planted_b_aftershocks': sc.B_CLUSTER,
            'cluster_fraction_m2': sc.CLUSTER_FRAC_M2,
            'baseline_windows': [m['config']['timeThreshold'], m['config']['distanceThreshold']],
            'min_quality': q['min_quality'],
        },
        'catalogues': [{
            'name': c['name'], 'events': c['events'], 'median_q': c['median_q'],
            'grades': c['grades'], 'gap_over_180_pct': pct(c['gap_over_180']),
            'mc_maxc': c['maxc']['mc'], 'mc_gft': c['gft']['mc'], 'gft_source': c['gft']['mc_source'],
            'gft_level': c['gft']['gft_level'],
            'median_q_by_gap': _median_q_by_gap(np.array(c['q']), built['reports'][agency]['azimuthal_gap']),
        } for c, agency in ((g, 'GeoNet-like'), (b, 'Agency B'))],
        'merge': {k: v for k, v in m.items() if k != 'config'},
        'merge_pct': {
            'recall': pct(m['true_pairs_found'] / m['injected_pairs']),
            'precision': pct(m['true_pairs_found'] / m['duplicate_groups']),
            'resolved_to_agency_b': pct(m['resolved_to']['synthetic-agency-b'] / m['duplicate_groups']),
        },
        'quality': {
            'retained': q['retained'], 'removed': q['removed'],
            'retained_pct': pct(q['retained'] / m['merged']),
            'merged_median_q': q['merged_median_q'],
            'gap_over_180_merged': q['gap_over_180_merged'],
            'gap_over_180_removed_pct': pct(q['gap_over_180_removed_fraction']),
            'removed_with_gap_over_180_pct': pct(q['removed_share_with_gap_over_180']),
            'removed_share_by_provenance_pct': {k: pct(v) for k, v in q['removed_share_by_provenance'].items()},
            'retention_by_magnitude_pct': [
                {'lo': r['lo'], 'hi': r['hi'], 'events': r['events'],
                 'retained_pct': pct(r['retained'] / r['events']) if r['events'] else None} for r in ret_mag],
        },
        'completeness': {
            k: ({kk: v[kk] for kk in ('mc', 'b', 'sigma_b', 'n', 'mc_source', 'gft_level')} if isinstance(v, dict) else v)
            for k, v in comp.items()
        },
        'analysis': {
            **{k: v for k, v in an.items() if not isinstance(v, dict)},
            **{k: {kk: v[kk] for kk in ('b', 'sigma_b', 'a', 'n')} for k, v in an.items() if isinstance(v, dict)},
        },
        'b_vs_cutoff': [
            {'cutoff': r['cutoff'],
             **{k: (None if r[k] is None else [round(r[k]['b'], 3), round(r[k]['sigma_b'], 3), r[k]['n']])
                for k in ('merged', 'retained', 'retained_declustered', 'merged_background', 'retained_background')}}
            for r in res['b_vs_cutoff']
        ],
    }
    return summary


def print_summary(s):
    g, b = s['catalogues']
    m, mp, q, c, a = s['merge'], s['merge_pct'], s['quality'], s['completeness'], s['analysis']
    line = '=' * 74
    print('\n' + line)
    print(f" WORKED EXAMPLE - platform engine on the seeded synthetic pair (seed {s['seed']})")
    print(line)
    for cat in (g, b):
        print(f" {cat['name']:<34}: {cat['events']:>8,} events, median Q {cat['median_q']:g}, "
              f"gap>180 {cat['gap_over_180_pct']}%, Mc MAXC {cat['mc_maxc']} / GFT {cat['mc_gft']}")
    print(f" Merge (Quality-based, {s['inputs']['baseline_windows'][0]} s / {s['inputs']['baseline_windows'][1]} km):"
          f" {m['ingested']:,} -> {m['merged']:,} ({m['duplicate_groups']:,} duplicate groups)")
    print(f"   injected pairs {m['injected_pairs']:,}; found {m['true_pairs_found']:,} ({mp['recall']}%);"
          f" false {m['false_associations']:,}; missed {m['missed_pairs']:,} {m['missed_by_reason']}")
    print(f"   solution kept: {m['resolved_to']}; GeoNet-like only {m['first_only']:,}, Agency B only {m['second_only']:,}")
    print(f" Q >= {s['inputs']['min_quality']}: retained {q['retained']:,} ({q['retained_pct']}%), removed {q['removed']:,};"
          f" {q['gap_over_180_removed_pct']}% of the {q['gap_over_180_merged']:,} gap>180 events removed")
    print('   retention by magnitude:', ', '.join(f"M{r['lo']}-{r['hi']}: {r['retained_pct']}%" for r in q['retention_by_magnitude_pct']))
    for k in ('retained_maxc', 'retained_gft', 'merged_maxc', 'merged_gft'):
        v = c[k]
        print(f"   {k:<14} Mc {v['mc']} ({v['mc_source']}{'' if v['gft_level'] is None else ' ' + str(v['gft_level']) + '%'}):"
              f" b = {v['b']:.3f} +/- {v['sigma_b']:.3f} (N={v['n']:,})")
    print(f"   b-value stability cut-off of the merged catalogue: {c['merged_stability_cutoff']}")
    print(f" At M >= {a['cutoff']} ({a['cutoff_source']}): {a['retained_above']:,} filtered events")
    for k in ('gr_merged', 'gr_retained', 'gr_merged_background', 'gr_retained_background',
              'gr_retained_aftershocks', 'gr_declustered', 'gr_symmetric', 'gr_concatenated'):
        v = a.get(k)
        if v:
            print(f"   {k:<24} b = {v['b']:.3f} +/- {v['sigma_b']:.3f}, a = {v['a']:.2f} (N={v['n']:,})")
    print(f"   GK removes {a['removed_by_gk']:,} (recall of injected {100*a['gk_recall_of_injected']:.1f}%,"
          f" background swept {a['gk_background_removed']:,}); symmetric removes {a['symmetric_removed']:,}")
    print(line)


# ══════════════════════════════════════════════════════════════════════════════
#  Screen-capture catalogues
# ══════════════════════════════════════════════════════════════════════════════
def screenshot_catalogues(outdir):
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    built = sc.build(thin=SCREENSHOT_THIN)
    files = {}
    for agency, cat_id, name, _prefix in sc.CATALOGUES:
        path = outdir / f'{cat_id}.xml'
        sc.write_quakeml(built, agency, path)
        files[cat_id] = str(path)
        print(f"{name}: {built['reports'][agency]['lat'].size:,} events -> {path}")
    proc = subprocess.run(
        ['npx', 'tsx', str(OUT / 'screenshot_expectations.ts'),
         files['synthetic-geonet-like'], files['synthetic-agency-b'], str(outdir / 'expected_values.json')],
        cwd=REPO, capture_output=True, text=True)
    if proc.returncode != 0:
        sys.stderr.write(proc.stdout + proc.stderr)
        raise SystemExit('screenshot_expectations.ts failed')
    # A copy beside the figures: the supplement captions quote these values and
    # __tests__/paper/worked-example-summary.test.ts checks them.
    with open(outdir / 'expected_values.json') as fh:
        expected = json.load(fh)
    with open(SCREENSHOT_SUMMARY_PATH, 'w') as fh:
        json.dump(expected, fh, indent=1)
        fh.write('\n')
    print(json.dumps(expected, indent=1))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--screenshot-catalogues', metavar='DIR',
                    help='write the reduced-scale QuakeML pair and the expected panel values to DIR')
    args = ap.parse_args()
    if args.screenshot_catalogues:
        screenshot_catalogues(args.screenshot_catalogues)
        return

    built = sc.build()
    with tempfile.TemporaryDirectory() as tmp:
        res = run_engine(built, tmp)
    # Plot sampling draws from its own generator so the figures never perturb the data.
    plot_rng = np.random.default_rng(sc.SEED + 100)
    make_map(built, res, plot_rng)
    make_gap_quality(built, res)
    make_fmd(res)
    summary = summarise(built, res)
    with open(SUMMARY_PATH, 'w') as fh:
        json.dump(summary, fh, indent=1, sort_keys=False)
        fh.write('\n')
    print_summary(summary)
    print('Figures and', SUMMARY_PATH.name, 'written to', OUT)


if __name__ == '__main__':
    main()
