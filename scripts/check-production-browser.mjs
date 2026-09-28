/** Verify an already-running production server with a fresh browser profile. */
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.PRODUCTION_TEST_URL;
assert.ok(baseUrl, 'Set PRODUCTION_TEST_URL to the production test server');
let ready = false;
for (let attempt = 0; attempt < 120; attempt++) {
  try { ready = (await fetch(new URL('/login', baseUrl))).ok; } catch {}
  if (ready) break;
  await delay(500);
}
assert.ok(ready, 'Production test server did not become ready');

/**
 * Select every base layer in the map's layer control and require that its tiles
 * raise no CSP violation. The CSP check happens before any network request, so this
 * holds even where the tile servers themselves are unreachable.
 */
async function checkBaseLayers(page) {
  await page.getByText('Geographic Region Search', { exact: true }).click();
  const control = page.locator('.leaflet-control-layers').first();
  await control.waitFor();
  const labels = control.locator('.leaflet-control-layers-base label');
  const count = await labels.count();
  assert.ok(count >= 5, `expected every base layer in the layer control, found ${count}`);
  for (let i = 0; i < count; i++) {
    await control.hover(); // the control expands on hover
    const label = labels.nth(i);
    const name = (await label.innerText()).trim();
    await label.locator('input').check();
    await page.waitForFunction(() => document.querySelector('img.leaflet-tile') !== null);
    await delay(750); // let the new layer request its first tiles
    assert.deepEqual(await page.evaluate(() => window.cspViolations), [], `base layer "${name}" must be allowed by img-src`);
  }
}
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || undefined });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.cspViolations = [];
    document.addEventListener('securitypolicyviolation', event => {
      window.cspViolations.push({ directive: event.effectiveDirective, uri: event.blockedURI });
    });
  });
  for (const path of ['/login', '/catalogues']) {
    const response = await page.goto(new URL(path, baseUrl).href, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    const csp = response.headers()['content-security-policy'];
    assert.ok(csp?.includes("'strict-dynamic'"), `${path} must serve the production CSP`);
    const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
    assert.ok(nonce);
    const scripts = await page.locator('script').evaluateAll(elements => elements
      .filter(script => !script.src || script.src.includes('/_next/'))
      .map(script => ({ src: script.src, nonce: script.nonce })));
    assert.ok(scripts.length > 3);
    assert.ok(scripts.every(script => script.nonce === nonce), `${path}: bootstrap and theme script nonces must match the CSP`);
    await page.getByRole('button', { name: 'Toggle theme', exact: true }).first().click();
    await page.getByRole('menuitem', { name: 'Dark', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
    assert.deepEqual(await page.evaluate(() => window.cspViolations), []);
    assert.deepEqual(errors, []);
    if (path === '/catalogues') await checkBaseLayers(page);
  }
  console.log('Production CSP, bootstrap/theme nonces, interactive hydration and map base layers passed.');
} finally {
  await browser.close();
}
