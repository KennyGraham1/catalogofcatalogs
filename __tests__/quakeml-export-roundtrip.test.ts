/**
 * QuakeML parse -> export -> parse round trip (cluster: quakeml-export).
 *
 * The source document below is written by hand from the QuakeML 1.2 BED schema,
 * so every expected number is derived from it rather than from the exporter:
 *   depth               15110 m   -> 15.11 km in the DB   -> 15110 m on export
 *   depth uncertainty    2340 m   ->  2.34 km             ->  2340 m
 *   horizontal unc.      3400 m   ->  3.40 km             ->  3400 m
 *   time uncertainty     0.21 s (no conversion)
 *   magnitude 7.82 +/- 0.11 (no conversion)
 *
 * The document also carries an ampersand in its description, so the escaping
 * pass is exercised: the exporter must escape exactly once (a literal "&" from a
 * CSV upload would otherwise produce malformed XML) and the reader must decode
 * exactly once, or repeated round trips accumulate "&amp;amp;…".
 */

import { eventsToQuakeMLDocument } from '@/lib/quakeml-exporter';
import { validateQuakeMLStructure } from '@/lib/quakeml-validator';
import { parseQuakeML } from '@/lib/parsers';
import type { MergedEvent } from '@/lib/db';

const sourceDocument = `<?xml version="1.0" encoding="UTF-8"?>
<q:quakeml xmlns="http://quakeml.org/xmlns/bed/1.2" xmlns:q="http://quakeml.org/xmlns/quakeml/1.2">
  <eventParameters publicID="smi:local/eventParameters/1">
    <event publicID="smi:nz.org.geonet/event/2016p858000">
      <description><text>Kaikoura &amp; Hanmer</text><type>region name</type></description>
      <comment id="smi:nz.org.geonet/comment/1"><text>Operator reviewed</text></comment>
      <origin publicID="smi:nz.org.geonet/origin/1">
        <time><value>2016-11-13T11:02:56.346Z</value><uncertainty>0.21</uncertainty></time>
        <latitude><value>-42.6905</value><uncertainty>0.0123</uncertainty></latitude>
        <longitude><value>173.0217</value><uncertainty>0.0145</uncertainty></longitude>
        <depth><value>15110</value><uncertainty>2340</uncertainty></depth>
        <originUncertainty><horizontalUncertainty>3400</horizontalUncertainty></originUncertainty>
        <quality><azimuthalGap>44</azimuthalGap><usedPhaseCount>101</usedPhaseCount></quality>
      </origin>
      <magnitude publicID="smi:nz.org.geonet/magnitude/1">
        <mag><value>7.82</value><uncertainty>0.11</uncertainty></mag>
        <type>Mw</type>
        <originID>smi:nz.org.geonet/origin/1</originID>
      </magnitude>
      <preferredOriginID>smi:nz.org.geonet/origin/1</preferredOriginID>
      <preferredMagnitudeID>smi:nz.org.geonet/magnitude/1</preferredMagnitudeID>
    </event>
  </eventParameters>
</q:quakeml>`;

describe('QuakeML parse -> export -> parse', () => {
  const parsed = parseQuakeML(sourceDocument);
  const exported = eventsToQuakeMLDocument([parsed.events[0] as unknown as MergedEvent], 'round-trip');
  const reparsed = parseQuakeML(exported);

  it('parses the source document', () => {
    expect(parsed.success).toBe(true);
    expect(parsed.events).toHaveLength(1);
  });

  it('re-exports the hypocentre in QuakeML units', () => {
    expect(exported).toContain('<value>2016-11-13T11:02:56.346Z</value>');
    expect(exported).toContain('<value>-42.6905</value>');
    expect(exported).toContain('<value>173.0217</value>');
    expect(exported).toContain('<value>15110</value>');
    expect(exported).toContain('<uncertainty>2340</uncertainty>');
    expect(exported).toContain('<horizontalUncertainty>3400</horizontalUncertainty>');
  });

  it('recovers every number unchanged after a second parse', () => {
    const event = reparsed.events[0] as any;

    expect(event.time).toBe('2016-11-13T11:02:56.346Z');
    expect(event.latitude).toBeCloseTo(-42.6905, 6);
    expect(event.longitude).toBeCloseTo(173.0217, 6);
    expect(event.depth).toBeCloseTo(15.11, 6);          // 15110 m
    expect(event.depth_uncertainty).toBeCloseTo(2.34, 6); // 2340 m
    expect(event.horizontal_uncertainty).toBeCloseTo(3.4, 6); // 3400 m
    expect(event.time_uncertainty).toBeCloseTo(0.21, 6);
    expect(event.magnitude).toBeCloseTo(7.82, 6);
    expect(event.magnitude_uncertainty).toBeCloseTo(0.11, 6);
    expect(event.magnitude_type).toBe('Mw');
  });

  it('preserves the native identifiers and the comment id attribute', () => {
    const event = reparsed.events[0] as any;

    expect(event.event_public_id).toBe('smi:nz.org.geonet/event/2016p858000');
    expect(event.preferred_origin_id).toBe('smi:nz.org.geonet/origin/1');
    expect(event.preferred_magnitude_id).toBe('smi:nz.org.geonet/magnitude/1');
    expect(JSON.parse(event.comments)).toEqual([
      { text: 'Operator reviewed', id: 'smi:nz.org.geonet/comment/1' },
    ]);
  });

  it('escapes text exactly once per round trip', () => {
    // The source text decodes to a literal ampersand, which must be re-escaped once.
    expect(exported).toContain('<text>Kaikoura &amp; Hanmer</text>');
    expect(exported).not.toContain('&amp;amp;');
    expect((reparsed.events[0] as any).region).toBe('Kaikoura & Hanmer');
  });

  it('produces a document the structural validator accepts', () => {
    const result = validateQuakeMLStructure(exported);

    expect(result.errors).toEqual([]);
    expect(result.eventCount).toBe(1);
  });
});
