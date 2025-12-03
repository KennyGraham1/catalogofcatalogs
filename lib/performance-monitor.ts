/**
 * Performance Monitoring Utilities
 * 
 * Provides tools for tracking and logging performance metrics of operations.
 * Useful for measuring the impact of optimizations and identifying bottlenecks.
 */

export interface PerformanceMetrics {
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  memoryBefore?: NodeJS.MemoryUsage;
  memoryAfter?: NodeJS.MemoryUsage;
  memoryDelta?: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  metadata?: Record<string, any>;
}

export class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetrics> = new Map();
  private enableMemoryTracking: boolean;

  constructor(enableMemoryTracking: boolean = true) {
    this.enableMemoryTracking = enableMemoryTracking;
  }

  /**
   * Start tracking an operation
   */
  start(operation: string, metadata?: Record<string, any>): void {
    const metrics: PerformanceMetrics = {
      operation,
      startTime: Date.now(),
      metadata
    };

    if (this.enableMemoryTracking) {
      metrics.memoryBefore = process.memoryUsage();
    }

    this.metrics.set(operation, metrics);
  }

  /**
   * End tracking an operation and return metrics
   */
  end(operation: string): PerformanceMetrics | null {
    const metrics = this.metrics.get(operation);
    if (!metrics) {
      console.warn(`[PerformanceMonitor] No start time found for operation: ${operation}`);
      return null;
    }

    metrics.endTime = Date.now();
    metrics.duration = metrics.endTime - metrics.startTime;

    if (this.enableMemoryTracking && metrics.memoryBefore) {
      metrics.memoryAfter = process.memoryUsage();
      metrics.memoryDelta = {
        heapUsed: metrics.memoryAfter.heapUsed - metrics.memoryBefore.heapUsed,
        heapTotal: metrics.memoryAfter.heapTotal - metrics.memoryBefore.heapTotal,
        external: metrics.memoryAfter.external - metrics.memoryBefore.external,
        rss: metrics.memoryAfter.rss - metrics.memoryBefore.rss
      };
    }

    this.metrics.delete(operation);
    return metrics;
  }

  /**
   * Measure an async operation
   */
  async measure<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<{ result: T; metrics: PerformanceMetrics }> {
    this.start(operation, metadata);
    try {
      const result = await fn();
      const metrics = this.end(operation)!;
      return { result, metrics };
    } catch (error) {
      this.end(operation);
      throw error;
    }
  }

  /**
   * Measure a synchronous operation
   */
  measureSync<T>(
    operation: string,
    fn: () => T,
    metadata?: Record<string, any>
  ): { result: T; metrics: PerformanceMetrics } {
    this.start(operation, metadata);
    try {
      const result = fn();
      const metrics = this.end(operation)!;
      return { result, metrics };
    } catch (error) {
      this.end(operation);
      throw error;
    }
  }

  /**
   * Log metrics in a human-readable format
   */
  static logMetrics(metrics: PerformanceMetrics): void {
    const duration = metrics.duration || 0;
    const durationStr = duration < 1000
      ? `${duration}ms`
      : `${(duration / 1000).toFixed(2)}s`;

    console.log(`[Performance] ${metrics.operation}: ${durationStr}`);

    if (metrics.memoryDelta) {
      const heapMB = (metrics.memoryDelta.heapUsed / 1024 / 1024).toFixed(2);
      const rssMB = (metrics.memoryDelta.rss / 1024 / 1024).toFixed(2);
      console.log(`  Memory: Heap ${heapMB}MB, RSS ${rssMB}MB`);
    }

    if (metrics.metadata) {
      console.log(`  Metadata:`, metrics.metadata);
    }
  }

  /**
   * Get all active (not yet ended) operations
   */
  getActiveOperations(): string[] {
    return Array.from(this.metrics.keys());
  }

  /**
   * Clear all tracked operations
   */
  clear(): void {
    this.metrics.clear();
  }
}

/**
 * Global performance monitor instance
 */
export const globalPerformanceMonitor = new PerformanceMonitor();

/**
 * Convenience function for measuring async operations
 */
export async function measurePerformance<T>(
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, any>,
  logResults: boolean = true
): Promise<T> {
  const { result, metrics } = await globalPerformanceMonitor.measure(operation, fn, metadata);
  
  if (logResults) {
    PerformanceMonitor.logMetrics(metrics);
  }
  
  return result;
}

