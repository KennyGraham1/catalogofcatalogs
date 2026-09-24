/** Exercise real dependencies, without a database or Jest module mocks. */
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

async function main() {
  process.env.NEXTAUTH_SECRET ??= 'runtime-smoke-test-secret-no-production-use';
  assert.equal(typeof require('next-auth').default, 'function');
  const { default: middleware } = await import('../middleware');
  for (const authorization of ['Bearer %', 'Bearer %E0%A4%A', 'Bearer invalid-token']) {
    const request = new NextRequest('http://localhost/catalogues', { headers: { authorization } });
    const response = await (middleware as Function)(request, {});
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-security-policy'));
  }
  const login = await (middleware as Function)(new NextRequest('http://localhost/login'), {});
  assert.equal(login.status, 200);
  assert.ok(login.headers.get('content-security-policy'));
  assert.equal(login.headers.get('content-security-policy'), login.headers.get('x-middleware-request-content-security-policy'));
  const protectedRequest = new NextRequest('http://localhost/admin', { headers: { authorization: 'Bearer %' } });
  const response = await (middleware as Function)(protectedRequest, {});
  assert.equal(response.status, 307);
  assert.match(response.headers.get('location'), /\/login/);
  console.log('Authentication import and malformed-header middleware checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
