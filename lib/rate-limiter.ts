/**
 * Rate Limiter
 * 
 * Implements token bucket rate limiting using LRU cache to prevent:
 * - DDoS attacks
 * - Brute force attacks
 * - API abuse
 * 
 * Uses LRU cache with TTL to automatically expire old entries and prevent memory leaks.
 */

import { LRUCache } from 'lru-cache';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /**
   * Time window in milliseconds
   * @default 60000 (1 minute)
   */
  interval: number;

  /**
   * Maximum number of unique tokens (IPs) to track
   * @default 500
   */
  uniqueTokenPerInterval: number;
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  /**
   * Whether the request is allowed (not rate limited)
   */
  success: boolean;

  /**
   * Maximum number of requests allowed in the interval
   */
  limit: number;

  /**
   * Number of requests remaining in the current interval
   */
  remaining: number;

  /**
   * Timestamp when the rate limit will reset (milliseconds since epoch)
   */
  reset: number;
}

/**
 * Create a rate limiter instance
 * 
 * @example
 * ```typescript
 * const limiter = rateLimit({
 *   interval: 60 * 1000, // 1 minute
 *   uniqueTokenPerInterval: 500,
 * });
 * 
 * const ip = request.headers.get('x-forwarded-for') || 'unknown';
 * const { success, limit, remaining, reset } = limiter.check(10, ip);
 * 
 * if (!success) {
 *   return NextResponse.json(
 *     { error: 'Too many requests' },
 *     { status: 429 }
 *   );
 * }
 * ```
 */
export function rateLimit(config: RateLimitConfig) {
  const interval = config.interval || 60000;
  // Create LRU cache to store [request count, window start] per token (IP address).
  // Entries automatically expire after the configured interval, which starts at the
  // token's first request: that is when its window ends.
  const tokenCache = new LRUCache<string, number[]>({
    max: config.uniqueTokenPerInterval || 500,
    ttl: interval, // Time to live in milliseconds
  });

  return {
    /**
     * Check if a request should be rate limited
     * 
     * @param limit - Maximum number of requests allowed in the interval
     * @param token - Unique identifier (typically IP address)
     * @returns Rate limit check result
     */
    check: (limit: number, token: string): RateLimitResult => {
      // Get [count, window start] for this token, or open a new window now
      let tokenCount = tokenCache.get(token);

      // If this is a new token, add it to the cache
      if (!tokenCount) {
        tokenCount = [0, Date.now()];
        tokenCache.set(token, tokenCount);
      }

      // Increment request count
      tokenCount[0] += 1;

      const currentUsage = tokenCount[0];
      const isRateLimited = currentUsage > limit;

      return {
        success: !isRateLimited,
        limit,
        remaining: Math.max(0, limit - currentUsage),
        // When this window closes, not a full interval from now.
        reset: tokenCount[1] + interval,
      };
    },

    /**
     * Reset rate limit for a specific token
     * Useful for testing or manual intervention
     * 
     * @param token - Unique identifier to reset
     */
    reset: (token: string): void => {
      tokenCache.delete(token);
    },

    /**
     * Get current usage for a token without incrementing
     * 
     * @param token - Unique identifier to check
     * @returns Current request count
     */
    getUsage: (token: string): number => {
      const tokenCount = tokenCache.get(token);
      return tokenCount ? tokenCount[0] : 0;
    },
  };
}

/**
 * Pre-configured rate limiters for common use cases
 */



/**
 * Standard rate limiter for API endpoints
 * 60 requests per minute for general API usage
 */
export const apiRateLimiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 1000,
});

/**
 * Lenient rate limiter for read-only endpoints
 * 120 requests per minute for high-traffic read operations
 */
export const readRateLimiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 1000,
});

/**
 * Strict rate limiter for authentication endpoints (register, login, password reset).
 * 10 requests per 15 minutes per IP to limit brute-force and email-flood attacks.
 */
export const authRateLimiter = rateLimit({
  interval: 15 * 60 * 1000, // 15 minutes
  uniqueTokenPerInterval: 500,
});

const DEFAULT_TRUSTED_PROXY_HOPS = 1;

/**
 * Parse TRUSTED_PROXY_HOPS: a non-negative integer, 1 when unset.
 *
 * Anything else (e.g. "two", "-1", "1.5") is reported as invalid and replaced by the
 * default. The old `Math.max(1, parseInt(...))` turned a typo into NaN, which made
 * every request resolve to one shared key, and silently turned 0 into 1.
 */
export function parseTrustedProxyHops(raw: string | undefined): { hops: number; valid: boolean } {
  const value = raw?.trim() ?? '';
  if (value === '') return { hops: DEFAULT_TRUSTED_PROXY_HOPS, valid: true };
  if (!/^\d+$/.test(value)) return { hops: DEFAULT_TRUSTED_PROXY_HOPS, valid: false };
  return { hops: Number(value), valid: true };
}

// Each distinct problem is logged once per process, not once per request.
const reportedHopsProblems = new Set<string>();
function reportHopsProblemOnce(key: string, log: () => void) {
  if (reportedHopsProblems.has(key)) return;
  reportedHopsProblems.add(key);
  log();
}

function trustedProxyHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS;
  const { hops, valid } = parseTrustedProxyHops(raw);
  if (!valid) {
    reportHopsProblemOnce(`invalid:${raw}`, () => console.error(
      `[RateLimiter] TRUSTED_PROXY_HOPS="${raw}" is not a non-negative integer; using ` +
      `${DEFAULT_TRUSTED_PROXY_HOPS}. Set it to the number of trusted reverse proxies in ` +
      'front of the app (see .env.example).'
    ));
  } else if (hops === 0) {
    reportHopsProblemOnce('zero', () => console.warn(
      '[RateLimiter] TRUSTED_PROXY_HOPS=0: no trusted proxy. Route handlers cannot see the ' +
      'TCP peer, so client keys come from the X-Forwarded-For value Next.js fills in when a ' +
      'request has none - and a client that sends its own header can forge its key. Put the ' +
      'app behind the reverse proxy in nginx/nginx.conf for per-client limits that hold.'
    ));
  }
  return hops;
}

/**
 * The client address as reported by our trusted proxies, or null when the request
 * carries none.
 *
 * x-forwarded-for is a comma-separated list of IPs appended left-to-right by
 * each proxy. A client can prepend arbitrary values to the leftmost position,
 * so taking [0] is spoofable. The rightmost IP is appended by the nearest
 * trusted proxy and cannot be forged by the client - provided the client cannot
 * bypass that proxy (Next.js only fills the header in when it is absent).
 *
 * Set TRUSTED_PROXY_HOPS=N (default 1) to the number of trusted proxies that
 * append to the header. For Vercel / the nginx config in nginx/ (which overwrites
 * the header with the peer address), the default of 1 is correct. 0 declares that
 * there is no proxy; the rightmost entry is then all a route handler can see.
 */
export function resolveClientIp(request: Pick<Request, 'headers'>): string | null {
  const trustedHops = Math.max(1, trustedProxyHops());

  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const ips = forwardedFor.split(',').map(ip => ip.trim()).filter(Boolean);
    if (ips.length > 0 && ips.length < trustedHops) {
      // Fewer entries than trusted proxies: either the setting is too large for the
      // proxy chain or the request skipped a proxy. Index 0 is then the address the
      // first proxy saw (a client that skips a proxy can forge any position anyway).
      reportHopsProblemOnce('short-chain', () => console.warn(
        `[RateLimiter] X-Forwarded-For has fewer entries than TRUSTED_PROXY_HOPS=${trustedHops}; ` +
        'check that the setting matches the proxy chain and that the app is not reachable directly.'
      ));
    }
    // The client-supplied IP is at index 0; the first proxy adds at index 1, etc.
    // We trust the entry added by our own proxy: ips[ips.length - trustedHops].
    const idx = Math.max(0, ips.length - trustedHops);
    if (ips[idx]) return ips[idx];
  }

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  return null;
}

/**
 * Extract the real client IP from request headers (see resolveClientIp), or
 * 'unknown' when the request carries no client address.
 */
export function getClientIp(request: Request): string {
  return resolveClientIp(request) ?? 'unknown';
}

/** Node-style header records (as NextAuth hands to `authorize`) as a Headers object. */
export function toHeaders(raw: Headers | Record<string, string | string[] | undefined> = {}): Headers {
  if (raw instanceof Headers) return raw;
  const headers = new Headers();
  for (const [name, value] of Object.entries(raw)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(',') : value);
  }
  return headers;
}

/**
 * Apply rate limiting to a request and return appropriate response headers
 *
 * @param request - Next.js request object
 * @param limiter - Rate limiter instance
 * @param limit - Maximum requests allowed
 * @returns Rate limit result with headers
 *
 * @example
 * ```typescript
 * import { NextResponse } from 'next/server';
 * import { applyRateLimit, apiRateLimiter } from '@/lib/rate-limiter';
 *
 * export async function POST(request: Request) {
 *   const rateLimitResult = applyRateLimit(request, apiRateLimiter, 60);
 *
 *   if (!rateLimitResult.success) {
 *     return NextResponse.json(
 *       { error: 'Too many requests. Please try again later.' },
 *       {
 *         status: 429,
 *         headers: rateLimitResult.headers,
 *       }
 *     );
 *   }
 *
 *   // Process request...
 * }
 * ```
 */
export function applyRateLimit(
  request: Request,
  limiter: ReturnType<typeof rateLimit>,
  limit: number
): RateLimitResult & { headers: Record<string, string> } {
  const ip = getClientIp(request);
  const result = limiter.check(limit, ip);

  // Create standard rate limit headers
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': new Date(result.reset).toISOString(),
  };

  // Add Retry-After header if rate limited
  if (!result.success) {
    const retryAfterSeconds = Math.ceil((result.reset - Date.now()) / 1000);
    headers['Retry-After'] = retryAfterSeconds.toString();
  }

  return {
    ...result,
    headers,
  };
}

