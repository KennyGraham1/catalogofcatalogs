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
function defaultShouldRetry(error: any, _attempt: number): boolean {
  // The attempt budget is maxAttempts, enforced by retry() itself. A hard stop at 3
  // here silently capped callers that configured 5.

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
 */
export async function retry<T>(
  fn: (signal?: AbortSignal) => Promise<T>,
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
    // One AbortController per attempt. Promise.race only decides which promise the
    // CALLER observes - it does not cancel the loser - so without an abort a timed-out
    // request keeps running to completion while the next attempt opens a second socket
    // to the same endpoint (up to maxAttempts concurrent duplicates per logical call).
    // `fn` receives the signal and is expected to pass it to whatever it starts.
    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
      // Create timeout promise. The handle is cleared in `finally` so a fast success
      // does not leave a `timeout`-long timer holding the event loop open.
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          controller.abort();
          reject(new Error(`Request timeout after ${timeout}ms`));
        }, timeout);
      });

      // Race between function execution and timeout
      const result = await Promise.race([
        fn(controller.signal),
        timeoutPromise,
      ]);

      return result;
    } catch (error: any) {
      lastError = error;

      // An abort that did not come from this attempt's timeout is the caller
      // cancelling: stop at once, with no further attempts and no backoff.
      const externallyAborted = error?.name === 'AbortError' && !controller.signal.aborted;
      if (externallyAborted) {
        throw error;
      }

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
    } finally {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
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
  fn: (signal?: AbortSignal) => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const startTime = Date.now();
  let attempts = 0;

  try {
    const data = await retry(
      async (signal) => {
        attempts++;
        return fn(signal);
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
 * Combine a caller-supplied AbortSignal with the per-attempt timeout signal so either
 * can cancel the request. Uses AbortSignal.any where the runtime provides it
 * (Node >= 20 / modern browsers) and falls back to a manual relay otherwise.
 */
function combineAbortSignals(
  external?: AbortSignal | null,
  attempt?: AbortSignal
): AbortSignal | undefined {
  if (!external) return attempt;
  if (!attempt) return external;

  const anyOf = (AbortSignal as unknown as {
    any?: (signals: AbortSignal[]) => AbortSignal;
  }).any;
  if (typeof anyOf === 'function') {
    return anyOf.call(AbortSignal, [external, attempt]);
  }

  const controller = new AbortController();
  if (external.aborted || attempt.aborted) {
    controller.abort();
  } else {
    const abort = () => controller.abort();
    external.addEventListener('abort', abort, { once: true });
    attempt.addEventListener('abort', abort, { once: true });
  }
  return controller.signal;
}

/**
 * One fetch attempt: passes the per-attempt abort signal through so a timed-out
 * attempt actually cancels its socket, and turns a non-ok response into a retryable
 * error carrying `status` (which callers such as the GeoNet chunker test for 413).
 */
async function fetchOrThrow(
  url: string,
  init: RequestInit | undefined,
  signal?: AbortSignal
): Promise<Response> {
  // A caller-cancelled request is not retried, whatever the reason the caller
  // aborted with (AbortSignal.timeout() rejects with a TimeoutError, abort(reason)
  // with the reason itself): check the caller's signal directly rather than the
  // error's name, before the attempt and after a failure.
  const externallyAborted = () => {
    const e: any = new Error(`Request aborted by caller${init?.signal?.reason instanceof Error ? `: ${init.signal.reason.message}` : ''}`);
    e.name = 'AbortError';
    return e;
  };
  if (init?.signal?.aborted) throw externallyAborted();
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: combineAbortSignals(init?.signal, signal),
    });
  } catch (error) {
    if (init?.signal?.aborted) throw externallyAborted();
    throw error;
  }

  // Throw error for non-ok responses so they can be retried
  if (!response.ok) {
    const error: any = new Error(`HTTP ${response.status}: ${response.statusText}`);
    error.status = response.status;
    error.response = response;
    throw error;
  }

  return response;
}

/**
 * Retry a fetch request with exponential backoff
 * Convenience wrapper around retry() for fetch calls
 *
 * NOTE: this resolves as soon as the response headers arrive, so a caller that then
 * awaits `response.text()` reads the body OUTSIDE the per-attempt timeout. Use
 * `retryFetchText` when the body is what you want.
 */
export async function retryFetch(
  url: string,
  init?: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  return retry(
    async (signal) => fetchOrThrow(url, init, signal),
    {
      ...options,
      onRetry: (error, attempt, delay) => {
        console.log(`[RetryFetch] Attempt ${attempt} failed for ${url}: ${error.message}. Retrying in ${delay}ms...`);
        options.onRetry?.(error, attempt, delay);
      },
    }
  );
}

export interface RetryFetchTextResult {
  status: number;
  /** Response `content-type` header, or '' when absent. */
  contentType: string;
  text: string;
}

/**
 * Retry a fetch request and read its text body INSIDE the retried attempt, so the
 * per-attempt timeout and its abort cover the body download as well as the header
 * exchange. With `retryFetch` a stalled body download is unbounded: the timeout has
 * already been cleared by the time the caller awaits `response.text()`.
 */
export async function retryFetchText(
  url: string,
  init?: RequestInit,
  options: RetryOptions = {}
): Promise<RetryFetchTextResult> {
  return retry(
    async (signal) => {
      const response = await fetchOrThrow(url, init, signal);
      return {
        status: response.status,
        contentType: response.headers?.get('content-type') || '',
        // A 204 has no body; text() yields '' for it.
        text: await response.text(),
      };
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

