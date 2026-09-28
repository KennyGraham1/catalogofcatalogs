/** @jest-environment node */
/**
 * The day/month order is a property of the whole file (#34), and the JSON upload path
 * decides it the same way the CSV path does (#35).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCSV, parseJSON, parseFile, parseJSONStream } from '@/lib/parsers';
import { detectDateFormat } from '@/lib/date-format-detector';

/** A time-sorted US-format Darfield sequence: 60 ambiguous rows before the first day > 12. */
const DARFIELD_TIMES = [
  ...Array.from({ length: 60 }, (_, i) => `09/04/2010 16:${String(i).padStart(2, '0')}:00`),
  '09/13/2010 10:00:00',
  '09/08/2010 10:00:00',
];
const DARFIELD_ROWS = DARFIELD_TIMES.map((time) => ({ time, latitude: -43.53, longitude: 172.17, depth: 10, magnitude: 4.1 }));

describe('#34: the day/month order is decided from the whole time column', () => {
  it('parseCSV reads every row of a US file as MM/DD, not only rows after the first 50', () => {
    const csv = ['time,latitude,longitude,depth,magnitude']
      .concat(DARFIELD_ROWS.map((r) => `${r.time},${r.latitude},${r.longitude},${r.depth},${r.magnitude}`))
      .join('\n');
    const result = parseCSV(csv);
    expect(result.errors).toEqual([]);
    expect(result.events[0].time).toBe('2010-09-04T16:00:00.000Z'); // the M7.1 mainshock day
    expect(result.events[60].time).toBe('2010-09-13T10:00:00.000Z');
    expect(result.events[61].time).toBe('2010-09-08T10:00:00.000Z');
    expect(result.fileDecisions.dateFormat).toBe('US');
    expect(result.warnings.some((w) => /Detected US date format/.test(w.message))).toBe(true);
  });

  it('a file with no day above 12 anywhere still falls back to DD/MM, with a warning', () => {
    const csv = ['time,latitude,longitude,depth,magnitude', '03/04/2024 10:00:00,-41,174,5,4', '05/06/2024 10:00:00,-41,174,5,4'].join('\n');
    const result = parseCSV(csv);
    expect(result.events.map((e) => e.time)).toEqual(['2024-04-03T10:00:00.000Z', '2024-06-05T10:00:00.000Z']);
    expect(result.warnings.some((w) => /Low confidence date format detection/.test(w.message))).toBe(true);
  });

  it('the detector counts two-digit-year and year-first slash dates', () => {
    expect(detectDateFormat(['25/03/24 10:00:00', '05/03/24 11:00:00']).format).toBe('International');
    expect(detectDateFormat(['2024/01/15 10:00', '2024/01/16 11:00']).format).toBe('ISO');
  });
});

describe('#35: parseJSON detects the file date format as parseCSV does', () => {
  it('a US file keeps its ambiguous rows as MM/DD', () => {
    const json = JSON.stringify([
      { time: '03/25/2024 10:00:00', latitude: -41, longitude: 174, magnitude: 4 },
      { time: '03/04/2024 10:00:00', latitude: -41, longitude: 174, magnitude: 4 },
    ]);
    for (const result of [parseJSON(json), parseFile(json, 'catalogue.json')]) {
      expect(result.events.map((e) => e.time)).toEqual(['2024-03-25T10:00:00.000Z', '2024-03-04T10:00:00.000Z']);
      expect(result.warnings.some((w) => /Detected US date format/.test(w.message))).toBe(true);
    }
  });

  it('the Kaikoura row (11/13) settles the ambiguous row as MM/DD too', () => {
    const json = JSON.stringify([
      { time: '11/13/2016 11:02:56', latitude: -42.69, longitude: 173.02, magnitude: 7.8 },
      { time: '03/04/2016 05:06:07', latitude: -42.5, longitude: 173.4, magnitude: 6.0 },
    ]);
    expect(parseJSON(json).events.map((e) => e.time)).toEqual(['2016-11-13T11:02:56.000Z', '2016-03-04T05:06:07.000Z']);
  });

  it('matches parseCSV for the whole Darfield sequence', () => {
    const result = parseJSON(JSON.stringify(DARFIELD_ROWS));
    expect(result.events[0].time).toBe('2010-09-04T16:00:00.000Z');
    expect(result.events[61].time).toBe('2010-09-08T10:00:00.000Z');
    expect(result.fileDecisions).toMatchObject({ dateFormat: 'US', dateFormatSource: 'detected' });
  });

  it('parseJSONStream decides from every record it holds back, not the first 50', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-parse-ndjson-'));
    const file = path.join(dir, 'darfield.ndjson');
    fs.writeFileSync(file, DARFIELD_ROWS.map((r) => JSON.stringify(r)).join('\n'));
    try {
      const seen: string[] = [];
      const result = await parseJSONStream(file, (event) => { seen.push(event.time); });
      expect(result.errors).toEqual([]);
      expect(seen[0]).toBe('2010-09-04T16:00:00.000Z');
      expect(seen[61]).toBe('2010-09-08T10:00:00.000Z');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
