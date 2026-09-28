/** @jest-environment node */
/**
 * GeoNet circuit breaker (findings #105 and #106).
 *
 * #105: the shared GeoNet breaker counted every non-404/204/413 error, so five requests
 * GeoNet rejected as malformed (HTTP 400) opened it and cut every user off from a healthy
 * service for a minute. Only health signals may count: network/timeout/parse failures
 * (no status), 5xx and 429.
 *
 * #106: a failed half-open trial went back to OPEN without clearing the success count,
 * so the next trial closed the breaker after fewer than successThreshold successes.
 */

import { GeoNetClient, isGeoNetHealthFailure } from '@/lib/geonet-client';
import { CircuitBreaker, CircuitBreakerError, CircuitState } from '@/lib/circuit-breaker';

const params = { starttime: '2024-01-01T00:00:00Z', endtime: '2024-01-01T02:00:00Z' };
const header = '#EventID|Time|Latitude|Longitude|Depth/km|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|MagAuthor|EventLocationName|EventType';
const row = '2024p000001|2024-01-01T00:00:00|-41|174|10|GNS|NZ|GNS|2024p000001|ML|3.2|GNS|Wellington|earthquake';

function respond(status: number, body = '') {
  return new Response(status === 204 ? null : body, {
    status,
    statusText: status === 400 ? 'Bad Request' : 'OK',
    headers: { 'content-type': 'text/plain' },
  });
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GeoNet breaker failure classification (#105)', () => {
  it('stays closed after repeated 400s and keeps serving valid requests', async () => {
    const client = new GeoNetClient();
    const fetchMock = jest.fn(async () => respond(400, 'Bad request: starttime is invalid'));
    global.fetch = fetchMock as unknown as typeof fetch;

    for (let i = 0; i < 6; i++) {
      await expect(client.fetchEventsText(params)).rejects.toThrow(/400/);
    }
    expect(client.getCircuitBreakerStats().state).toBe(CircuitState.CLOSED);
    expect(client.getCircuitBreakerStats().failures).toBe(0);

    // A valid request is still sent to GeoNet, not refused by an open breaker.
    fetchMock.mockImplementation(async () => respond(200, `${header}\n${row}`));
    await expect(client.fetchEventsText(params)).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it('counts only signals about GeoNet health', () => {
    // No status: network error, timeout, unparseable body.
    expect(isGeoNetHealthFailure(new TypeError('fetch failed'))).toBe(true);
    expect(isGeoNetHealthFailure(new Error('Request timeout after 30000ms'))).toBe(true);
    expect(isGeoNetHealthFailure(Object.assign(new Error('HTTP 500'), { status: 500 }))).toBe(true);
    expect(isGeoNetHealthFailure(Object.assign(new Error('HTTP 503'), { status: 503 }))).toBe(true);
    expect(isGeoNetHealthFailure(Object.assign(new Error('HTTP 429'), { status: 429 }))).toBe(true);
    // Problems with the request itself.
    for (const status of [400, 401, 403, 404, 405, 413]) {
      expect(isGeoNetHealthFailure(Object.assign(new Error(`HTTP ${status}`), { status }))).toBe(false);
    }
  });

  it('still opens on server errors', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 5, isFailure: isGeoNetHealthFailure });
    const serverError = () => Promise.reject(Object.assign(new Error('HTTP 503'), { status: 503 }));
    for (let i = 0; i < 5; i++) {
      await expect(breaker.execute(serverError)).rejects.toThrow('HTTP 503');
    }
    expect(breaker.getState()).toBe(CircuitState.OPEN);
    await expect(breaker.execute(async () => 'ok')).rejects.toBeInstanceOf(CircuitBreakerError);
  });
});

describe('half-open success counting (#106)', () => {
  it('needs successThreshold successes within one trial to close', async () => {
    let now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const breaker = new CircuitBreaker({ failureThreshold: 1, successThreshold: 2, timeout: 1000 });
    const ok = async () => 'ok';
    const fail = () => Promise.reject(new Error('down'));

    await expect(breaker.execute(fail)).rejects.toThrow('down');
    expect(breaker.getState()).toBe(CircuitState.OPEN);

    // Trial 1: one success, then a failure sends it back to OPEN.
    now += 1001;
    await breaker.execute(ok);
    expect(breaker.getStats()).toMatchObject({ state: CircuitState.HALF_OPEN, successes: 1 });
    await expect(breaker.execute(fail)).rejects.toThrow('down');
    expect(breaker.getStats()).toMatchObject({ state: CircuitState.OPEN, successes: 0 });

    // Trial 2: one success is not enough...
    now += 1001;
    await breaker.execute(ok);
    expect(breaker.getStats()).toMatchObject({ state: CircuitState.HALF_OPEN, successes: 1 });
    // ...the second one closes it.
    await breaker.execute(ok);
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('does not carry a success across a forced open', async () => {
    let now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const breaker = new CircuitBreaker({ failureThreshold: 1, successThreshold: 2, timeout: 1000 });
    await expect(breaker.execute(() => Promise.reject(new Error('down')))).rejects.toThrow();
    now += 1001;
    await breaker.execute(async () => 'ok');
    breaker.forceOpen(1000);
    now += 1001;
    await breaker.execute(async () => 'ok');
    expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
  });
});
