/**
 * Circuit Breaker Pattern Implementation
 * 
 * Prevents cascading failures by stopping requests to a failing service
 * and allowing it time to recover.
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is failing, requests fail immediately
 * - HALF_OPEN: Testing if service has recovered
 */

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  /**
   * Number of failures before opening the circuit
   * @default 5
   */
  failureThreshold?: number;

  /**
   * Number of successful requests in HALF_OPEN state before closing circuit
   * @default 2
   */
  successThreshold?: number;

  /**
   * Time in milliseconds to wait before transitioning from OPEN to HALF_OPEN
   * @default 60000 (1 minute)
   */
  timeout?: number;

  /**
   * Time window in milliseconds for counting failures
   * @default 60000 (1 minute)
   */
  windowSize?: number;

  /**
   * Function to determine if error should count as failure
   * @default All errors count as failures
   */
  isFailure?: (error: any) => boolean;

  /**
   * Callback when circuit state changes
   */
  onStateChange?: (oldState: CircuitState, newState: CircuitState) => void;

  /**
   * Callback when circuit opens
   */
  onOpen?: () => void;

  /**
   * Callback when circuit closes
   */
  onClose?: () => void;

  /**
   * Name for logging purposes
   */
  name?: string;
}

interface FailureRecord {
  timestamp: number;
  error: any;
}

export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: FailureRecord[] = [];
  private successes: number = 0;
  private nextAttemptTime: number = 0;
  private options: Required<CircuitBreakerOptions>;

  constructor(options: CircuitBreakerOptions = {}) {
    this.options = {
      failureThreshold: options.failureThreshold ?? 5,
      successThreshold: options.successThreshold ?? 2,
      timeout: options.timeout ?? 60000,
      windowSize: options.windowSize ?? 60000,
      isFailure: options.isFailure ?? (() => true),
      onStateChange: options.onStateChange ?? (() => {}),
      onOpen: options.onOpen ?? (() => {}),
      onClose: options.onClose ?? (() => {}),
      name: options.name ?? 'CircuitBreaker',
    };
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      state: this.state,
      failures: this.failures.length,
      successes: this.successes,
      nextAttemptTime: this.nextAttemptTime,
      failureThreshold: this.options.failureThreshold,
      successThreshold: this.options.successThreshold,
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new CircuitBreakerError(
          `Circuit breaker is OPEN for ${this.options.name}. Next attempt at ${new Date(this.nextAttemptTime).toISOString()}`
        );
      }
      
      // Transition to HALF_OPEN to test the service
      this.transitionTo(CircuitState.HALF_OPEN);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Handle successful request
   */
  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      
      if (this.successes >= this.options.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
        this.reset();
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Remove old failures outside the window
      this.cleanupOldFailures();
    }
  }

  /**
   * Handle failed request
   */
  private onFailure(error: any): void {
    // Check if this error should count as a failure
    if (!this.options.isFailure(error)) {
      return;
    }

    // Record the failure
    this.failures.push({
      timestamp: Date.now(),
      error,
    });

    // Clean up old failures
    this.cleanupOldFailures();

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed during recovery test, go back to OPEN
      this.transitionTo(CircuitState.OPEN);
      this.nextAttemptTime = Date.now() + this.options.timeout;
    } else if (this.state === CircuitState.CLOSED) {
      // Check if we've exceeded the failure threshold
      if (this.failures.length >= this.options.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
        this.nextAttemptTime = Date.now() + this.options.timeout;
      }
    }
  }

  /**
   * Remove failures outside the time window
   */
  private cleanupOldFailures(): void {
    const cutoff = Date.now() - this.options.windowSize;
    this.failures = this.failures.filter(f => f.timestamp > cutoff);
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    
    if (oldState === newState) {
      return;
    }

    console.log(`[${this.options.name}] Circuit breaker: ${oldState} -> ${newState}`);
    
    this.state = newState;
    this.options.onStateChange(oldState, newState);

    if (newState === CircuitState.OPEN) {
      this.options.onOpen();
    } else if (newState === CircuitState.CLOSED) {
      this.options.onClose();
    }
  }

  /**
   * Reset the circuit breaker
   */
  private reset(): void {
    this.failures = [];
    this.successes = 0;
    this.nextAttemptTime = 0;
  }

  /**
   * Manually reset the circuit breaker (for testing or admin purposes)
   */
  public forceReset(): void {
    console.log(`[${this.options.name}] Circuit breaker manually reset`);
    this.reset();
    this.transitionTo(CircuitState.CLOSED);
  }

  /**
   * Manually open the circuit breaker (for maintenance)
   */
  public forceOpen(duration?: number): void {
    console.log(`[${this.options.name}] Circuit breaker manually opened`);
    this.transitionTo(CircuitState.OPEN);
    this.nextAttemptTime = Date.now() + (duration ?? this.options.timeout);
  }
}

/**
 * Create a circuit breaker wrapper for a function
 * 
 * @example
 * ```typescript
 * const fetchWithCircuitBreaker = withCircuitBreaker(
 *   async (url: string) => {
 *     const response = await fetch(url);
 *     if (!response.ok) throw new Error(`HTTP ${response.status}`);
 *     return response.json();
 *   },
 *   {
 *     name: 'ExternalAPI',
 *     failureThreshold: 5,
 *     timeout: 60000,
 *   }
 * );
 * 
 * // Use it
 * const data = await fetchWithCircuitBreaker('https://api.example.com/data');
 * ```
 */
export function withCircuitBreaker<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: CircuitBreakerOptions = {}
): (...args: TArgs) => Promise<TResult> {
  const breaker = new CircuitBreaker(options);

  return async (...args: TArgs): Promise<TResult> => {
    return breaker.execute(() => fn(...args));
  };
}

