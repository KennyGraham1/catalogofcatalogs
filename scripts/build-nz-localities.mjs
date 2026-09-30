#!/usr/bin/env node
/**
 * Build public/data/nz-localities.json, the reference places the maps describe earthquake
 * locations against ("15 km north-east of Gisborne"), from the LINZ New Zealand Gazetteer
 * of official place names (https://gazetteer.linz.govt.nz, CC BY 4.0).
 *
 * Kept: the cities, towns, villages, localities and islands the Gazetteer gives a map
 * label level (label_hierarchy) of 12 or more important - the places a map names and an
 * observatory describes events against (Gisborne 8, Seddon / Te Araroa / Culverden 10,
 * Raoul Island 6). All ~3,700 localities would describe events against unlabelled hamlets
 * ("10 km east of Hauwai" for the 2013 Seddon earthquake, which GeoNet placed 20 km east of
 * Seddon). Names the Gazetteer records as replaced are dropped. Coordinates are the
 * Gazetteer's NZGD2000 latitude/longitude, rounded to 4 decimals (~10 m).
 *
 *   curl -o /tmp/gaz.csv https://gazetteer.linz.govt.nz/gaz.csv
 *   node scripts/build-nz-localities.mjs /tmp/gaz.csv
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2];
if (!source) {
  console.error('usage: node scripts/build-nz-localities.mjs <path to gaz.csv from https://gazetteer.linz.govt.nz/gaz.csv>');
  process.exit(2);
}
const target = path.join(root, 'public', 'data', 'nz-localities.json');

/** RFC 4180 CSV rows (quoted fields may contain commas, quotes and newlines). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const [header, ...records] = parseCsv(fs.readFileSync(source, 'utf8').replace(/^﻿/, ''));
const col = Object.fromEntries(header.map((name, index) => [name, index]));
for (const name of ['name', 'status', 'feat_type', 'crd_latitude', 'crd_longitude']) {
  if (!(name in col)) throw new Error(`Gazetteer CSV has no ${name} column`);
}

const PLACE_TYPES = new Set(['City', 'Town', 'Village', 'Locality', 'Island']);
const MAX_LABEL_LEVEL = 12;
if (!('label_hierarchy' in col)) throw new Error('Gazetteer CSV has no label_hierarchy column');
const labelled = (row) => {
  const level = Number.parseInt(row[col.label_hierarchy], 10);
  return Number.isFinite(level) && level <= MAX_LABEL_LEVEL;
};
const round4 = (value) => Math.round(value * 1e4) / 1e4;
const entry = (row) => ({
  name: row[col.name].trim(),
  type: row[col.feat_type],
  latitude: Number(row[col.crd_latitude]),
  longitude: Number(row[col.crd_longitude]),
});
const usable = (place) => place.name && Number.isFinite(place.latitude) && Number.isFinite(place.longitude);

const kept = records
  .filter((row) => PLACE_TYPES.has(row[col.feat_type]) && row[col.status] !== 'Unofficial Replaced' && labelled(row))
  .map(entry)
  .filter(usable);

const R = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;
function distanceKm(a, b) {
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// The same name within 1 km (a name recorded twice) is one place.
const places = [];
for (const place of kept) {
  if (places.some((kept) => kept[0] === place.name && distanceKm({ latitude: kept[1], longitude: kept[2] }, place) < 1)) continue;
  places.push([place.name, round4(place.latitude), round4(place.longitude)]);
}
places.sort((a, b) => a[0].localeCompare(b[0], 'en'));

fs.writeFileSync(target, JSON.stringify({
  source: 'LINZ New Zealand Gazetteer of official place names, https://gazetteer.linz.govt.nz',
  licence: 'CC BY 4.0',
  attribution: 'Place names © LINZ (CC BY 4.0)',
  generated: new Date().toISOString().slice(0, 10),
  fields: ['name', 'latitude', 'longitude'],
  places,
}));
const byType = {};
for (const place of kept) byType[place.type] = (byType[place.type] ?? 0) + 1;
console.log(`${JSON.stringify(byType)} -> ${places.length} places, ${(fs.statSync(target).size / 1024).toFixed(0)} KB (${path.relative(root, target)})`);
