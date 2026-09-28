"""
Seeded synthetic two-agency New Zealand catalogue pair for the SRL worked example.

Everything in this module is an INPUT of the worked example: one population of
"true" earthquakes, two synthetic station networks, and the rules that turn an
earthquake recorded by a network into that agency's catalogue entry (its
location, depth, origin time and magnitude, and the metadata equation 1 of the
paper reads).  Nothing here scores, merges, estimates Mc or declusters: every
downstream number is computed from these reports by the platform's own
TypeScript engine (worked_example_engine.ts, run by generate_figures.py).

The construction, in order:

1. True earthquakes, 2020-01-01 to 2024-12-31.  An independent background with a
   Gutenberg-Richter law of b = 1.00 (continuous magnitudes from M 0.5), spread
   over seven source zones (SOURCE_ZONES), plus aftershock sequences on the
   background events of M >= 4.5: sizes by the Utsu (1970) productivity law,
   times by the modified Omori law (Omori 1894; Utsu 1961), epicentres in a disc
   of twice the Wells and Coppersmith (1994) rupture length, magnitudes from a
   b = 1.30 law truncated 1.2 units below the mainshock (Bath 1965).  The
   sequences are sized so that 23% of the true events of M >= 2.0 are
   aftershocks.  The background rate (about 3,200 true events of M >= 2.3 a
   year) is of the order of the New Zealand national rate.
2. Two station networks on New Zealand land (Natural Earth 1:10m coastline): a
   GeoNet-like national network (jittered grid, about 40 km spacing) and an
   Agency B regional network (about 30 km spacing) confined to the central and
   eastern North Island.
3. Recording.  A station records an earthquake when its hypocentral distance is
   below R(M) = 10^(1.11 + 0.38 M) km, scattered station by station by a
   log-normal factor (sigma_ln = 0.25).  An agency catalogues every earthquake
   that four or more of its stations record.
4. Reports.  From the recording stations of each report: the azimuthal gap
   (largest azimuthal gap between recording stations), the used-station count
   and the nearest-station distance.  Uncertainties follow the stated scalings
   in make_reports(), and the reported epicentre, depth, origin time and
   magnitude are the true values perturbed by errors of exactly the reported
   size, so the stated uncertainties are honest.  Where the depth uncertainty
   would exceed DEPTH_UNRESOLVED_KM the agency fixes the depth (operator
   assigned) and reports no depth uncertainty.  Both agencies report analyst-
   reviewed (manual, reviewed) ML magnitudes; the GeoNet-like catalogue to full
   precision, Agency B to 0.1.

All randomness comes from one numpy Generator seeded with SEED; the draws are
made in a fixed order, so the catalogues are reproduced exactly.
"""

from __future__ import annotations

import numpy as np

SEED = 42

# ---------------------------------------------------------------------------
# Time and space
# ---------------------------------------------------------------------------
T0_ISO = '2020-01-01T00:00:00Z'
T_SPAN_DAYS = 1827.0                     # 2020-01-01 .. 2024-12-31 inclusive
LON0, LON1 = 166.0, 179.0                # generator domain (true epicentres)
LAT0, LAT1 = -47.5, -34.5
R_EARTH_KM = 6371.0
KM_PER_DEG = 111.32

# ---------------------------------------------------------------------------
# True earthquake population
# ---------------------------------------------------------------------------
N_BACKGROUND = 1_000_000                 # true background events, M >= M_MIN_TRUE
M_MIN_TRUE = 0.5
M_MAX = 7.5
B_BACKGROUND = 1.00                      # planted b of the independent population
B_CLUSTER = 1.30                         # planted b of the injected aftershocks
M_SEED = 4.5                             # background events >= M_SEED seed sequences
UTSU_ALPHA = 0.8                         # productivity ~ 10^(alpha (M - M_SEED))
CLUSTER_FRAC_M2 = 0.23                   # share of true events >= M 2.0 injected as aftershocks
BATH_DM = 1.2                            # largest aftershock this far below its mainshock
OMORI_P, OMORI_C_DAYS = 1.1, 0.05
AFTERSHOCK_MAX_DAYS = 365.0

# Source zones of the background: centre (lon, lat), Gaussian spread along and
# across strike (km), strike azimuth (degrees clockwise from north), depth law
# (km: uniform between two depths, or a minimum depth plus an exponential tail
# of the given scale, capped), share of the background.  The last zone is
# spread evenly over the generator domain (mostly offshore).
SOURCE_ZONES = [
    # name,                        lon,    lat,   sd_along, sd_across, strike, depth law,             weight
    ('Hikurangi margin',           177.3, -40.0, 170.0, 45.0, 35.0, ('uniform', 8.0, 30.0),       0.19),
    ('Central North Island crust', 176.0, -39.0, 150.0, 60.0, 40.0, ('uniform', 2.0, 15.0),       0.22),
    ('North Island slab',          175.8, -39.6, 190.0, 60.0, 40.0, ('exp', 40.0, 30.0, 250.0),   0.16),
    ('Marlborough-Canterbury',     173.2, -42.4, 130.0, 60.0, 50.0, ('uniform', 3.0, 20.0),       0.16),
    ('Alpine Fault',               170.5, -43.6, 180.0, 50.0, 55.0, ('uniform', 2.0, 15.0),       0.14),
    ('Fiordland-Puysegur',         166.9, -45.6, 110.0, 45.0, 25.0, ('exp', 5.0, 25.0, 150.0),    0.08),
    ('Distributed offshore',       None,  None,   None,  None, None, ('uniform', 5.0, 30.0),       0.05),
]

# ---------------------------------------------------------------------------
# Station networks
# ---------------------------------------------------------------------------
# (grid spacing in latitude, in longitude, jitter as a fraction of the spacing,
#  optional bounding region [lon0, lon1, lat0, lat1])
GEONET_LIKE_NETWORK = dict(dlat=0.36, dlon=0.47, jitter=0.35, region=None)
AGENCY_B_NETWORK = dict(dlat=0.27, dlon=0.35, jitter=0.35, region=(175.5, 178.6, -41.4, -37.6))

# ---------------------------------------------------------------------------
# Recording and report model
# ---------------------------------------------------------------------------
REC_A, REC_B = 1.11, 0.38                # log10 R(M) = REC_A + REC_B * M  (km, hypocentral)
REC_SIGMA_LN = 0.25                      # station-by-station scatter of the recording distance
MIN_STATIONS = 4                         # stations needed to locate (and so catalogue) an event

REPORT_MODEL = {
    'GeoNet-like': dict(
        rms_median=0.20,                 # s, arrival-time residual (national 1-D velocity model)
        mag_error_floor=0.05,            # magnitude uncertainty = floor + scale / sqrt(n_amp)
        mag_error_scale=0.30,
        mag_decimals=None,               # magnitudes reported to full precision
        fixed_depth_km=12.0,             # depth assigned when the depth is unresolved
        agency_id='SYNG',
    ),
    'Agency B': dict(
        rms_median=0.14,                 # s, local 3-D velocity model
        mag_error_floor=0.05,
        mag_error_scale=0.30,
        mag_decimals=1,                  # magnitudes reported to 0.1
        fixed_depth_km=10.0,
        agency_id='SYNB',
    ),
}
DEPTH_UNRESOLVED_KM = 20.0               # depth uncertainty above which the depth is fixed
S_PICK_PROB = 0.6                        # chance a recording station also contributes an S phase


# ═══════════════════════════════════════════════════════════════════════════
#  Geometry helpers
# ═══════════════════════════════════════════════════════════════════════════
def _unit_xyz(lat, lon):
    la, lo = np.deg2rad(lat), np.deg2rad(lon)
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], axis=-1)


def _bearing_deg(lat1, lon1, lat2, lon2):
    """Initial great-circle bearing from point 1 to point 2, degrees in [0, 360)."""
    p1, p2 = np.deg2rad(lat1), np.deg2rad(lat2)
    dl = np.deg2rad(lon2 - lon1)
    y = np.sin(dl) * np.cos(p2)
    x = np.cos(p1) * np.sin(p2) - np.sin(p1) * np.cos(p2) * np.cos(dl)
    return np.rad2deg(np.arctan2(y, x)) % 360.0


def recording_radius_km(mag):
    return 10.0 ** (REC_A + REC_B * np.asarray(mag, dtype=float))


def nz_land():
    """New Zealand land (Natural Earth 1:10m) clipped to the generator domain."""
    import cartopy.io.shapereader as shpreader
    import shapely
    from shapely.geometry import box
    path = shpreader.natural_earth(resolution='10m', category='physical', name='land')
    domain = box(LON0 - 0.5, LAT0 - 0.5, LON1 + 0.5, LAT1 + 0.5)
    parts = [g.intersection(domain) for g in shpreader.Reader(path).geometries() if g.intersects(domain)]
    return shapely.unary_union(parts)


def station_grid(land, rng, dlat, dlon, jitter, region=None):
    """Jittered grid of station sites on land (optionally inside a lon/lat region)."""
    import shapely
    lon0, lon1, lat0, lat1 = region if region is not None else (LON0, LON1, LAT0, LAT1)
    lats = np.arange(lat0 + dlat / 2, lat1, dlat)
    lons = np.arange(lon0 + dlon / 2, lon1, dlon)
    glon, glat = np.meshgrid(lons, lats)
    glon = glon.ravel() + rng.uniform(-jitter, jitter, glon.size) * dlon
    glat = glat.ravel() + rng.uniform(-jitter, jitter, glat.size) * dlat
    on_land = shapely.contains_xy(land, glon, glat)
    return glat[on_land], glon[on_land]


# ═══════════════════════════════════════════════════════════════════════════
#  True earthquakes
# ═══════════════════════════════════════════════════════════════════════════
def _gr_continuous(u, b, mmin, mmax):
    """Inverse CDF of a doubly truncated Gutenberg-Richter law (continuous)."""
    return mmin - np.log10(1.0 - u * (1.0 - 10.0 ** (-b * (mmax - mmin)))) / b


def _zone_positions(rng, n_by_zone):
    lat_all, lon_all, z_all, zone_all = [], [], [], []
    for k, (name, lon_c, lat_c, sd_a, sd_c, strike, depth_law, _w) in enumerate(SOURCE_ZONES):
        need = int(n_by_zone[k])
        lat_k, lon_k = np.empty(0), np.empty(0)
        while lat_k.size < need:
            m = int((need - lat_k.size) * 1.3) + 16
            if lon_c is None:
                la = rng.uniform(LAT0, LAT1, m)
                lo = rng.uniform(LON0, LON1, m)
            else:
                a = rng.normal(0.0, sd_a, m)
                c = rng.normal(0.0, sd_c, m)
                th = np.deg2rad(strike)
                east = a * np.sin(th) + c * np.cos(th)
                north = a * np.cos(th) - c * np.sin(th)
                la = lat_c + north / KM_PER_DEG
                lo = lon_c + east / (KM_PER_DEG * np.cos(np.deg2rad(lat_c)))
            inside = (la >= LAT0) & (la <= LAT1) & (lo >= LON0) & (lo <= LON1)
            lat_k = np.concatenate([lat_k, la[inside]])
            lon_k = np.concatenate([lon_k, lo[inside]])
        lat_all.append(lat_k[:need]); lon_all.append(lon_k[:need])
        if depth_law[0] == 'uniform':
            z_all.append(rng.uniform(depth_law[1], depth_law[2], need))
        else:
            _, zmin, scale, zmax = depth_law
            z_all.append(np.minimum(zmin + rng.exponential(scale, need), zmax))
        zone_all.append(np.full(need, k, dtype=np.int16))
    return (np.concatenate(lat_all), np.concatenate(lon_all),
            np.concatenate(z_all), np.concatenate(zone_all))


def true_population(rng, n_background=N_BACKGROUND):
    """The true earthquakes: independent background plus injected aftershock sequences."""
    weights = np.array([z[-1] for z in SOURCE_ZONES], dtype=float)
    weights /= weights.sum()
    zone_of = rng.choice(len(SOURCE_ZONES), size=n_background, p=weights)
    n_by_zone = np.bincount(zone_of, minlength=len(SOURCE_ZONES))
    bg_lat, bg_lon, bg_z, bg_zone = _zone_positions(rng, n_by_zone)
    # Shuffle so that the zone blocks are not contiguous in the event order.
    perm = rng.permutation(n_background)
    bg_lat, bg_lon, bg_z, bg_zone = bg_lat[perm], bg_lon[perm], bg_z[perm], bg_zone[perm]
    bg_t = rng.uniform(0.0, T_SPAN_DAYS, n_background)
    bg_m = _gr_continuous(rng.uniform(0, 1, n_background), B_BACKGROUND, M_MIN_TRUE, M_MAX)

    # ---- aftershock sequences ------------------------------------------------
    seed_idx = np.where(bg_m >= M_SEED)[0]
    n_bg_m2 = int((bg_m >= 2.0).sum())
    n_as_m2 = int(round(CLUSTER_FRAC_M2 / (1.0 - CLUSTER_FRAC_M2) * n_bg_m2))
    w = 10.0 ** (UTSU_ALPHA * (bg_m[seed_idx] - M_SEED))
    share = w / w.sum() * n_as_m2
    n2 = np.floor(share).astype(int)
    short = n_as_m2 - n2.sum()
    if short > 0:                                   # largest-remainder allocation
        n2[np.argsort(-(share - n2), kind='stable')[:short]] += 1
    # Each sequence also has aftershocks between M_MIN_TRUE and 2.0, in the
    # proportion its own truncated b = 1.30 law implies.
    mtop = bg_m[seed_idx] - BATH_DM
    p_lo = 1.0 - 10.0 ** (-B_CLUSTER * (2.0 - M_MIN_TRUE))            # mass in [M_MIN_TRUE, 2)
    p_hi = 10.0 ** (-B_CLUSTER * (2.0 - M_MIN_TRUE)) - 10.0 ** (-B_CLUSTER * (mtop - M_MIN_TRUE))
    n1 = np.rint(n2 * p_lo / p_hi).astype(int)

    par_hi = np.repeat(seed_idx, n2)
    par_lo = np.repeat(seed_idx, n1)
    m_hi = _gr_continuous(rng.uniform(0, 1, par_hi.size), B_CLUSTER, 2.0, bg_m[par_hi] - BATH_DM)
    m_lo = _gr_continuous(rng.uniform(0, 1, par_lo.size), B_CLUSTER, M_MIN_TRUE, 2.0)
    parent = np.concatenate([par_hi, par_lo])
    as_m = np.concatenate([m_hi, m_lo])
    n_as = parent.size

    t_par = bg_t[parent]
    t_max = np.minimum(AFTERSHOCK_MAX_DAYS, T_SPAN_DAYS - t_par)
    u = rng.uniform(0, 1, n_as)
    c1 = OMORI_C_DAYS ** (1 - OMORI_P)
    dt = (c1 + u * ((t_max + OMORI_C_DAYS) ** (1 - OMORI_P) - c1)) ** (1 / (1 - OMORI_P)) - OMORI_C_DAYS
    # Rupture length, log10 L = 0.59 M - 2.44 (Wells and Coppersmith 1994, all slip types).
    r_km = 2.0 * 10.0 ** (0.59 * bg_m[parent] - 2.44) * np.sqrt(rng.uniform(0, 1, n_as))
    th = rng.uniform(0, 2 * np.pi, n_as)
    as_lat = bg_lat[parent] + r_km * np.sin(th) / KM_PER_DEG
    as_lon = bg_lon[parent] + r_km * np.cos(th) / (KM_PER_DEG * np.cos(np.deg2rad(bg_lat[parent])))
    as_z = np.clip(bg_z[parent] + rng.normal(0.0, 3.0, n_as), 0.5, None)

    return {
        't_days': np.concatenate([bg_t, t_par + dt]),
        'lat': np.concatenate([bg_lat, as_lat]),
        'lon': np.concatenate([bg_lon, as_lon]),
        'depth': np.concatenate([bg_z, as_z]),
        'mag': np.concatenate([bg_m, as_m]),
        'zone': np.concatenate([bg_zone, bg_zone[parent]]),
        'is_aftershock': np.concatenate([np.zeros(n_background, bool), np.ones(n_as, bool)]),
        # index of the mainshock in this same array (-1 for background events)
        'parent': np.concatenate([np.full(n_background, -1), parent]),
    }


# ═══════════════════════════════════════════════════════════════════════════
#  Recording by a network
# ═══════════════════════════════════════════════════════════════════════════
def record(truth, st_lat, st_lon, rng, chunk=60_000):
    """Which true earthquakes a network catalogues, and the recording geometry.

    Returns a dict with, for every true event: n (recording stations), gap
    (deg), dmin (nearest recording station, epicentral km), n_s (stations with
    an S pick) - and 'detected' (n >= MIN_STATIONS).  Random draws (station
    scatter, S picks) are made only for events that could possibly reach
    MIN_STATIONS, in event order, so the stream is deterministic.
    """
    n_ev = truth['lat'].size
    st_xyz = _unit_xyz(st_lat, st_lon) * R_EARTH_KM                      # (S, 3)
    out_n = np.zeros(n_ev, np.int32)
    out_gap = np.full(n_ev, 360.0)
    out_dmin = np.full(n_ev, np.nan)
    out_ns = np.zeros(n_ev, np.int32)
    k4 = MIN_STATIONS - 1
    for s in range(0, n_ev, chunk):
        e = min(s + chunk, n_ev)
        lat, lon, z, m = (truth['lat'][s:e], truth['lon'][s:e],
                          truth['depth'][s:e], truth['mag'][s:e])
        epi = _unit_xyz(lat, lon) * R_EARTH_KM
        hyp = _unit_xyz(lat, lon) * (R_EARTH_KM - z)[:, None]
        d_hyp = np.linalg.norm(hyp[:, None, :] - st_xyz[None, :, :], axis=2)   # (C, S)
        r = recording_radius_km(m)
        # Screen: an event whose 4th-nearest station lies beyond R(M) e^(4 sigma)
        # cannot be recorded by four stations; no random draws are spent on it.
        d4 = np.partition(d_hyp, k4, axis=1)[:, k4]
        cand = np.where(d4 <= r * np.exp(4.0 * REC_SIGMA_LN))[0]
        if cand.size == 0:
            continue
        eps = rng.normal(0.0, REC_SIGMA_LN, (cand.size, st_lat.size))
        rec = d_hyp[cand] <= (r[cand, None] * np.exp(eps))
        n = rec.sum(axis=1)
        s_pick = rec & (rng.uniform(0, 1, rec.shape) < S_PICK_PROB)
        ok = n >= MIN_STATIONS
        idx = cand[ok]
        rec = rec[ok]
        gidx = s + idx
        out_n[gidx] = n[ok]
        out_ns[gidx] = s_pick[ok].sum(axis=1)
        # Epicentral distance to the nearest RECORDING station.
        d_epi = np.linalg.norm(epi[idx][:, None, :] - st_xyz[None, :, :], axis=2)
        out_dmin[gidx] = np.where(rec, d_epi, np.inf).min(axis=1)
        # Azimuthal gap: the largest gap between the azimuths of the recording stations.
        az = _bearing_deg(lat[idx][:, None], lon[idx][:, None], st_lat[None, :], st_lon[None, :])
        az = np.where(rec, az, np.inf)
        az.sort(axis=1)
        nn = n[ok]
        with np.errstate(invalid='ignore'):
            inner = np.diff(az, axis=1)
        valid = np.arange(inner.shape[1])[None, :] < (nn - 1)[:, None]
        inner = np.where(valid, inner, -np.inf).max(axis=1)
        last = az[np.arange(az.shape[0]), nn - 1]
        wrap = az[:, 0] + 360.0 - last
        out_gap[gidx] = np.maximum(inner, wrap)
    return {'n': out_n, 'gap': out_gap, 'dmin': out_dmin, 'n_s': out_ns,
            'detected': out_n >= MIN_STATIONS}


# ═══════════════════════════════════════════════════════════════════════════
#  Reports
# ═══════════════════════════════════════════════════════════════════════════
def make_reports(agency, truth, rec, rng):
    """Catalogue entries of one agency for the true events it records."""
    p = REPORT_MODEL[agency]
    idx = np.where(rec['detected'])[0]
    n = rec['n'][idx].astype(float)
    gap = rec['gap'][idx]
    dmin = rec['dmin'][idx]
    z_true = truth['depth'][idx]
    k = idx.size

    # Horizontal uncertainty (km): grows with gap beyond 150 deg and with the
    # distance outside the network, falls with the number of stations.
    sig_h = (0.9 * np.sqrt(6.0 / n) * np.exp(np.maximum(0.0, gap - 150.0) / 70.0)
             * (1.0 + dmin / 80.0) * np.exp(rng.normal(0.0, 0.25, k)))
    sig_h = np.clip(sig_h, 0.1, 99.0)
    # Depth uncertainty (km): poorly resolved when the nearest station is far
    # compared with the depth.
    sig_z = 1.6 * sig_h * (1.0 + dmin / (z_true + 5.0)) * np.exp(rng.normal(0.0, 0.25, k))
    depth_fixed = sig_z > DEPTH_UNRESOLVED_KM
    # Origin-time uncertainty (s).
    sig_t = 0.05 + sig_h / 7.0 * np.exp(rng.normal(0.0, 0.2, k))
    # Arrival-time RMS residual (s).
    rms = p['rms_median'] * np.exp(rng.normal(0.0, 0.3, k)) * (1.0 + dmin / 200.0)
    # Magnitude: stations with amplitudes, and the uncertainty they give.
    n_amp = np.maximum(1, np.rint(n * rng.uniform(0.6, 0.95, k))).astype(int)
    sig_m = p['mag_error_floor'] + p['mag_error_scale'] / np.sqrt(n_amp)

    # Reported values: true value plus an error of exactly the reported size.
    th = rng.uniform(0, 2 * np.pi, k)
    rad = sig_h * np.sqrt(-np.log(rng.uniform(1e-12, 1, k)))   # Rayleigh, RMS = sig_h
    lat = truth['lat'][idx] + rad * np.sin(th) / KM_PER_DEG
    lon = truth['lon'][idx] + rad * np.cos(th) / (KM_PER_DEG * np.cos(np.deg2rad(truth['lat'][idx])))
    z_err = rng.normal(0.0, 1.0, k) * sig_z
    depth = np.where(depth_fixed, p['fixed_depth_km'], np.clip(z_true + z_err, 0.0, None))
    t_days = truth['t_days'][idx] + rng.normal(0.0, 1.0, k) * sig_t / 86400.0
    mag = truth['mag'][idx] + rng.normal(0.0, 1.0, k) * sig_m
    if p['mag_decimals'] is not None:
        mag = np.round(mag, p['mag_decimals'])

    # A catalogue lists its events in origin-time order (all draws are made above, so
    # the order does not change any value).
    order = np.argsort(t_days, kind='stable')
    out = {
        'agency': agency,
        'true_index': idx,
        't_days': t_days, 'lat': lat, 'lon': lon, 'depth': depth, 'depth_fixed': depth_fixed,
        'mag': mag,
        'horizontal_uncertainty': sig_h,
        'depth_uncertainty': np.where(depth_fixed, np.nan, sig_z),
        'time_uncertainty': sig_t,
        'azimuthal_gap': gap,
        'used_station_count': rec['n'][idx],
        'used_phase_count': rec['n'][idx] + rec['n_s'][idx],
        'standard_error': rms,
        'magnitude_uncertainty': sig_m,
        'magnitude_station_count': n_amp,
        'minimum_distance_km': dmin,
    }
    return {key: (value[order] if isinstance(value, np.ndarray) else value) for key, value in out.items()}


def build(seed=SEED, n_background=N_BACKGROUND, thin=None):
    """Build the stations, the true population and both agencies' reports.

    ``thin`` (0 < thin < 1) keeps each true earthquake with that probability,
    AFTER the full-scale population has been drawn, so a thinned pair is a
    random subset of the same earthquakes (used for the browser screenshots).
    """
    rng = np.random.default_rng(seed)
    land = nz_land()
    g_lat, g_lon = station_grid(land, rng, **GEONET_LIKE_NETWORK)
    b_lat, b_lon = station_grid(land, rng, **AGENCY_B_NETWORK)
    truth = true_population(rng, n_background)
    if thin is not None:
        keep = np.random.default_rng(seed + 1).uniform(0, 1, truth['lat'].size) < thin
        truth = {k: v[keep] for k, v in truth.items()}
        # Parents refer to positions in the full array; remap (or drop) them.
        new_pos = np.full(keep.size, -1)
        new_pos[keep] = np.arange(keep.sum())
        truth['parent'] = np.where(truth['parent'] >= 0, new_pos[np.maximum(truth['parent'], 0)], -1)
    rec_g = record(truth, g_lat, g_lon, rng)
    rec_b = record(truth, b_lat, b_lon, rng)
    rep_g = make_reports('GeoNet-like', truth, rec_g, rng)
    rep_b = make_reports('Agency B', truth, rec_b, rng)
    return {
        'truth': truth,
        'stations': {'GeoNet-like': (g_lat, g_lon), 'Agency B': (b_lat, b_lon)},
        'reports': {'GeoNet-like': rep_g, 'Agency B': rep_b},
    }


# ═══════════════════════════════════════════════════════════════════════════
#  Serialisation for the TypeScript engine
# ═══════════════════════════════════════════════════════════════════════════
CATALOGUES = (
    # agency key, catalogue id, catalogue name, id prefix
    ('GeoNet-like', 'synthetic-geonet-like', 'Synthetic GeoNet-like catalogue', 'synG-'),
    ('Agency B', 'synthetic-agency-b', 'Synthetic Agency B catalogue', 'synB-'),
)


def _clean(values, decimals=None):
    """A JSON-ready list: NaN -> None, optional rounding."""
    arr = np.asarray(values, dtype=float)
    if decimals is not None:
        arr = np.round(arr, decimals)
    return [None if not np.isfinite(v) else float(v) for v in arr]


def engine_input(built, options=None):
    """The columnar JSON document run_worked_example.ts reads."""
    cats, truth = [], {}
    for agency, cat_id, name, prefix in CATALOGUES:
        r = built['reports'][agency]
        n = r['lat'].size
        ids = [f'{prefix}{k:07d}' for k in range(n)]
        mag_dec = REPORT_MODEL[agency]['mag_decimals']
        cols = {
            'id': ids,
            'source_id': ids,
            't_days': _clean(r['t_days'], 9),
            'latitude': _clean(r['lat'], 5),
            'longitude': _clean(r['lon'], 5),
            'depth': _clean(r['depth'], 3),
            'depth_type': ['operator assigned' if f else 'from location' for f in r['depth_fixed']],
            'magnitude': _clean(r['mag'], mag_dec if mag_dec is not None else 6),
            'magnitude_type': ['ML'] * n,
            'horizontal_uncertainty': _clean(r['horizontal_uncertainty'], 4),
            'depth_uncertainty': _clean(r['depth_uncertainty'], 4),
            'time_uncertainty': _clean(r['time_uncertainty'], 4),
            'azimuthal_gap': _clean(r['azimuthal_gap'], 2),
            'used_station_count': [int(v) for v in r['used_station_count']],
            'used_phase_count': [int(v) for v in r['used_phase_count']],
            'standard_error': _clean(r['standard_error'], 4),
            'magnitude_uncertainty': _clean(r['magnitude_uncertainty'], 4),
            'magnitude_station_count': [int(v) for v in r['magnitude_station_count']],
            'evaluation_mode': ['manual'] * n,
            'evaluation_status': ['reviewed'] * n,
            'agency_id': [REPORT_MODEL[agency]['agency_id']] * n,
        }
        cats.append({'id': cat_id, 'name': name, 'columns': cols})
        truth[cat_id] = {
            'true_index': [int(v) for v in r['true_index']],
            'is_aftershock': [bool(v) for v in built['truth']['is_aftershock'][r['true_index']]],
        }
    doc = {'t0': T0_ISO, 'catalogues': cats, 'truth': truth}
    if options:
        doc['options'] = options
    return doc


# ═══════════════════════════════════════════════════════════════════════════
#  QuakeML 1.2 BED for the browser screenshots
# ═══════════════════════════════════════════════════════════════════════════
def iso_times(t_days):
    """ISO 8601 UTC origin times (millisecond precision) for day offsets from T0_ISO.

    Rounds half up to the millisecond, as worked_example_engine.ts does
    (Math.round), so both paths give every report the same origin time.
    """
    ms = np.floor(np.asarray(t_days, dtype=float) * 86_400_000.0 + 0.5).astype('int64')
    t = np.datetime64(T0_ISO.rstrip('Z'), 'ms') + ms.astype('timedelta64[ms]')
    return [str(v) + 'Z' for v in t]


def write_quakeml(built, agency, path):
    """One agency's reports as a QuakeML 1.2 BED document (element order per the schema).

    Uses the same values engine_input() passes to the engine (the same rounding), so a
    catalogue uploaded from this file stores exactly the rows the engine analyses.
    """
    cat_id, name, prefix = next((c, n, p) for a, c, n, p in CATALOGUES if a == agency)
    r = built['reports'][agency]
    n = r['lat'].size
    mag_dec = REPORT_MODEL[agency]['mag_decimals']
    agency_id = REPORT_MODEL[agency]['agency_id']
    times = iso_times(np.round(r['t_days'], 9))
    lat, lon = np.round(r['lat'], 5), np.round(r['lon'], 5)
    depth_m = np.round(np.round(r['depth'], 3) * 1000.0, 3)
    mag = np.round(r['mag'], mag_dec if mag_dec is not None else 6)
    h_unc = np.round(r['horizontal_uncertainty'], 4)
    z_unc = np.round(r['depth_uncertainty'], 4)
    t_unc = np.round(r['time_uncertainty'], 4)
    gap = np.round(r['azimuthal_gap'], 2)
    rms = np.round(r['standard_error'], 4)
    m_unc = np.round(r['magnitude_uncertainty'], 4)

    def num(v):
        return repr(float(v))

    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<q:quakeml xmlns="http://quakeml.org/xmlns/bed/1.2" xmlns:q="http://quakeml.org/xmlns/quakeml/1.2">',
           f'  <eventParameters publicID="smi:local/synthetic/{cat_id}">',
           f'    <description>{name}: synthetic data for the CofC SRL worked example (seed {SEED}); '
           'not real earthquakes</description>']
    for k in range(n):
        eid = f'{prefix}{k:07d}'
        base = f'smi:local/synthetic/{eid}'
        fixed = bool(r['depth_fixed'][k])
        depth_unc = '' if fixed else f'<uncertainty>{num(z_unc[k] * 1000.0)}</uncertainty>'
        out.append(
            f'    <event publicID="{base}">\n'
            f'      <magnitude publicID="{base}/magnitude">\n'
            f'        <mag><value>{num(mag[k])}</value><uncertainty>{num(m_unc[k])}</uncertainty></mag>\n'
            f'        <type>ML</type>\n'
            f'        <stationCount>{int(r["magnitude_station_count"][k])}</stationCount>\n'
            f'        <originID>{base}/origin</originID>\n'
            f'        <evaluationMode>manual</evaluationMode>\n'
            f'        <evaluationStatus>reviewed</evaluationStatus>\n'
            f'      </magnitude>\n'
            f'      <origin publicID="{base}/origin">\n'
            f'        <time><value>{times[k]}</value><uncertainty>{num(t_unc[k])}</uncertainty></time>\n'
            f'        <latitude><value>{num(lat[k])}</value></latitude>\n'
            f'        <longitude><value>{num(lon[k])}</value></longitude>\n'
            f'        <depth><value>{num(depth_m[k])}</value>{depth_unc}</depth>\n'
            f'        <depthType>{"operator assigned" if fixed else "from location"}</depthType>\n'
            f'        <quality>\n'
            f'          <usedPhaseCount>{int(r["used_phase_count"][k])}</usedPhaseCount>\n'
            f'          <usedStationCount>{int(r["used_station_count"][k])}</usedStationCount>\n'
            f'          <standardError>{num(rms[k])}</standardError>\n'
            f'          <azimuthalGap>{num(gap[k])}</azimuthalGap>\n'
            f'        </quality>\n'
            f'        <originUncertainty>\n'
            f'          <horizontalUncertainty>{num(h_unc[k] * 1000.0)}</horizontalUncertainty>\n'
            f'          <preferredDescription>horizontal uncertainty</preferredDescription>\n'
            f'        </originUncertainty>\n'
            f'        <evaluationMode>manual</evaluationMode>\n'
            f'        <evaluationStatus>reviewed</evaluationStatus>\n'
            f'        <creationInfo><agencyID>{agency_id}</agencyID></creationInfo>\n'
            f'      </origin>\n'
            f'      <preferredOriginID>{base}/origin</preferredOriginID>\n'
            f'      <preferredMagnitudeID>{base}/magnitude</preferredMagnitudeID>\n'
            f'      <type>earthquake</type>\n'
            f'    </event>')
    out += ['  </eventParameters>', '</q:quakeml>', '']
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(out))
