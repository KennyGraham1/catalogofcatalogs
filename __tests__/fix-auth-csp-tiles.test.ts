/**
 * @jest-environment node
 *
 * #116 / #128: every base layer offered in the map layer control must be loadable
 * under the Content-Security-Policy the middleware sends.
 *
 * Leaflet fetches tiles as <img> elements, so img-src governs them. The policy listed
 * only the OpenStreetMap and Carto hosts, so 'Satellite (Esri)' and 'Terrain
 * (OpenTopoMap)' rendered as a blank grey map with a CSP violation per tile. This test
 * reads the policy from the real middleware and checks every BASE_LAYERS URL, so adding
 * a layer without updating the policy fails here.
 */

jest.mock('next-auth/middleware', () => ({ withAuth: (middleware: unknown) => middleware }));

import { NextRequest } from 'next/server';
import middleware from '@/middleware';
import { BASE_LAYERS } from '@/hooks/use-map-theme';

const env = process.env as Record<string, string | undefined>;
const ORIGINAL_NODE_ENV = env.NODE_ENV;

afterEach(() => {
  env.NODE_ENV = ORIGINAL_NODE_ENV;
});

async function imgSrcFor(nodeEnv: 'production' | 'development', path: string): Promise<string[]> {
  env.NODE_ENV = nodeEnv;
  const req = Object.assign(new NextRequest(`http://localhost${path}`), { nextauth: { token: null } });
  const response = await (middleware as unknown as (r: NextRequest) => Promise<Response>)(req);
  const policy = response.headers.get('content-security-policy') ?? '';
  const directive = policy.split(';').map(part => part.trim()).find(part => part.startsWith('img-src '));
  expect(directive).toBeDefined();
  return directive!.split(/\s+/).slice(1);
}

/** CSP Level 3 host-source matching, for the https host sources this policy uses. */
function allowedBy(sources: string[], url: string): boolean {
  const { protocol, hostname, port } = new URL(url);
  return sources.some(source => {
    if (source.startsWith("'") || source.endsWith(':')) return false; // keywords, scheme-only
    const match = /^(?:(https?):\/\/)?(\*\.)?([^/:]+)(?::(\d+))?/.exec(source);
    if (!match) return false;
    const [, scheme, wildcard, host, sourcePort] = match;
    if (scheme && `${scheme}:` !== protocol) return false;
    if ((sourcePort ?? '') !== port) return false;
    return wildcard ? hostname.endsWith(`.${host}`) : hostname === host;
  });
}

/** A concrete tile URL for each subdomain Leaflet may substitute for {s} ('abc'). */
function tileUrls(template: string): string[] {
  const concrete = template.replace('{z}', '5').replace('{x}', '31').replace('{y}', '19').replace('{r}', '');
  return concrete.includes('{s}') ? ['a', 'b', 'c'].map(s => concrete.replace('{s}', s)) : [concrete];
}

describe.each(['production', 'development'] as const)('img-src in %s', nodeEnv => {
  it.each(BASE_LAYERS.map(layer => [layer.name, layer.url]))('allows base layer %s', async (_name, template) => {
    const sources = await imgSrcFor(nodeEnv, '/catalogues');
    for (const url of tileUrls(template)) {
      expect({ url, allowed: allowedBy(sources, url) }).toEqual({ url, allowed: true });
    }
  });

  it('still blocks tile hosts that no layer uses', async () => {
    const sources = await imgSrcFor(nodeEnv, '/login');
    expect(allowedBy(sources, 'https://a.tile.example.org/5/31/19.png')).toBe(false);
    expect(allowedBy(sources, 'https://opentopomap.org.evil.example/5/31/19.png')).toBe(false);
  });
});
