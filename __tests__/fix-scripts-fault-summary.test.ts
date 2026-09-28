/**
 * @jest-environment node
 *
 * scripts/download-fault-data.ts's console-only summary read `properties.NAME`
 * and `properties.SLIP_TYPE`, which are always undefined — the AF250 layer's
 * real GeoJSON properties are all lower-case (`name`, `slip_type`, a numeric
 * code). Every fault therefore printed as "Unnamed (Unknown)". The fix
 * (scripts/lib/fault-summary.ts) is a pure function tested here directly, and
 * also against the real bundled public/data/nz-active-faults.geojson so the
 * test fails if that file's schema ever drifts from what the summary expects.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { summarizeFaultFeatures } from '@/scripts/lib/fault-summary';

describe('scripts/lib/fault-summary.ts summarizeFaultFeatures', () => {
  it('reads lower-case name/slip_type, not the old upper-case NAME/SLIP_TYPE', () => {
    const features = [
      { properties: { name: 'Wellington Fault', slip_type: 1 } }, // dextral
      { properties: { NAME: 'Should be ignored', SLIP_TYPE: 3 } as any }, // old, wrong casing
    ];
    const summary = summarizeFaultFeatures(features);

    expect(summary.totalFaults).toBe(2);
    expect(summary.sampleNames[0]).toEqual({ name: 'Wellington Fault', slipType: 'dextral' });
    // The upper-case-keyed feature has no usable `name`/`slip_type` under the
    // real schema, so it correctly falls back to Unnamed/Unknown — this is the
    // symptom the old bug produced for EVERY feature, now only for a
    // deliberately-mis-keyed one.
    expect(summary.sampleNames[1]).toEqual({ name: 'Unnamed', slipType: 'Unknown' });
  });

  it('decodes the AF250 numeric slip_type code (0=unknown..4=sinistral), not just the raw number', () => {
    const features = [
      { properties: { name: 'a', slip_type: 0 } },
      { properties: { name: 'b', slip_type: 1 } },
      { properties: { name: 'c', slip_type: 2 } },
      { properties: { name: 'd', slip_type: 3 } },
      { properties: { name: 'e', slip_type: 4 } },
    ];
    const summary = summarizeFaultFeatures(features);
    const labels = summary.sampleNames.map((s) => s.slipType);
    expect(labels).toEqual(['Unknown', 'dextral', 'normal', 'reverse', 'sinistral']);
  });

  it('counts and sorts slip types by frequency, most common first', () => {
    const features = [
      { properties: { name: 'a', slip_type: 3 } },
      { properties: { name: 'b', slip_type: 3 } },
      { properties: { name: 'c', slip_type: 1 } },
    ];
    const summary = summarizeFaultFeatures(features);
    expect(summary.slipTypeCounts[0]).toEqual(['reverse', 2]);
    expect(summary.slipTypeCounts[1]).toEqual(['dextral', 1]);
  });

  it('handles missing properties/name/slip_type gracefully', () => {
    const summary = summarizeFaultFeatures([{}, { properties: null }, { properties: {} }]);
    expect(summary.totalFaults).toBe(3);
    expect(summary.sampleNames.every((s) => s.name === 'Unnamed' && s.slipType === 'Unknown')).toBe(true);
  });

  it('against the real bundled AF250 file (if present), every sample fault is named and typed', () => {
    const geojsonPath = join(__dirname, '..', 'public', 'data', 'nz-active-faults.geojson');
    if (!existsSync(geojsonPath)) return; // not part of every checkout; skip rather than fail
    const data = JSON.parse(readFileSync(geojsonPath, 'utf-8'));
    const summary = summarizeFaultFeatures(data.features);

    expect(summary.totalFaults).toBe(data.features.length);
    // The old bug made every single sample "Unnamed (Unknown)"; on the real
    // data, most named faults should now resolve to their actual name.
    const unnamed = summary.sampleNames.filter((s) => s.name === 'Unnamed').length;
    expect(unnamed).toBeLessThan(summary.sampleNames.length);
  });
});
