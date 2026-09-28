/**
 * Regression tests for QuakeML 1.2 BED export conformance (cluster: quakeml-export).
 *
 * Covers four defects found in lib/quakeml-exporter.ts and lib/quakeml-validator.ts:
 *   1. eventParameters/description is xs:string in QuakeML-BED-1.2.xsd, so it must
 *      not carry a <text> child (Event/description is the complex EventDescription
 *      type and does).
 *   2. Every publicID attribute and every *ID/*URI reference element is typed
 *      ResourceIdentifier / ResourceReference and must match the schema's pattern;
 *      bare identifiers coming from CSV/GeoJSON uploads made the document invalid.
 *   3. Comment carries its identifier in the `id` ATTRIBUTE; the exporter wrote an
 *      <id> child element, which is not in the Comment content model.
 *   4. A merged row's authoritative hypocentre/magnitude live in the scalar columns
 *      (lib/merge.ts spreads the best-quality source event's origins/magnitudes JSON
 *      verbatim and overwrites only the scalars), so the export must publish the
 *      merged values as the preferred solution. (Cluster C, #66: the merged values
 *      are their own origin; the source origin is left intact rather than overwritten
 *      under the source's identity, so these tests assert on the preferred origin.)
 *   5. validateQuakeMLStructure counted <eventParameters> as an event and used an
 *      open/close tag count that every well-formed document fails.
 *
 * Expected values are derived from QuakeML-BED-1.2.xsd and by hand, never by
 * running the exporter and pasting its output.
 */

import { eventToQuakeML, eventsToQuakeMLDocument } from '@/lib/quakeml-exporter';
import { validateQuakeMLStructure } from '@/lib/quakeml-validator';
import type { MergedEvent } from '@/lib/db';

/**
 * QuakeML-BED-1.2.xsd, simpleType ResourceIdentifier (ResourceReference shares the
 * restriction), transcribed from the schema:
 *   (smi|quakeml):[\w\d][\w\d\-\.\*\(\)_~']{2,}/[\w\d\-\.\*\(\)_~'][\w\d\-\.\*\(\)\+\?_~'=,;#/&]*
 * XSD patterns are implicitly anchored, hence ^…$ here.
 */
const BED_RESOURCE_ID = /^(?:smi|quakeml):[\w\d][\w\d\-.*()_~']{2,}\/[\w\d\-.*()_~'][\w\d\-.*()+?_~'=,;#/&]*$/;

const baseEvent: MergedEvent = {
  id: 'evt-1',
  catalogue_id: 'cat-1',
  time: '2016-11-13T11:02:56.100Z',
  latitude: -42.715,
  longitude: 173.035,
  depth: 22.0,
  magnitude: 7.9,
  magnitude_type: 'Mw',
  source_events: '[]',
  created_at: '2024-01-01T00:00:00Z',
};

/** Collect every identifier the document publishes: publicID attributes and *ID elements. */
function collectIdentifiers(xml: string): string[] {
  const ids: string[] = [];
  const collect = (pattern: RegExp) => {
    Array.from(xml.matchAll(pattern)).forEach(m => ids.push(m[1]));
  };
  collect(/publicID="([^"]*)"/g);
  collect(/<(?:preferred\w*ID|originID|magnitudeID|pickID|methodID|earthModelID|amplitudeID|filterID|derivedOriginID|triggeringOriginID|stationMagnitudeID)>([^<]*)</g);
  collect(/<comment id="([^"]*)"/g);
  return ids;
}

// ---------------------------------------------------------------------------
// eventParameters/description is a simple xs:string
// ---------------------------------------------------------------------------

describe('eventParameters description (xs:string, no child elements)', () => {
  it('emits the catalogue description as text content, not a <text> child', () => {
    const doc = eventsToQuakeMLDocument([baseEvent], 'GeoNet NZ');

    expect(doc).toContain('<description>Catalogue: GeoNet NZ</description>');
    expect(doc).not.toMatch(/<description>\s*<text>/);
  });

  it('still emits Event/description as the complex EventDescription type', () => {
    // Event/description IS EventDescription (text + type children) — unchanged.
    const xml = eventToQuakeML({ ...baseEvent, region: 'Kaikoura' });

    expect(xml).toContain('<text>Kaikoura</text>');
    expect(xml).toContain('<type>region name</type>');
  });

  it('joins every metadata part into the one permitted description element', () => {
    const doc = eventsToQuakeMLDocument([baseEvent], 'GeoNet NZ', {
      source: 'GeoNet',
      eventCount: 1,
    });

    expect(doc).toContain('<description>Catalogue: GeoNet NZ; Source: GeoNet; Event Count: 1</description>');
    // baseEvent has no region, so the only description element is the catalogue one.
    expect((doc.match(/<description>/g) || []).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ResourceIdentifier grammar
// ---------------------------------------------------------------------------

describe('ResourceIdentifier grammar for CSV/GeoJSON-derived identifiers', () => {
  const csvDerived: MergedEvent = {
    ...baseEvent,
    event_public_id: '2016p858000',
    preferred_origin_id: 'origin-42',
    preferred_magnitude_id: 'mag-42',
    method_id: 'NonLinLoc',
    earth_model_id: 'nz3d',
    magnitude_method_id: 'weighted mean',
  };

  it('wraps a bare event id in the smi:local namespace', () => {
    expect(eventToQuakeML(csvDerived)).toContain('<event publicID="smi:local/event/2016p858000">');
  });

  it('wraps bare origin and magnitude ids, keeping definition and reference identical', () => {
    const xml = eventToQuakeML(csvDerived);

    expect(xml).toContain('<origin publicID="smi:local/origin/origin-42">');
    expect(xml).toContain('<preferredOriginID>smi:local/origin/origin-42</preferredOriginID>');
    expect(xml).toContain('<magnitude publicID="smi:local/magnitude/mag-42">');
    expect(xml).toContain('<preferredMagnitudeID>smi:local/magnitude/mag-42</preferredMagnitudeID>');
    // The magnitude's originID must resolve to the origin it was computed on.
    expect(xml).toContain('<originID>smi:local/origin/origin-42</originID>');
  });

  it('wraps bare method / earth model references and replaces illegal characters', () => {
    const xml = eventToQuakeML(csvDerived);

    expect(xml).toContain('<methodID>smi:local/method/NonLinLoc</methodID>');
    expect(xml).toContain('<earthModelID>smi:local/earthModel/nz3d</earthModelID>');
    // A space is outside the grammar's path character class → '_'.
    // Illegal characters are escaped INJECTIVELY (~XX hex), not flattened to "_": that
    // flattening mapped distinct identifiers ("a/b", "a:b") onto one and merged event
    // identities on export. A space is U+0020 -> ~20.
    expect(xml).toContain('<methodID>smi:local/method/weighted~20mean</methodID>');
    expect(xml).not.toContain('weighted_mean');
  });

  it('leaves identifiers that already satisfy the grammar untouched', () => {
    const native: MergedEvent = {
      ...baseEvent,
      event_public_id: 'smi:nz.org.geonet/event/2016p858000',
      preferred_origin_id: 'quakeml:nz.geonet.org.nz/origin/1',
    };
    const xml = eventToQuakeML(native);

    expect(xml).toContain('<event publicID="smi:nz.org.geonet/event/2016p858000">');
    expect(xml).toContain('<origin publicID="quakeml:nz.geonet.org.nz/origin/1">');
  });

  it('falls back to the row id when no identifier is stored', () => {
    expect(eventToQuakeML(baseEvent)).toContain('<event publicID="smi:local/event/evt-1">');
  });

  it('every identifier in a full document matches the BED pattern', () => {
    const rich: MergedEvent = {
      ...csvDerived,
      comments: JSON.stringify([{ text: 'Operator reviewed', id: 'comment 7' }]),
      origins: JSON.stringify([{
        publicID: 'origin-42',
        time: { value: baseEvent.time },
        latitude: { value: baseEvent.latitude },
        longitude: { value: baseEvent.longitude },
        depth: { value: 22000 },
        methodID: 'NonLinLoc',
      }]),
      magnitudes: JSON.stringify([{ publicID: 'mag-42', mag: { value: 7.9 }, type: 'Mw', originID: 'origin-42' }]),
      picks: JSON.stringify([{
        publicID: 'pick 1',
        time: { value: baseEvent.time },
        waveformID: { networkCode: 'NZ', stationCode: 'WEL' },
      }]),
    };
    const doc = eventsToQuakeMLDocument([rich], 'GeoNet NZ');
    const identifiers = collectIdentifiers(doc);

    expect(identifiers.length).toBeGreaterThan(5);
    for (const id of identifiers) {
      expect(id).toMatch(BED_RESOURCE_ID);
    }
  });
});

// ---------------------------------------------------------------------------
// Comment id is an attribute
// ---------------------------------------------------------------------------

describe('Comment identifier placement', () => {
  it('writes the comment id as an attribute, never as an <id> child', () => {
    const xml = eventToQuakeML({
      ...baseEvent,
      comments: JSON.stringify([{ text: 'Operator reviewed', id: 'smi:nz.org.geonet/comment/1' }]),
    });

    expect(xml).toContain('<comment id="smi:nz.org.geonet/comment/1">');
    expect(xml).toContain('<text>Operator reviewed</text>');
    expect(xml).not.toContain('<id>');
  });

  it('omits the attribute entirely when the comment has no id', () => {
    const xml = eventToQuakeML({
      ...baseEvent,
      comments: JSON.stringify([{ text: 'No identifier' }]),
    });

    expect(xml).toContain('<comment>');
    expect(xml).toContain('<text>No identifier</text>');
  });
});

// ---------------------------------------------------------------------------
// Merged rows export the merged hypocentre / magnitude
// ---------------------------------------------------------------------------

describe('merged catalogue rows export the merged solution, not the source one', () => {
  // Scalars are the merged product; the JSON blobs are the best-quality source
  // event's own solution, copied verbatim by lib/merge.ts.
  const mergedRow: MergedEvent = {
    ...baseEvent,
    source_events: JSON.stringify([{ catalogueId: 'geonet' }, { catalogueId: 'isc' }]),
    depth: 22.0,               // km  -> 22000 m in QuakeML
    magnitude: 7.9,
    magnitude_type: 'Mw',
    magnitude_uncertainty: 0.05,
    depth_uncertainty: 1.5,    // km  -> 1500 m
    horizontal_uncertainty: 2.8, // km  -> 2800 m
    preferred_origin_id: 'smi:nz.org.geonet/origin/1',
    preferred_magnitude_id: 'smi:nz.org.geonet/magnitude/1',
    origins: JSON.stringify([{
      publicID: 'smi:nz.org.geonet/origin/1',
      time: { value: '2016-11-13T11:02:56.346Z' },
      latitude: { value: -42.69 },
      longitude: { value: 173.02 },
      depth: { value: 15110 },
      uncertainty: { horizontalUncertainty: 9900 },
    }]),
    magnitudes: JSON.stringify([{
      publicID: 'smi:nz.org.geonet/magnitude/1',
      mag: { value: 7.8 },
      type: 'MLv',
    }]),
  };

  it('publishes the merged hypocentre from the scalar columns', () => {
    const xml = eventToQuakeML(mergedRow);
    const preferredID = xml.match(/<preferredOriginID>([^<]+)<\/preferredOriginID>/)?.[1];
    const preferred = xml.match(new RegExp(`<origin publicID="${preferredID}">[\\s\\S]*?</origin>`))?.[0] ?? '';

    expect(preferred).toContain('<value>2016-11-13T11:02:56.100Z</value>');
    expect(preferred).toContain('<value>-42.715</value>');
    expect(preferred).toContain('<value>173.035</value>');
    expect(preferred).toContain('<value>22000</value>');   // 22.0 km x 1000
    expect(preferred).toContain('<uncertainty>1500</uncertainty>'); // 1.5 km x 1000
    expect(preferred).toContain('<horizontalUncertainty>2800</horizontalUncertainty>'); // 2.8 km x 1000
    // The source's values stay on the source's own origin, never on the merged solution.
    expect(preferred).not.toContain('<value>-42.69</value>');
    expect(preferred).not.toContain('<value>15110</value>');
    expect(preferred).not.toContain('<horizontalUncertainty>9900</horizontalUncertainty>');
    expect(preferredID).not.toBe('smi:nz.org.geonet/origin/1');
  });

  it('publishes the merged magnitude and its scale', () => {
    const xml = eventToQuakeML(mergedRow);

    expect(xml).toContain('<value>7.9</value>');
    expect(xml).toContain('<type>Mw</type>');
    expect(xml).toContain('<uncertainty>0.05</uncertainty>');
    // The source measurement remains intact as an alternative; the authoritative
    // merged value has its own ID and is the preferred magnitude.
    expect(xml).toContain('<value>7.8</value>');
    expect(xml).toContain('<type>MLv</type>');
    const preferredId = xml.match(/<preferredMagnitudeID>([^<]+)<\/preferredMagnitudeID>/)?.[1];
    expect(preferredId).toBeDefined();
    expect(preferredId).not.toBe('smi:nz.org.geonet/magnitude/1');
    expect(xml).toContain(`<magnitude publicID="${preferredId}">`);
  });

  it('keeps the source identifiers so provenance is still resolvable', () => {
    const xml = eventToQuakeML(mergedRow);

    expect(xml).toContain('<origin publicID="smi:nz.org.geonet/origin/1">');
    expect(xml).toContain('<magnitude publicID="smi:nz.org.geonet/magnitude/1">');
  });

  it('leaves every contributing origin alone and publishes the merged solution beside them', () => {
    const twoOrigins: MergedEvent = {
      ...mergedRow,
      origins: JSON.stringify([
        { publicID: 'smi:isc/origin/9', time: { value: '2016-11-13T11:02:57.000Z' }, latitude: { value: -42.60 }, longitude: { value: 173.10 }, depth: { value: 30000 } },
        { publicID: 'smi:nz.org.geonet/origin/1', time: { value: '2016-11-13T11:02:56.346Z' }, latitude: { value: -42.69 }, longitude: { value: 173.02 }, depth: { value: 15110 } },
      ]),
    };
    const xml = eventToQuakeML(twoOrigins);

    // Both contributing origins are untouched (neither is overwritten with the merge)…
    expect(xml).toContain('<value>-42.6</value>');
    expect(xml).toContain('<value>30000</value>');
    expect(xml).toContain('<value>-42.69</value>');
    expect(xml).toContain('<value>15110</value>');
    // …and the merged solution is a third origin, which is the preferred one.
    const preferredID = xml.match(/<preferredOriginID>([^<]+)<\/preferredOriginID>/)?.[1];
    expect(['smi:isc/origin/9', 'smi:nz.org.geonet/origin/1']).not.toContain(preferredID);
    const preferred = xml.match(new RegExp(`<origin publicID="${preferredID}">[\\s\\S]*?</origin>`))?.[0] ?? '';
    expect(preferred).toContain('<value>-42.715</value>');
    expect(preferred).toContain('<value>22000</value>');
  });

  it('does not rewrite single-source rows', () => {
    // An uploaded/imported row: source_events has one entry, and the blob IS the
    // authoritative solution, so it must be re-serialised byte-for-byte.
    const singleSource: MergedEvent = {
      ...mergedRow,
      source_events: JSON.stringify([{ source: 'upload', eventId: '2016p858000' }]),
    };
    const xml = eventToQuakeML(singleSource);

    expect(xml).toContain('<value>-42.69</value>');
    expect(xml).toContain('<value>15110</value>');
    expect(xml).toContain('<horizontalUncertainty>9900</horizontalUncertainty>');
    expect(xml).toContain('<value>7.8</value>');
    expect(xml).toContain('<type>MLv</type>');
  });
});

// ---------------------------------------------------------------------------
// validateQuakeMLStructure
// ---------------------------------------------------------------------------

describe('validateQuakeMLStructure', () => {
  const oneEventDoc = `<?xml version="1.0" encoding="UTF-8"?>
<q:quakeml xmlns="http://quakeml.org/xmlns/bed/1.2" xmlns:q="http://quakeml.org/xmlns/quakeml/1.2">
  <eventParameters publicID="smi:local/eventParameters/1">
    <event publicID="smi:nz.org.geonet/event/2016p858000">
      <origin publicID="smi:nz.org.geonet/origin/1">
        <time><value>2016-11-13T11:02:56.346Z</value></time>
        <latitude><value>-42.69</value></latitude>
        <longitude><value>173.02</value></longitude>
        <creationInfo agencyID="WEL"/>
      </origin>
    </event>
  </eventParameters>
</q:quakeml>`;

  it('accepts a well-formed document containing a declaration and self-closing tags', () => {
    const result = validateQuakeMLStructure(oneEventDoc);

    expect(result.errors).toEqual([]);
    expect(result.isValid).toBe(true);
  });

  it('counts events without counting the eventParameters container', () => {
    expect(validateQuakeMLStructure(oneEventDoc).eventCount).toBe(1);

    const twoEvents = oneEventDoc.replace(
      '</eventParameters>',
      '  <event publicID="smi:nz.org.geonet/event/2"><origin publicID="smi:nz.org.geonet/origin/2"/></event>\n  </eventParameters>'
    );
    expect(validateQuakeMLStructure(twoEvents).eventCount).toBe(2);
  });

  it('counts namespace-prefixed event elements', () => {
    const prefixed = oneEventDoc
      .replace('<event ', '<q:event ')
      .replace('</event>', '</q:event>');
    expect(validateQuakeMLStructure(prefixed).eventCount).toBe(1);
  });

  it('reports a document with no events', () => {
    const noEvents = `<?xml version="1.0" encoding="UTF-8"?>
<q:quakeml xmlns="http://quakeml.org/xmlns/bed/1.2" xmlns:q="http://quakeml.org/xmlns/quakeml/1.2">
  <eventParameters publicID="smi:local/eventParameters/1"></eventParameters>
</q:quakeml>`;
    const result = validateQuakeMLStructure(noEvents);

    expect(result.eventCount).toBe(0);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.path === 'quakeml')).toBe(true);
  });

  it('detects genuinely mismatched tags', () => {
    const malformed = oneEventDoc.replace('</origin>', '</origins>');
    const result = validateQuakeMLStructure(malformed);

    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.path === 'xml')).toBe(true);
  });

  it('detects an unclosed element', () => {
    const unclosed = oneEventDoc.replace('</origin>\n    </event>', '    </event>');
    const result = validateQuakeMLStructure(unclosed);

    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.path === 'xml')).toBe(true);
  });

  it('tolerates comments and attribute values containing markup characters', () => {
    const withComment = oneEventDoc.replace(
      '<eventParameters',
      '<!-- generated <by> the test -->\n  <eventParameters'
    );
    expect(validateQuakeMLStructure(withComment).isValid).toBe(true);
  });

  it('accepts the exporter\'s own output', () => {
    const doc = eventsToQuakeMLDocument([baseEvent], 'GeoNet NZ', { license: 'CC BY 4.0' });
    const result = validateQuakeMLStructure(doc);

    expect(result.errors).toEqual([]);
    expect(result.isValid).toBe(true);
    expect(result.eventCount).toBe(1);
  });
});
