/**
 * Rate Limiter
 * 
 * Implements token bucket rate limiting using LRU cache to prevent:
 * - DDoS attacks
 * - Brute force attacks on authentication endpoints
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
  // Create LRU cache to store request counts per token (IP address)
  // Entries automatically expire after the configured interval
  const tokenCache = new LRUCache<string, number[]>({
    max: config.uniqueTokenPerInterval || 500,
    ttl: config.interval || 60000, // Time to live in milliseconds
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
      // Get current request count for this token, or initialize to [0]
      const tokenCount = tokenCache.get(token) || [0];

      // If this is a new token, add it to the cache
      if (tokenCount[0] === 0) {
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
        reset: Date.now() + config.interval,
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
 * Extract IP address from request headers
 * Checks multiple headers in order of preference:
 * 1. x-forwarded-for (proxy/load balancer)
 * 2. x-real-ip (nginx)
 * 3. fallback to 'unknown'
 *
 * @param request - Next.js request object
 * @returns IP address or 'unknown'
 */
export function getClientIp(request: Request): string {
  // Check x-forwarded-for header (may contain multiple IPs, take the first)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  // Check x-real-ip header
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback to unknown (should rarely happen in production)
  return 'unknown';
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
 * import { applyRateLimit, authRateLimiter } from '@/lib/rate-limiter';
 *
 * export async function POST(request: Request) {
 *   const rateLimitResult = applyRateLimit(request, authRateLimiter, 5);
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

