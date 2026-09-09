"""
Reproduce the worked example for the CofC SRL submission.

This single, seeded script reproduces every quantity quoted in the worked
example and writes the three paper figures.  It (i) sizes the two
synthetic catalogues and their overlap, (ii) derives the duplicate-aware merge
bookkeeping arithmetically (these counts are definitional in the worked
example), (iii) simulates representative azimuthal-gap and quality
distributions and *measures* the quality-filter retention on them, and
(iv) builds a space-time synthetic catalogue above Mc, runs Gardner-Knopoff
(1974) declustering on it, and computes Gutenberg-Richter b-values before and
after.

Which numbers are inputs and which are outputs:
  inputs  -- the catalogue sizes, the 50% duplicate overlap, the quality
             threshold Q >= 70, the number of events above Mc, the injected
             clustered fraction, and the planted b-values of the independent
             and clustered populations;
  outputs -- the quality-filter retention, the fraction Gardner-Knopoff
             actually removes, and every b-value.  None of the b-values or
             removal fractions is calibrated to a target.

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
# Matplotlib stamps a CreationDate into PDF metadata, so identical content
# produced different bytes on every run and any rerun appeared to modify the
# committed figures.  Suppressing it makes the seeded script byte-reproducible.
PDF_META = {'CreationDate': None}

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
QMIN       = 70                             # quality threshold applied in Step 4
# The retained / removed counts are *not* constants: they are measured in
# make_gap_distribution() by applying Q >= QMIN to the simulated per-event
# quality scores of the merged provenance mix.

MC          = 2.0                           # magnitude of completeness
DM          = 0.1                           # magnitude reporting grid / bin width
N_ABOVE_MC  = 48_600                        # events >= Mc in the quality-filtered
                                            # set (design constant of the example)
CLUSTER_FRAC = 0.23                         # fraction of the above-Mc catalogue
                                            # *injected* as clustered aftershocks;
                                            # the fraction Gardner-Knopoff removes
                                            # is an output, not this number
N_AFTER      = int(round(N_ABOVE_MC * CLUSTER_FRAC))    # 11,178 injected aftershocks
N_BACKGROUND = N_ABOVE_MC - N_AFTER                     # 37,422 independent events

B_BACKGROUND = 1.00       # planted b of the independent (background) population
B_CLUSTER    = 1.30       # planted b of the injected aftershock population
M_SEED       = 4.5        # background events >= M_SEED seed aftershock sequences
T_SPAN_DAYS  = 5 * 365.25                   # January 2020 - December 2024
LON0, LON1   = 166.0, 179.0                 # synthetic New Zealand study box
LAT0, LAT1   = -47.0, -34.0
R_EARTH_KM   = 6371.0


def gr_from_u(u, b, mmin, mmax):
    """Inverse-CDF of a doubly-truncated Gutenberg-Richter law for fixed u."""
    m = mmin - np.log10(1 - u * (1 - 10 ** (-b * (mmax - mmin)))) / b
    return np.clip(m, mmin, mmax)


def gr_binned(u, b, mc, mmax, dm=DM):
    """Doubly-truncated GR sample *as a catalogue reports it*: on the dm grid.

    Magnitudes are drawn continuously from ``mc - dm/2`` (the lower edge of the
    lowest reported bin) and then rounded to the grid, so the lowest bin is
    fully populated.  This is the condition under which the Utsu (1966) /
    Bender (1983) binning correction used by mle_b() is valid; drawing from mc
    itself would half-fill the lowest bin and bias b low by a factor
    1/(1 + ln(10) b dm/2), about 11% at b = 1, dm = 0.1.
    """
    return np.round(gr_from_u(u, b, mc - dm / 2.0, mmax) / dm) * dm


def mle_b(mags, mc, dm=DM):
    """Aki (1965) / Utsu (1966) maximum-likelihood b for grid-reported magnitudes.

    ``mags`` are magnitudes on the dm reporting grid; events are selected by
    bin centre (>= mc - dm/2 selects the bin labelled mc and above), which is
    robust to the floating-point representation of the grid values.
    """
    m = np.round(np.asarray(mags) / dm) * dm
    m = m[m >= mc - dm / 2.0]
    n = len(m)
    if n < 2:
        return np.nan, np.nan
    b = np.log10(np.e) / (m.mean() - mc + dm / 2.0)
    return b, b / np.sqrt(n)


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
    fig.savefig(OUT / 'fig1_map.pdf', bbox_inches='tight', dpi=150, metadata=PDF_META)
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

    # ── quality filter, measured on the simulated scores ─────────────────────
    # Which Agency B events have a GeoNet counterpart is not arbitrary: the
    # duplicated half is the half inside GeoNet's detection footprint, i.e. the
    # better-covered one.  The 49,000 lowest-gap Agency B events are therefore
    # taken as the duplicate pairs and the remaining 49,000 - the offshore,
    # high-gap tail - as Agency-B-only.  GeoNet records essentially everything
    # onshore, so its duplicated members are just the first N_DUP of its
    # (i.i.d.) draws.
    order_b = np.argsort(gap_b, kind='stable')
    dup_b, only_b = order_b[:N_DUP], order_b[N_DUP:]
    dup_g, only_g = np.arange(N_DUP), np.arange(N_DUP, N_GEONET)
    # Quality-based resolution keeps the higher-scoring member of each pair.
    take_g  = q_geonet[dup_g] >= q_b[dup_b]
    q_dup   = np.where(take_g, q_geonet[dup_g], q_b[dup_b])
    gap_dup = np.where(take_g, gap_geonet[dup_g], gap_b[dup_b])
    merged_q   = np.concatenate([q_geonet[only_g], q_dup, q_b[only_b]])
    merged_gap = np.concatenate([gap_geonet[only_g], gap_dup, gap_b[only_b]])
    is_agb_only = np.zeros(len(merged_q), dtype=bool)
    is_agb_only[-len(only_b):] = True

    kept = merged_q >= QMIN
    q_frac = kept.mean()                      # <- retention, an output not a constant
    rm = ~kept
    rm_agb   = is_agb_only[rm].mean()         # share of the cut that is Agency-B-only
    rm_gap180 = (merged_gap[rm] >= 180).mean()  # share of the cut with gap > 180 deg
    hi_gap = merged_gap >= 180
    rm_gap_recall = (hi_gap & rm).sum() / hi_gap.sum()   # share of the high-gap
                                                         # population that is cut
    n_hi_gap = int(hi_gap.sum())

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
    fig.savefig(OUT / 'fig2_gap.pdf', metadata=PDF_META); fig.savefig(OUT / 'fig2_gap.png', dpi=300)
    plt.close(fig)
    print('Figure 2 (gap) saved.')
    return (pct_geonet, pct_b, med_geonet, med_b, q_frac, rm_agb, rm_gap180,
            rm_gap_recall, n_hi_gap)


# ══════════════════════════════════════════════════════════════════════════════
#  Gardner-Knopoff (1974) declustering — the same windows the platform applies
# ══════════════════════════════════════════════════════════════════════════════
def gk_window(m):
    """Gardner-Knopoff (1974) space-time windows, as tabulated by van Stiphout
    et al. (2012, Table 1) and implemented in lib/seismological-analysis.ts:

        L(M) = 10^(0.1238 M + 0.983) km
        T(M) = 10^(0.032  M + 2.7389) days   (M >= 6.5)
             = 10^(0.5409 M - 0.547)  days   (M <  6.5)
    """
    t = np.where(m >= 6.5, 10 ** (0.032 * m + 2.7389), 10 ** (0.5409 * m - 0.547))
    return t, 10 ** (0.1238 * m + 0.983)


def gardner_knopoff(t_days, lat, lon, mag):
    """Partition a catalogue into independent events and dependent events.

    Port of gardnerKnopoffDeclustering() in lib/seismological-analysis.ts:
    events are visited in order of decreasing magnitude and every not-yet-
    assigned event inside the visited event's L(M)/T(M) window is flagged as
    dependent; the events never flagged are the independent (declustered)
    catalogue.  Returns a boolean mask of the independent events.

    Candidates are restricted by binary search on the time-sorted catalogue, so
    the distance calculation only touches the events already inside T(M).
    """
    order = np.argsort(t_days, kind='stable')
    t_s = t_days[order]
    lat_r, lon_r = np.deg2rad(lat[order]), np.deg2rad(lon[order])
    cos_lat, mag_s = np.cos(lat_r), mag[order]
    t_win, l_win = gk_window(mag_s)

    dependent = np.zeros(len(t_s), dtype=bool)
    for i in np.argsort(-mag_s, kind='stable'):
        if dependent[i]:
            continue
        lo = np.searchsorted(t_s, t_s[i] - t_win[i], side='left')
        hi = np.searchsorted(t_s, t_s[i] + t_win[i], side='right')
        cand = ~dependent[lo:hi]
        cand[i - lo] = False                       # the visited event itself
        if not cand.any():
            continue
        # Haversine distance, as in the TypeScript implementation.
        dlat = lat_r[lo:hi] - lat_r[i]
        dlon = lon_r[lo:hi] - lon_r[i]
        a = np.sin(dlat / 2) ** 2 + cos_lat[i] * cos_lat[lo:hi] * np.sin(dlon / 2) ** 2
        d = 2 * R_EARTH_KM * np.arcsin(np.sqrt(np.clip(a, 0, 1)))
        dependent[lo:hi] |= cand & (d <= l_win[i])

    independent = np.zeros(len(t_days), dtype=bool)
    independent[order] = ~dependent
    return independent


def build_above_mc_catalogue():
    """Synthesise the above-Mc catalogue as events in space and time.

    An independent background population (planted b = B_BACKGROUND, uniform in
    the study box and in time) plus aftershock sequences nucleated on its
    M >= M_SEED events.  Sequence sizes follow the Utsu (1970) productivity
    relation, inter-event times the modified Omori law (Omori 1894; Utsu 1961),
    epicentres a disc of twice the Wells and Coppersmith (1994) subsurface
    rupture length, and magnitudes a GR law with the higher b of clustered
    seismicity, truncated one Bath (1965) magnitude unit below the mainshock.
    The clustered events are *injected*; how many of them (and how many
    background events) Gardner-Knopoff removes is then measured, not assumed.
    """
    # ---- background: independent in space, time and magnitude --------------
    bg_mag = gr_binned(rng.uniform(0, 1, N_BACKGROUND), B_BACKGROUND, MC, 7.5)
    bg_t   = rng.uniform(0, T_SPAN_DAYS, N_BACKGROUND)
    bg_lat = rng.uniform(LAT0, LAT1, N_BACKGROUND)
    bg_lon = rng.uniform(LON0, LON1, N_BACKGROUND)

    # ---- sequences on the background events large enough to have them ------
    seed = np.where(bg_mag >= M_SEED - DM / 2)[0]
    # Utsu (1970) productivity: N_aftershocks ~ 10^(alpha (M - M_SEED)), alpha = 0.8.
    weight = 10 ** (0.8 * (bg_mag[seed] - M_SEED))
    share = weight / weight.sum() * N_AFTER
    n_as = np.floor(share).astype(int)
    # Largest-remainder allocation so the sequences sum to exactly N_AFTER.
    short = N_AFTER - n_as.sum()
    if short > 0:
        n_as[np.argsort(-(share - n_as), kind='stable')[:short]] += 1

    idx = np.repeat(seed, n_as)                 # parent mainshock of each aftershock
    m_par, t_par = bg_mag[idx], bg_t[idx]
    lat_par, lon_par = bg_lat[idx], bg_lon[idx]

    # Modified Omori decay, observed only to the end of the catalogue.
    p, c = 1.1, 0.05
    t_max = np.minimum(365.0, T_SPAN_DAYS - t_par)
    u = rng.uniform(0, 1, N_AFTER)
    c1 = c ** (1 - p)
    dt = (c1 + u * ((t_max + c) ** (1 - p) - c1)) ** (1 / (1 - p)) - c

    # Aftershock zone: a disc of twice the subsurface rupture length,
    # log10 L_rup = 0.59 M - 2.44 (Wells and Coppersmith 1994, Table 2A, all types).
    r_km = 2 * 10 ** (0.59 * m_par - 2.44) * np.sqrt(rng.uniform(0, 1, N_AFTER))
    th = rng.uniform(0, 2 * np.pi, N_AFTER)
    as_lat = lat_par + (r_km * np.sin(th)) / 111.32
    as_lon = lon_par + (r_km * np.cos(th)) / (111.32 * np.cos(np.deg2rad(lat_par)))
    # Bath (1965): the largest aftershock is about 1.2 magnitude units below
    # the mainshock, so the sequence is drawn from a GR law truncated there.
    as_mag = gr_binned(rng.uniform(0, 1, N_AFTER), B_CLUSTER, MC, m_par - 1.2)

    t   = np.concatenate([bg_t,   t_par + dt])
    lat = np.concatenate([bg_lat, as_lat])
    lon = np.concatenate([bg_lon, as_lon])
    mag = np.concatenate([bg_mag, as_mag])
    injected = np.concatenate([np.zeros(N_BACKGROUND, bool), np.ones(N_AFTER, bool)])
    return t, lat, lon, mag, injected


# ══════════════════════════════════════════════════════════════════════════════
#  Figure 3 — FMD before / after declustering
# ══════════════════════════════════════════════════════════════════════════════
def make_fmd():
    dm = DM
    # Bin centres on the same grid the magnitudes are reported on.  Building the
    # centres with np.arange(MC, 7.6, dm) instead accumulates the 0.1 step and
    # drifts above the exactly-representable grid values, which pushes every bin
    # above M2.5 one bin low.
    n_bin = int(round((7.5 - MC) / dm)) + 1
    bins = MC + dm * np.arange(n_bin)

    t, lat, lon, mag, injected = build_above_mc_catalogue()
    independent = gardner_knopoff(t, lat, lon, mag)

    all_mag  = mag                             # before declustering
    main_mag = mag[independent]                # after declustering

    b_all,  s_all  = mle_b(all_mag,  MC)
    b_main, s_main = mle_b(main_mag, MC)
    # Estimator check, decoupled from declustering: the independent population
    # was planted at B_BACKGROUND, so this is the recovery error of the
    # Aki-Utsu MLE itself (the same estimator the platform applies).
    b_bg, s_bg = mle_b(mag[~injected], MC)
    # The independent events the windows sweep up are preferentially small (they
    # are visited last in the descending-magnitude pass, by which time the larger
    # events have already claimed them), which is why declustering flattens the
    # surviving distribution rather than returning the planted background b.
    b_cut_bg, _ = mle_b(mag[(~injected) & (~independent)], MC)

    def cum_n(mags):
        return np.array([(mags >= m - dm / 2).sum() for m in bins], dtype=float)

    def non_cum(mags):
        k = np.rint((mags - MC) / dm).astype(int)
        return np.bincount(k[(k >= 0) & (k < n_bin)], minlength=n_bin).astype(float)

    cum_all, cum_main = cum_n(all_mag), cum_n(main_mag)
    nc_all, nc_main = non_cum(all_mag), non_cum(main_mag)

    # GR intercept: log10 N(M) = a - b M, anchored on N at Mc, so a = log10 N(Mc) + b*Mc.
    # (Omitting the b*Mc term offsets the fitted line by 10^(b*Mc) ~ 100x and lifts it
    #  clear of the data it is fitting.)
    a_all  = np.log10(cum_all[0])  + b_all  * MC
    a_main = np.log10(cum_main[0]) + b_main * MC
    # Draw only over the magnitude range the synthetic catalogue actually spans.
    m_top = bins[cum_all > 0][-1]
    fit_m = np.linspace(MC, m_top + 0.2, 200)
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
    ax.set_xlim(MC - 0.2, m_top + 0.4)
    ax.set_ylim(0.5, cum_all[0] * 3)
    ax.set_title('(a) Cumulative frequency-magnitude distribution')
    ax.legend(loc='upper right', handlelength=1.8, framealpha=0.92, fontsize=8.5)
    ax.grid(True, which='major', axis='both', lw=0.3, color='#D1D5DB', alpha=0.7)
    ax.set_axisbelow(True)

    # Non-cumulative: filled bars for "before", dark step outline for "after", so
    # the declustered subset is legible where the two nearly coincide.
    ax2 = axes[1]
    # The magnitudes are reported on the grid, so ``bins`` are the bin centres:
    # the bars are drawn on them directly, not offset by half a bin.
    ax2.bar(bins, nc_all, width=dm * 0.9, color=GRAY, alpha=0.35,
            edgecolor='none', label='Before declustering')
    ax2.step(np.append(bins - dm / 2, bins[-1] + dm / 2),
             np.append(nc_main, nc_main[-1]), where='post',
             color=BLUE, lw=1.2, label='After declustering')
    ax2.axvline(MC, color=GRAY, linestyle=':', linewidth=1.0)
    ax2.text(MC + 0.06, 1.4, f'$M_c = {MC}$', fontsize=8, color=GRAY,
             rotation=90, va='bottom', ha='left')
    ax2.set_xlabel('Magnitude'); ax2.set_ylabel('Number of events per bin')
    ax2.set_yscale('log'); ax2.set_xlim(MC - 0.2, m_top + 0.4); ax2.set_ylim(0.7, None)
    ax2.set_title('(b) Non-cumulative frequency-magnitude distribution')
    # Order the legend before/after rather than by artist type.
    h2, l2 = ax2.get_legend_handles_labels()
    order2 = [l2.index('Before declustering'), l2.index('After declustering')]
    ax2.legend([h2[i] for i in order2], [l2[i] for i in order2],
               loc='upper right', handlelength=1.8, framealpha=0.92, fontsize=8.5)
    ax2.grid(True, which='major', axis='y', lw=0.3, color='#D1D5DB', alpha=0.7)
    ax2.set_axisbelow(True)

    n_removed = len(all_mag) - len(main_mag)
    pct = n_removed / len(all_mag) * 100
    fig.suptitle(f'Gardner-Knopoff (1974) declustering removes {n_removed:,} '
                 f'dependent events ({pct:.0f}%); '
                 fr'$\hat{{b}}$: {b_all:.2f} $\rightarrow$ {b_main:.2f}',
                 fontsize=9, y=1.01, color=GRAY)
    fig.tight_layout()
    fig.savefig(OUT / 'fig3_fmd.pdf', metadata=PDF_META); fig.savefig(OUT / 'fig3_fmd.png', dpi=300)
    plt.close(fig)
    print('Figure 3 (FMD) saved.')
    # Recovery of the planted background b is the point of the check: the
    # declustered estimate is compared against B_BACKGROUND, not calibrated to it.
    return {
        'b_all': b_all, 's_all': s_all, 'b_main': b_main, 's_main': s_main,
        'b_bg': b_bg, 's_bg': s_bg, 'b_cut_bg': b_cut_bg,
        'n_removed': n_removed, 'pct_removed': pct,
        'n_kept': len(main_mag),
        # Diagnostics: how much of the injected clustering the windows recover,
        # and how many independent events they take with it.
        'recall': injected[~independent].sum() / N_AFTER,
        'n_bg_removed': int((~injected & ~independent).sum()),
    }


if __name__ == '__main__':
    make_map()
    (pct_geonet, pct_b, med_geonet, med_b, q_frac, rm_agb, rm_gap180,
     rm_gap_recall, n_hi_gap) = make_gap_distribution()
    fmd = make_fmd()

    # Quality filter: retention measured on the simulated scores, not assumed.
    N_RETAINED = int(round(N_MERGED * q_frac))
    N_REMOVED  = N_MERGED - N_RETAINED

    # ── reproducibility checks: the merge/filter arithmetic must tie out ──
    assert N_DUP == 49_000
    assert N_MERGED == N_GEONET_ONLY + N_AGENCYB_ONLY + N_DUP == 169_000
    assert N_GEONET_ONLY + N_DUP == N_GEONET
    assert N_AGENCYB_ONLY + N_DUP == N_AGENCYB
    assert N_RETAINED + N_REMOVED == N_MERGED
    assert N_ABOVE_MC <= N_RETAINED          # the Mc cut acts on the retained set
    assert N_BACKGROUND + N_AFTER == N_ABOVE_MC
    # The estimator check has to be a real one: the b recovered from the planted
    # background must sit within a few counting-error standard deviations of
    # B_BACKGROUND, having never been calibrated to it.
    assert abs(fmd['b_bg'] - B_BACKGROUND) < 3 * fmd['s_bg']
    # Declustering has to be executed, not asserted: the windows recover most of
    # the injected sequences and do not return exactly the injected count.
    assert fmd['recall'] > 0.5 and fmd['n_removed'] != N_AFTER

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
    print(f' Q >= {QMIN} retained                 : {N_RETAINED:>8,}  ({q_frac:.1%})')
    print(f' Removed by quality filter        : {N_REMOVED:>8,}')
    print(f'   of the removed: Agency-B-only  : {rm_agb:>7.0%}')
    print(f'   of the removed: gap >= 180 deg : {rm_gap180:>7.0%}')
    print(f'   of the {n_hi_gap:,} gap >= 180 events : {rm_gap_recall:>6.0%} removed')
    print(f' Events >= Mc={MC} (quality-filt.)  : {N_ABOVE_MC:>8,}'
          f'  ({CLUSTER_FRAC:.0%} injected as clusters)')
    print(f' Planted b  background / clusters : {B_BACKGROUND:.2f} / {B_CLUSTER:.2f}')
    print(f' MLE b recovered from background  : {fmd["b_bg"]:.3f} +/- {fmd["s_bg"]:.3f}'
          f'  (planted {B_BACKGROUND:.2f}, error {fmd["b_bg"] - B_BACKGROUND:+.3f})')
    print(f' GR b-value (quality-filtered)    : {fmd["b_all"]:.3f} +/- {fmd["s_all"]:.3f}'
          f'  (N={N_ABOVE_MC:,})')
    print(f' Gardner-Knopoff removes          : {fmd["pct_removed"]:.0f}%'
          f'  ({fmd["n_removed"]:,} dependent events)')
    print(f'   injected aftershocks recovered : {fmd["recall"]:>7.0%}')
    print(f'   independent events also cut    : {fmd["n_bg_removed"]:>8,}'
          f'  (their own b = {fmd["b_cut_bg"]:.2f})')
    print(f' GR b-value (declustered)         : {fmd["b_main"]:.3f} +/- {fmd["s_main"]:.3f}'
          f'  (N={fmd["n_kept"]:,})')
    print(f'   error vs planted background b  : {fmd["b_main"] - B_BACKGROUND:+.3f}')
    print('=' * 66)
    print('All figures written to', OUT)
