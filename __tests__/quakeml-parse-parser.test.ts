/**
 * Regression tests for the QuakeML 1.2 (BED) parser.
 *
 * Expected values are derived from the specifications, not from the
 * implementation:
 *
 *  - XML 1.0 (5th ed.) §4.6 defines the five predefined entities
 *    (amp -> &, lt -> <, gt -> >, quot -> ", apos -> ') and §4.1 defines
 *    character references (&#233; = U+00E9 'e-acute', &#8211; / &#x2013; =
 *    U+2013 EN DASH). §4.4.5 states that replacement text is not rescanned, so
 *    "&amp;lt;" denotes the four characters "&lt;".
 *  - QuakeML-BED-1.2.xsd orders Event as an unbounded choice of
 *    (description | comment | focalMechanism | amplitude | magnitude |
 *    stationMagnitude | origin | pick) followed by preferredOriginID?,
 *    preferredMagnitudeID?, preferredFocalMechanismID?, type?, typeCertainty?,
 *    creationInfo? — so the event's own <type> and <creationInfo> come last.
 *  - The same schema declares Arrival as a child of Origin, Magnitude/originID,
 *    NodalPlanes/@preferredPlane (an xs:integer ATTRIBUTE), NodalPlane
 *    (strike, dip, rake), Axis (azimuth, plunge, length), Tensor (Mrr, Mtt,
 *    Mpp, Mrt, Mrp, Mtp) and MomentTensor (… tensor, variance,
 *    varianceReduction, doubleCouple, clvd, iso …).
 *  - QuakeML expresses depth and its uncertainties in METRES, so the DB's km
 *    convention divides by 1000.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { parseQuakeMLEvent, parseQuakeMLStream } from '@/lib/quakeml-parser';
import { quakemlEventToDbFields } from '@/lib/quakeml-to-db';
import { parseQuakeML } from '@/lib/parsers';

// A schema-ordered event: every element of the BED Event choice group comes
// first, each carrying its own <type> and/or <creationInfo>, and the event's own
// type / typeCertainty / creationInfo are the last children.
const SCHEMA_ORDERED_EVENT = `
<event publicID="smi:nz/event/1">
  <description><text>25 km south-east of Seddon</text><type>region name</type></description>
  <comment><text>Reviewed by duty officer</text>
    <creationInfo><agencyID>COMMENT</agencyID><author>duty</author></creationInfo>
  </comment>
  <focalMechanism publicID="smi:nz/fm/1">
    <creationInfo><agencyID>GCMT</agencyID><author>gcmt-bot</author></creationInfo>
  </focalMechanism>
  <amplitude publicID="smi:nz/amp/1">
    <genericAmplitude><value>1.2</value></genericAmplitude>
    <type>A</type>
    <creationInfo><agencyID>AMP</agencyID><author>scamp</author></creationInfo>
  </amplitude>
  <magnitude publicID="smi:nz/mag/1">
    <mag><value>4.2</value></mag>
    <type>MLv</type>
    <originID>smi:nz/origin/1</originID>
  </magnitude>
  <stationMagnitude publicID="smi:nz/stamag/1">
    <mag><value>4.3</value></mag>
    <type>MLv</type>
  </stationMagnitude>
  <origin publicID="smi:nz/origin/1">
    <time><value>2024-01-01T00:00:00Z</value></time>
    <latitude><value>-41.5</value></latitude>
    <longitude><value>174.2</value></longitude>
    <depth><value>12000</value><uncertainty>1500</uncertainty></depth>
    <originUncertainty><horizontalUncertainty>850</horizontalUncertainty></originUncertainty>
    <type>hypocenter</type>
  </origin>
  <pick publicID="smi:nz/pick/1">
    <time><value>2024-01-01T00:00:05Z</value></time>
    <waveformID networkCode="NZ" stationCode="WEL"/>
    <creationInfo><agencyID>PICK</agencyID><author>scautopick</author></creationInfo>
  </pick>
  <preferredOriginID>smi:nz/origin/1</preferredOriginID>
  <preferredMagnitudeID>smi:nz/mag/1</preferredMagnitudeID>
  <type>quarry blast</type>
  <typeCertainty>known</typeCertainty>
  <creationInfo><agencyID>WEL(GNS_Primary)</agencyID><author>scevent</author></creationInfo>
</event>`;

describe('QuakeML parser — entity and character reference decoding', () => {
  it('resolves the five predefined entities and numeric character references', () => {
    const xml = `
      <event publicID="smi:nz/event/ent">
        <description><text>Hawke's Bay &#8211; Jos&#233; &amp; &lt;surrounds&gt;</text><type>region name</type></description>
        <comment id="smi:local/comment/a&amp;b"><text>He said &quot;ok&quot; &amp; left</text></comment>
        <origin publicID="smi:nz/origin/ent">
          <time><value>2024-01-01T00:00:00Z</value></time>
          <latitude><value>-39.5</value></latitude>
          <longitude><value>176.9</value></longitude>
          <region>Cheviot &#x2013; New Zealand</region>
          <creationInfo><agencyID>GNS &amp; Partners</agencyID><author>Smith &amp; Jones</author></creationInfo>
        </origin>
      </event>`;

    const event = parseQuakeMLEvent(xml);

    expect(event).not.toBeNull();
    // U+2013 EN DASH and U+00E9 come from the character references.
    expect(event?.description?.[0].text).toBe("Hawke's Bay – José & <surrounds>");
    expect(event?.comment?.[0].text).toBe('He said "ok" & left');
    expect(event?.comment?.[0].id).toBe('smi:local/comment/a&b');
    expect(event?.origins?.[0].region).toBe('Cheviot – New Zealand');
    expect(event?.origins?.[0].creationInfo?.agencyID).toBe('GNS & Partners');
    expect(event?.origins?.[0].creationInfo?.author).toBe('Smith & Jones');
  });

  it('does not rescan replacement text (&amp;lt; is the four characters &lt;)', () => {
    const xml = `
      <event publicID="smi:nz/event/nested">
        <description><text>&amp;lt; and &amp;amp;</text></description>
        <origin publicID="smi:nz/origin/nested">
          <time><value>2024-01-01T00:00:00Z</value></time>
          <latitude><value>-41</value></latitude>
          <longitude><value>174</value></longitude>
        </origin>
      </event>`;

    const event = parseQuakeMLEvent(xml);

    expect(event?.description?.[0].text).toBe('&lt; and &amp;');
  });

  it('is stable under re-escaping, so an export/import cycle cannot double-escape', () => {
    const escapeXml = (text: string) =>
      text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const buildEvent = (author: string) => `
      <event publicID="smi:nz/event/rt">
        <origin publicID="smi:nz/origin/rt">
          <time><value>2024-01-01T00:00:00Z</value></time>
          <latitude><value>-41</value></latitude>
          <longitude><value>174</value></longitude>
          <creationInfo><author>${author}</author></creationInfo>
        </origin>
      </event>`;

    let author = escapeXml('Smith & <Jones>');
    for (let cycle = 0; cycle < 3; cycle++) {
      const parsed = parseQuakeMLEvent(buildEvent(author));
      expect(parsed?.origins?.[0].creationInfo?.author).toBe('Smith & <Jones>');
      author = escapeXml(parsed!.origins![0].creationInfo!.author!);
    }
  });
});

describe('QuakeML parser — BED element scoping', () => {
  it("takes the event's own <type>, not a nested description/magnitude/origin <type>", () => {
    const event = parseQuakeMLEvent(SCHEMA_ORDERED_EVENT);

    expect(event?.type).toBe('quarry blast');
    expect(event?.typeCertainty).toBe('known');
    expect(event?.description?.[0].type).toBe('region name');
    expect(event?.magnitudes?.[0].type).toBe('MLv');
  });

  it("takes the event's own creationInfo, not a child element's", () => {
    const event = parseQuakeMLEvent(SCHEMA_ORDERED_EVENT);

    expect(event?.creationInfo).toEqual({ agencyID: 'WEL(GNS_Primary)', author: 'scevent' });
  });

  it('does not let a comment shadow an origin/pick/amplitude creationInfo', () => {
    const xml = `
      <event publicID="smi:nz/event/ci">
        <origin publicID="smi:nz/origin/ci">
          <comment><text>note</text>
            <creationInfo><agencyID>COMMENT</agencyID><author>commenter</author></creationInfo>
          </comment>
          <time><value>2024-01-01T00:00:00Z</value></time>
          <latitude><value>-41</value></latitude>
          <longitude><value>174</value></longitude>
          <earthModelID>smi:nz/model/nz3drx</earthModelID>
          <creationInfo><agencyID>WEL</agencyID><author>scloc</author></creationInfo>
        </origin>
      </event>`;

    const origin = parseQuakeMLEvent(xml)?.origins?.[0];

    expect(origin?.creationInfo).toEqual({ agencyID: 'WEL', author: 'scloc' });
    expect(origin?.earthModelID).toBe('smi:nz/model/nz3drx');
  });

  it("does not let an arrival's earthModelID/creationInfo shadow the origin's", () => {
    const xml = `
      <event publicID="smi:nz/event/arrci">
        <origin publicID="smi:nz/origin/arrci">
          <arrival publicID="smi:nz/arrival/1">
            <pickID>smi:nz/pick/1</pickID>
            <phase>P</phase>
            <earthModelID>smi:nz/model/arrival</earthModelID>
            <creationInfo><agencyID>ARR</agencyID><author>scarrival</author></creationInfo>
          </arrival>
          <time><value>2024-01-01T00:00:00Z</value></time>
          <latitude><value>-41</value></latitude>
          <longitude><value>174</value></longitude>
          <earthModelID>smi:nz/model/origin</earthModelID>
          <creationInfo><agencyID>WEL</agencyID><author>scloc</author></creationInfo>
        </origin>
      </event>`;

    const origin = parseQuakeMLEvent(xml)?.origins?.[0];

    expect(origin?.earthModelID).toBe('smi:nz/model/origin');
    expect(origin?.creationInfo).toEqual({ agencyID: 'WEL', author: 'scloc' });
    expect(origin?.arrivals?.[0].earthModelID).toBe('smi:nz/model/arrival');
  });
});

describe('QuakeML parser — arrivals and magnitude/origin association', () => {
  const TWO_ORIGIN_EVENT = `
    <event publicID="smi:nz/event/2org">
      <preferredOriginID>smi:nz/origin/2</preferredOriginID>
      <magnitude publicID="smi:nz/mag/1">
        <mag><value>4.5</value></mag>
        <type>ML</type>
        <originID>smi:nz/origin/2</originID>
      </magnitude>
      <origin publicID="smi:nz/origin/1">
        <time><value>2024-01-01T00:00:00Z</value></time>
        <latitude><value>-41</value></latitude>
        <longitude><value>174</value></longitude>
        <arrival publicID="a1"><pickID>p1</pickID><phase>P</phase><timeResidual>0.1</timeResidual></arrival>
      </origin>
      <origin publicID="smi:nz/origin/2">
        <time><value>2024-01-01T00:00:01Z</value></time>
        <latitude><value>-41.1</value></latitude>
        <longitude><value>174.1</value></longitude>
        <arrival publicID="a2"><pickID>p2</pickID><phase>S</phase><timeResidual>0.4</timeResidual></arrival>
        <arrival publicID="a3"><pickID>p3</pickID><phase>P</phase><timeResidual>0.2</timeResidual></arrival>
      </origin>
    </event>`;

  it('attaches each arrival to the origin that owns it', () => {
    const event = parseQuakeMLEvent(TWO_ORIGIN_EVENT);

    expect(event?.origins?.[0].arrivals?.map(a => a.publicID)).toEqual(['a1']);
    expect(event?.origins?.[1].arrivals?.map(a => a.publicID)).toEqual(['a2', 'a3']);
    expect(event?.origins?.[1].arrivals?.[0].phase).toBe('S');
    expect(event?.origins?.[1].arrivals?.[0].timeResidual).toBe(0.4);
  });

  it("exposes the PREFERRED origin's phase set as the flat event arrival list", () => {
    const event = parseQuakeMLEvent(TWO_ORIGIN_EVENT);

    expect(event?.arrivals?.map(a => a.publicID)).toEqual(['a2', 'a3']);
  });

  it('still reads arrivals that sit outside any origin', () => {
    const xml = `
      <event publicID="smi:nz/event/flat">
        <origin publicID="smi:nz/origin/flat">
          <time><value>2024-01-01T00:00:00Z</value></time>
          <latitude><value>-41</value></latitude>
          <longitude><value>174</value></longitude>
        </origin>
        <arrival publicID="loose"><pickID>p9</pickID><phase>Pn</phase></arrival>
      </event>`;

    const event = parseQuakeMLEvent(xml);

    expect(event?.origins?.[0].arrivals).toBeUndefined();
    expect(event?.arrivals?.map(a => a.publicID)).toEqual(['loose']);
  });

  it('reads Magnitude/originID', () => {
    const event = parseQuakeMLEvent(TWO_ORIGIN_EVENT);

    expect(event?.magnitudes?.[0].originID).toBe('smi:nz/origin/2');
  });
});

describe('QuakeML parser — focal mechanism geometry', () => {
  const FM_EVENT = `
    <event publicID="smi:nz/event/fm">
      <focalMechanism publicID="smi:nz/fm/1">
        <comment><text>GCMT solution</text>
          <creationInfo><agencyID>COMMENT</agencyID><author>commenter</author></creationInfo>
        </comment>
        <momentTensor publicID="smi:nz/mt/1">
          <derivedOriginID>smi:nz/origin/3</derivedOriginID>
          <scalarMoment><value>5.3e19</value></scalarMoment>
          <tensor>
            <Mrr><value>5.32e19</value></Mrr>
            <Mtt><value>-2.1e19</value></Mtt>
            <Mpp><value>-3.22e19</value></Mpp>
            <Mrt><value>1.4e19</value></Mrt>
            <Mrp><value>2.3e19</value></Mrp>
            <Mtp><value>-0.9e19</value></Mtp>
          </tensor>
          <variance>0.12</variance>
          <varianceReduction>0.86</varianceReduction>
          <doubleCouple>0.92</doubleCouple>
          <clvd>0.08</clvd>
          <iso>0.01</iso>
          <methodID>smi:nz/method/momenttensor</methodID>
          <creationInfo><agencyID>MT</agencyID><author>mt-bot</author></creationInfo>
        </momentTensor>
        <triggeringOriginID>smi:nz/origin/3</triggeringOriginID>
        <nodalPlanes preferredPlane="2">
          <nodalPlane1>
            <strike><value>219</value></strike><dip><value>38</value></dip><rake><value>128</value></rake>
          </nodalPlane1>
          <nodalPlane2>
            <strike><value>1</value></strike><dip><value>60</value></dip><rake><value>63</value></rake>
          </nodalPlane2>
        </nodalPlanes>
        <principalAxes>
          <tAxis><azimuth><value>287</value></azimuth><plunge><value>72</value></plunge><length><value>5.5e19</value></length></tAxis>
          <pAxis><azimuth><value>106</value></azimuth><plunge><value>18</value></plunge><length><value>-5.1e19</value></length></pAxis>
          <nAxis><azimuth><value>16</value></azimuth><plunge><value>1</value></plunge><length><value>-0.4e19</value></length></nAxis>
        </principalAxes>
        <azimuthalGap>42.5</azimuthalGap>
        <methodID>smi:nz/method/focalmechanism</methodID>
        <evaluationMode>manual</evaluationMode>
        <creationInfo><agencyID>WEL</agencyID><author>scmoment</author></creationInfo>
      </focalMechanism>
    </event>`;

  it('parses nodalPlanes including the preferredPlane attribute', () => {
    const fm = parseQuakeMLEvent(FM_EVENT)?.focalMechanisms?.[0];

    expect(fm?.nodalPlanes?.nodalPlane1).toEqual({
      strike: { value: 219 },
      dip: { value: 38 },
      rake: { value: 128 }
    });
    expect(fm?.nodalPlanes?.nodalPlane2).toEqual({
      strike: { value: 1 },
      dip: { value: 60 },
      rake: { value: 63 }
    });
    // QuakeML-BED-1.2.xsd: preferredPlane is an attribute of <nodalPlanes>.
    expect(fm?.nodalPlanes?.preferredPlane).toBe(2);
  });

  it('accepts the child-element spelling of preferredPlane that the exporter writes', () => {
    const xml = `
      <event publicID="smi:nz/event/pp">
        <focalMechanism publicID="smi:nz/fm/pp">
          <nodalPlanes>
            <nodalPlane1><strike><value>10</value></strike><dip><value>20</value></dip><rake><value>30</value></rake></nodalPlane1>
            <preferredPlane>1</preferredPlane>
          </nodalPlanes>
        </focalMechanism>
      </event>`;

    const fm = parseQuakeMLEvent(xml)?.focalMechanisms?.[0];

    expect(fm?.nodalPlanes?.preferredPlane).toBe(1);
  });

  it('parses principalAxes', () => {
    const fm = parseQuakeMLEvent(FM_EVENT)?.focalMechanisms?.[0];

    expect(fm?.principalAxes?.tAxis).toEqual({
      azimuth: { value: 287 },
      plunge: { value: 72 },
      length: { value: 5.5e19 }
    });
    expect(fm?.principalAxes?.pAxis.azimuth.value).toBe(106);
    expect(fm?.principalAxes?.nAxis?.plunge.value).toBe(1);
  });

  it('parses the moment tensor components and inversion diagnostics', () => {
    const mt = parseQuakeMLEvent(FM_EVENT)?.focalMechanisms?.[0].momentTensor;

    expect(mt?.publicID).toBe('smi:nz/mt/1');
    expect(mt?.tensor).toEqual({
      Mrr: { value: 5.32e19 },
      Mtt: { value: -2.1e19 },
      Mpp: { value: -3.22e19 },
      Mrt: { value: 1.4e19 },
      Mrp: { value: 2.3e19 },
      Mtp: { value: -0.9e19 }
    });
    expect(mt?.variance).toBe(0.12);
    expect(mt?.varianceReduction).toBe(0.86);
    expect(mt?.doubleCouple).toBe(0.92);
    expect(mt?.clvd).toBe(0.08);
    expect(mt?.iso).toBe(0.01);
    expect(mt?.scalarMoment?.value).toBe(5.3e19);
  });

  it("does not let the momentTensor's methodID/creationInfo shadow the mechanism's", () => {
    const fm = parseQuakeMLEvent(FM_EVENT)?.focalMechanisms?.[0];

    expect(fm?.methodID).toBe('smi:nz/method/focalmechanism');
    expect(fm?.creationInfo).toEqual({ agencyID: 'WEL', author: 'scmoment' });
    expect(fm?.momentTensor?.methodID).toBe('smi:nz/method/momenttensor');
    expect(fm?.momentTensor?.creationInfo).toEqual({ agencyID: 'MT', author: 'mt-bot' });
    expect(fm?.azimuthalGap).toBe(42.5);
  });
});

describe('QuakeML -> DB field mapping', () => {
  it('stores the event type of a schema-ordered event', () => {
    const fields = quakemlEventToDbFields(parseQuakeMLEvent(SCHEMA_ORDERED_EVENT)!);

    expect(fields.event_type).toBe('quarry blast');
    expect(fields.event_type_certainty).toBe('known');
  });

  it('converts depth and horizontal uncertainties from QuakeML metres to DB km', () => {
    const fields = quakemlEventToDbFields(parseQuakeMLEvent(SCHEMA_ORDERED_EVENT)!);

    // 1500 m = 1.5 km, 850 m = 0.85 km (the exporter multiplies both by 1000).
    expect(fields.depth_uncertainty).toBeCloseTo(1.5, 10);
    expect(fields.horizontal_uncertainty).toBeCloseTo(0.85, 10);
  });

  it('stores raw (decoded) text rather than escaped markup', () => {
    const xml = `
      <event publicID="smi:nz/event/db">
        <origin publicID="smi:nz/origin/db">
          <time><value>2024-01-01T00:00:00Z</value></time>
          <latitude><value>-41</value></latitude>
          <longitude><value>174</value></longitude>
          <region>Cheviot &amp; surrounds</region>
          <creationInfo><agencyID>GNS &amp; Partners</agencyID><author>Smith &amp; Jones</author></creationInfo>
        </origin>
      </event>`;

    const fields = quakemlEventToDbFields(parseQuakeMLEvent(xml)!);

    expect(fields.region).toBe('Cheviot & surrounds');
    expect(fields.agency_id).toBe('GNS & Partners');
    expect(fields.author).toBe('Smith & Jones');
  });
});

describe('parseQuakeML — regex path and SAX path agree', () => {
  const eventBody = (index: number) => `<event publicID="smi:local/ev-${index}">
  <description><text>Hawke's Bay &#8211; Jos&#233; &amp; &lt;surrounds&gt;</text><type>region name</type></description>
  <origin publicID="smi:local/or-${index}">
    <time><value>2024-01-01T00:00:00Z</value></time>
    <latitude><value>-41.5</value></latitude>
    <longitude><value>174.5</value></longitude>
    <depth><value>12000</value><uncertainty>1500</uncertainty></depth>
    <creationInfo><agencyID>GNS &amp; Partners</agencyID><author>Smith &amp; Jones</author></creationInfo>
  </origin>
  <magnitude publicID="smi:local/mag-${index}"><mag><value>4.5</value></mag><type>ML</type></magnitude>
  <preferredOriginID>smi:local/or-${index}</preferredOriginID>
  <preferredMagnitudeID>smi:local/mag-${index}</preferredMagnitudeID>
  <type>quarry blast</type>
</event>`;

  const document = (eventCount: number) => {
    const parts = [
      '<?xml version="1.0" encoding="UTF-8"?>\n',
      '<q:quakeml xmlns:q="http://quakeml.org/xmlns/quakeml/1.2" xmlns="http://quakeml.org/xmlns/bed/1.2">\n',
      '<eventParameters publicID="smi:local/ep">\n'
    ];
    for (let i = 0; i < eventCount; i++) parts.push(eventBody(i), '\n');
    parts.push('</eventParameters>\n</q:quakeml>');
    return parts.join('');
  };

  it('produces identical events either side of the 5 MB streaming threshold', () => {
    // lib/parsers.ts switches to the SAX extractor at 5 MB of content. The first
    // event is byte-identical in both documents, so any difference in the parsed
    // result comes from the ingest path rather than the input.
    const small = document(1);
    const large = document(Math.ceil((5 * 1024 * 1024) / eventBody(0).length) + 10);

    expect(small.length).toBeLessThan(5 * 1024 * 1024);
    expect(large.length).toBeGreaterThan(5 * 1024 * 1024);

    const fromRegex = parseQuakeML(small);
    const fromSax = parseQuakeML(large);

    expect(fromRegex.events).toHaveLength(1);
    expect(fromSax.events.length).toBeGreaterThan(1);

    const regexEvent = fromRegex.events[0] as Record<string, unknown>;
    const saxEvent = fromSax.events[0] as Record<string, unknown>;

    expect(saxEvent.region).toEqual(regexEvent.region);
    expect(saxEvent.agency_id).toEqual(regexEvent.agency_id);
    expect(saxEvent.author).toEqual(regexEvent.author);
    expect(saxEvent.event_type).toEqual(regexEvent.event_type);
    expect(saxEvent.event_descriptions).toEqual(regexEvent.event_descriptions);

    // …and the shared value is the decoded text, not the lexical markup.
    expect(regexEvent.agency_id).toBe('GNS & Partners');
    expect(regexEvent.author).toBe('Smith & Jones');
    expect(regexEvent.event_type).toBe('quarry blast');
    expect(JSON.parse(regexEvent.event_descriptions as string)).toEqual([
      { text: "Hawke's Bay – José & <surrounds>", type: 'region name' }
    ]);
  }, 30000);
});

describe('parseQuakeMLStream', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quakeml-parse-'));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const writeCatalogue = (name: string, eventCount: number): string => {
    const parts = [
      '<?xml version="1.0" encoding="UTF-8"?>\n',
      '<q:quakeml xmlns:q="http://quakeml.org/xmlns/quakeml/1.2" xmlns="http://quakeml.org/xmlns/bed/1.2">\n',
      '<eventParameters publicID="smi:local/ep">\n'
    ];
    for (let i = 0; i < eventCount; i++) {
      parts.push(`<event publicID="smi:local/ev-${i}">
  <description><text>Depth &lt; 20 km &amp; offshore ${i}</text><type>region name</type></description>
  <origin publicID="smi:local/or-${i}">
    <time><value>2024-01-01T00:00:00Z</value></time>
    <latitude><value>-41.${i % 100}</value></latitude>
    <longitude><value>174.${i % 100}</value></longitude>
    <depth><value>${10000 + i}</value></depth>
  </origin>
  <magnitude publicID="smi:local/mag-${i}"><mag><value>4.5</value></mag><type>ML</type></magnitude>
  <preferredOriginID>smi:local/or-${i}</preferredOriginID>
  <type>earthquake</type>
</event>\n`);
    }
    parts.push('</eventParameters>\n</q:quakeml>\n');

    const filePath = path.join(tempDir, name);
    fs.writeFileSync(filePath, parts.join(''));
    return filePath;
  };

  it('loses no event across stream chunk boundaries when onEvent is async', async () => {
    // Node reads a file stream in 64 KiB chunks; 400 events spans several of them.
    const filePath = writeCatalogue('async-callback.xml', 400);
    expect(fs.statSync(filePath).size).toBeGreaterThan(3 * 64 * 1024);

    const seen: string[] = [];
    const result = await parseQuakeMLStream(filePath, {
      onEvent: async (event) => {
        await Promise.resolve();
        seen.push(event.publicID);
      }
    });

    expect(result.errors).toEqual([]);
    expect(result.totalEvents).toBe(400);
    expect(result.successfulEvents).toBe(400);
    expect(seen).toEqual(Array.from({ length: 400 }, (_, i) => `smi:local/ev-${i}`));
  });

  it('delivers every batch and waits for in-flight callbacks before resolving', async () => {
    const filePath = writeCatalogue('batched.xml', 250);

    const batched: string[] = [];
    const result = await parseQuakeMLStream(filePath, {
      batchSize: 100,
      onBatch: async (events) => {
        await Promise.resolve();
        for (const event of events) batched.push(event.publicID);
      }
    });

    expect(result.successfulEvents).toBe(250);
    expect(batched).toHaveLength(250);
    expect(batched[0]).toBe('smi:local/ev-0');
    expect(batched[249]).toBe('smi:local/ev-249');
  });

  it('keeps text containing entity references readable', async () => {
    const filePath = writeCatalogue('entities.xml', 1);

    const events: string[] = [];
    await parseQuakeMLStream(filePath, {
      onEvent: (event) => {
        events.push(event.description?.[0].text ?? '');
      }
    });

    expect(events).toEqual(['Depth < 20 km & offshore 0']);
  });
});
