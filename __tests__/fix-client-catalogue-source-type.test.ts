/**
 * Regression tests for lib/catalogue-source-type.ts (contract C6).
 *
 * Exercises the classifier against the exact source_catalogues / merge_config shapes
 * written by the real creation paths (gc#3 brief):
 *   uploads   app/api/catalogues/route.ts:524, 1009  -> [{"source":"upload",...}]
 *   GeoNet    lib/geonet-import-service.ts:641        -> [{"source":"GeoNet",...}]
 *   FDSN      scripts/import-temp-networks.ts:284     -> [{"source":"IRIS FDSN",...}]
 *   merges    lib/merge.ts:445                        -> [{id,name,events,source}, ...]
 */
import { getCatalogueSourceType } from '@/lib/catalogue-source-type';

describe('getCatalogueSourceType', () => {
  it('classifies a merge output as merged (2+ entries with id/name/events)', () => {
    const merged = {
      source_catalogues: JSON.stringify([
        { id: 'U1', name: 'Upload 1', events: 1000, source: 'upload' },
        { id: 'G1', name: 'GeoNet import', events: 800, source: 'GeoNet' },
      ]),
      merge_config: JSON.stringify({ mergeStrategy: 'priority', timeThresholdSeconds: 60, distanceThresholdKm: 10 }),
    };
    expect(getCatalogueSourceType(merged)).toBe('merged');
  });

  it('classifies a plain upload as upload, not merged', () => {
    const upload = {
      source_catalogues: JSON.stringify([{ source: 'upload', description: 'Uploaded catalogue' }]),
      merge_config: '',
    };
    expect(getCatalogueSourceType(upload)).toBe('upload');
  });

  it('classifies a GeoNet import as import', () => {
    const geonet = {
      source_catalogues: JSON.stringify([{ source: 'GeoNet', description: 'GeoNet' }]),
      merge_config: '',
    };
    expect(getCatalogueSourceType(geonet)).toBe('import');
  });

  it('classifies an IRIS FDSN import as import (case-insensitive hint match)', () => {
    const fdsn = {
      source_catalogues: JSON.stringify([{ source: 'IRIS FDSN', description: 'Temporary network' }]),
      merge_config: '',
    };
    expect(getCatalogueSourceType(fdsn)).toBe('import');
  });

  it('does not classify a single self-referencing source entry as merged', () => {
    // A single entry, even with id/name/events, is not "more than one" contributing
    // catalogue: only >1 such entries mean an actual merge.
    const single = {
      source_catalogues: JSON.stringify([{ id: 'U1', name: 'Upload 1', events: 1000, source: 'upload' }]),
      merge_config: '',
    };
    expect(getCatalogueSourceType(single)).toBe('upload');
  });

  it('falls back to merge_config.mergeStrategy when source_catalogues is empty', () => {
    const legacyMerge = {
      source_catalogues: '[]',
      merge_config: JSON.stringify({ mergeStrategy: 'newest' }),
    };
    expect(getCatalogueSourceType(legacyMerge)).toBe('merged');
  });

  it('returns unknown rather than guessing when there is no usable signal', () => {
    expect(getCatalogueSourceType({ source_catalogues: null, merge_config: null })).toBe('unknown');
    expect(getCatalogueSourceType({ source_catalogues: '[]', merge_config: '' })).toBe('unknown');
    expect(getCatalogueSourceType({ source_catalogues: JSON.stringify([{ source: 'mystery-agency' }]), merge_config: '' })).toBe('unknown');
  });

  it('treats malformed JSON as absent rather than throwing', () => {
    expect(() => getCatalogueSourceType({ source_catalogues: '{not json', merge_config: '{also not json' })).not.toThrow();
    expect(getCatalogueSourceType({ source_catalogues: '{not json', merge_config: '{also not json' })).toBe('unknown');
  });
});
