#!/usr/bin/env python3
"""
Generate earthquake test data for validation testing.
Creates 3 example catalogues with 1000 events each:
1. North Island Seismic Events (shallow subduction)
2. South Island Seismic Events (shallow strike-slip)
3. NZ Deep Seismic Events (deep subduction)

By default, 60-80% of events are intentionally invalid to stress-test
validation, error reporting, and data quality assessment.
"""

import json
import os
import random
import math
from datetime import datetime, timedelta

# Seed for reproducibility
random.seed(42)

INVALID_RATIO_RANGE = (0.6, 0.8)
CROSS_FIELD_ANOMALY_RATIO = 0.15

# Designed time+space clusters (aftershock-sequence-like), as opposed to the
# uniformly-random "background" events. A fresh cluster centre used to be drawn
# for every "clustered" event, which (combined with lat/lon staying uniform over
# the whole catalogue regardless) made the result indistinguishable from plain
# uniform timing with no real spatial clustering at all: Gardner-Knopoff
# declustering found no designed clusters, only chance groupings from the heavy
# magnitude tail.
CLUSTER_EVENT_FRACTION = 0.3      # fraction of events assigned to a cluster
EVENTS_PER_CLUSTER = 150          # ~1 cluster centre per this many events
CLUSTER_RADIUS_DEG = 0.15         # jitter radius around a cluster's epicentre (~15-17 km)
CLUSTER_TIME_WINDOW_SECONDS = 2 * 86400  # +/- 2 days around a cluster's origin time

INVALID_CASES = [
    "missing_time",
    "missing_latitude",
    "missing_longitude",
    "missing_magnitude",
    "out_of_range_coords",
    "out_of_range_magnitude",
    "out_of_range_depth",
    "invalid_timestamp",
    "invalid_types",
    "future_timestamp",
]

def introduce_invalid_event(event, event_datetime):
    """
    Mutate event data to create a variety of validation failures.
    """
    case = random.choice(INVALID_CASES)

    if case == "missing_time":
        event.pop("time", None)
    elif case == "missing_latitude":
        event.pop("latitude", None)
    elif case == "missing_longitude":
        event.pop("longitude", None)
    elif case == "missing_magnitude":
        event.pop("magnitude", None)
    elif case == "out_of_range_coords":
        event["latitude"] = random.choice([95, -95, 120])
        event["longitude"] = random.choice([190, -190, 250])
    elif case == "out_of_range_magnitude":
        event["magnitude"] = random.choice([11.5, -4.0, 12.0])
    elif case == "out_of_range_depth":
        event["depth"] = random.choice([-10.0, -50.0, 1500.0])
    elif case == "invalid_timestamp":
        event["time"] = random.choice([
            "not-a-date",
            "2024-13-40T25:61:00Z",
            "2024/99/99",
        ])
    elif case == "invalid_types":
        field = random.choice(["latitude", "longitude", "magnitude", "depth", "time"])
        event[field] = random.choice(["invalid", "NaN", {"bad": True}])
    elif case == "future_timestamp":
        future = event_datetime + timedelta(days=random.randint(365, 3650))
        event["time"] = future.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

    event["validation_note"] = f"invalid:{case}"
    return event

def introduce_cross_field_anomaly(event):
    """
    Keep event valid but create cross-field inconsistencies for QA checks.
    """
    event["depth"] = round(random.uniform(0.1, 4.9), 1)
    event["magnitude"] = round(random.uniform(8.1, 9.6), 1)
    event["validation_note"] = "anomaly:shallow_large_magnitude"
    return event

def gutenberg_richter_magnitude(min_mag=1.0, max_mag=7.5, b_value=1.0):
    """
    Sample a magnitude from the doubly-truncated Gutenberg-Richter law
    N(>=M) proportional to 10^(-b*M), truncated to [min_mag, max_mag].

    Inverse-CDF form (Utsu 1965 / Page 1968): for u ~ Uniform(0, 1),
        m = min_mag - log10(1 - u*(1 - 10^(-b*(max_mag - min_mag)))) / b_value
    This matches paper/figures/generate_figures.py's gr_from_u. The previous
    version, `min_mag + (max_mag - min_mag) * (1 - u**(1/b_value))`, is a
    Beta(1, b_value) power law, not Gutenberg-Richter: at the b_value=2.5 this
    file called it with, its local b ran from 0.20 at M2 to 2.2 at M7 (measured
    on the platform's own b-value estimator: b ~= 0.25, not 2.5), and 9.7% of
    events landed at M>=5 versus ~1e-4 for a real b=1 law.
    """
    u = random.random()
    span = max_mag - min_mag
    mag = min_mag - math.log10(1 - u * (1 - 10 ** (-b_value * span))) / b_value
    return round(mag, 1)

def wrap_rake(rake):
    """Wrap an angle in degrees into (-180, 180], QuakeML's NodalPlane.rake domain."""
    wrapped = ((rake + 180.0) % 360.0) - 180.0
    return wrapped + 360.0 if wrapped <= -180.0 else wrapped

def _strike_dip_from_vector(n, e, u):
    """
    Convert a slip/normal-style (north, east, up) vector to (strike, dip),
    in degrees. `u` is flipped to point upward (u >= 0) first, since a fault
    plane's strike/dip is conventionally read off its upward-pointing normal.
    """
    if u < 0:
        n, e, u = -n, -e, -u
    strike = math.degrees(math.atan2(e, n)) - 90.0
    strike %= 360.0
    dip = math.degrees(math.atan2(math.hypot(n, e), u))
    return strike, dip

def auxiliary_plane(strike1, dip1, rake1):
    """
    True auxiliary plane of a double-couple source, computed from the slip and
    normal vectors of plane 1 (Aki & Richards 1980 convention; this formulation
    traces back to Herrmann's AUXPLN and is the one used by ObsPy/GMT psmeca).
    Verified against the Aki & Richards moment-tensor formula over 50,000 random
    mechanisms (max moment-tensor component error ~1e-13) and the involution
    property auxiliary_plane(auxiliary_plane(p)) == p (same moment tensor).

    Replaces the previous (strike+180, dip, -rake) shortcut, which is only the
    true auxiliary plane for a vertical dip-slip fault: for example it put plane
    2 sixty degrees away from the true auxiliary plane of a 30-degree-dip thrust,
    and made it identical to plane 1 (degenerate) for a vertical strike-slip
    fault.
    """
    z = math.radians(strike1 + 90.0)
    d1 = math.radians(dip1)
    r1 = math.radians(rake1)

    # Slip vector of plane 1, in the same (north, east, up)-style convention as
    # the fault normal below.
    sl_1 = -math.cos(r1) * math.cos(z) - math.sin(r1) * math.sin(z) * math.cos(d1)
    sl_2 = math.cos(r1) * math.sin(z) - math.sin(r1) * math.cos(z) * math.cos(d1)
    sl_3 = math.sin(r1) * math.sin(d1)
    strike2, dip2 = _strike_dip_from_vector(sl_2, sl_1, sl_3)

    # Plane 1's normal, and plane 2's strike-parallel vector (= plane 1's slip
    # vector): the rake of plane 2 is the angle between them.
    n_1 = math.sin(z) * math.sin(d1)
    n_2 = math.cos(z) * math.sin(d1)
    h_1 = -sl_2
    h_2 = sl_1
    cos_rake2 = (h_1 * n_1 + h_2 * n_2) / math.hypot(h_1, h_2)
    cos_rake2 = max(-1.0, min(1.0, cos_rake2))
    rake2 = math.degrees(math.acos(cos_rake2))
    if sl_3 < 0:
        rake2 = 360.0 - rake2

    return strike2, dip2, wrap_rake(rake2)

def generate_focal_mechanism(region_type="subduction"):
    """
    Generate realistic focal mechanism based on tectonic setting.
    """
    if region_type == "subduction":
        # Thrust faulting common in subduction zones
        strike = random.randint(0, 360)
        dip = random.randint(20, 50)
        rake = random.randint(70, 110)  # Reverse/thrust
    elif region_type == "strike_slip":
        # Strike-slip faulting
        strike = random.randint(0, 360)
        dip = random.randint(70, 90)
        rake = random.choice([random.randint(-20, 20), random.randint(160, 200)])
    else:  # normal faulting
        strike = random.randint(0, 360)
        dip = random.randint(40, 70)
        rake = random.randint(-110, -70)

    # randint(160, 200) can exceed QuakeML's (-180, 180] rake domain.
    rake = wrap_rake(rake)
    strike2, dip2, rake2 = auxiliary_plane(strike, dip, rake)

    return {
        "nodalPlane1": {
            "strike": strike,
            "dip": dip,
            "rake": round(rake, 1)
        },
        "nodalPlane2": {
            "strike": round(strike2, 1),
            "dip": round(dip2, 1),
            "rake": round(rake2, 1)
        }
    }

def generate_depth(region_type="shallow", magnitude=3.0):
    """
    Generate realistic depth based on region and magnitude.
    """
    if region_type == "shallow":
        # Most earthquakes are shallow
        if magnitude < 4.0:
            return round(random.uniform(5, 25), 1)
        else:
            return round(random.uniform(10, 40), 1)
    elif region_type == "intermediate":
        # Some deeper events
        return round(random.uniform(20, 150), 1)
    else:  # deep
        return round(random.uniform(100, 600), 1)

def _clamp(value, lo, hi):
    return max(lo, min(hi, value))

def generate_catalogue(name, region, bounds, num_events=1000,
                      start_date="2024-01-01", end_date="2024-10-29",
                      tectonic_type="subduction", depth_type="shallow",
                      invalid_ratio=None, invalid_ratio_range=INVALID_RATIO_RANGE,
                      anomaly_ratio=CROSS_FIELD_ANOMALY_RATIO):
    """
    Generate a complete earthquake catalogue.
    """
    start = datetime.fromisoformat(start_date)
    end = datetime.fromisoformat(end_date)
    time_range = (end - start).total_seconds()

    events = []
    if invalid_ratio is None:
        invalid_ratio = random.uniform(*invalid_ratio_range)
    invalid_ratio = max(0, min(1, invalid_ratio))
    invalid_count = int(num_events * invalid_ratio)
    invalid_indices = set(random.sample(range(num_events), invalid_count))

    # Fixed cluster centres, drawn once, each tight in both space and time — an
    # aftershock-sequence stand-in that a declustering algorithm can actually find.
    num_clusters = max(1, num_events // EVENTS_PER_CLUSTER)
    cluster_centres = [
        {
            "lat": random.uniform(bounds["minLatitude"], bounds["maxLatitude"]),
            "lon": random.uniform(bounds["minLongitude"], bounds["maxLongitude"]),
            "time": random.uniform(0, time_range),
        }
        for _ in range(num_clusters)
    ]

    for i in range(num_events):
        # Generate magnitude (doubly-truncated Gutenberg-Richter, b ~= 1)
        magnitude = gutenberg_richter_magnitude(min_mag=1.0, max_mag=7.5, b_value=1.0)

        if random.random() < CLUSTER_EVENT_FRACTION:
            centre = random.choice(cluster_centres)
            event_time = _clamp(
                centre["time"] + random.uniform(-CLUSTER_TIME_WINDOW_SECONDS, CLUSTER_TIME_WINDOW_SECONDS),
                0, time_range,
            )
            lat = _clamp(centre["lat"] + random.uniform(-CLUSTER_RADIUS_DEG, CLUSTER_RADIUS_DEG),
                         bounds["minLatitude"], bounds["maxLatitude"])
            lon = _clamp(centre["lon"] + random.uniform(-CLUSTER_RADIUS_DEG, CLUSTER_RADIUS_DEG),
                         bounds["minLongitude"], bounds["maxLongitude"])
        else:
            event_time = random.uniform(0, time_range)
            lat = random.uniform(bounds["minLatitude"], bounds["maxLatitude"])
            lon = random.uniform(bounds["minLongitude"], bounds["maxLongitude"])

        event_datetime = start + timedelta(seconds=event_time)

        # Generate depth
        depth = generate_depth(depth_type, magnitude)

        # Create event
        event = {
            "publicID": f"{region.lower().replace(' ', '_')}_{start.year}p{i+1:06d}",
            "time": event_datetime.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
            "latitude": round(lat, 4),
            "longitude": round(lon, 4),
            "depth": depth,
            "magnitude": magnitude
        }

        # Add focal mechanism for M >= 5.0
        if magnitude >= 5.0:
            event["focal_mechanisms"] = [generate_focal_mechanism(tectonic_type)]
        if i in invalid_indices:
            introduce_invalid_event(event, event_datetime)
        elif random.random() < anomaly_ratio:
            introduce_cross_field_anomaly(event)

        events.append(event)

    # Sort by time. str() guards against "invalid_types" occasionally setting
    # event["time"] to a dict ({"bad": True}) — `x.get("time") or ""` then
    # returned the dict itself (truthy), and comparing a dict to a str crashes
    # sort() with a TypeError before any file is written.
    events.sort(key=lambda x: str(x.get("time") or ""))

    numeric_magnitudes = [
        e["magnitude"] for e in events
        if isinstance(e.get("magnitude"), (int, float))
    ]
    magnitude_range = {
        "min": min(numeric_magnitudes) if numeric_magnitudes else None,
        "max": max(numeric_magnitudes) if numeric_magnitudes else None
    }

    catalogue = {
        "catalogue_name": name,
        "region": region,
        "description": f"Realistic earthquake catalogue for {region} with {num_events} events",
        "geographic_bounds": bounds,
        "time_range": {
            "start": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "end": end.strftime("%Y-%m-%dT%H:%M:%SZ")
        },
        "statistics": {
            "total_events": num_events,
            "invalid_events": invalid_count,
            "invalid_ratio": round(invalid_ratio, 2),
            "events_with_focal_mechanisms": sum(1 for e in events if "focal_mechanisms" in e),
            "magnitude_range": magnitude_range
        },
        "events": events
    }

    return catalogue

# Generate 3 example catalogues for New Zealand regions

# 1. North Island catalogue
print("Generating North Island catalogue...")
north_island_catalogue = generate_catalogue(
    name="North Island Seismic Events",
    region="New Zealand - North Island",
    bounds={
        "minLatitude": -41.5,
        "maxLatitude": -34.0,
        "minLongitude": 172.0,
        "maxLongitude": 179.0
    },
    num_events=1000,
    tectonic_type="subduction",
    depth_type="shallow"
)

# 2. South Island catalogue
print("Generating South Island catalogue...")
south_island_catalogue = generate_catalogue(
    name="South Island Seismic Events",
    region="New Zealand - South Island",
    bounds={
        "minLatitude": -47.0,
        "maxLatitude": -40.5,
        "minLongitude": 166.0,
        "maxLongitude": 174.5
    },
    num_events=1000,
    tectonic_type="strike_slip",
    depth_type="shallow"
)

# 3. Deep events catalogue
print("Generating Deep Events catalogue...")
deep_events_catalogue = generate_catalogue(
    name="NZ Deep Seismic Events",
    region="New Zealand - Deep Events",
    bounds={
        "minLatitude": -47.0,
        "maxLatitude": -34.0,
        "minLongitude": 166.0,
        "maxLongitude": 179.0
    },
    num_events=1000,
    tectonic_type="subduction",
    depth_type="deep"
)

# Save catalogues
print("\nSaving catalogues to JSON files...")
os.makedirs("test-data", exist_ok=True)

with open("test-data/north-island-catalogue.json", "w") as f:
    json.dump(north_island_catalogue, f, indent=2)
print("✓ Saved: test-data/north-island-catalogue.json")

with open("test-data/south-island-catalogue.json", "w") as f:
    json.dump(south_island_catalogue, f, indent=2)
print("✓ Saved: test-data/south-island-catalogue.json")

with open("test-data/deep-events-catalogue.json", "w") as f:
    json.dump(deep_events_catalogue, f, indent=2)
print("✓ Saved: test-data/deep-events-catalogue.json")

print("\n" + "="*60)
print("SUMMARY")
print("="*60)
for cat in [north_island_catalogue, south_island_catalogue, deep_events_catalogue]:
    print(f"\n{cat['catalogue_name']}:")
    print(f"  Region: {cat['region']}")
    print(f"  Total events: {cat['statistics']['total_events']}")
    print(f"  Invalid events: {cat['statistics']['invalid_events']} ({cat['statistics']['invalid_ratio'] * 100:.0f}%)")
    print(f"  Events with focal mechanisms: {cat['statistics']['events_with_focal_mechanisms']}")
    print(f"  Magnitude range: {cat['statistics']['magnitude_range']['min']} - {cat['statistics']['magnitude_range']['max']}")
    print(f"  Geographic bounds:")
    print(f"    Latitude: {cat['geographic_bounds']['minLatitude']} to {cat['geographic_bounds']['maxLatitude']}")
    print(f"    Longitude: {cat['geographic_bounds']['minLongitude']} to {cat['geographic_bounds']['maxLongitude']}")

print("\n" + "="*60)
print("3 example catalogues generated successfully!")
print("="*60)
