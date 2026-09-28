/**
 * Regression tests for merged-row QuakeML export (cluster: server2).
 *
 * A merged row's hypocentre and magnitude live in the scalar columns; the `origins` /
 * `magnitudes` JSON blobs are the best-quality CONTRIBUTING source's own solution,
 * copied verbatim by lib/merge.ts. The merged solution is published as its own
 * preferred origin / magnitude, and every uncertainty, depth type, scale and station
 * count on it must be the merged row's own: the blob's describe the source's values.
 *
 * lib/merge.ts nulls LOCATION_META_FIELDS, DEPTH_META_FIELDS and MAGNITUDE_META_FIELDS
 * whenever no source reports the merged value, precisely so an averaged hypocentre is
 * never labelled with one contributor's error estimate. Carrying the blob's metadata
 * onto the merged solution puts back exactly what that nulling removed.
 *
 * (Updated by cluster C, finding #66: these tests used to require that the source's
 * values appear nowhere in the document, because the exporter overwrote the source
 * origin in place. The source origin is now emitted untouched — it is that agency's
 * real solution — and the assertions below are made on the preferred origin.)
 *
 * Expected values are derived from QuakeML-BED-1.2 (lengths in metres, DB in km) and
 * from the merge rules above, not from running the exporter.
 */

import { eventToQuakeML } from '@/lib/quakeml-exporter';
import { parseQuakeMLEvent } from '@/lib/quakeml-parser';
import type { MergedEvent } from '@/lib/db';
import type { Origin, QuakeMLEvent } from '@/lib/types/quakeml';

/** The <origin> element the exported event names as preferred, as XML text. */
function preferredOriginXml(xml: string): string {
  const preferredID = xml.match(/<preferredOriginID>([^<]+)<\/preferredOriginID>/)?.[1];
  expect(preferredID).toBeDefined();
  const block = xml.match(new RegExp(`<origin publicID="${preferredID!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">[\\s\\S]*?</origin>`));
  expect(block).not.toBeNull();
  return block![0];
}

function preferredOrigin(xml: string): Origin {
  const event = parseQuakeMLEvent(xml) as QuakeMLEvent;
  const origin = event.origins?.find(o => o.publicID === event.preferredOriginID);
  expect(origin).toBeDefined();
  return origin!;
}

/** The contributing source's origin, as lib/merge.ts copies it onto the merged row. */
const sourceOrigin = {
  publicID: 'smi:nz.org.geonet/origin/1',
  time: { value: '2016-11-13T11:02:56.346Z', uncertainty: 0.35 },
  latitude: { value: -42.69, uncertainty: 0.02 },
  longitude: { value: 173.02, uncertainty: 0.03, confidenceLevel: 68 },
  depth: { value: 15110, uncertainty: 1200 },
  depthType: 'from location',
  uncertainty: { horizontalUncertainty: 9900, preferredDescription: 'horizontal uncertainty' },
};

const sourceMagnitude = {
  publicID: 'smi:nz.org.geonet/magnitude/1',
  mag: { value: 7.8, uncertainty: 0.2 },
  type: 'MLv',
  stationCount: 12,
};

/** Merged row: two sources, scalars carrying no uncertainty of their own. */
const mergedRow: MergedEvent = {
  id: 'evt-1',
  catalogue_id: 'cat-1',
  time: '2016-11-13T11:02:56.100Z',
  latitude: -42.715,
  longitude: 173.035,
  depth: 22.0,
  magnitude: 7.9,
  source_events: JSON.stringify([{ catalogueId: 'geonet' }, { catalogueId: 'isc' }]),
  created_at: '2024-01-01T00:00:00Z',
  preferred_origin_id: 'smi:nz.org.geonet/origin/1',
  preferred_magnitude_id: 'smi:nz.org.geonet/magnitude/1',
  origins: JSON.stringify([sourceOrigin]),
  magnitudes: JSON.stringify([sourceMagnitude]),
};

describe('server2 :: merged origin does not inherit the source solution uncertainties', () => {
  it('drops every uncertainty the merged row does not itself carry', () => {
    const xml = eventToQuakeML(mergedRow);
    const merged = preferredOriginXml(xml);

    // The merged hypocentre is published (km -> m for depth).
    expect(merged).toContain('<value>2016-11-13T11:02:56.100Z</value>');
    expect(merged).toContain('<value>-42.715</value>');
    expect(merged).toContain('<value>173.035</value>');
    expect(merged).toContain('<value>22000</value>');

    // ...and none of the source's error estimates travel with it.
    expect(merged).not.toContain('<uncertainty>');
    expect(merged).not.toContain('<confidenceLevel>');
    expect(merged).not.toContain('<originUncertainty>');
    // depthType states how THAT solution's depth was determined.
    expect(merged).not.toContain('<depthType>');

    // The contributing solution itself is still published, intact, under its own id.
    const source = parseQuakeMLEvent(xml)!.origins!.find(o => o.publicID === sourceOrigin.publicID)!;
    expect(source.latitude.value).toBe(-42.69);
    expect(source.time.uncertainty).toBe(0.35);
    expect(source.uncertainty?.horizontalUncertainty).toBe(9900);
  });

  it('publishes the merged row own uncertainties when it has them', () => {
    const xml = eventToQuakeML({
      ...mergedRow,
      time_uncertainty: 0.11,
      latitude_uncertainty: 0.004,
      longitude_uncertainty: 0.005,
      depth_uncertainty: 1.5,          // km -> 1500 m
      horizontal_uncertainty: 2.8,     // km -> 2800 m
      depth_type: 'operator assigned',
    });
    const merged = preferredOrigin(xml);

    expect(merged.time.uncertainty).toBe(0.11);
    expect(merged.latitude.uncertainty).toBe(0.004);
    expect(merged.longitude.uncertainty).toBe(0.005);
    expect(merged.depth?.uncertainty).toBe(1500);
    expect(merged.uncertainty?.horizontalUncertainty).toBe(2800);
    expect(merged.depthType).toBe('operator assigned');

    // The source's values are not merged alongside on the published solution.
    expect(merged.uncertainty?.preferredDescription).toBeUndefined();
    expect(merged.latitude.confidenceLevel).toBeUndefined();
  });

  it('keeps source magnitude metadata off the preferred merged measurement', () => {
    const xml = eventToQuakeML(mergedRow);
    const event = parseQuakeMLEvent(xml)!;
    const magnitude = event.magnitudes?.find(m => m.publicID === event.preferredMagnitudeID);
    expect(magnitude?.mag.value).toBe(7.9);
    expect(magnitude?.mag.uncertainty).toBeUndefined();
    expect(magnitude?.type).toBeUndefined();
    expect(magnitude?.stationCount).toBeUndefined();
    expect(event.magnitudes?.find(m => m.publicID === mergedRow.preferred_magnitude_id)?.mag.value).toBe(7.8);
  });

  it('keeps the merged magnitude metadata that the row does carry', () => {
    const xml = eventToQuakeML({
      ...mergedRow,
      magnitude_type: 'Mw',
      magnitude_uncertainty: 0.05,
      magnitude_station_count: 31,
    });

    const event = parseQuakeMLEvent(xml)!;
    const magnitude = event.magnitudes?.find(m => m.publicID === event.preferredMagnitudeID);
    expect(magnitude?.mag.uncertainty).toBe(0.05);
    expect(magnitude?.type).toBe('Mw');
    expect(magnitude?.stationCount).toBe(31);
  });

  it('leaves a single-source row byte-for-byte: its blob IS the solution', () => {
    const xml = eventToQuakeML({
      ...mergedRow,
      source_events: JSON.stringify([{ source: 'upload', eventId: '2016p858000' }]),
    });

    expect(xml).toContain('<uncertainty>0.35</uncertainty>');
    expect(xml).toContain('<horizontalUncertainty>9900</horizontalUncertainty>');
    expect(xml).toContain('<depthType>from location</depthType>');
    expect(xml).toContain('<type>MLv</type>');
    expect(xml).toContain('<stationCount>12</stationCount>');
  });
});
