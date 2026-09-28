/**
 * @jest-environment node
 *
 * gp#6: scripts/import_test_catalogues_api.sh could never import anything:
 *  - it POSTed each event to /api/catalogues/<id>/events, which has never had a
 *    POST handler (app/api/catalogues/[id]/events/route.ts exports only GET);
 *  - under `set -e`, `((count++))` starting from 0 returns exit status 1 (a
 *    bash arithmetic-command evaluating to 0 is "false"), silently aborting the
 *    script after the first event on bash >= 4.1;
 *  - it read test-data/new-zealand-, california- and japan-catalogue.json, while
 *    scripts/generate_test_data.py has always written test-data/north-island-,
 *    south-island- and deep-events-catalogue.json.
 *
 * The fix creates each catalogue with its events in ONE authenticated POST to
 * /api/catalogues (which accepts `events` inline — there is no per-event
 * endpoint), checks HTTP status codes throughout, and reads the right filenames.
 *
 * These tests run the REAL script (bash) against a fake `curl` on PATH that
 * never touches the network — only the HTTP boundary is stubbed, exactly as the
 * fix-scripts rules require. Real `jq` and `bash` are used as-is.
 */

import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT_PATH = join(__dirname, '..', 'scripts', 'import_test_catalogues_api.sh');

// A fake `curl` that answers the 5 calls the script makes (health check, CSRF,
// login, session, create-catalogue) based on env vars, and never opens a socket.
const FAKE_CURL = `#!/bin/bash
url=""
method="GET"
out=""
write_fmt=""
is_post=0
args=("$@")
i=0
while [ $i -lt \${#args[@]} ]; do
  a="\${args[$i]}"
  case "$a" in
    -X) i=$((i+1)); method="\${args[$i]}"; [ "$method" = "POST" ] && is_post=1 ;;
    -o) i=$((i+1)); out="\${args[$i]}" ;;
    -w) i=$((i+1)); write_fmt="\${args[$i]}" ;;
    http*) url="$a" ;;
  esac
  i=$((i+1))
done
body=""
code="200"
case "$url" in
  */api/catalogues)
    if [ "$is_post" = "1" ]; then
      if [ "\${CREATE_OK:-1}" = "1" ]; then
        code="201"
        body='{"id":"cat_fake123","name":"x","validationReport":{"successfullyImported":1,"totalSubmitted":1}}'
      else
        code="400"
        body='{"error":"boom","code":"INVALID_EVENTS"}'
      fi
    else
      code="\${HEALTH_CODE:-200}"
      body='{"data":[]}'
    fi
    ;;
  */api/auth/csrf) body='{"csrfToken":"fake-csrf-token"}'; code="200" ;;
  */api/auth/callback/credentials*) code="\${LOGIN_STATUS:-200}"; body='' ;;
  */api/auth/session)
    if [ "\${SESSION_OK:-1}" = "1" ]; then
      body='{"user":{"email":"editor@example.com","role":"editor"}}'
    else
      body='{}'
    fi
    code="200"
    ;;
  *) code="404"; body='{"error":"unhandled"}' ;;
esac
if [ -n "$out" ]; then printf '%s' "$body" > "$out"; else printf '%s' "$body"; fi
if [ -n "$write_fmt" ]; then printf '%s' "$code"; fi
exit 0
`;

function makeRunDir(withCatalogueFiles: boolean): { dir: string; binDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'gp6-run-'));
  const binDir = join(dir, 'bin');
  mkdirSync(binDir);
  const curlPath = join(binDir, 'curl');
  // Substitute the literal role placeholder the shell would otherwise not expand
  // inside single quotes (this file's FAKE_CURL is written verbatim below).
  writeFileSync(curlPath, FAKE_CURL);
  chmodSync(curlPath, 0o755);

  if (withCatalogueFiles) {
    const dataDir = join(dir, 'test-data');
    mkdirSync(dataDir);
    for (const name of ['north-island', 'south-island', 'deep-events']) {
      writeFileSync(
        join(dataDir, `${name}-catalogue.json`),
        JSON.stringify({
          catalogue_name: `${name} cat`,
          region: 'NZ',
          description: 'd',
          events: [{ publicID: 'p1', time: '2024-01-01T00:00:00.000Z', latitude: -41.0, longitude: 174.0, depth: 10.0, magnitude: 3.0 }],
        }),
      );
    }
  } else {
    mkdirSync(join(dir, 'test-data'));
  }
  return { dir, binDir };
}

function runScript(dir: string, binDir: string, env: Record<string, string> = {}) {
  return spawnSync('bash', [SCRIPT_PATH], {
    cwd: dir,
    encoding: 'utf-8',
    timeout: 20000,
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      CATALOGUE_API_EMAIL: 'editor@example.com',
      CATALOGUE_API_PASSWORD: 'pw',
      ...env,
    },
  });
}

describe("gp#6 import_test_catalogues_api.sh (real script, fake curl, no network)", () => {
  it('imports all 3 catalogues end-to-end and exits 0 (the old script could never even reach the first event)', () => {
    const { dir, binDir } = makeRunDir(true);
    const result = runScript(dir, binDir);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('✓ Signed in as editor@example.com');
    expect(result.stdout).toContain('Importing: north-island-catalogue.json');
    expect(result.stdout).toContain('Importing: south-island-catalogue.json');
    expect(result.stdout).toContain('Importing: deep-events-catalogue.json');
    expect(result.stdout).toContain('✓ Created catalogue with ID: cat_fake123');
    expect(result.stdout).toContain('All catalogues imported successfully');
    // Never silently stops after the first item (the old ((count++)) defect).
    expect((result.stdout.match(/Created catalogue with ID/g) || []).length).toBe(3);
  });

  it('fails LOUDLY (nonzero exit, clear message) when the catalogue files are missing, instead of the old silent set -e abort', () => {
    const { dir, binDir } = makeRunDir(false); // no test-data files at all
    const result = runScript(dir, binDir);

    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('File not found');
    expect(result.stdout + result.stderr).toContain('north-island-catalogue.json');
  });

  it('reads the filenames scripts/generate_test_data.py actually writes, not the old new-zealand/california/japan names', () => {
    const { dir, binDir } = makeRunDir(true);
    const result = runScript(dir, binDir);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toMatch(/new-zealand-catalogue|california-catalogue|japan-catalogue/);
  });

  it('fails loudly when sign-in never produces a session (bad credentials), and never proceeds to import', () => {
    const { dir, binDir } = makeRunDir(true);
    const result = runScript(dir, binDir, { SESSION_OK: '0' });

    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('sign-in did not produce a session');
    expect(result.stdout).not.toContain('Importing:');
  });

  it('fails loudly and reports the HTTP status when catalogue creation is rejected, for every file (no silent per-event abort)', () => {
    const { dir, binDir } = makeRunDir(true);
    const result = runScript(dir, binDir, { CREATE_OK: '0' });

    expect(result.status).not.toBe(0);
    const combined = result.stdout + result.stderr;
    const failures = (combined.match(/Failed to create catalogue \(HTTP 400\)/g) || []).length;
    expect(failures).toBe(3); // all 3 files attempted and reported, not just the first
    expect(combined).toContain('FAILURE');
  });

  it('the server-down health check fails loudly instead of proceeding to sign in', () => {
    const { dir, binDir } = makeRunDir(true);
    const result = runScript(dir, binDir, { HEALTH_CODE: '500' });

    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('not reachable');
    expect(result.stdout).not.toContain('Signing in');
  });
});
