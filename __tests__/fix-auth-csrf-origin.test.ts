/**
 * @jest-environment node
 *
 * #112: no API route checked where a state-changing request came from. The session
 * cookie's SameSite=Lax keeps it off cross-site POSTs, but not off same-site ones
 * (e.g. a page on a sibling subdomain), and route handlers parse text/plain bodies as
 * JSON, so a plain HTML form could start a GeoNet import with an editor's cookie.
 *
 * The middleware now refuses POST/PUT/PATCH/DELETE to /api when the browser-supplied
 * Origin names another host. Requests with no Origin (curl, scripts: no ambient cookie
 * authority) and NextAuth's own routes (which check their own CSRF token) pass.
 */

jest.mock('next-auth/middleware', () => ({ withAuth: (middleware: unknown) => middleware }));

import { NextRequest } from 'next/server';
import middleware from '@/middleware';

const run = middleware as unknown as (req: NextRequest) => Promise<Response>;
const ORIGINAL_NEXTAUTH_URL = process.env.NEXTAUTH_URL;

afterEach(() => {
  if (ORIGINAL_NEXTAUTH_URL === undefined) delete process.env.NEXTAUTH_URL;
  else process.env.NEXTAUTH_URL = ORIGINAL_NEXTAUTH_URL;
});

function apiRequest(method: string, path: string, headers: Record<string, string> = {}, host = 'quakes.example.org') {
  const req = new NextRequest(`https://${host}${path}`, {
    method,
    headers: { host, 'content-type': 'text/plain', ...headers },
    body: method === 'GET' ? undefined : '{"hours":1,"catalogueId":"victim","pad":"="}',
  });
  return Object.assign(req, { nextauth: { token: null } });
}

describe('#112 cross-origin writes to the API are refused', () => {
  it.each([
    ['another site', 'https://evil.example'],
    ['a sibling subdomain (same site, other origin)', 'https://evil.quakes.example.org'],
    ['an opaque origin', 'null'],
  ])('refuses a POST from %s', async (_label, origin) => {
    const response = await run(apiRequest('POST', '/api/import/geonet', { origin }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: expect.stringMatching(/cross-origin/i) });
  });

  it.each(['PUT', 'PATCH', 'DELETE'])('refuses a cross-origin %s', async method => {
    const response = await run(apiRequest(method, '/api/catalogues/c1', { origin: 'https://evil.example' }));

    expect(response.status).toBe(403);
  });
});

describe('#112 legitimate requests are unaffected', () => {
  it('allows a same-origin POST', async () => {
    const response = await run(apiRequest('POST', '/api/import/geonet', { origin: 'https://quakes.example.org' }));

    expect(response.status).toBe(200);
  });

  it('allows a POST without an Origin header (non-browser clients)', async () => {
    const response = await run(apiRequest('POST', '/api/import/geonet'));

    expect(response.status).toBe(200);
  });

  it('allows cross-origin reads', async () => {
    const response = await run(apiRequest('GET', '/api/catalogues', { origin: 'https://evil.example' }));

    expect(response.status).toBe(200);
  });

  it('accepts the public host a reverse proxy reports in X-Forwarded-Host', async () => {
    const req = apiRequest('POST', '/api/import/geonet', {
      origin: 'https://quakes.example.org',
      'x-forwarded-host': 'quakes.example.org',
    }, 'app:3000');

    expect((await run(req)).status).toBe(200);
  });

  it('matches a Host header that spells out the default port', async () => {
    const req = apiRequest('POST', '/api/import/geonet', { origin: 'https://quakes.example.org' }, 'quakes.example.org:443');

    expect((await run(req)).status).toBe(200);
  });

  it('still refuses another port on the same host when Host names one', async () => {
    const req = apiRequest('POST', '/api/import/geonet', { origin: 'https://quakes.example.org:8443' }, 'quakes.example.org:443');

    expect((await run(req)).status).toBe(403);
  });

  it('accepts the NEXTAUTH_URL origin when the proxy rewrites Host', async () => {
    process.env.NEXTAUTH_URL = 'https://quakes.example.org';
    const req = apiRequest('POST', '/api/import/geonet', { origin: 'https://quakes.example.org' }, 'app:3000');

    expect((await run(req)).status).toBe(200);
  });

  it("leaves NextAuth's own routes to NextAuth's CSRF token", async () => {
    const response = await run(apiRequest('POST', '/api/auth/callback/credentials', { origin: 'https://evil.example' }));

    expect(response.status).not.toBe(403);
  });
});
