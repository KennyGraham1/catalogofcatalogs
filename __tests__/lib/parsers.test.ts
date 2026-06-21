import { parseCSV, parseJSON, parseQuakeML, parseFile } from '@/lib/parsers';

describe('parsers', () => {
  describe('parseCSV', () => {
    it('should parse valid CSV data', () => {
      const csv = `time,latitude,longitude,magnitude,depth
2024-01-01T00:00:00Z,-41.2865,174.7762,5.0,10
2024-01-01T01:00:00Z,-36.8485,174.7633,4.5,15`;

      const result = parseCSV(csv);
      
      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(2);
      expect(result.events[0].latitude).toBe(-41.2865);
      expect(result.events[0].magnitude).toBe(5.0);
    });

    it('should handle quoted values', () => {
      const csv = `time,latitude,longitude,magnitude,depth,region
2024-01-01T00:00:00Z,-41.2865,174.7762,5.0,10,"Wellington, NZ"`;

      const result = parseCSV(csv);
      
      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
    });

    it('should return errors for invalid data', () => {
      const csv = `time,latitude,longitude,magnitude,depth
invalid,100,200,-1,2000`;

      const result = parseCSV(csv);
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle empty file', () => {
      const result = parseCSV('');
      
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('parseJSON', () => {
    it('should parse valid JSON array', () => {
      const json = JSON.stringify([
        {
          time: '2024-01-01T00:00:00Z',
          latitude: -41.2865,
          longitude: 174.7762,
          magnitude: 5.0,
          depth: 10
        },
        {
          time: '2024-01-01T01:00:00Z',
          latitude: -36.8485,
          longitude: 174.7633,
          magnitude: 4.5,
          depth: 15
        }
      ]);

      const result = parseJSON(json);
      
      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(2);
    });

    it('should parse JSON with events property', () => {
      const json = JSON.stringify({
        events: [
          {
            time: '2024-01-01T00:00:00Z',
            latitude: -41.2865,
            longitude: 174.7762,
            magnitude: 5.0,
            depth: 10
          }
        ]
      });

      const result = parseJSON(json);
      
      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
    });

    it('should parse GeoJSON format', () => {
      const json = JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              time: '2024-01-01T00:00:00Z',
              magnitude: 5.0
            },
            geometry: {
              type: 'Point',
              coordinates: [174.7762, -41.2865, 10]
            }
          }
        ]
      });

      const result = parseJSON(json);
      
      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].latitude).toBe(-41.2865);
      expect(result.events[0].longitude).toBe(174.7762);
    });

    it('should handle invalid JSON', () => {
      const result = parseJSON('invalid json');
      
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('parseQuakeML', () => {
    it('should parse valid QuakeML', () => {
      const xml = `<?xml version="1.0"?>
<quakeml>
  <event publicID="quakeml:test/event/1">
    <origin publicID="quakeml:test/origin/1">
      <time><value>2024-01-01T00:00:00Z</value></time>
      <latitude><value>-41.2865</value></latitude>
      <longitude><value>174.7762</value></longitude>
      <depth><value>10000</value></depth>
    </origin>
    <magnitude publicID="quakeml:test/magnitude/1">
      <mag><value>5.0</value></mag>
    </magnitude>
  </event>
</quakeml>`;

      const result = parseQuakeML(xml);

      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].magnitude).toBe(5.0);
      expect(result.events[0].depth).toBe(10); // Converted from meters to km
      expect(result.events[0].quakeml).toBeDefined();
      expect(result.events[0].quakeml?.publicID).toBe('quakeml:test/event/1');
    });

    it('should handle invalid XML', () => {
      const result = parseQuakeML('invalid xml');

      expect(result.success).toBe(false); // No valid events found
      expect(result.events).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
    });

    it('should flatten rich QuakeML fields into mappable source fields', () => {
      const xml = `<?xml version="1.0"?>
<quakeml>
  <event publicID="quakeml:test/event/rich2">
    <type>earthquake</type>
    <typeCertainty>known</typeCertainty>
    <description><text>Test Region</text><type>region name</type></description>
    <origin publicID="quakeml:test/origin/rich2">
      <time><value>2024-01-01T00:00:00Z</value><uncertainty>0.2</uncertainty></time>
      <latitude><value>-41.2865</value><uncertainty>0.01</uncertainty></latitude>
      <longitude><value>174.7762</value><uncertainty>0.01</uncertainty></longitude>
      <depth><value>10000</value><uncertainty>500</uncertainty></depth>
      <depthType>from location</depthType>
      <earthModelID>iasp91</earthModelID>
      <methodID>method:origin</methodID>
      <evaluationMode>manual</evaluationMode>
      <evaluationStatus>reviewed</evaluationStatus>
      <quality>
        <azimuthalGap>85.5</azimuthalGap>
        <usedPhaseCount>38</usedPhaseCount>
        <usedStationCount>22</usedStationCount>
        <standardError>0.42</standardError>
      </quality>
      <originUncertainty>
        <horizontalUncertainty>850</horizontalUncertainty>
      </originUncertainty>
      <arrival>
        <pickID>quakeml:test/pick/2</pickID>
        <phase>P</phase>
      </arrival>
      <creationInfo>
        <agencyID>NZ.GEONET</agencyID>
        <author>SeisComP</author>
      </creationInfo>
    </origin>
    <pick publicID="quakeml:test/pick/2">
      <time><value>2024-01-01T00:00:01Z</value></time>
      <waveformID networkCode="NZ" stationCode="ABC"/>
    </pick>
    <amplitude publicID="quakeml:test/amplitude/2">
      <genericAmplitude><value>2.1</value></genericAmplitude>
    </amplitude>
    <stationMagnitude publicID="quakeml:test/stamag/2">
      <mag><value>4.9</value></mag>
    </stationMagnitude>
    <magnitude publicID="quakeml:test/magnitude/rich2">
      <mag><value>5.0</value><uncertainty>0.1</uncertainty></mag>
      <type>ML</type>
      <stationCount>22</stationCount>
      <evaluationMode>manual</evaluationMode>
      <evaluationStatus>reviewed</evaluationStatus>
      <methodID>method:mag</methodID>
    </magnitude>
    <focalMechanism publicID="quakeml:test/fm/2">
      <methodID>method:fm</methodID>
    </focalMechanism>
  </event>
</quakeml>`;

      const result = parseQuakeML(xml);
      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);

      const event = result.events[0] as any;
      expect(event.event_public_id).toBe('quakeml:test/event/rich2');
      expect(event.event_type).toBe('earthquake');
      expect(event.event_type_certainty).toBe('known');
      expect(event.time_uncertainty).toBe(0.2);
      expect(event.latitude_uncertainty).toBe(0.01);
      expect(event.longitude_uncertainty).toBe(0.01);
      // QuakeML depth/horizontal uncertainty are in metres (500 m, 850 m); DB stores km.
      expect(event.depth_uncertainty).toBe(0.5);
      expect(event.horizontal_uncertainty).toBe(0.85);
      expect(event.depth_type).toBe('from location');
      expect(event.earth_model_id).toBe('iasp91');
      expect(event.method_id).toBe('method:origin');
      expect(event.azimuthal_gap).toBe(85.5);
      expect(event.used_phase_count).toBe(38);
      expect(event.used_station_count).toBe(22);
      expect(event.standard_error).toBe(0.42);
      expect(event.magnitude_type).toBe('ML');
      expect(event.magnitude_uncertainty).toBe(0.1);
      expect(event.magnitude_station_count).toBe(22);
      expect(event.magnitude_method_id).toBe('method:mag');
      expect(event.magnitude_evaluation_mode).toBe('manual');
      expect(event.magnitude_evaluation_status).toBe('reviewed');
      expect(event.evaluation_mode).toBe('manual');
      expect(event.evaluation_status).toBe('reviewed');
      expect(event.agency_id).toBe('NZ.GEONET');
      expect(event.author).toBe('SeisComP');
      expect(typeof event.origins).toBe('string');
      expect(typeof event.magnitudes).toBe('string');
      expect(typeof event.picks).toBe('string');
      expect(typeof event.arrivals).toBe('string');
      expect(typeof event.focal_mechanisms).toBe('string');
      expect(typeof event.amplitudes).toBe('string');
      expect(typeof event.station_magnitudes).toBe('string');

      expect(result.detectedFields).toContain('event_public_id');
      expect(result.detectedFields).toContain('event_type');
      expect(result.detectedFields).toContain('time_uncertainty');
      expect(result.detectedFields).toContain('horizontal_uncertainty');
      expect(result.detectedFields).toContain('arrivals');
      expect(result.detectedFields).toContain('focal_mechanisms');
      expect(result.detectedFields).toContain('station_magnitudes');
    });

    it('should parse namespaced event tags in catalogue-level QuakeML', () => {
      const xml = `<?xml version="1.0"?>
<q:quakeml xmlns:q="http://quakeml.org/xmlns/quakeml/1.2">
  <q:event publicID="quakeml:test/event/ns2">
    <q:origin publicID="quakeml:test/origin/ns2">
      <q:time><q:value>2024-01-01T00:00:00Z</q:value></q:time>
      <q:latitude><q:value>-41.2865</q:value></q:latitude>
      <q:longitude><q:value>174.7762</q:value></q:longitude>
    </q:origin>
    <q:magnitude publicID="quakeml:test/magnitude/ns2">
      <q:mag><q:value>5.0</q:value></q:mag>
    </q:magnitude>
  </q:event>
</q:quakeml>`;

      const result = parseQuakeML(xml);
      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].eventId).toBe('quakeml:test/event/ns2');
    });

    it('should cap warning volume for large warning-producing files', () => {
      const eventXml = `<event publicID="quakeml:test/warn/event">
  <origin publicID="quakeml:test/warn/origin">
    <time><value>2024-01-01T00:00:00Z</value></time>
    <latitude><value>-41.2865</value></latitude>
    <longitude><value>174.7762</value></longitude>
  </origin>
  <magnitude publicID="quakeml:test/warn/mag">
    <mag><value>5.0</value></mag>
  </magnitude>
</event>`;

      const manyEvents = Array.from({ length: 230 }, (_, i) =>
        eventXml.replace('quakeml:test/warn/event', `quakeml:test/warn/event/${i}`)
      ).join('\n');
      const xml = `<quakeml>${manyEvents}</quakeml>`;
      const result = parseQuakeML(xml);

      expect(result.success).toBe(true);
      expect(result.events.length).toBe(230);
      expect(result.warnings.length).toBe(200);
      expect(result.warningsTruncated).toBe(true);
    });
  });

  describe('parseFile', () => {
    it('should auto-detect CSV format', () => {
      const csv = `time,latitude,longitude,magnitude,depth
2024-01-01T00:00:00Z,-41.2865,174.7762,5.0,10`;

      const result = parseFile(csv, 'data.csv');
      
      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
    });

    it('should auto-detect JSON format', () => {
      const json = JSON.stringify([
        {
          time: '2024-01-01T00:00:00Z',
          latitude: -41.2865,
          longitude: 174.7762,
          magnitude: 5.0,
          depth: 10
        }
      ]);

      const result = parseFile(json, 'data.json');
      
      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
    });

    it('should auto-detect XML format', () => {
      const xml = `<?xml version="1.0"?>
<quakeml>
  <event publicID="quakeml:test/event/1">
    <origin publicID="quakeml:test/origin/1">
      <time><value>2024-01-01T00:00:00Z</value></time>
      <latitude><value>-41.2865</value></latitude>
      <longitude><value>174.7762</value></longitude>
      <depth><value>10000</value></depth>
    </origin>
    <magnitude publicID="quakeml:test/magnitude/1">
      <mag><value>5.0</value></mag>
    </magnitude>
  </event>
</quakeml>`;

      const result = parseFile(xml, 'data.xml');

      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
    });
  });

  describe('mapCommonFields - field name variations', () => {
    it('should map common latitude variations', () => {
      const csv = `lat,lon,time,mag
-41.2865,174.7762,2024-01-01T00:00:00Z,5.0`;

      const result = parseCSV(csv);
      expect(result.success).toBe(true);
      expect(result.events[0].latitude).toBe(-41.2865);
    });

    it('should map GeoNet-style field names (evla, evlo, evdp)', () => {
      const json = JSON.stringify([{
        evla: -41.2865,
        evlo: 174.7762,
        evdp: 10,
        time: '2024-01-01T00:00:00Z',
        mag: 5.0
      }]);

      const result = parseJSON(json);
      expect(result.success).toBe(true);
      expect(result.events[0].latitude).toBe(-41.2865);
      expect(result.events[0].longitude).toBe(174.7762);
      expect(result.events[0].depth).toBe(10);
    });

    it('should map ISC-style quality metrics (nph, nst, rms)', () => {
      const json = JSON.stringify([{
        latitude: -41.2865,
        longitude: 174.7762,
        time: '2024-01-01T00:00:00Z',
        magnitude: 5.0,
        nph: 25,
        nst: 15,
        rms: 0.5,
        azgap: 45
      }]);

      const result = parseJSON(json);
      expect(result.success).toBe(true);
      expect(result.events[0].used_phase_count).toBe(25);
      expect(result.events[0].used_station_count).toBe(15);
      expect(result.events[0].standard_error).toBe(0.5);
      expect(result.events[0].azimuthal_gap).toBe(45);
    });

    it('maps generic JSON uncertainty aliases AS-IS in DB units (km/seconds, no conversion)', () => {
      // Unlike the QuakeML importer (metres -> km), generic JSON/CSV values are taken in
      // the field's canonical DB unit: horizontal/depth uncertainty in km, time in seconds.
      const json = JSON.stringify([{
        latitude: -41.2865,
        longitude: 174.7762,
        time: '2024-01-01T00:00:00Z',
        magnitude: 5.0,
        horiz_unc: 1.5,    // km (already in DB units)
        depth_error: 2.5,  // km
        time_error: 0.3    // seconds
      }]);

      const result = parseJSON(json);
      expect(result.success).toBe(true);
      expect(result.events[0].horizontal_uncertainty).toBe(1.5);
      expect(result.events[0].depth_uncertainty).toBe(2.5);
      expect(result.events[0].time_uncertainty).toBe(0.3);
    });

    it('should map agency and author fields', () => {
      const json = JSON.stringify([{
        latitude: -41.2865,
        longitude: 174.7762,
        time: '2024-01-01T00:00:00Z',
        magnitude: 5.0,
        agency: 'GeoNet',
        analyst: 'auto'
      }]);

      const result = parseJSON(json);
      expect(result.success).toBe(true);
      expect(result.events[0].agency_id).toBe('GeoNet');
      expect(result.events[0].author).toBe('auto');
    });

    it('should map magnitude evaluation fields', () => {
      const json = JSON.stringify([{
        latitude: -41.2865,
        longitude: 174.7762,
        time: '2024-01-01T00:00:00Z',
        magnitude: 5.0,
        mag_eval_mode: 'automatic',
        mag_eval_status: 'preliminary'
      }]);

      const result = parseJSON(json);
      expect(result.success).toBe(true);
      expect(result.events[0].magnitude_evaluation_mode).toBe('automatic');
      expect(result.events[0].magnitude_evaluation_status).toBe('preliminary');
    });

    it('should map distance metrics', () => {
      const json = JSON.stringify([{
        latitude: -41.2865,
        longitude: 174.7762,
        time: '2024-01-01T00:00:00Z',
        magnitude: 5.0,
        mindist: 0.5,
        maxdist: 10.0
      }]);

      const result = parseJSON(json);
      expect(result.success).toBe(true);
      expect(result.events[0].minimum_distance).toBe(0.5);
      expect(result.events[0].maximum_distance).toBe(10.0);
    });
  });
});
