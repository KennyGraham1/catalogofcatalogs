#!/usr/bin/env node
/**
 * Build the compact fault file the maps load (public/data/nz-active-faults.map.geojson)
 * from the full GNS Science active-fault database extract
 * (public/data/nz-active-faults.geojson, from scripts/download-fault-data.ts).
 *
 * The full file is ~20 MB: pretty-printed, coordinates to 8 decimals (~1 mm, far below
 * the traces' mapping accuracy) and 29 attributes per trace, none of which the map layer
 * reads. Every map downloaded and parsed all of it. The map copy keeps every trace and
 * vertex, rounds coordinates to 5 decimals (~1 m), keeps only the name, slip type and
 * AFDB id, and is minified.
 *
 *   node scripts/build-fault-map-data.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'public', 'data', 'nz-active-faults.geojson');
const target = path.join(root, 'public', 'data', 'nz-active-faults.map.geojson');
const DECIMALS = 5;
const KEPT_PROPERTIES = ['afdb_id', 'name', 'slip_type'];

const round = (value) => Number(value.toFixed(DECIMALS));
const roundCoordinates = (coordinates) =>
  typeof coordinates[0] === 'number' ? coordinates.map(round) : coordinates.map(roundCoordinates);

const full = JSON.parse(fs.readFileSync(source, 'utf8'));
const features = full.features.map((feature) => {
  const properties = {};
  for (const key of KEPT_PROPERTIES) {
    if (feature.properties?.[key] != null) properties[key] = feature.properties[key];
  }
  return {
    type: 'Feature',
    ...(feature.id != null ? { id: feature.id } : {}),
    geometry: { type: feature.geometry.type, coordinates: roundCoordinates(feature.geometry.coordinates) },
    properties,
  };
});
fs.writeFileSync(target, JSON.stringify({ type: 'FeatureCollection', features }));
const size = (file) => `${(fs.statSync(file).size / 1e6).toFixed(1)} MB`;
console.log(`${features.length} traces: ${size(source)} -> ${size(target)} (${path.relative(root, target)})`);
