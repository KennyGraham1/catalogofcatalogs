/** @jest-environment node */

// QuakeML parse and export round trips.
// Fixtures are minimal, schema-valid documents; expectations are what the XML says.

import { parseQuakeML } from '@/lib/parsers';
import { parseQuakeMLEvent } from '@/lib/quakeml-parser';
import { eventToQuakeML } from '@/lib/quakeml-exporter';
import { quakemlEventToDbFields } from '@/lib/quakeml-to-db';

const NS = 'xmlns="http://quakeml.org/xmlns/bed/1.2" xmlns:q="http://quakeml.org/xmlns/quakeml/1.2"';
const doc = (events: string) =>
  `<?xml version="1.0"?><q:quakeml ${NS}><eventParameters publicID="smi:local/ep">${events}</eventParameters></q:quakeml>`;
const origin = (id: string, extra = '') =>
  `<origin publicID="smi:local/origin/${id}"><time><value>2024-01-01T00:00:00Z</value></time>` +
  `<latitude><value>-41</value></latitude><longitude><value>174</value></longitude><depth><value>10000</value></depth>${extra}</origin>`;
const mag = (id: string) => `<magnitude publicID="smi:local/mag/${id}"><mag><value>3.5</value></mag></magnitude>`;
const prefs = (id: string) => `<preferredOriginID>smi:local/origin/${id}</preferredOriginID><preferredMagnitudeID>smi:local/mag/${id}</preferredMagnitudeID>`;

describe('parser handles valid XML spellings the regex scan mishandled', () => {
  it('imports an event whose publicID uses single quotes', () => {
    const r = parseQuakeML(doc(`<event publicID='smi:local/event/e1'>${origin('o1')}${mag('m1')}${prefs('1')}</event>`.replace(/o1|m1/g, '1')));
    expect(r.events).toHaveLength(1);
  });

  it('a comment-only document yields no ghost event', () => {
    const r = parseQuakeML(doc(`<!-- <event publicID="smi:local/event/ghost">${origin('g')}${mag('g')}</event> -->`));
    expect(r.events).toHaveLength(0);
  });

  it('CDATA content is kept literally and a CDATA numeric does not drop the event', () => {
    const xml = doc(
      `<event publicID="smi:local/event/e1"><description><text><![CDATA[Depth < 20 km & offshore]]></text></description>` +
      `${origin('1')}<magnitude publicID="smi:local/mag/1"><mag><value><![CDATA[4.5]]></value></mag></magnitude>${prefs('1')}</event>`
    );
    const r = parseQuakeML(xml);
    expect(r.events).toHaveLength(1);
    expect(JSON.stringify(r.events[0])).toContain('Depth < 20 km & offshore');
    expect(r.events[0].magnitude).toBe(4.5);
  });
});

describe('comment ownership survives repeated round trips', () => {
  it('keeps 0 event / 1 origin / 1 pick comments through three cycles', () => {
    let xml =
      `<event publicID="smi:local/event/e1">${origin('1', '<comment><text>Origin A rejected</text></comment>')}${mag('1')}` +
      `<pick publicID="smi:local/pick/p1"><time><value>2024-01-01T00:00:05Z</value></time>` +
      `<waveformID networkCode="NZ" stationCode="WEL" channelCode="HHZ"/><comment><text>Pick uncertain</text></comment></pick>${prefs('1')}</event>`;
    for (let cycle = 0; cycle < 3; cycle++) {
      const ev: any = parseQuakeMLEvent(xml);
      expect([ev.comment?.length ?? 0, ev.origins[0].comment?.length ?? 0, ev.picks[0].comment?.length ?? 0]).toEqual([0, 1, 1]);
      xml = eventToQuakeML({ ...quakemlEventToDbFields(ev), id: 'e1' } as any);
    }
  });
});

describe('the preferred focal mechanism is carried, not inferred from array order', () => {
  it('maps and exports preferredFocalMechanismID', () => {
    const fm = (id: string) => `<focalMechanism publicID="smi:local/fm/${id}"><nodalPlanes><nodalPlane1><strike><value>10</value></strike><dip><value>20</value></dip><rake><value>30</value></rake></nodalPlane1></nodalPlanes></focalMechanism>`;
    const ev: any = parseQuakeMLEvent(`<event publicID="smi:local/event/e1">${origin('1')}${mag('1')}${fm('1')}${fm('2')}${prefs('1')}<preferredFocalMechanismID>smi:local/fm/2</preferredFocalMechanismID></event>`);
    const fields: any = quakemlEventToDbFields(ev);
    expect(fields.preferred_focal_mechanism_id).toBe('smi:local/fm/2');
    expect(eventToQuakeML({ ...fields, id: 'e1' } as any)).toContain('<preferredFocalMechanismID>smi:local/fm/2</preferredFocalMechanismID>');
  });
});

describe('exporter conformance', () => {
  const base: any = { id: 'e1', catalogue_id: 'c', source_id: 'e1', time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude: 3 };

  it('preferredPlane is an attribute of <nodalPlanes>, not a child element', () => {
    const xml = eventToQuakeML({ ...base, focal_mechanisms: JSON.stringify([{ publicID: 'smi:local/fm/1', nodalPlanes: { preferredPlane: 2, nodalPlane1: { strike: { value: 10 }, dip: { value: 20 }, rake: { value: 30 } }, nodalPlane2: { strike: { value: 100 }, dip: { value: 70 }, rake: { value: -150 } } } }]) });
    expect(xml).toContain('<nodalPlanes preferredPlane="2">');
    expect(xml).not.toContain('<preferredPlane>');
  });

  it('associatedStationCount and depthPhaseCount are exported in BED order', () => {
    const xml = eventToQuakeML({ ...base, origins: JSON.stringify([{ publicID: 'smi:local/origin/1', time: { value: base.time }, latitude: { value: -41 }, longitude: { value: 174 }, quality: { associatedPhaseCount: 30, usedPhaseCount: 20, associatedStationCount: 22, usedStationCount: 18, depthPhaseCount: 5 } }]), preferred_origin_id: 'smi:local/origin/1' });
    const order = ['associatedPhaseCount', 'usedPhaseCount', 'associatedStationCount', 'usedStationCount', 'depthPhaseCount'].map((t) => xml.indexOf(`<${t}>`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(xml).toContain('<associatedStationCount>22</associatedStationCount>');
    expect(xml).toContain('<depthPhaseCount>5</depthPhaseCount>');
  });

  it('distinct source identifiers stay distinct after resource-id escaping', () => {
    const pid = (id: string) => (eventToQuakeML({ ...base, id, source_id: id }).match(/<event publicID="([^"]+)"/) || [])[1];
    const sourceIds = ['a/b', 'a:b', 'a_b', 'a~b', '\u010000', '\u{10000}', '~u00010000', '\u0100', '\u00ff00'];
    const ids = sourceIds.map(pid);
    expect(new Set(ids).size).toBe(sourceIds.length);
    for (const id of ids) expect(id).toMatch(/^smi:local\/event\/[A-Za-z0-9_\-.*()~']+$/);
  });

  it('selects the matching Mw donor and preserves both agencies and measurement IDs', () => {
    const old = { publicID: 'smi:local/mag/ML', mag: { value: 5.4 }, type: 'ML', creationInfo: { agencyID: 'A' } };
    const donor = { publicID: 'smi:local/mag/Mw', mag: { value: 5.9, uncertainty: 0.05 }, type: 'Mw', methodID: 'smi:local/method/Mw', creationInfo: { agencyID: 'B' } };
    const row = { ...base, magnitude: 5.9, magnitude_type: 'Mw', magnitude_uncertainty: 0.05, magnitude_method_id: donor.methodID,
      source_events: '[{"source":"A"},{"source":"B"}]', preferred_magnitude_id: old.publicID, magnitudes: JSON.stringify([old, donor]) };
    const result = parseQuakeMLEvent(eventToQuakeML(row))!;
    expect(result.preferredMagnitudeID).toBe(donor.publicID);
    expect(result.magnitudes).toHaveLength(2);
    expect(result.magnitudes?.find(m => m.publicID === donor.publicID)?.creationInfo?.agencyID).toBe('B');
    expect(result.magnitudes?.find(m => m.publicID === old.publicID)?.mag.value).toBe(5.4);
  });

  it('does not invent donor provenance when only the discarded measurement is stored', () => {
    const old = { publicID: 'smi:local/mag/ML', mag: { value: 5.4 }, type: 'ML', creationInfo: { agencyID: 'A', author: 'analyst-A' } };
    const row = { ...base, magnitude: 5.9, magnitude_type: 'Mw', magnitude_method_id: 'smi:local/method/Mw',
      agency_id: 'A', author: 'analyst-A', evaluation_mode: 'automatic', evaluation_status: 'preliminary',
      source_events: '[{"source":"A"},{"source":"B"}]', preferred_magnitude_id: old.publicID, magnitudes: JSON.stringify([old]) };
    const result = parseQuakeMLEvent(eventToQuakeML(row))!;
    const preferred = result.magnitudes?.find(m => m.publicID === result.preferredMagnitudeID);
    expect(preferred?.mag.value).toBe(5.9);
    expect(preferred?.methodID).toBe(row.magnitude_method_id);
    expect(preferred?.publicID).not.toBe(old.publicID);
    expect(preferred?.creationInfo).toBeUndefined();
    expect(preferred?.evaluationMode).toBeUndefined();
    expect(preferred?.evaluationStatus).toBeUndefined();
    expect(result.magnitudes?.find(m => m.publicID === old.publicID)?.creationInfo?.agencyID).toBe('A');
  });
});
