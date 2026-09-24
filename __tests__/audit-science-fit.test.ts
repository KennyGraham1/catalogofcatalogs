/** @jest-environment node */
import { calculateGutenbergRichter } from '@/lib/seismological-analysis';
const events = (table: number[][]) => table.flatMap(([magnitude, count]) => Array.from({ length: count }, (_, i) => ({ id: `${magnitude}-${i}`, time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude })));
it('withholds a fit when incomplete bins are the only bins meeting the safeguard', () => {
  expect(() => calculateGutenbergRichter(events([[1, 60], [1.1, 10], [4, 20]]))).toThrow(/3 populated bins/);
});
it('scores an identical complete sample identically despite different incomplete tails', () => {
  const tail = Array.from({ length: 29 }, (_, i) => [Number((2.2 + i * .1).toFixed(1)), Math.round(100 * 10 ** (-i * .1))]);
  const a = calculateGutenbergRichter(events([[2, 200], [2.1, 150], ...tail]));
  const b = calculateGutenbergRichter(events([[2, 10000], [2.1, 9000], ...tail]));
  expect(a.completeness).toBe(b.completeness);
  expect(a.bValue).toBe(b.bValue);
  expect(a.aValue).toBe(b.aValue);
  expect(a.rSquared).toBeCloseTo(b.rSquared, 12);
  expect(a.fittedLine.every(p => p.magnitude >= a.completeness)).toBe(true);
});
it('withholds the same one-bin fit in the actual worker message handler', () => {
  const fs = require('fs');
  const ts = require('typescript');
  const js = ts.transpileModule(fs.readFileSync(require('path').join(__dirname, '../workers/seismological-worker.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const posted: any[] = [];
  const self: any = { postMessage: (m: any) => posted.push(m) };
  const moduleStub = { exports: {} };
  new Function('self', 'module', 'exports', js)(self, moduleStub, moduleStub.exports);
  self.onmessage({ data: { type: 'gutenberg-richter', events: events([[1, 60], [1.1, 10], [4, 20]]) } });
  const result = posted[0].result;
  expect(result.error).toMatch(/3 populated bins/);
  expect(result.bValue).toBeUndefined();
});
