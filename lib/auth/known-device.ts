/**
 * Known-device cookies for the sign-in throttle (lib/auth/login-rate-limit.ts).
 *
 * After a successful sign-in, or a completed password reset, the browser receives a
 * cookie saying "this browser has signed in to account X". It is signed with
 * NEXTAUTH_SECRET (HMAC-SHA256), httpOnly and long-lived. A browser that presents one
 * is limited on its own and is exempt from the account-wide limit that anyone can
 * raise by failing sign-ins, so failures from elsewhere cannot lock the owner out of
 * the browsers they use (the "device cookie" approach in the OWASP Authentication
 * Cheat Sheet). The cookie is not a credential: the password is still checked.
 *
 * One cookie holds entries for up to five accounts: `tag.device.expires.mac`, joined
 * by "~". `tag` is a hash of the account's normalised email, `device` a random id.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { normalizeEmail } from './normalize';

const COOKIE_NAME = 'known-device';
const MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
const MAX_ENTRIES = 5;

export interface KnownDeviceCookie {
  name: string;
  value: string;
  options: { httpOnly: true; secure: boolean; sameSite: 'lax'; path: '/'; maxAge: number };
}

interface Entry { tag: string; device: string; expires: number; mac: string }

function signingKey(): string | undefined {
  return process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
}

// Same rule as NextAuth's own cookies: Secure (and the __Host- prefix) behind https.
function secure(): boolean {
  return (process.env.NEXTAUTH_URL ?? '').startsWith('https://');
}

export function knownDeviceCookieName(): string {
  return secure() ? `__Host-${COOKIE_NAME}` : COOKIE_NAME;
}

function accountTag(email: string): string {
  return createHash('sha256').update(`known-device-account:${normalizeEmail(email)}`).digest('base64url').slice(0, 22);
}

function sign(key: string, tag: string, device: string, expires: number): string {
  return createHmac('sha256', key).update(`known-device|v1|${tag}|${device}|${expires}`).digest('base64url');
}

function readCookie(cookieHeader: string | null | undefined, name: string): string | undefined {
  for (const part of (cookieHeader ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

function entries(cookieHeader: string | null | undefined): Entry[] {
  const value = readCookie(cookieHeader, knownDeviceCookieName());
  if (!value) return [];
  return value.split('~').slice(0, MAX_ENTRIES).flatMap(part => {
    const [tag, device, expires, mac] = part.split('.');
    return tag && device && mac && /^\d+$/.test(expires ?? '') ? [{ tag, device, expires: Number(expires), mac }] : [];
  });
}

function isValid(entry: Entry, key: string, now: number): boolean {
  if (entry.expires * 1000 <= now) return false;
  const expected = Buffer.from(sign(key, entry.tag, entry.device, entry.expires));
  const actual = Buffer.from(entry.mac);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * The device id of a valid known-device entry for this account in the request's Cookie
 * header, or null (also when no signing secret is configured).
 */
export function knownDeviceId(cookieHeader: string | null | undefined, email: string, now = Date.now()): string | null {
  const key = signingKey();
  if (!key) return null;
  const tag = accountTag(email);
  return entries(cookieHeader).find(entry => entry.tag === tag && isValid(entry, key, now))?.device ?? null;
}

/**
 * The cookie to send after a successful sign-in or password reset for this account:
 * a fresh entry for it, plus the browser's other still-valid entries. Null when no
 * signing secret is configured or there is no address to bind it to.
 */
export function knownDeviceCookie(
  cookieHeader: string | null | undefined,
  email: string | null | undefined,
  now = Date.now()
): KnownDeviceCookie | null {
  const key = signingKey();
  if (!key || !email) return null;
  const tag = accountTag(email);
  const expires = Math.floor(now / 1000) + MAX_AGE_SECONDS;
  const device = randomBytes(12).toString('base64url');
  const fresh = { tag, device, expires, mac: sign(key, tag, device, expires) };
  const others = entries(cookieHeader).filter(entry => entry.tag !== tag && isValid(entry, key, now));
  return {
    name: knownDeviceCookieName(),
    value: [fresh, ...others].slice(0, MAX_ENTRIES).map(e => `${e.tag}.${e.device}.${e.expires}.${e.mac}`).join('~'),
    options: { httpOnly: true, secure: secure(), sameSite: 'lax', path: '/', maxAge: MAX_AGE_SECONDS },
  };
}

/**
 * Set the known-device cookie on the response of the current route handler (NextAuth's
 * sign-in callback). Outside a request - tests, scripts - there is no response to set
 * it on, and nothing happens.
 */
export async function rememberKnownDevice(cookieHeader: string | null | undefined, email: string): Promise<void> {
  const cookie = knownDeviceCookie(cookieHeader, email);
  if (!cookie) return;
  try {
    const { cookies } = await import('next/headers');
    (await cookies()).set(cookie.name, cookie.value, cookie.options);
  } catch {
    // Not inside a Next.js request.
  }
}
