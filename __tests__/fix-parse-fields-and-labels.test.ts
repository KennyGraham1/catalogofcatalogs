/** @jest-environment node */
/**
 * gap gi#7: QuakeML depth types are looked up case-insensitively and stored in the
 * schema's spelling. gap gt#7: magnitude class labels. Contract C16 additions: the
 * origin-uncertainty confidence level, rake normalised to (-180, 180] at ingest, and
 * negative "not determined" sentinels in non-negative columns read as missing.
 */
import { parseCSV, parseJSON, parseQuakeML } from '@/lib/parsers';
import { parseGeoJSON } from '@/lib/geojson-parser';
import { parseQuakeMLEvent } from '@/lib/quakeml-parser';
import { quakemlEventToDbFields, canonicalQuakeMLDepthType, QUAKEML_DEPTH_TYPES } from '@/lib/quakeml-to-db';
import { parsedEventToDbFields } from '@/lib/parsed-event-to-db';
import { getMagnitudeLabel } from '@/lib/earthquake-utils';
import { magnitudeClass } from '@/lib/chart-config';

const eventXml = (originExtra: string, eventExtra = '') => `<event publicID="smi:test/event/1">
  <origin publicID="smi:test/origin/1">
    <time><value>2024-01-01T00:00:00Z</value></time>
    <latitude><value>-41</value></latitude>
    <longitude><value>174</value></longitude>
    <depth><value>12000</value></depth>
    ${originExtra}
  </origin>
  <magnitude publicID="smi:test/mag/1"><mag><value>5.1</value></mag><type>Mw</type></magnitude>
  ${eventExtra}
</event>`;

describe('gi#7: depth types keep the QuakeML 1.2 spelling', () => {
  it('matches the eight OriginDepthType values case-insensitively', () => {
    expect(QUAKEML_DEPTH_TYPES).toHaveLength(8);
    for (const value of QUAKEML_DEPTH_TYPES) {
      expect(canonicalQuakeMLDepthType(value.toUpperCase())).toBe(value);
    }
    expect(canonicalQuakeMLDepthType('from modeling of broad-band p waveforms')).toBe('from modeling of broad-band P waveforms');
    expect(canonicalQuakeMLDepthType('constrained by S-P time differences')).toBeNull();
  });

  it('a QuakeML upload stores the canonical spelling', () => {
    const quakeml = parseQuakeMLEvent(eventXml('<depthType>from modeling of broad-band P waveforms</depthType>'))!;
    expect(quakemlEventToDbFields(quakeml).depth_type).toBe('from modeling of broad-band P waveforms');
    const both = parseQuakeMLEvent(eventXml('<depthType>Constrained By Depth And Direct Phases</depthType>'))!;
    expect(quakemlEventToDbFields(both).depth_type).toBe('constrained by depth and direct phases');
  });

  it('a CSV/JSON value is canonicalised too; 0/1 flags and unknown values as before', () => {
    const base = { time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, magnitude: 4 };
    expect(parsedEventToDbFields({ ...base, depth_type: 'FROM MODELING OF BROAD-BAND P WAVEFORMS' }).depth_type)
      .toBe('from modeling of broad-band P waveforms');
    expect(parsedEventToDbFields({ ...base, depth_type: '1' }).depth_type).toBe('operator assigned');
    expect(parsedEventToDbFields({ ...base, depth_type: 'Fixed' }).depth_type).toBe('fixed');
  });
});

describe('gt#7: magnitude class labels', () => {
  it('uses Great for M >= 8 and Micro below M2', () => {
    expect(getMagnitudeLabel(8.1)).toBe('Great'); // 2021 Kermadec
    expect(getMagnitudeLabel(8.2)).toBe('Great'); // 1855 Wairarapa
    expect(getMagnitudeLabel(7.9)).toBe('Major');
    expect(getMagnitudeLabel(3.9)).toBe('Minor');
    expect(getMagnitudeLabel(2)).toBe('Minor');
    expect(getMagnitudeLabel(1.99)).toBe('Micro');
    expect(getMagnitudeLabel(-1.2)).toBe('Micro');
    expect(getMagnitudeLabel(NaN)).toBe('Unknown');
  });

  it('agrees with the chart tooltip classes everywhere', () => {
    for (let tenths = -30; tenths <= 100; tenths++) {
      const m = tenths / 10;
      expect([m, getMagnitudeLabel(m)]).toEqual([m, magnitudeClass(m)]);
    }
  });
});

describe('C16: origin-uncertainty confidence level', () => {
  it('QuakeML originUncertainty.confidenceLevel of the preferred origin becomes confidence_level', () => {
    const uncertainty = (level: string) => `<originUncertainty>
      <horizontalUncertainty>1200</horizontalUncertainty>
      <confidenceLevel>${level}</confidenceLevel>
    </originUncertainty>`;
    const parsed = parseQuakeML(`<q:quakeml xmlns:q="http://quakeml.org/xmlns/quakeml/1.2"><eventParameters publicID="smi:x">${eventXml(uncertainty('68'))}</eventParameters></q:quakeml>`);
    expect(parsed.errors).toEqual([]);
    expect((parsed.events[0] as any).confidence_level).toBe(68);
    expect(quakemlEventToDbFields(parsedEventQuakeml(parsed)).confidence_level).toBe(68);
    // Not an xs:double: absent rather than parseFloat's 68.
    expect(parseQuakeMLEvent(eventXml(uncertainty('68percent')))!.origins![0].uncertainty!.confidenceLevel).toBeUndefined();
  });

  it('CSV/JSON columns and the GeoJSON export property carry it', () => {
    const csv = parseCSV('time,latitude,longitude,magnitude,confidence_level\n2024-01-01T00:00:00Z,-41,174,4,95');
    expect(parsedEventToDbFields(csv.events[0]).confidence_level).toBe(95);
    const json = parseJSON(JSON.stringify([{ time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, magnitude: 4, confidenceLevel: 68 }]));
    expect(parsedEventToDbFields(json.events[0]).confidence_level).toBe(68);
    const geojson = parseGeoJSON(JSON.stringify({
      type: 'Feature', geometry: { type: 'Point', coordinates: [174, -41] },
      properties: { time: '2024-01-01T00:00:00Z', magnitude: 4, confidenceLevel: 90 },
    }));
    expect(parsedEventToDbFields(geojson.events[0]).confidence_level).toBe(90);
    // A negative sentinel is not a level.
    const sentinel = parseCSV('time,latitude,longitude,magnitude,confidence_level\n2024-01-01T00:00:00Z,-41,174,4,-1');
    expect(parsedEventToDbFields(sentinel.events[0]).confidence_level).toBeUndefined();
  });
});

function parsedEventQuakeml(result: ReturnType<typeof parseQuakeML>) {
  return result.events[0].quakeml!;
}

describe('C16: rake is stored on (-180, 180]', () => {
  const planeRakes = (focalMechanisms: string) => {
    const planes = JSON.parse(focalMechanisms)[0].nodalPlanes;
    return [planes.nodalPlane1?.rake?.value, planes.nodalPlane2?.rake?.value];
  };

  it('flat CSV nodal-plane columns', () => {
    const csv = [
      'time,latitude,longitude,magnitude,strike1,dip1,rake1,strike2,dip2,rake2',
      '2024-01-01T00:00:00Z,-41,174,4,30,40,270,210,50,-180',
      '2024-01-02T00:00:00Z,-41,174,4,30,40,180,210,50,-450',
    ].join('\n');
    const events = parseCSV(csv).events;
    expect(planeRakes(events[0].focal_mechanisms as string)).toEqual([-90, 180]);
    expect(planeRakes(events[1].focal_mechanisms as string)).toEqual([180, -90]);
  });

  it('QuakeML nodal planes', () => {
    const fm = `<focalMechanism publicID="smi:test/fm/1">
      <nodalPlanes>
        <nodalPlane1><strike><value>30</value></strike><dip><value>40</value></dip><rake><value>270</value><uncertainty>5</uncertainty></rake></nodalPlane1>
        <nodalPlane2><strike><value>210</value></strike><dip><value>50</value></dip><rake><value>-90</value></rake></nodalPlane2>
      </nodalPlanes>
    </focalMechanism>`;
    const planes = parseQuakeMLEvent(eventXml('', fm))!.focalMechanisms![0].nodalPlanes!;
    expect(planes.nodalPlane1!.rake).toEqual({ value: -90, uncertainty: 5 });
    expect(planes.nodalPlane2!.rake.value).toBe(-90);
  });
});

describe('C16: negative sentinels in non-negative columns are missing values', () => {
  it('CSV uncertainties, counts and gap', () => {
    const result = parseCSV([
      'time,latitude,longitude,depth,magnitude,azimuthal_gap,used_station_count,horizontal_uncertainty,standard_error',
      '2024-01-01T00:00:00Z,-41,174,-1,4,-1,-999,-1,0',
    ].join('\n'));
    expect(result.success).toBe(true);
    const event: any = result.events[0];
    expect([event.azimuthal_gap, event.used_station_count, event.horizontal_uncertainty]).toEqual([null, null, null]);
    expect(event.standard_error).toBe(0);
    expect(event.depth).toBe(-1); // depth may be above sea level; not a sentinel field
    expect(result.fileDecisions.sentinelValues).toBe(3);
    expect(result.warnings.some((w) => /3 negative value\(s\)/.test(w.message))).toBe(true);
  });

  it('USGS GeoJSON gap/nst/dmin/rms', () => {
    const result = parseGeoJSON(JSON.stringify({
      type: 'Feature', geometry: { type: 'Point', coordinates: [174, -41, 10] },
      properties: { time: 1704067200000, mag: 4, net: 'us', gap: -1, nst: -1, dmin: 0.2, rms: 0.4 },
    }));
    const event: any = result.events[0];
    expect(event.azimuthal_gap).toBeUndefined();
    expect(event.used_station_count).toBeUndefined();
    expect([event.minimum_distance, event.standard_error]).toEqual([0.2, 0.4]);
    expect(result.fileDecisions.sentinelValues).toBe(2);
  });
});
