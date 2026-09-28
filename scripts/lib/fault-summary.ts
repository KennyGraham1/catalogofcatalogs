/**
 * Pure summarisation of AF250 fault features for scripts/download-fault-data.ts's
 * console report. Extracted so the fix (reading the real, lower-case property
 * names) can be tested without a network fetch.
 *
 * The AF250 layer's GeoJSON properties are all lower-case (`name`, `slip_type`,
 * ...) — lib/fault-data.ts's FaultFeature interface documents this after an
 * earlier fix for the same mismatch in the app's own reader. This script used to
 * read `properties.NAME`/`properties.SLIP_TYPE`, which are absent from the real
 * file, so every fault fell into "Unknown" and every sample name was "Unnamed".
 */
import { getFaultSlipTypeName } from '../../lib/fault-data';

export interface FaultFeatureLike {
  properties?: {
    name?: string | null;
    slip_type?: number | string | null;
  } | null;
}

export interface FaultSummary {
  totalFaults: number;
  /** Slip-type label (decoded via getFaultSlipTypeName) -> count, most common first. */
  slipTypeCounts: Array<[string, number]>;
  sampleNames: Array<{ name: string; slipType: string }>;
}

export function summarizeFaultFeatures(features: FaultFeatureLike[], sampleSize = 10): FaultSummary {
  const slipTypeCounts: Record<string, number> = {};
  for (const feature of features) {
    const slipType = getFaultSlipTypeName(feature.properties?.slip_type) ?? 'Unknown';
    slipTypeCounts[slipType] = (slipTypeCounts[slipType] || 0) + 1;
  }

  const sampleNames = features.slice(0, sampleSize).map((feature) => ({
    name: feature.properties?.name || 'Unnamed',
    slipType: getFaultSlipTypeName(feature.properties?.slip_type) ?? 'Unknown',
  }));

  return {
    totalFaults: features.length,
    slipTypeCounts: Object.entries(slipTypeCounts).sort((a, b) => b[1] - a[1]),
    sampleNames,
  };
}
