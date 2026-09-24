/** @jest-environment node */
jest.mock('next-auth/middleware', () => ({ withAuth: (middleware: unknown) => middleware }));
import { NextRequest } from 'next/server';
import middleware from '@/middleware';
it('forwards the same nonce policy to the renderer and browser', async () => {
  const req = Object.assign(new NextRequest('http://localhost/login'), { nextauth: { token: null } });
  const response = await (middleware as any)(req);
  expect(response.headers.get('content-security-policy')).toContain("'nonce-");
  expect(response.headers.get('x-middleware-request-x-nonce')).toBeTruthy();
  expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(response.headers.get('content-security-policy'));
  expect(response.headers.get('content-security-policy')).toContain(`'nonce-${response.headers.get('x-middleware-request-x-nonce')}'`);
});
