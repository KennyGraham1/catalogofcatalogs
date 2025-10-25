/**
 * Tests for QuakeML 1.2 Parser
 */

import { parseQuakeMLEvent } from '@/lib/quakeml-parser';

describe('QuakeML Parser', () => {
  describe('parseQuakeMLEvent', () => {
    it('should parse a complete QuakeML event with all fields', () => {
      const quakemlXML = `
        <event publicID="quakeml:nz.geonet/2024/p123456">
          <type>earthquake</type>
          <typeCertainty>known</typeCertainty>
          <description>
            <text>Canterbury Region</text>
            <type>region name</type>
          </description>
          <comment>
            <text>Felt widely in Christchurch</text>
            <creationInfo>
              <agencyID>NZ.GEONET</agencyID>
              <author>analyst@geonet.org.nz</author>
              <creationTime>2024-01-15T12:00:00Z</creationTime>
            </creationInfo>
          </comment>
          <creationInfo>
            <agencyID>NZ.GEONET</agencyID>
            <author>SeisComP</author>
            <creationTime>2024-01-15T10:30:00Z</creationTime>
            <version>1.0</version>
          </creationInfo>
          <preferredOriginID>quakeml:nz.geonet/origin/123456</preferredOriginID>
          <preferredMagnitudeID>quakeml:nz.geonet/magnitude/123456</preferredMagnitudeID>
          <origin publicID="quakeml:nz.geonet/origin/123456">
            <time>
              <value>2024-01-15T10:25:30.500Z</value>
              <uncertainty>0.15</uncertainty>
            </time>
            <latitude>
              <value>-43.5321</value>
              <uncertainty>0.005</uncertainty>
            </latitude>
            <longitude>
              <value>172.6362</value>
              <uncertainty>0.008</uncertainty>
            </longitude>
            <depth>
              <value>8500</value>
              <uncertainty>1200</uncertainty>
            </depth>
            <depthType>from location</depthType>
            <evaluationMode>manual</evaluationMode>
            <evaluationStatus>reviewed</evaluationStatus>
            <quality>
              <associatedPhaseCount>45</associatedPhaseCount>
              <usedPhaseCount>38</usedPhaseCount>
              <associatedStationCount>25</associatedStationCount>
              <usedStationCount>22</usedStationCount>
              <standardError>0.42</standardError>
              <azimuthalGap>85.5</azimuthalGap>
              <minimumDistance>0.15</minimumDistance>
              <maximumDistance>2.8</maximumDistance>
            </quality>
            <originUncertainty>
              <horizontalUncertainty>850</horizontalUncertainty>
              <minHorizontalUncertainty>650</minHorizontalUncertainty>
              <maxHorizontalUncertainty>1200</maxHorizontalUncertainty>
              <azimuthMaxHorizontalUncertainty>45.2</azimuthMaxHorizontalUncertainty>
            </originUncertainty>
            <creationInfo>
              <agencyID>NZ.GEONET</agencyID>
              <author>SeisComP</author>
              <creationTime>2024-01-15T10:30:00Z</creationTime>
            </creationInfo>
          </origin>
          <magnitude publicID="quakeml:nz.geonet/magnitude/123456">
            <mag>
              <value>5.2</value>
              <uncertainty>0.1</uncertainty>
            </mag>
            <type>ML</type>
            <stationCount>22</stationCount>
            <azimuthalGap>85.5</azimuthalGap>
            <evaluationMode>manual</evaluationMode>
            <evaluationStatus>reviewed</evaluationStatus>
            <creationInfo>
              <agencyID>NZ.GEONET</agencyID>
              <author>SeisComP</author>
              <creationTime>2024-01-15T10:30:00Z</creationTime>
            </creationInfo>
          </magnitude>
        </event>
      `;

      const event = parseQuakeMLEvent(quakemlXML);

      expect(event).not.toBeNull();
      expect(event?.publicID).toBe('quakeml:nz.geonet/2024/p123456');
      expect(event?.type).toBe('earthquake');
      expect(event?.typeCertainty).toBe('known');
      
      // Check descriptions
      expect(event?.description).toHaveLength(1);
      expect(event?.description?.[0].text).toBe('Canterbury Region');
      expect(event?.description?.[0].type).toBe('region name');
      
      // Check comments
      expect(event?.comment).toHaveLength(1);
      expect(event?.comment?.[0].text).toBe('Felt widely in Christchurch');
      expect(event?.comment?.[0].creationInfo?.agencyID).toBe('NZ.GEONET');
      
      // Check creation info (extracts the event-level creationInfo, not from nested elements)
      expect(event?.creationInfo?.agencyID).toBe('NZ.GEONET');
      expect(event?.creationInfo?.author).toBe('SeisComP');
      expect(event?.creationInfo?.creationTime).toBe('2024-01-15T10:30:00Z');
      expect(event?.creationInfo?.version).toBe('1.0');
      
      // Check preferred IDs
      expect(event?.preferredOriginID).toBe('quakeml:nz.geonet/origin/123456');
      expect(event?.preferredMagnitudeID).toBe('quakeml:nz.geonet/magnitude/123456');
      
      // Check origin
      expect(event?.origins).toHaveLength(1);
      const origin = event?.origins?.[0];
      expect(origin?.publicID).toBe('quakeml:nz.geonet/origin/123456');
      expect(origin?.time.value).toBe('2024-01-15T10:25:30.500Z');
      expect(origin?.time.uncertainty).toBe(0.15);
      expect(origin?.latitude.value).toBe(-43.5321);
      expect(origin?.latitude.uncertainty).toBe(0.005);
      expect(origin?.longitude.value).toBe(172.6362);
      expect(origin?.longitude.uncertainty).toBe(0.008);
      expect(origin?.depth?.value).toBe(8500);
      expect(origin?.depth?.uncertainty).toBe(1200);
      expect(origin?.depthType).toBe('from location');
      expect(origin?.evaluationMode).toBe('manual');
      expect(origin?.evaluationStatus).toBe('reviewed');
      
      // Check origin quality
      expect(origin?.quality?.associatedPhaseCount).toBe(45);
      expect(origin?.quality?.usedPhaseCount).toBe(38);
      expect(origin?.quality?.associatedStationCount).toBe(25);
      expect(origin?.quality?.usedStationCount).toBe(22);
      expect(origin?.quality?.standardError).toBe(0.42);
      expect(origin?.quality?.azimuthalGap).toBe(85.5);
      expect(origin?.quality?.minimumDistance).toBe(0.15);
      expect(origin?.quality?.maximumDistance).toBe(2.8);
      
      // Check origin uncertainty
      expect(origin?.uncertainty?.horizontalUncertainty).toBe(850);
      expect(origin?.uncertainty?.minHorizontalUncertainty).toBe(650);
      expect(origin?.uncertainty?.maxHorizontalUncertainty).toBe(1200);
      expect(origin?.uncertainty?.azimuthMaxHorizontalUncertainty).toBe(45.2);
      
      // Check magnitude
      expect(event?.magnitudes).toHaveLength(1);
      const magnitude = event?.magnitudes?.[0];
      expect(magnitude?.publicID).toBe('quakeml:nz.geonet/magnitude/123456');
      expect(magnitude?.mag.value).toBe(5.2);
      expect(magnitude?.mag.uncertainty).toBe(0.1);
      expect(magnitude?.type).toBe('ML');
      expect(magnitude?.stationCount).toBe(22);
      expect(magnitude?.azimuthalGap).toBe(85.5);
      expect(magnitude?.evaluationMode).toBe('manual');
      expect(magnitude?.evaluationStatus).toBe('reviewed');
    });

    it('should parse a minimal QuakeML event', () => {
      const quakemlXML = `
        <event publicID="quakeml:test/event/1">
          <origin publicID="quakeml:test/origin/1">
            <time>
              <value>2024-01-15T10:25:30Z</value>
            </time>
            <latitude>
              <value>-41.5</value>
            </latitude>
            <longitude>
              <value>174.0</value>
            </longitude>
          </origin>
          <magnitude publicID="quakeml:test/magnitude/1">
            <mag>
              <value>4.5</value>
            </mag>
          </magnitude>
        </event>
      `;

      const event = parseQuakeMLEvent(quakemlXML);

      expect(event).not.toBeNull();
      expect(event?.publicID).toBe('quakeml:test/event/1');
      expect(event?.origins).toHaveLength(1);
      expect(event?.origins?.[0].time.value).toBe('2024-01-15T10:25:30Z');
      expect(event?.origins?.[0].latitude.value).toBe(-41.5);
      expect(event?.origins?.[0].longitude.value).toBe(174.0);
      expect(event?.magnitudes).toHaveLength(1);
      expect(event?.magnitudes?.[0].mag.value).toBe(4.5);
    });

    it('should handle multiple origins and magnitudes', () => {
      const quakemlXML = `
        <event publicID="quakeml:test/event/1">
          <origin publicID="quakeml:test/origin/1">
            <time><value>2024-01-15T10:25:30Z</value></time>
            <latitude><value>-41.5</value></latitude>
            <longitude><value>174.0</value></longitude>
          </origin>
          <origin publicID="quakeml:test/origin/2">
            <time><value>2024-01-15T10:25:31Z</value></time>
            <latitude><value>-41.51</value></latitude>
            <longitude><value>174.01</value></longitude>
          </origin>
          <magnitude publicID="quakeml:test/magnitude/1">
            <mag><value>4.5</value></mag>
            <type>ML</type>
          </magnitude>
          <magnitude publicID="quakeml:test/magnitude/2">
            <mag><value>4.6</value></mag>
            <type>Mw</type>
          </magnitude>
        </event>
      `;

      const event = parseQuakeMLEvent(quakemlXML);

      expect(event).not.toBeNull();
      expect(event?.origins).toHaveLength(2);
      expect(event?.magnitudes).toHaveLength(2);
      expect(event?.magnitudes?.[0].type).toBe('ML');
      expect(event?.magnitudes?.[1].type).toBe('Mw');
    });

    it('should return null for invalid XML', () => {
      const invalidXML = '<invalid>not a valid event</invalid>';
      const event = parseQuakeMLEvent(invalidXML);
      expect(event).toBeNull();
    });

    it('should return null for event without publicID', () => {
      const xmlWithoutPublicID = `
        <event>
          <origin publicID="quakeml:test/origin/1">
            <time><value>2024-01-15T10:25:30Z</value></time>
            <latitude><value>-41.5</value></latitude>
            <longitude><value>174.0</value></longitude>
          </origin>
        </event>
      `;
      const event = parseQuakeMLEvent(xmlWithoutPublicID);
      expect(event).toBeNull();
    });
  });
});

