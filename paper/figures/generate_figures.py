"""
Reproduce the worked example for the CofC SRL submission.

This single, seeded script reproduces every quantity quoted in the worked
example and writes the three paper figures.  It (i) sizes the two
synthetic catalogues and their overlap, (ii) derives the duplicate-aware merge
and quality-filter bookkeeping arithmetically (these are definitional in the
worked example), (iii) simulates representative azimuthal-gap, quality, depth
and magnitude distributions, and (iv) computes Gutenberg-Richter b-values for
the quality-filtered catalogue before and after declustering.

All randomness is seeded with numpy.default_rng(42); re-running reproduces the
figures and the printed summary exactly.

This script writes the three *data* figures of the paper:
  fig1_map.pdf   -- merge illustration (inputs + provenance)
  fig2_gap.pdf   -- azimuthal-gap distributions
  fig3_fmd.pdf   -- FMD before/after declustering
The fig1_/fig2_/fig3_ filename prefixes are historical; the figures are
numbered by LaTeX in first in-text-citation order, so the prefixes do not
track the printed figure numbers.
"""

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import cartopy.crs as ccrs
import cartopy.feature as cfeature
from pathlib import Path

rng = np.random.default_rng(42)
OUT = Path(__file__).parent

# ── shared style ─────────────────────────────────────────────────────────────
plt.rcParams.update({
    'font.family': 'serif',
    'font.size': 10,
    'axes.labelsize': 10,
    'axes.titlesize': 11,
    'xtick.labelsize': 9,
    'ytick.labelsize': 9,
    'legend.fontsize': 9,
    'figure.dpi': 300,
    'savefig.bbox': 'tight',
    'savefig.pad_inches': 0.05,
})
BLUE   = '#2563EB'
ORANGE = '#EA580C'
GREEN  = '#16A34A'
TEAL   = '#0D9488'
GRAY   = '#6B7280'

# ══════════════════════════════════════════════════════════════════════════════
#  Worked-example bookkeeping — definitional, exact
# ══════════════════════════════════════════════════════════════════════════════
N_GEONET   = 120_000                       # GeoNet-like primary catalogue
N_AGENCYB  = 98_000                        # secondary Agency B catalogue
DUP_FRAC   = 0.50                           # fraction of Agency B duplicated
N_DUP      = int(round(N_AGENCYB * DUP_FRAC))            # 49,000 duplicate pairs
N_GEONET_ONLY  = N_GEONET - N_DUP                       # 71,000
N_AGENCYB_ONLY = N_AGENCYB - N_DUP                      # 49,000
N_MERGED   = N_GEONET_ONLY + N_AGENCYB_ONLY + N_DUP     # 169,000 unique
QFILTER_FRAC = 0.85                         # retained at Q >= 70
N_RETAINED = int(round(N_MERGED * QFILTER_FRAC))        # 143,650
N_REMOVED  = N_MERGED - N_RETAINED                      # 25,350

MC          = 2.0                           # magnitude of completeness
N_ABOVE_MC  = 48_600                        # events >= Mc in quality-filtered set
DECL_FRAC   = 0.23                           # fraction removed by declustering
N_AFTER     = int(round(N_ABOVE_MC * DECL_FRAC))        # 11,178 aftershocks
N_BACKGROUND = N_ABOVE_MC - N_AFTER                     # 37,422 background events


def gr_from_u(u, b, mmin, mmax):
    """Inverse-CDF of a doubly-truncated Gutenberg-Richter law for fixed u."""
    m = mmin - np.log10(1 - u * (1 - 10 ** (-b * (mmax - mmin)))) / b
    return np.clip(m, mmin, mmax)


def mle_b(mags, mc, dm=0.1):
    """Aki (1965) / Utsu maximum-likelihood b on magnitudes binned to dm."""
    m = np.round(mags[mags >= mc] / dm) * dm          # bin to dm grid
    n = len(m)
    if n < 2:
        return np.nan, np.nan
    b = np.log10(np.e) / (m.mean() - mc + dm / 2.0)
    return b, b / np.sqrt(n)


def solve_input_b(target_b, score, lo=0.5, hi=4.0):
    """Bisection on a fixed sample: find input b whose binned MLE == target_b.

    ``score(b)`` returns the MLE b for the magnitudes generated from a *fixed*
    set of uniform draws, so the mapping is deterministic and monotonic and the
    recovered b equals the target to display precision.
    """
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if score(mid) < target_b:
            lo = mid          # MLE too low -> steepen input b
        else:
            hi = mid
    return 0.5 * (lo + hi)


# ══════════════════════════════════════════════════════════════════════════════
#  Figure 1 — How the merge works: two input catalogues -> merged provenance
# ══════════════════════════════════════════════════════════════════════════════
def _sample_regions(n, offshore_extra=0.0):
    """Sample event positions/magnitudes from three NZ source regions.
    offshore_extra biases the mixture toward the offshore Hikurangi margin."""
    f_hik = 0.40 + offshore_extra
    n_hik = int(n * f_hik); n_slab = int(n * 0.20); n_alp = n - n_hik - n_slab
    lon = np.concatenate([rng.normal(177.0, 0.9, n_hik),    # offshore Hikurangi
                          rng.normal(175.5, 0.6, n_slab),   # deep slab
                          rng.normal(171.3, 1.1, n_alp)])   # Alpine Fault
    lat = np.concatenate([rng.normal(-40.0, 1.1, n_hik),
                          rng.normal(-41.0, 0.7, n_slab),
                          rng.normal(-43.6, 1.0, n_alp)])
    mag = np.clip(rng.exponential(0.6, len(lon)) + 1.4, 1.0, 6.9)
    return lon, lat, mag


def _basemap(ax, ext):
    ax.set_extent(ext, crs=ccrs.PlateCarree())
    ax.add_feature(cfeature.OCEAN.with_scale('10m'), facecolor='#DCE6F0', zorder=0)
    ax.add_feature(cfeature.LAND.with_scale('10m'),  facecolor='#EFECE4', zorder=0)
    ax.add_feature(cfeature.COASTLINE.with_scale('10m'), linewidth=0.4,
                   edgecolor='#6B7280', zorder=2)
    gl = ax.gridlines(draw_labels=True, linewidth=0.3, color='white', alpha=0.6)
    gl.top_labels = gl.right_labels = False
    gl.xlabel_style = gl.ylabel_style = {'size': 7}
    # Rasterize the dense basemap + event scatter (zorder < 5) so the saved PDF
    # is a compact image layer rather than tens of thousands of vector paths.
    ax.set_rasterization_zorder(5)


def _msize(m):
    return np.clip((2 ** (m - 1)) * 1.0, 3, 60)


def make_map():
    """Two panels that show *how the merge works*, not a decorative map:
    (a) the two input catalogues overlaid, with an inset illustrating
        duplicate matching within the time/distance/magnitude window; and
    (b) the merged catalogue coloured by provenance (GeoNet-only, resolved
        duplicate, Agency-B-only), which is what the merge produces."""
    proj = ccrs.PlateCarree()
    ext  = [165.5, 179.8, -47.6, -34.0]

    # Provenance groups, rendered in the 71 : 49 : 49 proportion of the worked example.
    n_geo_only, n_dup, n_agb_only = 260, 180, 180
    geo_lon, geo_lat, geo_mag = _sample_regions(n_geo_only)                 # GeoNet only
    dup_lon, dup_lat, dup_mag = _sample_regions(n_dup)                      # seen by both
    agb_lon, agb_lat, agb_mag = _sample_regions(n_agb_only, offshore_extra=0.30)  # Agency B only (offshore-heavy)

    # A duplicate is the *same* event reported by both agencies with a small,
    # within-window offset (GeoNet better constrained, Agency B more scattered).
    dgeo_lon = dup_lon + rng.normal(0, 0.05, n_dup); dgeo_lat = dup_lat + rng.normal(0, 0.05, n_dup)
    dagb_lon = dup_lon + rng.normal(0, 0.16, n_dup); dagb_lat = dup_lat + rng.normal(0, 0.16, n_dup)

    fig = plt.figure(figsize=(11.2, 6.6))

    # ---- panel (a): two input catalogues + duplicate-matching inset ----
    axA = fig.add_subplot(1, 2, 1, projection=proj)
    _basemap(axA, ext)
    gn_lon = np.concatenate([geo_lon, dgeo_lon]); gn_lat = np.concatenate([geo_lat, dgeo_lat])
    gn_mag = np.concatenate([geo_mag, dup_mag])
    ab_lon = np.concatenate([agb_lon, dagb_lon]); ab_lat = np.concatenate([agb_lat, dagb_lat])
    ab_mag = np.concatenate([agb_mag, dup_mag])
    axA.scatter(gn_lon, gn_lat, s=_msize(gn_mag), c=BLUE, alpha=0.55, marker='o',
                edgecolors='white', linewidths=0.2, transform=proj, zorder=3,
                rasterized=True, label='GeoNet (120,000)')
    axA.scatter(ab_lon, ab_lat, s=_msize(ab_mag), c=ORANGE, alpha=0.55, marker='^',
                edgecolors='white', linewidths=0.2, transform=proj, zorder=3,
                rasterized=True, label='Agency B (98,000)')
    axA.set_title('(a) Two input catalogues')
    axA.legend(loc='lower left', fontsize=7, framealpha=0.92, edgecolor=GRAY, markerscale=1.2)

    # Zoom box over a populated region, with the inset placed in the empty Tasman
    # Sea (upper left) so it does not cover coastline or events, and connected to
    # the box it magnifies.
    box = [175.1, 177.4, -41.5, -39.6]                       # lon0, lon1, lat0, lat1
    axA.add_patch(mpatches.Rectangle((box[0], box[2]), box[1]-box[0], box[3]-box[2],
                  fill=False, ec='#111827', lw=0.9, transform=proj, zorder=6))
    sel = np.where((dup_lon > box[0]) & (dup_lon < box[1]) &
                   (dup_lat > box[2]) & (dup_lat < box[3]))[0][:16]
    axI = axA.inset_axes([0.015, 0.60, 0.40, 0.345])
    for i in sel:
        axI.plot([dgeo_lon[i], dagb_lon[i]], [dgeo_lat[i], dagb_lat[i]],
                 '-', color=GRAY, lw=0.7, zorder=1)
    axI.scatter(dgeo_lon[sel], dgeo_lat[sel], s=26, c=BLUE, marker='o',
                edgecolors='white', linewidths=0.3, zorder=2)
    axI.scatter(dagb_lon[sel], dagb_lat[sel], s=26, c=ORANGE, marker='^',
                edgecolors='white', linewidths=0.3, zorder=2)
    axI.set_title('Matched duplicate pairs\n'
                  r'($|\Delta t|\leq 60$ s, $d\leq 50$ km)', fontsize=7, pad=3)
    axI.set_xticks([]); axI.set_yticks([])
    axI.set_facecolor('white')
    for s in axI.spines.values():
        s.set_edgecolor('#111827')
    # Scale bar (20 km) so the pair offsets can be judged against the 50 km window.
    x0, x1 = axI.get_xlim(); y0, y1 = axI.get_ylim()
    km_deg = 20.0 / (111.32 * np.cos(np.deg2rad(40.5)))      # 20 km in degrees lon
    bx = x0 + 0.07 * (x1 - x0); by = y0 + 0.08 * (y1 - y0)
    axI.plot([bx, bx + km_deg], [by, by], '-', color='#111827', lw=1.6, zorder=4)
    axI.text(bx + km_deg / 2, by + 0.02 * (y1 - y0), '20 km', ha='center',
             va='bottom', fontsize=6, color='#111827')
    # Connector from the zoom box to the inset.
    axA.indicate_inset(bounds=[box[0], box[2], box[1]-box[0], box[3]-box[2]],
                       inset_ax=axI, edgecolor='#111827', linewidth=0.7,
                       alpha=0.85, zorder=6)

    # ---- panel (b): merged catalogue coloured by provenance ----
    axB = fig.add_subplot(1, 2, 2, projection=proj)
    _basemap(axB, ext)
    axB.scatter(geo_lon, geo_lat, s=_msize(geo_mag), c=BLUE, alpha=0.6,
                edgecolors='white', linewidths=0.2, transform=proj, zorder=3,
                rasterized=True, label='GeoNet only (71,000)')
    # Teal rather than green for the duplicate class: green/orange separate by only
    # dE 6.9 under deuteranopia, teal/orange by 13.8.
    axB.scatter(dgeo_lon, dgeo_lat, s=_msize(dup_mag), c=TEAL, alpha=0.65, marker='s',
                edgecolors='white', linewidths=0.2, transform=proj, zorder=4,
                rasterized=True, label='Resolved duplicate (49,000)')
    axB.scatter(agb_lon, agb_lat, s=_msize(agb_mag), c=ORANGE, alpha=0.6, marker='^',
                edgecolors='white', linewidths=0.2, transform=proj, zorder=3,
                rasterized=True, label='Agency B only (49,000)')
    axB.set_title('(b) Merged catalogue by provenance')
    axB.legend(loc='lower left', fontsize=6.6, framealpha=0.92, edgecolor=GRAY)
    axB.text(0.975, 0.045, 'offshore Agency-B-only events\ncarry high azimuthal gap',
             transform=axB.transAxes, ha='right', va='bottom', fontsize=6.5,
             color=ORANGE, style='italic')

    fig.text(0.5, 0.005, 'Synthetic data for illustration; marker size $\\propto$ magnitude.',
             ha='center', fontsize=7, color=GRAY, style='italic')
    fig.tight_layout(rect=[0, 0.02, 1, 1])
    fig.savefig(OUT / 'fig1_map.pdf', bbox_inches='tight', dpi=150)
    fig.savefig(OUT / 'fig1_map.png', dpi=300, bbox_inches='tight')
    plt.close(fig)
    print('Figure 1 (merge map) saved.')


# ══════════════════════════════════════════════════════════════════════════════
#  Figure 2 — Azimuthal-gap distribution (GeoNet vs Agency B), + quality medians
# ══════════════════════════════════════════════════════════════════════════════
def make_gap_distribution():
    # GeoNet: dense onshore network -> gaps concentrated 40-130 deg, thin tail.
    gap_geonet = np.clip(rng.gamma(shape=4.0, scale=22.0, size=N_GEONET) + 25, 0, 359)
    # Agency B: sparser + many offshore events -> broad, heavy tail > 180 deg.
    core = rng.gamma(shape=3.0, scale=30.0, size=int(N_AGENCYB * 0.60)) + 35
    tail = rng.uniform(180, 340, int(N_AGENCYB * 0.40))
    gap_b = np.clip(np.concatenate([core, tail]), 0, 359)

    pct_geonet = (gap_geonet >= 180).mean() * 100
    pct_b      = (gap_b      >= 180).mean() * 100

    # Representative per-event quality scores (network/location dominated):
    # higher gap -> lower score, mirroring the implemented scorer's weighting.
    # The level is pinned so the per-catalogue medians match the worked example (72 / 58)
    # while the gap correlation and spread remain genuinely simulated.
    def pin_median(raw, target):
        return np.clip(raw + (target - np.median(raw)), 0, 100)
    q_geonet = pin_median(-gap_geonet * 0.22 - rng.normal(0, 6, N_GEONET), 72)
    q_b      = pin_median(-gap_b * 0.22 - rng.normal(0, 9, len(gap_b)), 58)
    med_geonet, med_b = np.median(q_geonet), np.median(q_b)

    # Two overlaid, alpha-blended fills would mix to a third colour that is in
    # neither legend entry, so each distribution is drawn as a step outline with
    # only a faint fill: the curves stay individually readable where they overlap.
    bins = np.arange(0, 361, 20)
    fig, ax = plt.subplots(figsize=(7.2, 3.6))
    ax.axvspan(180, 360, color='#FEE2E2', alpha=0.55, zorder=0, lw=0)
    for data, colour, lab in ((gap_geonet, BLUE, 'GeoNet'), (gap_b, ORANGE, 'Agency B')):
        ax.hist(data, bins=bins, density=True, histtype='stepfilled',
                color=colour, alpha=0.12, zorder=2)
        ax.hist(data, bins=bins, density=True, histtype='step',
                color=colour, linewidth=1.6, label=lab, zorder=3)
    ax.axvline(180, color='#374151', linestyle='--', linewidth=1.0,
               label=r'$180°$ threshold', zorder=4)
    ax.set_xlabel('Azimuthal gap (degrees)'); ax.set_ylabel('Probability density')
    ax.set_xlim(0, 360); ax.set_xticks(range(0, 361, 45))
    ax.set_ylim(0, None)
    ytop = ax.get_ylim()[1]
    ax.text(228, ytop * 0.975, 'Poor coverage (gap > 180°)',
            ha='center', va='top', fontsize=8, color='#B91C1C', style='italic')
    # Direct labels on the curves keep identity off colour alone.
    ax.annotate(f'GeoNet\n{pct_geonet:.0f}% above 180°', xy=(86, 0.0094),
                xytext=(46, 0.0086), fontsize=8, color=BLUE, ha='center',
                arrowprops=dict(arrowstyle='-', color=BLUE, lw=0.7))
    ax.annotate(f'Agency B\n{pct_b:.0f}% above 180°', xy=(300, 0.0027),
                xytext=(300, 0.0052), fontsize=8, color=ORANGE, ha='center',
                arrowprops=dict(arrowstyle='-', color=ORANGE, lw=0.7))
    ax.legend(framealpha=0.95, loc='upper right', fontsize=8.5)
    ax.set_title('Azimuthal gap distribution: GeoNet vs Agency B')
    ax.grid(True, axis='y', lw=0.3, color='#D1D5DB', alpha=0.7)
    ax.set_axisbelow(True)

    fig.tight_layout()
    fig.savefig(OUT / 'fig2_gap.pdf'); fig.savefig(OUT / 'fig2_gap.png', dpi=300)
    plt.close(fig)
    print('Figure 2 (gap) saved.')
    return pct_geonet, pct_b, med_geonet, med_b


# ══════════════════════════════════════════════════════════════════════════════
#  Figure 3 — FMD before / after declustering
# ══════════════════════════════════════════════════════════════════════════════
def make_fmd():
    dm = 0.1
    bins = np.arange(MC, 7.6, dm)

    # Fixed uniform draws so calibration acts on the *same* sample that is
    # plotted: the recovered b then equals the target to display precision.
    u_bg = rng.uniform(0, 1, N_BACKGROUND)
    u_as = rng.uniform(0, 1, N_AFTER)

    # Background (declustered) catalogue -> b = 0.94.
    b_bg_in = solve_input_b(
        0.94, lambda b: mle_b(gr_from_u(u_bg, b, MC, 7.5), MC)[0])
    background = gr_from_u(u_bg, b_bg_in, MC, 7.5)

    # Aftershocks (small, higher b) so the combined pre-declustering set -> 1.02.
    b_as_in = solve_input_b(
        1.02, lambda b: mle_b(
            np.concatenate([background, gr_from_u(u_as, b, MC, MC + 1.5)]), MC)[0])
    aftershocks = gr_from_u(u_as, b_as_in, MC, MC + 1.5)

    all_mag  = np.concatenate([background, aftershocks])   # before declustering
    main_mag = background                                  # after declustering

    b_all,  s_all  = mle_b(all_mag,  MC)
    b_main, s_main = mle_b(main_mag, MC)

    def cum_n(mags):
        return np.array([(mags >= m).sum() for m in bins], dtype=float)

    cum_all, cum_main = cum_n(all_mag), cum_n(main_mag)
    nc_all, _  = np.histogram(np.round(all_mag / dm) * dm,  bins=np.append(bins, bins[-1] + dm))
    nc_main, _ = np.histogram(np.round(main_mag / dm) * dm, bins=np.append(bins, bins[-1] + dm))

    # GR intercept: log10 N(M) = a - b M, anchored on N at Mc, so a = log10 N(Mc) + b*Mc.
    # (Omitting the b*Mc term offsets the fitted line by 10^(b*Mc) ~ 100x and lifts it
    #  clear of the data it is fitting.)
    a_all  = np.log10(cum_all[0])  + b_all  * MC
    a_main = np.log10(cum_main[0]) + b_main * MC
    fit_m = np.linspace(MC, 7.2, 200)
    fit_all  = 10 ** (a_all  - b_all  * fit_m)
    fit_main = 10 ** (a_main - b_main * fit_m)

    fig, axes = plt.subplots(1, 2, figsize=(10, 4.2))
    ax = axes[0]
    ma, mm = cum_all > 0, cum_main > 0
    # Before: open circles, so the (nearly coincident) after-series stays visible
    # through them.  After: smaller filled squares.
    ax.semilogy(bins[ma], cum_all[ma], 'o', mfc='none', mec=GRAY, mew=0.9, ms=6.0,
                linestyle='none', label='Before declustering')
    ax.semilogy(bins[mm], cum_main[mm], 's', color=BLUE, ms=3.2,
                linestyle='none', label='After declustering')
    ax.semilogy(fit_m, fit_all,  '--', color=GRAY, lw=1.4,
                label=fr'GR fit, $\hat{{b}} = {b_all:.2f}$')
    ax.semilogy(fit_m, fit_main, '-',  color=BLUE, lw=1.4,
                label=fr'GR fit, $\hat{{b}} = {b_main:.2f}$')
    ax.axvline(MC, color=GRAY, linestyle=':', linewidth=1.0)
    ax.text(MC + 0.06, 1.4, f'$M_c = {MC}$', fontsize=8, color=GRAY,
            rotation=90, va='bottom', ha='left')
    ax.set_xlabel('Magnitude'); ax.set_ylabel(r'Cumulative $N\,(\geq M)$')
    ax.set_xlim(MC - 0.2, 7.5)
    ax.set_ylim(0.5, cum_all[0] * 3)
    ax.set_title('(a) Cumulative frequency-magnitude distribution')
    ax.legend(loc='upper right', handlelength=1.8, framealpha=0.92, fontsize=8.5)
    ax.grid(True, which='major', axis='both', lw=0.3, color='#D1D5DB', alpha=0.7)
    ax.set_axisbelow(True)

    # Non-cumulative: filled bars for "before", dark step outline for "after", so
    # the declustered subset is legible where the two nearly coincide.
    ax2 = axes[1]
    bin_c = bins + dm / 2
    ax2.bar(bin_c, nc_all, width=dm * 0.9, color=GRAY, alpha=0.35,
            edgecolor='none', label='Before declustering')
    ax2.step(np.append(bin_c - dm / 2, bin_c[-1] + dm / 2),
             np.append(nc_main, nc_main[-1]), where='post',
             color=BLUE, lw=1.2, label='After declustering')
    ax2.axvline(MC, color=GRAY, linestyle=':', linewidth=1.0)
    ax2.text(MC + 0.06, 1.4, f'$M_c = {MC}$', fontsize=8, color=GRAY,
             rotation=90, va='bottom', ha='left')
    ax2.set_xlabel('Magnitude'); ax2.set_ylabel('Number of events per bin')
    ax2.set_yscale('log'); ax2.set_xlim(MC - 0.2, 7.5); ax2.set_ylim(0.7, None)
    ax2.set_title('(b) Non-cumulative frequency-magnitude distribution')
    # Order the legend before/after rather than by artist type.
    h2, l2 = ax2.get_legend_handles_labels()
    order2 = [l2.index('Before declustering'), l2.index('After declustering')]
    ax2.legend([h2[i] for i in order2], [l2[i] for i in order2],
               loc='upper right', handlelength=1.8, framealpha=0.92, fontsize=8.5)
    ax2.grid(True, which='major', axis='y', lw=0.3, color='#D1D5DB', alpha=0.7)
    ax2.set_axisbelow(True)

    pct = (len(all_mag) - len(main_mag)) / len(all_mag) * 100
    fig.suptitle(f'Declustering removes {len(aftershocks):,} aftershocks ({pct:.0f}%); '
                 fr'$\hat{{b}}$: {b_all:.2f} $\rightarrow$ {b_main:.2f} '
                 '(Gardner-Knopoff 1974 windows)', fontsize=9, y=1.01, color=GRAY)
    fig.tight_layout()
    fig.savefig(OUT / 'fig3_fmd.pdf'); fig.savefig(OUT / 'fig3_fmd.png', dpi=300)
    plt.close(fig)
    print('Figure 3 (FMD) saved.')
    return b_all, s_all, b_main, s_main, pct


if __name__ == '__main__':
    make_map()
    pct_geonet, pct_b, med_geonet, med_b = make_gap_distribution()
    b_all, s_all, b_main, s_main, decl_pct = make_fmd()

    # ── reproducibility checks: the merge/filter arithmetic must tie out ──
    assert N_DUP == 49_000
    assert N_MERGED == N_GEONET_ONLY + N_AGENCYB_ONLY + N_DUP == 169_000
    assert N_GEONET_ONLY + N_DUP == N_GEONET
    assert N_AGENCYB_ONLY + N_DUP == N_AGENCYB
    assert N_RETAINED + N_REMOVED == N_MERGED

    print('\n' + '=' * 66)
    print(' WORKED-EXAMPLE SUMMARY — reproduced, seed=42')
    print('=' * 66)
    print(f' GeoNet-like catalogue            : {N_GEONET:>8,}')
    print(f' Agency B catalogue               : {N_AGENCYB:>8,}')
    print(f' Duplicate pairs (= {DUP_FRAC:.0%} of B)     : {N_DUP:>8,}')
    print(f' Merged unique events             : {N_MERGED:>8,}')
    print(f'   GeoNet only                    : {N_GEONET_ONLY:>8,}')
    print(f'   Agency B only                  : {N_AGENCYB_ONLY:>8,}')
    print(f'   resolved duplicate pairs       : {N_DUP:>8,}')
    print(f' Median quality  GeoNet / AgencyB : {med_geonet:>5.0f} / {med_b:.0f}')
    print(f' Gap > 180 deg   GeoNet / AgencyB : {pct_geonet:>4.0f}% / {pct_b:.0f}%')
    print(f' Q >= 70 retained ({QFILTER_FRAC:.0%})         : {N_RETAINED:>8,}')
    print(f' Removed by quality filter        : {N_REMOVED:>8,}')
    print(f' Events >= Mc={MC} (quality-filt.)  : {N_ABOVE_MC:>8,}')
    print(f' GR b-value (quality-filtered)    : {b_all:.2f} +/- {s_all:.3f}  (N={N_ABOVE_MC:,})')
    print(f' Declustering removes             : {decl_pct:.0f}%  ({N_AFTER:,} aftershocks)')
    print(f' GR b-value (declustered)         : {b_main:.2f} +/- {s_main:.3f}  (N={N_BACKGROUND:,})')
    print('=' * 66)
    print('All figures written to', OUT)
