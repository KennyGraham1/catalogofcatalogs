/**
 * @jest-environment node
 *
 * gp#5: scripts/generate_test_data.py's "Gutenberg-Richter" magnitude sampler was
 * actually a Beta(1, 2.5) power law (b ~= 0.25 on the platform's own estimator,
 * not the b=1 the script implied), its "clustered" events used a fresh random
 * centre per event (no real space+time clustering), its auxiliary nodal plane
 * used a (strike+180, dip, -rake) shortcut that is only correct for a vertical
 * dip-slip fault, and rake could land outside QuakeML's (-180, 180] domain.
 *
 * These tests run the REAL, current scripts/generate_test_data.py with python3
 * (numpy is available but not required here) — never a reimplementation:
 *  - the magnitude/rake/aux-plane functions are extracted from the live file with
 *    `ast` (the same technique the original finding's probe used) and exercised
 *    directly, so a regression in the file itself fails these tests;
 *  - the full script is also run once end-to-end in a temp directory and its
 *    output inspected, matching how the script is actually invoked.
 *
 * No network, no database; python3 and its stdlib only.
 */

import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT_PATH = join(__dirname, '..', 'scripts', 'generate_test_data.py');

function runPython(code: string, args: string[] = []): { stdout: string; stderr: string; status: number | null } {
  const dir = mkdtempSync(join(tmpdir(), 'gp5-py-'));
  const file = join(dir, 'harness.py');
  writeFileSync(file, code);
  const result = spawnSync('python3', [file, ...args], { encoding: 'utf-8', timeout: 30000 });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status };
}

describe('gp#5 generate_test_data.py (real source, via python3)', () => {
  it('the magnitude sampler follows a doubly-truncated Gutenberg-Richter law with b ~= 1, not a Beta(1, 2.5) law', () => {
    const harness = `
import ast, json, math, random, sys

with open(${JSON.stringify(SCRIPT_PATH)}) as f:
    tree = ast.parse(f.read())

ns = {"random": random, "math": math}
for node in tree.body:
    if isinstance(node, ast.FunctionDef) and node.name == "gutenberg_richter_magnitude":
        exec(compile(ast.Module(body=[node], type_ignores=[]), "<extracted>", "exec"), ns)

gr = ns["gutenberg_richter_magnitude"]

random.seed(12345)
N = 200000
mags = [gr(min_mag=1.0, max_mag=7.5, b_value=1.0) for _ in range(N)]

def empirical_ge(m):
    return sum(1 for x in mags if x >= m) / N

def theory_ge(m, mmin=1.0, mmax=7.5, b=1.0):
    num = 10 ** (-b * (m - mmin)) - 10 ** (-b * (mmax - mmin))
    den = 1 - 10 ** (-b * (mmax - mmin))
    return num / den

out = {
    "min": min(mags), "max": max(mags),
    "empirical": {str(m): empirical_ge(m) for m in [2, 3, 4, 5, 6]},
    "theory": {str(m): theory_ge(m) for m in [2, 3, 4, 5, 6]},
}
print(json.dumps(out))
`;
    const { stdout, stderr, status } = runPython(harness);
    expect(stderr).toBe('');
    expect(status).toBe(0);
    const result = JSON.parse(stdout.trim().split('\n').pop()!);

    expect(result.min).toBeGreaterThanOrEqual(1.0);
    expect(result.max).toBeLessThanOrEqual(7.5);

    // Binning to 1 decimal inflates counts near each integer threshold by up to
    // ~half a bin's density (the same, documented effect noted in
    // paper/figures/generate_figures.py next to its own gr_from_u) -- a 20%
    // relative band comfortably separates "the right law" from the old Beta(1,
    // 2.5) law, whose P(M>=5) was ~970x theory (0.097 vs 1e-4).
    for (const m of [2, 3, 4]) {
      const emp = result.empirical[String(m)];
      const th = result.theory[String(m)];
      expect(Math.abs(emp - th) / th).toBeLessThan(0.2);
    }
    // At M>=5/6 the theoretical counts are tiny (~1e-4/1e-5); assert the same
    // order of magnitude instead of a tight relative tolerance.
    expect(result.empirical['5']).toBeLessThan(0.01); // old Beta(1,2.5) law gave ~0.097
    expect(result.empirical['6']).toBeLessThan(0.005); // old law gave ~0.027
  });

  it('rake is always wrapped into (-180, 180]', () => {
    const harness = `
import ast, json, random

with open(${JSON.stringify(SCRIPT_PATH)}) as f:
    tree = ast.parse(f.read())

ns = {}
import math
ns["math"] = math
for node in tree.body:
    if isinstance(node, ast.FunctionDef) and node.name == "wrap_rake":
        exec(compile(ast.Module(body=[node], type_ignores=[]), "<extracted>", "exec"), ns)

wrap_rake = ns["wrap_rake"]
cases = [160, 175, 180, 190, 200, -20, -180, 359, -359, 0, 540, -540]
print(json.dumps([wrap_rake(x) for x in cases]))
`;
    const { stdout, stderr, status } = runPython(harness);
    expect(stderr).toBe('');
    expect(status).toBe(0);
    const wrapped: number[] = JSON.parse(stdout.trim().split('\n').pop()!);
    for (const r of wrapped) {
      expect(r).toBeGreaterThan(-180);
      expect(r).toBeLessThanOrEqual(180);
    }
  });

  it('the auxiliary plane shares its moment tensor with plane 1 (a real double-couple auxiliary plane), for many mechanisms including the finding\'s own examples', () => {
    const harness = `
import ast, json, math, random

with open(${JSON.stringify(SCRIPT_PATH)}) as f:
    tree = ast.parse(f.read())

ns = {"math": math}
wanted = {"wrap_rake", "_strike_dip_from_vector", "auxiliary_plane"}
for node in tree.body:
    if isinstance(node, ast.FunctionDef) and node.name in wanted:
        exec(compile(ast.Module(body=[node], type_ignores=[]), "<extracted>", "exec"), ns)

auxiliary_plane = ns["auxiliary_plane"]

def moment_tensor(strike, dip, rake):
    phi, delta, lam = math.radians(strike), math.radians(dip), math.radians(rake)
    Mxx = -(math.sin(delta)*math.cos(lam)*math.sin(2*phi) + math.sin(2*delta)*math.sin(lam)*math.sin(phi)**2)
    Mxy = (math.sin(delta)*math.cos(lam)*math.cos(2*phi) + 0.5*math.sin(2*delta)*math.sin(lam)*math.sin(2*phi))
    Mxz = -(math.cos(delta)*math.cos(lam)*math.cos(phi) + math.cos(2*delta)*math.sin(lam)*math.sin(phi))
    Myy = (math.sin(delta)*math.cos(lam)*math.sin(2*phi) - math.sin(2*delta)*math.sin(lam)*math.cos(phi)**2)
    Myz = -(math.cos(delta)*math.cos(lam)*math.sin(phi) - math.cos(2*delta)*math.sin(lam)*math.cos(phi))
    Mzz = math.sin(2*delta)*math.sin(lam)
    return (Mxx, Mxy, Mxz, Myy, Myz, Mzz)

random.seed(2024)
max_err = 0.0
for _ in range(20000):
    s1 = random.uniform(0, 360)
    d1 = random.uniform(0.05, 89.95)
    r1 = random.uniform(-180, 180)
    s2, d2, r2 = auxiliary_plane(s1, d1, r1)
    assert -180 < r2 <= 180
    M1 = moment_tensor(s1, d1, r1)
    M2 = moment_tensor(s2, d2, r2)
    max_err = max(max_err, max(abs(a - b) for a, b in zip(M1, M2)))

# The finding's own examples: the old (strike+180, dip, -rake) shortcut put
# plane 2 sixty degrees from the true auxiliary plane of a 30-degree thrust, and
# made it identical to plane 1 for a vertical strike-slip fault.
thrust = auxiliary_plane(0, 30, 90)
vertical_ss = auxiliary_plane(0, 90, 0)

print(json.dumps({
    "max_moment_tensor_error": max_err,
    "thrust_plane2": list(thrust),
    "vertical_ss_plane2": list(vertical_ss),
}))
`;
    const { stdout, stderr, status } = runPython(harness);
    expect(stderr).toBe('');
    expect(status).toBe(0);
    const result = JSON.parse(stdout.trim().split('\n').pop()!);

    expect(result.max_moment_tensor_error).toBeLessThan(1e-9);
    // True auxiliary plane of (strike=0, dip=30, rake=90): (180, 60, 90) — NOT
    // the old shortcut's (180, 30, -90).
    expect(result.thrust_plane2[0]).toBeCloseTo(180, 3);
    expect(result.thrust_plane2[1]).toBeCloseTo(60, 3);
    expect(result.thrust_plane2[2]).toBeCloseTo(90, 3);
    // True auxiliary plane of a vertical strike-slip (0, 90, 0) is (270, 90, 180)
    // — genuinely different from plane 1, not the old shortcut's degenerate
    // (180, 90, 0) (identical fault plane).
    expect(result.vertical_ss_plane2[0]).toBeCloseTo(270, 3);
    expect(result.vertical_ss_plane2[2]).toBeCloseTo(180, 3);
  });

  it('runs end-to-end without crashing (seed 42 crashed the previous sort key on 199/200 seeds) and produces clamped, in-range output', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gp5-run-'));
    const source = readFileSync(SCRIPT_PATH, 'utf-8');
    const localCopy = join(dir, 'generate_test_data.py');
    writeFileSync(localCopy, source);

    const result = spawnSync('python3', [localCopy], { cwd: dir, encoding: 'utf-8', timeout: 30000 });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);

    const catalogueFile = join(dir, 'test-data', 'north-island-catalogue.json');
    expect(existsSync(catalogueFile)).toBe(true);
    expect(existsSync(join(dir, 'test-data', 'south-island-catalogue.json'))).toBe(true);
    expect(existsSync(join(dir, 'test-data', 'deep-events-catalogue.json'))).toBe(true);

    const catalogue = JSON.parse(readFileSync(catalogueFile, 'utf-8'));
    const start = new Date(catalogue.time_range.start).getTime();
    const end = new Date(catalogue.time_range.end).getTime();

    // Events untouched by the (unrelated, pre-existing) invalid/anomaly injectors
    // are exactly the clustering+GR-law output this fix changed.
    const clean = catalogue.events.filter((e: any) => e.validation_note === undefined);
    expect(clean.length).toBeGreaterThan(0);
    for (const e of clean) {
      expect(e.magnitude).toBeGreaterThanOrEqual(1.0);
      expect(e.magnitude).toBeLessThanOrEqual(7.5);
      const t = new Date(e.time).getTime();
      expect(t).toBeGreaterThanOrEqual(start);
      expect(t).toBeLessThanOrEqual(end);
      expect(e.latitude).toBeGreaterThanOrEqual(catalogue.geographic_bounds.minLatitude);
      expect(e.latitude).toBeLessThanOrEqual(catalogue.geographic_bounds.maxLatitude);
    }
  });
});
