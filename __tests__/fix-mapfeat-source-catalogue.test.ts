/**
 * F2 (map features): the "source catalogue" map colour mode (paper sec:viz: "colour can
 * encode ... source catalogue"). resolveSourceCatalogue implements contract C2's
 * precedence ("use the event's catalogue for pooled views and the C2 selected member /
 * source_catalogue_ids for merged rows") defensively, since C2's producer (B1/H2a) may
 * land source_catalogue_ids and the source_events `selected` flag after this file does.
 * buildCatalogueColorScale turns the resolved categories into a stable categorical
 * palette + legend, which is what a MapLegend-consuming map colours markers with.
 */
import { buildCatalogueColorScale, resolveSourceCatalogue, type SourceCatalogueEvent } from '@/components/map/MapLegend';
import { CATALOGUE_UNKNOWN_COLOR, OKABE_ITO } from '@/lib/map-style';

describe('resolveSourceCatalogue', () => {
  it('prefers the source_events member marked selected over any other signal', () => {
    const event: SourceCatalogueEvent = {
      catalogue: 'Pooled Name (ignored)',
      source_catalogue_ids: ['cat-a', 'cat-b'],
      source_events: JSON.stringify([
        { catalogueId: 'cat-a', source: 'GeoNet', selected: false },
        { catalogueId: 'cat-b', source: 'ISC', selected: true },
      ]),
    };
    expect(resolveSourceCatalogue(event)).toEqual({ key: 'cat-b', label: 'ISC' });
  });

  it('uses the single source_catalogue_id when there is nothing to disambiguate', () => {
    const event: SourceCatalogueEvent = { source_catalogue_ids: ['cat-a'] };
    expect(resolveSourceCatalogue(event)).toEqual({ key: 'cat-a', label: 'cat-a' });
  });

  it('looks up a display name for a single id when catalogueNames is provided', () => {
    const event: SourceCatalogueEvent = { source_catalogue_ids: ['cat-a'] };
    expect(resolveSourceCatalogue(event, { 'cat-a': 'GeoNet NZ' })).toEqual({ key: 'cat-a', label: 'GeoNet NZ' });
  });

  it('groups multiple source_catalogue_ids with no selected member as one "Merged" category', () => {
    const event: SourceCatalogueEvent = { source_catalogue_ids: ['cat-b', 'cat-a'] };
    // Order-independent key: the same contributing set always resolves to the same category.
    const reordered: SourceCatalogueEvent = { source_catalogue_ids: ['cat-a', 'cat-b'] };
    expect(resolveSourceCatalogue(event)).toEqual({ key: 'merged:cat-a+cat-b', label: 'Merged (2 sources)' });
    expect(resolveSourceCatalogue(reordered).key).toBe(resolveSourceCatalogue(event).key);
  });

  it('does not silently pick one contributor: an "average" merge (no selected member) is never mislabelled as a single source', () => {
    const event: SourceCatalogueEvent = {
      source_catalogue_ids: ['cat-a', 'cat-b', 'cat-c'],
      source_events: JSON.stringify([
        { catalogueId: 'cat-a', source: 'GeoNet' },
        { catalogueId: 'cat-b', source: 'ISC' },
        { catalogueId: 'cat-c', source: 'USGS' },
      ]),
    };
    const info = resolveSourceCatalogue(event);
    expect(info.label).toBe('Merged (3 sources)');
  });

  it('falls back to the pooled-view catalogue field when there is no merge provenance', () => {
    const event: SourceCatalogueEvent = { catalogue: 'NZ National Catalogue' };
    expect(resolveSourceCatalogue(event)).toEqual({ key: 'catalogue:NZ National Catalogue', label: 'NZ National Catalogue' });
  });

  it('resolves to Unknown source when no signal is present at all', () => {
    expect(resolveSourceCatalogue({})).toEqual({ key: '__unknown__', label: 'Unknown source' });
  });

  it('falls through malformed source_events JSON without throwing', () => {
    const event: SourceCatalogueEvent = { source_events: '{not json', catalogue: 'Fallback Catalogue' };
    expect(() => resolveSourceCatalogue(event)).not.toThrow();
    expect(resolveSourceCatalogue(event).label).toBe('Fallback Catalogue');
  });

  it('ignores a source_events array with no selected member and falls through to source_catalogue_ids', () => {
    const event: SourceCatalogueEvent = {
      source_catalogue_ids: ['cat-a'],
      source_events: JSON.stringify([{ catalogueId: 'cat-a', source: 'GeoNet' }]),
    };
    expect(resolveSourceCatalogue(event)).toEqual({ key: 'cat-a', label: 'cat-a' });
  });
});

describe('buildCatalogueColorScale', () => {
  it('gives the same key the same colour and different keys different colours', () => {
    const scale = buildCatalogueColorScale([
      { key: 'a', label: 'Alpha' },
      { key: 'b', label: 'Beta' },
      { key: 'a', label: 'Alpha' },
    ]);
    expect(scale.colorFor('a')).toBe(scale.colorFor('a'));
    expect(scale.colorFor('a')).not.toBe(scale.colorFor('b'));
  });

  it('returns the legend sorted alphabetically by label, one row per distinct key', () => {
    const scale = buildCatalogueColorScale([
      { key: 'z', label: 'Zeta Catalogue' },
      { key: 'a', label: 'Alpha Catalogue' },
      { key: 'a', label: 'Alpha Catalogue' },
    ]);
    expect(scale.legend.map(row => row.label)).toEqual(['Alpha Catalogue', 'Zeta Catalogue']);
  });

  it('colours every legend row with exactly what colorFor returns for that key', () => {
    const scale = buildCatalogueColorScale([{ key: 'a', label: 'Alpha' }, { key: 'b', label: 'Beta' }]);
    for (const row of scale.legend) {
      expect(scale.colorFor(row.key)).toBe(row.color);
    }
  });

  it('falls back to a neutral grey for a key that was never in the plotted set', () => {
    const scale = buildCatalogueColorScale([{ key: 'a', label: 'Alpha' }]);
    expect(scale.colorFor('never-seen')).toBe(CATALOGUE_UNKNOWN_COLOR);
    expect(CATALOGUE_UNKNOWN_COLOR).toBe('#9CA3AF');
  });

  it('colours catalogues from the Okabe–Ito palette, in label order, black/white by theme for the 8th', () => {
    const infos = 'ABCDEFGH'.split('').map((letter) => ({ key: letter.toLowerCase(), label: `Catalogue ${letter}` }));
    const light = buildCatalogueColorScale(infos);
    const dark = buildCatalogueColorScale(infos, { isDark: true });
    expect(light.legend.map((row) => row.color)).toEqual([...OKABE_ITO]);
    expect(light.legend.map((row) => row.color)).toEqual(['#0072B2', '#E69F00', '#009E73', '#D55E00', '#CC79A7', '#56B4E9', '#F0E442', '#000000']);
    expect(dark.legend[7].color).toBe('#FFFFFF');
  });

  it('greys "Unknown source" and lists it last without spending a palette colour', () => {
    const scale = buildCatalogueColorScale([
      resolveSourceCatalogue({}),
      { key: 'z', label: 'Zeta' },
      { key: 'a', label: 'Alpha' },
    ]);
    expect(scale.legend.map((row) => row.label)).toEqual(['Alpha', 'Zeta', 'Unknown source']);
    expect(scale.colorFor('__unknown__')).toBe(CATALOGUE_UNKNOWN_COLOR);
    expect(scale.colorFor('a')).toBe(OKABE_ITO[0]);
    expect(scale.colorFor('z')).toBe(OKABE_ITO[1]);
  });

  it('produces an empty legend for an empty input rather than throwing', () => {
    const scale = buildCatalogueColorScale([]);
    expect(scale.legend).toEqual([]);
  });
});
