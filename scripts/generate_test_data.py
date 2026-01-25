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
import random
import math
from datetime import datetime, timedelta

# Seed for reproducibility
random.seed(42)

INVALID_RATIO_RANGE = (0.6, 0.8)
CROSS_FIELD_ANOMALY_RATIO = 0.15

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
    Generate magnitude following Gutenberg-Richter law.
    More small earthquakes, fewer large ones.
    """
    # Use power law distribution: N(M) = 10^(a - b*M)
    # Generate uniform random number and transform
    u = random.random()
    # Adjust to get more events across the full range
    mag = min_mag + (max_mag - min_mag) * (1 - u**(1/b_value))
    return round(mag, 1)

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
    
    # Calculate auxiliary plane (simplified)
    strike2 = (strike + 180) % 360
    dip2 = dip
    rake2 = -rake
    
    return {
        "nodalPlane1": {
            "strike": strike,
            "dip": dip,
            "rake": rake
        },
        "nodalPlane2": {
            "strike": strike2,
            "dip": dip2,
            "rake": rake2
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
    
    for i in range(num_events):
        # Generate magnitude (Gutenberg-Richter distribution)
        # Use b_value=2.5 to get more realistic distribution with some large events
        magnitude = gutenberg_richter_magnitude(min_mag=1.0, max_mag=7.5, b_value=2.5)
        
        # Generate time (random but clustered - earthquakes cluster in time)
        if random.random() < 0.3:  # 30% chance of being in a cluster
            # Pick a random cluster time
            cluster_time = random.uniform(0, time_range)
            # Add small offset for cluster
            event_time = cluster_time + random.uniform(-86400, 86400)  # ±1 day
        else:
            event_time = random.uniform(0, time_range)
        
        event_datetime = start + timedelta(seconds=event_time)
        
        # Generate location within bounds
        lat = random.uniform(bounds["minLatitude"], bounds["maxLatitude"])
        lon = random.uniform(bounds["minLongitude"], bounds["maxLongitude"])
        
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
    
    # Sort by time
    events.sort(key=lambda x: x.get("time") or "")

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
