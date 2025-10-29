#!/usr/bin/env python3
"""
Generate realistic earthquake test data for the catalogue application.
Creates 3 catalogues with 1000 events each for different regions.
"""

import json
import random
import math
from datetime import datetime, timedelta

# Seed for reproducibility
random.seed(42)

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
                      tectonic_type="subduction", depth_type="shallow"):
    """
    Generate a complete earthquake catalogue.
    """
    start = datetime.fromisoformat(start_date)
    end = datetime.fromisoformat(end_date)
    time_range = (end - start).total_seconds()
    
    events = []
    
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
        
        events.append(event)
    
    # Sort by time
    events.sort(key=lambda x: x["time"])
    
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
            "events_with_focal_mechanisms": sum(1 for e in events if "focal_mechanisms" in e),
            "magnitude_range": {
                "min": min(e["magnitude"] for e in events),
                "max": max(e["magnitude"] for e in events)
            }
        },
        "events": events
    }
    
    return catalogue

# Generate New Zealand catalogue
print("Generating New Zealand catalogue...")
nz_catalogue = generate_catalogue(
    name="New Zealand Seismic Events 2024",
    region="New Zealand",
    bounds={
        "minLatitude": -47.0,
        "maxLatitude": -34.0,
        "minLongitude": 166.0,
        "maxLongitude": 179.0
    },
    num_events=1000,
    tectonic_type="subduction",
    depth_type="shallow"
)

# Save catalogue
print("\nSaving catalogue to JSON file...")
with open("test-data/new-zealand-catalogue.json", "w") as f:
    json.dump(nz_catalogue, f, indent=2)
print("✓ Saved: test-data/new-zealand-catalogue.json")

print("\n" + "="*60)
print("SUMMARY")
print("="*60)
print(f"\n{nz_catalogue['catalogue_name']}:")
print(f"  Region: {nz_catalogue['region']}")
print(f"  Total events: {nz_catalogue['statistics']['total_events']}")
print(f"  Events with focal mechanisms: {nz_catalogue['statistics']['events_with_focal_mechanisms']}")
print(f"  Magnitude range: {nz_catalogue['statistics']['magnitude_range']['min']} - {nz_catalogue['statistics']['magnitude_range']['max']}")
print(f"  Geographic bounds:")
print(f"    Latitude: {nz_catalogue['geographic_bounds']['minLatitude']} to {nz_catalogue['geographic_bounds']['maxLatitude']}")
print(f"    Longitude: {nz_catalogue['geographic_bounds']['minLongitude']} to {nz_catalogue['geographic_bounds']['maxLongitude']}")

print("\n" + "="*60)
print("File generated successfully!")
print("="*60)

