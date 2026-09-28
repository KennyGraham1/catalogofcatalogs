/** @jest-environment node */
/**
 * #41: the chunked-upload QuakeML path (parseQuakeMLFileStream) repairs a bare '&' the
 * same way the in-memory path does, so a bulletin parses whatever its size.
 * Feature: the .quakeml extension is routed to the QuakeML parser.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseFile, parseQuakeML, parseQuakeMLFileStream } from '@/lib/parsers';
import { createBareAmpersandEscaper } from '@/lib/quakeml-parser';

const event = (i: number, region: string) => `
    <event publicID="smi:test/event/${i}">
      <description><text>${region}</text><type>region name</type></description>
      <origin publicID="smi:test/origin/${i}">
        <time><value>2024-01-01T00:00:${String(i % 60).padStart(2, '0')}Z</value></time>
        <latitude><value>-41.3</value></latitude>
        <longitude><value>174.8</value></longitude>
        <depth><value>12000</value></depth>
      </origin>
      <magnitude publicID="smi:test/mag/${i}"><mag><value>4.1</value></mag><type>ML</type></magnitude>
    </event>`;

const document = (events: string) => `<?xml version="1.0" encoding="UTF-8"?>
<q:quakeml xmlns:q="http://quakeml.org/xmlns/quakeml/1.2" xmlns="http://quakeml.org/xmlns/bed/1.2">
  <eventParameters publicID="smi:test/ep">${events}
  </eventParameters>
</q:quakeml>`;

/** The in-memory repair as it was before it became a streaming escaper: the oracle. */
const referenceEscape = (content: string) =>
  content
    .split(/(<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->)/)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/&(?!(?:[A-Za-z][A-Za-z0-9._-]*|#[0-9]+|#x[0-9A-Fa-f]+);)/g, '&amp;')))
    .join('');

let dir: string;
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-parse-qml-')); });
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const writeFile = (name: string, content: string) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
};

describe('#41: the streamed QuakeML path tolerates a bare ampersand', () => {
  it('parses a bulletin with "Cook Strait & Marlborough" as the in-memory path does', async () => {
    const content = document(event(1, 'Cook Strait & Marlborough'));
    const inMemory = parseQuakeML(content);
    const streamed = await parseQuakeMLFileStream(writeFile('bare-amp.xml', content));
    expect(inMemory.success).toBe(true);
    expect(streamed.success).toBe(true);
    expect(streamed.events).toHaveLength(1);
    expect(streamed.events[0].region).toBe('Cook Strait & Marlborough');
    expect(streamed.events[0].region).toBe(inMemory.events[0].region);
  });

  it('handles a reference and a bare ampersand split across the 64 KiB stream chunks', async () => {
    // ASCII content, so the default 64 KiB read chunks are 65536 characters. Pad with
    // comments of exact length so that '&amp;' is split '&a' | 'mp;' across the first
    // boundary and a bare '&' is the last character of the second chunk.
    const head = document('').split('</eventParameters>')[0];
    const filler = (length: number) => `<!-- ${'x'.repeat(length - 9)} -->`;
    const first = event(1, 'Hawke&amp;s Bay');
    let body = head + filler(65534 - head.length - first.indexOf('&amp;')) + first;
    const second = event(2, 'Cook Strait & Marlborough');
    body += filler(2 * 65536 - 1 - body.length - second.indexOf('& ')) + second;
    const content = `${body}\n  </eventParameters>\n</q:quakeml>`;
    expect(content.slice(65534, 65537)).toBe('&am');
    expect(content.slice(2 * 65536 - 1, 2 * 65536 + 1)).toBe('& ');

    const streamed = await parseQuakeMLFileStream(writeFile('boundary.xml', content));
    expect(streamed.errors).toEqual([]);
    expect(streamed.events.map((e) => e.region)).toEqual(['Hawke&s Bay', 'Cook Strait & Marlborough']);
    expect(streamed.events.map((e) => e.region)).toEqual(parseQuakeML(content).events.map((e) => e.region));
  });

  it('the escaper gives the same output however the input is chunked', () => {
    const tricky = [
      '<a b="x & y">R&amp;D &#169; &#xA9; & more</a>',
      '<![CDATA[ a & b ]]> & <!-- c & d --> &lt;',
      '<!DOCTYPE q> tail & <',
    ].join('\n');
    const expected = referenceEscape(tricky);
    for (let size = 1; size <= 12; size++) {
      const escaper = createBareAmpersandEscaper();
      let out = '';
      for (let i = 0; i < tricky.length; i += size) out += escaper.push(tricky.slice(i, i + size));
      out += escaper.flush();
      expect(out).toBe(expected);
    }
  });
});

describe('the .quakeml extension', () => {
  it('is parsed as QuakeML', () => {
    const result = parseFile(document(event(1, 'Wellington')), 'bulletin.quakeml');
    expect(result.success).toBe(true);
    expect(result.events).toHaveLength(1);
  });

  it('is not sent to the CSV parser when the content is not XML', () => {
    const result = parseFile('time,latitude\n2024-01-01,-41', 'bulletin.QuakeML');
    expect(result.success).toBe(false);
    expect(result.errors[0].message).toMatch(/QuakeML/);
  });
});
