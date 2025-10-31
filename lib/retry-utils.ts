/**
 * Retry utilities for handling transient failures
 * Implements exponential backoff with jitter
 */

export interface RetryOptions {
  /**
   * Maximum number of retry attempts
   * @default 3
   */
  maxAttempts?: number;

  /**
   * Initial delay in milliseconds before first retry
   * @default 1000
   */
  initialDelay?: number;

  /**
   * Maximum delay in milliseconds between retries
   * @default 30000
   */
  maxDelay?: number;

  /**
   * Multiplier for exponential backoff
   * @default 2
   */
  backoffMultiplier?: number;

  /**
   * Whether to add random jitter to delays
   * @default true
   */
  jitter?: boolean;

  /**
   * Timeout for each attempt in milliseconds
   * @default 30000
   */
  timeout?: number;

  /**
   * Function to determine if error is retryable
   * @default Retries on network errors and 5xx status codes
   */
  shouldRetry?: (error: any, attempt: number) => boolean;

  /**
   * Callback called before each retry
   */
  onRetry?: (error: any, attempt: number, delay: number) => void;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalDuration: number;
}

/**
 * Default retry predicate - retries on network errors and 5xx status codes
 */
function defaultShouldRetry(error: any, attempt: number): boolean {
  // Don't retry if we've exhausted attempts
  if (attempt >= 3) {
    return false;
  }

  // Retry on network errors
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return true;
  }

  // Retry on timeout errors
  if (error.name === 'AbortError' || error.message?.includes('timeout')) {
    return true;
  }

  // Retry on 5xx server errors
  if (error.status >= 500 && error.status < 600) {
    return true;
  }

  // Retry on 429 (Too Many Requests)
  if (error.status === 429) {
    return true;
  }

  // Retry on 503 (Service Unavailable)
  if (error.status === 503) {
    return true;
  }

  // Don't retry on 4xx client errors (except 429)
  if (error.status >= 400 && error.status < 500) {
    return false;
  }

  // Retry on other errors
  return true;
}

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  backoffMultiplier: number,
  jitter: boolean
): number {
  // Calculate exponential backoff
  const exponentialDelay = initialDelay * Math.pow(backoffMultiplier, attempt - 1);
  
  // Cap at max delay
  let delay = Math.min(exponentialDelay, maxDelay);
  
  // Add jitter (random value between 0 and delay)
  if (jitter) {
    delay = Math.random() * delay;
  }
  
  return Math.floor(delay);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * 
 * @example
 * ```typescript
 * const result = await retry(
 *   async () => {
 *     const response = await fetch('https://api.example.com/data');
 *     if (!response.ok) throw new Error(`HTTP ${response.status}`);
 *     return response.json();
 *   },
 *   {
 *     maxAttempts: 3,
 *     initialDelay: 1000,
 *     onRetry: (error, attempt, delay) => {
 *       console.log(`Retry attempt ${attempt} after ${delay}ms: ${error.message}`);
 *     }
 *   }
 * );
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    jitter = true,
    timeout = 30000,
    shouldRetry = defaultShouldRetry,
    onRetry,
  } = options;

  let lastError: any;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Request timeout after ${timeout}ms`));
        }, timeout);
      });

      // Race between function execution and timeout
      const result = await Promise.race([
        fn(),
        timeoutPromise,
      ]);

      return result;
    } catch (error: any) {
      lastError = error;

      // Check if we should retry
      if (attempt < maxAttempts && shouldRetry(error, attempt)) {
        const delay = calculateDelay(
          attempt,
          initialDelay,
          maxDelay,
          backoffMultiplier,
          jitter
        );

        // Call onRetry callback if provided
        if (onRetry) {
          onRetry(error, attempt, delay);
        }

        // Wait before retrying
        await sleep(delay);
      } else {
        // Don't retry, throw the error
        throw error;
      }
    }
  }

  // All attempts failed
  throw lastError;
}

/**
 * Retry a function and return a result object instead of throwing
 * Useful when you want to handle errors without try/catch
 */
export async function retryWithResult<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const startTime = Date.now();
  let attempts = 0;

  try {
    const data = await retry(
      async () => {
        attempts++;
        return fn();
      },
      options
    );

    return {
      success: true,
      data,
      attempts,
      totalDuration: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      attempts,
      totalDuration: Date.now() - startTime,
    };
  }
}

/**
 * Retry a fetch request with exponential backoff
 * Convenience wrapper around retry() for fetch calls
 */
export async function retryFetch(
  url: string,
  init?: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  return retry(
    async () => {
      const response = await fetch(url, init);
      
      // Throw error for non-ok responses so they can be retried
      if (!response.ok) {
        const error: any = new Error(`HTTP ${response.status}: ${response.statusText}`);
        error.status = response.status;
        error.response = response;
        throw error;
      }
      
      return response;
    },
    {
      ...options,
      onRetry: (error, attempt, delay) => {
        console.log(`[RetryFetch] Attempt ${attempt} failed for ${url}: ${error.message}. Retrying in ${delay}ms...`);
        options.onRetry?.(error, attempt, delay);
      },
    }
  );
}

