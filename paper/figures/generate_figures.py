"""
Generate the three paper figures for CofC SRL submission.

All data are synthetic but statistically representative of the New Zealand
seismicity described in the worked example (Section 5).

Outputs
-------
figures/fig1_azimuthal_gap.pdf
figures/fig2_fmd_declustering.pdf
figures/fig3_map.pdf
"""

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.ticker as ticker
from matplotlib.colors import Normalize
from matplotlib.cm import ScalarMappable
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
TEAL   = '#0D9488'
GRAY   = '#6B7280'


# ══════════════════════════════════════════════════════════════════════════════
# Figure 1 — Azimuthal gap distribution
# ══════════════════════════════════════════════════════════════════════════════

def make_gap_distribution():
    """
    Simulate azimuthal gap distributions for two catalogues.

    GeoNet (dense onshore network):
      Most events well-covered → gap concentrated 50–130°, thin tail > 180°.
    Agency B (sparser, more offshore events):
      Broader distribution, substantial tail > 180°.
    """
    n_geonet  = 15_000
    n_agency  = 10_000

    # GeoNet: beta-like, mostly 60–140°
    gap_geonet = np.clip(
        rng.beta(3, 5, n_geonet) * 260 + 30,
        0, 359
    )
    # Agency B: more uniform, heavier tail
    core    = rng.beta(2, 3, int(n_agency * 0.65)) * 220 + 40
    tail    = rng.uniform(180, 340, int(n_agency * 0.35))
    gap_b   = np.clip(np.concatenate([core, tail]), 0, 359)

    bins = np.arange(0, 361, 20)

    fig, ax = plt.subplots(figsize=(7.2, 3.6))

    ax.hist(gap_geonet, bins=bins, density=True,
            alpha=0.75, color=BLUE, label='GeoNet', edgecolor='white', linewidth=0.4)
    ax.hist(gap_b, bins=bins, density=True,
            alpha=0.65, color=ORANGE, label='Agency B', edgecolor='white', linewidth=0.4)

    # vertical reference at 180°
    ax.axvline(180, color='black', linestyle='--', linewidth=0.9,
               label=r'$180°$ threshold')

    # shaded "poor coverage" region
    ax.axvspan(180, 360, alpha=0.07, color='red', zorder=0)
    ax.text(270, ax.get_ylim()[1] * 0.85 if ax.get_ylim()[1] > 0 else 0.005,
            'Poor coverage\n(gap > 180°)', ha='center', va='top',
            fontsize=8, color='firebrick', style='italic')

    ax.set_xlabel('Azimuthal gap (degrees)')
    ax.set_ylabel('Probability density')
    ax.set_xlim(0, 360)
    ax.set_xticks(range(0, 361, 45))
    ax.legend(framealpha=0.9)
    ax.set_title('Azimuthal gap distribution: GeoNet vs Agency B')

    # annotation: % above 180
    pct_geonet = (gap_geonet >= 180).mean() * 100
    pct_b      = (gap_b      >= 180).mean() * 100
    ax.annotate(
        f'GeoNet: {pct_geonet:.0f}% gap > 180°\nAgency B: {pct_b:.0f}% gap > 180°',
        xy=(0.98, 0.97), xycoords='axes fraction',
        ha='right', va='top', fontsize=8,
        bbox=dict(boxstyle='round,pad=0.3', fc='white', ec=GRAY, alpha=0.85),
    )

    fig.tight_layout()
    fig.savefig(OUT / 'fig1_azimuthal_gap.pdf')
    fig.savefig(OUT / 'fig1_azimuthal_gap.png', dpi=300)
    plt.close(fig)
    print('Figure 1 saved.')


# ══════════════════════════════════════════════════════════════════════════════
# Figure 2 — FMD before / after declustering
# ══════════════════════════════════════════════════════════════════════════════

def gutenberg_richter(m, a, b):
    return a - b * m


def simulate_catalogue(n_main, b_main, mc, m_max=7.5,
                        aftershock_fraction=0.23):
    """
    Simulate a catalogue with mainshocks following G-R and aftershocks
    clustering just above Mc (flattening the FMD slope slightly).
    """
    # mainshocks: truncated G-R
    u   = rng.uniform(0, 1, n_main)
    mag = mc - np.log10(1 - u * (1 - 10**(-b_main * (m_max - mc)))) / b_main
    mag = np.clip(mag, mc, m_max)

    # aftershocks: over-represented just above Mc, lower b
    n_after = int(n_main * aftershock_fraction / (1 - aftershock_fraction))
    b_after = b_main - 0.15   # lower b flattens the combined FMD
    u2      = rng.uniform(0, 1, n_after)
    mag_as  = mc - np.log10(1 - u2 * (1 - 10**(-b_after * (m_max - mc)))) / b_after
    mag_as  = np.clip(mag_as, mc, mc + 1.5)   # aftershocks mostly small

    all_mag = np.concatenate([mag, mag_as])
    labels  = np.array(['mainshock'] * n_main + ['aftershock'] * n_after)
    return all_mag, labels


def mle_b(magnitudes, mc, dm=0.1):
    m = magnitudes[magnitudes >= mc]
    if len(m) < 2:
        return np.nan, np.nan
    b   = np.log10(np.e) / (m.mean() - mc + dm / 2)
    sig = b / np.sqrt(len(m))
    return b, sig


def make_fmd():
    Mc   = 2.0
    dm   = 0.1
    bins = np.arange(Mc, 7.6, dm)

    all_mag, labels = simulate_catalogue(
        n_main=60_000, b_main=1.02, mc=Mc)

    main_mag = all_mag[labels == 'mainshock']

    b_all,  s_all  = mle_b(all_mag,  Mc)
    b_main, s_main = mle_b(main_mag, Mc)

    def cum_n(mags, bins):
        counts = []
        for m in bins:
            counts.append((mags >= m).sum())
        return np.array(counts, dtype=float)

    cum_all  = cum_n(all_mag,  bins)
    cum_main = cum_n(main_mag, bins)

    # non-cumulative (for annotation)
    nc_all, _  = np.histogram(all_mag,  bins=np.append(bins, bins[-1] + dm))
    nc_main, _ = np.histogram(main_mag, bins=np.append(bins, bins[-1] + dm))

    # fitted lines
    a_all  = np.log10(cum_all[0])
    a_main = np.log10(cum_main[0])
    fit_m  = np.linspace(Mc, 7.2, 200)
    fit_all  = 10 ** gutenberg_richter(fit_m, a_all,  b_all)
    fit_main = 10 ** gutenberg_richter(fit_m, a_main, b_main)

    # --- figure ---
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.2), sharey=False)

    # ── left panel: cumulative FMD ─────────────────────────────────────
    ax = axes[0]
    mask_all  = cum_all  > 0
    mask_main = cum_main > 0

    ax.semilogy(bins[mask_all],  cum_all[mask_all],
                'o', color=GRAY,  ms=4, alpha=0.7, label='Before declustering')
    ax.semilogy(bins[mask_main], cum_main[mask_main],
                's', color='black', ms=4, alpha=0.9, label='After declustering')

    ax.semilogy(fit_m, fit_all,  '--', color=GRAY,  lw=1.5)
    ax.semilogy(fit_m, fit_main, '-',  color='black', lw=1.5)

    ax.axvline(Mc, color='steelblue', linestyle=':', linewidth=1.2, label=f'$M_c = {Mc}$')

    # b-value annotations
    ax.text(0.98, 0.97,
            f'Before: $\\hat{{b}} = {b_all:.2f} \\pm {s_all:.2f}$\n'
            f'After:  $\\hat{{b}} = {b_main:.2f} \\pm {s_main:.2f}$',
            transform=ax.transAxes, ha='right', va='top', fontsize=9,
            bbox=dict(boxstyle='round,pad=0.35', fc='white', ec=GRAY, alpha=0.9))

    ax.set_xlabel('Magnitude')
    ax.set_ylabel('Cumulative N ($\\geq M$)')
    ax.set_xlim(Mc - 0.2, 7.5)
    ax.set_title('Cumulative frequency-magnitude distribution')
    ax.legend(loc='upper right', handlelength=1.5)

    # ── right panel: non-cumulative FMD ───────────────────────────────
    ax2 = axes[1]
    bin_c = bins + dm / 2

    ax2.bar(bin_c, nc_all,  width=dm * 0.85, color=GRAY,  alpha=0.6,
            label='Before declustering')
    ax2.bar(bin_c, nc_main, width=dm * 0.85, color='black', alpha=0.7,
            label='After declustering')

    ax2.axvline(Mc, color='steelblue', linestyle=':', linewidth=1.2,
                label=f'$M_c = {Mc}$')
    ax2.set_xlabel('Magnitude')
    ax2.set_ylabel('Number of events per bin')
    ax2.set_yscale('log')
    ax2.set_xlim(Mc - 0.2, 7.5)
    ax2.set_title('Non-cumulative frequency-magnitude distribution')
    ax2.legend(loc='upper right', handlelength=1.5)

    n_removed = len(all_mag) - len(main_mag)
    pct       = n_removed / len(all_mag) * 100
    fig.suptitle(
        f'Declustering removes {n_removed:,} events ({pct:.0f}%) from the catalogue  '
        f'(Gardner-Knopoff / Uhrhammer windows)',
        fontsize=9, y=1.01, color=GRAY
    )

    fig.tight_layout()
    fig.savefig(OUT / 'fig2_fmd_declustering.pdf')
    fig.savefig(OUT / 'fig2_fmd_declustering.png', dpi=300)
    plt.close(fig)
    print('Figure 2 saved.')


# ══════════════════════════════════════════════════════════════════════════════
# Figure 3 — Map view
# ══════════════════════════════════════════════════════════════════════════════

def make_map():
    """
    Synthetic New Zealand seismicity map showing:
    - Circle size    ∝ magnitude
    - Circle colour  ∝ depth (cyan→teal palette matching the CofC web app)
    """
    N = 3_000

    # geographic extents: NZ onshore + offshore Hikurangi margin
    lat_c, lon_c = -40.5, 175.5

    # cluster 1: Hikurangi subduction (offshore, shallow)
    n1 = int(N * 0.40)
    lat1 = rng.normal(-40.2, 1.2, n1)
    lon1 = rng.normal(176.5, 1.0, n1)
    dep1 = np.abs(rng.exponential(12, n1))          # mostly shallow
    mag1 = np.clip(rng.exponential(0.7, n1) + 1.5, 1.0, 6.8)

    # cluster 2: deep slab (Wellington–Hawke's Bay)
    n2 = int(N * 0.20)
    lat2 = rng.normal(-41.0, 0.8, n2)
    lon2 = rng.normal(175.5, 0.6, n2)
    dep2 = rng.normal(100, 30, n2)
    mag2 = np.clip(rng.exponential(0.6, n2) + 1.8, 1.5, 5.5)

    # cluster 3: Alpine Fault region (South Island, shallow)
    n3 = N - n1 - n2
    lat3 = rng.normal(-43.5, 1.0, n3)
    lon3 = rng.normal(171.5, 1.2, n3)
    dep3 = np.abs(rng.exponential(8, n3))
    mag3 = np.clip(rng.exponential(0.65, n3) + 1.2, 1.0, 7.2)

    lat = np.concatenate([lat1, lat2, lat3])
    lon = np.concatenate([lon1, lon2, lon3])
    dep = np.clip(np.concatenate([dep1, dep2, dep3]), 0, 300)
    mag = np.concatenate([mag1, mag2, mag3])

    # depth colour map — mirrors CofC app palette (cyan → dark teal)
    depth_bins  = [0, 15, 40, 100, 200, 400]
    depth_colors = ['#06B6D4', '#14B8A6', '#0D9488', '#0F766E', '#115E59']

    def depth_color(d):
        for i, (lo, hi) in enumerate(zip(depth_bins[:-1], depth_bins[1:])):
            if d < hi:
                return depth_colors[i]
        return depth_colors[-1]

    colors = [depth_color(d) for d in dep]

    # marker size ∝ magnitude (matching getMagnitudeRadius logic)
    sizes = (2 ** (mag - 1)) * 1.5
    sizes = np.clip(sizes, 2, 120)

    # sort small-to-large so large events render on top
    order = np.argsort(mag)
    lat, lon, dep, mag = lat[order], lon[order], dep[order], mag[order]
    colors = [colors[i] for i in order]
    sizes  = sizes[order]

    fig, ax = plt.subplots(figsize=(7.5, 8.0))
    ax.set_facecolor('#CBD5E1')   # ocean blue-grey, resembles tile background

    sc = ax.scatter(lon, lat, s=sizes, c=colors,
                    alpha=0.65, linewidths=0.3, edgecolors='white')

    # land outline approximation (very simplified NZ coastline boxes)
    north_island = plt.Polygon(
        [(172.6, -34.4), (178.5, -34.4), (178.5, -41.7),
         (174.8, -41.7), (172.6, -38.0), (172.6, -34.4)],
        closed=True, fc='#E5E7EB', ec='#9CA3AF', lw=0.6, zorder=0)
    south_island = plt.Polygon(
        [(166.4, -46.6), (174.3, -41.0), (174.3, -43.0),
         (171.0, -45.5), (166.4, -46.6)],
        closed=True, fc='#E5E7EB', ec='#9CA3AF', lw=0.6, zorder=0)
    ax.add_patch(north_island)
    ax.add_patch(south_island)

    # depth legend
    legend_handles = [
        mpatches.Patch(color=c, label=lbl) for c, lbl in zip(
            depth_colors,
            ['<15 km (Shallow)', '15–40 km', '40–100 km',
             '100–200 km', '>200 km (Deep)'])
    ]
    leg1 = ax.legend(handles=legend_handles, title='Depth (colour)',
                     loc='lower left', fontsize=7.5, title_fontsize=8,
                     framealpha=0.92, edgecolor=GRAY)
    ax.add_artist(leg1)

    # magnitude size legend
    for m_ex, label in [(2, 'M 2'), (4, 'M 4'), (6, 'M 6')]:
        ax.scatter([], [], s=(2 ** (m_ex - 1)) * 1.5, c=TEAL,
                   alpha=0.75, edgecolors='white', linewidths=0.3,
                   label=label)
    ax.legend(title='Magnitude (size)', loc='lower right',
              fontsize=7.5, title_fontsize=8,
              framealpha=0.92, edgecolor=GRAY)

    ax.set_xlim(165.0, 180.0)
    ax.set_ylim(-47.5, -34.0)
    ax.set_xlabel('Longitude (°E)')
    ax.set_ylabel('Latitude (°N)')
    ax.set_title(f'Merged New Zealand catalogue — {N:,} events\n'
                 f'Colour: depth  ·  Size: magnitude',
                 fontsize=10)

    # gridlines
    ax.grid(True, color='white', alpha=0.4, linewidth=0.5)
    ax.set_axisbelow(True)

    # data credit
    ax.text(0.99, 0.01,
            'Synthetic data for illustration\n(see Section 5)',
            transform=ax.transAxes, ha='right', va='bottom',
            fontsize=6.5, color=GRAY, style='italic')

    fig.tight_layout()
    fig.savefig(OUT / 'fig3_map.pdf')
    fig.savefig(OUT / 'fig3_map.png', dpi=300)
    plt.close(fig)
    print('Figure 3 saved.')


if __name__ == '__main__':
    make_gap_distribution()
    make_fmd()
    make_map()
    print('All figures written to', OUT)
