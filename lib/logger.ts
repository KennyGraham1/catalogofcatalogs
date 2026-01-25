/**
 * Structured Logger Module
 *
 * Provides a production-ready logging solution with:
 * - JSON structured output for log aggregation
 * - Log levels (debug, info, warn, error)
 * - Context and metadata support
 * - Request ID tracking
 * - Performance timing
 *
 * In production, logs are output as JSON for easy parsing by log aggregators
 * like CloudWatch, Datadog, or ELK stack.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  requestId?: string;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  [key: string]: unknown;
}

interface LogMetadata {
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Get log level from environment (default to 'info' in production, 'debug' in development)
const getLogLevel = (): LogLevel => {
  const level = process.env.LOG_LEVEL?.toLowerCase();
  if (level && level in LOG_LEVELS) {
    return level as LogLevel;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
};

const isProduction = process.env.NODE_ENV === 'production';
const currentLogLevel = getLogLevel();

/**
 * Format log entry for output
 */
function formatLogEntry(entry: LogEntry): string {
  if (isProduction) {
    // JSON format for production (easy to parse by log aggregators)
    return JSON.stringify(entry);
  }

  // Human-readable format for development
  const { timestamp, level, message, context, requestId, duration, error, ...meta } = entry;
  const contextStr = context ? `[${context}]` : '';
  const requestIdStr = requestId ? `(${requestId})` : '';
  const durationStr = duration !== undefined ? ` (${duration}ms)` : '';
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  const errorStr = error ? `\n  Error: ${error.message}${error.stack ? `\n  Stack: ${error.stack}` : ''}` : '';

  return `[${timestamp}] [${level.toUpperCase()}] ${contextStr}${requestIdStr} ${message}${durationStr}${metaStr}${errorStr}`;
}

/**
 * Write log entry to appropriate output
 */
function writeLog(level: LogLevel, entry: LogEntry): void {
  const formatted = formatLogEntry(entry);

  switch (level) {
    case 'error':
      console.error(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'debug':
      console.debug(formatted);
      break;
    default:
      console.log(formatted);
  }
}

/**
 * Check if log level should be output
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel];
}

/**
 * Logger class with context support
 */
export class Logger {
  private context: string;
  private requestId?: string;
  private defaultMeta: LogMetadata;

  constructor(context: string, options?: { requestId?: string; meta?: LogMetadata }) {
    this.context = context;
    this.requestId = options?.requestId;
    this.defaultMeta = options?.meta || {};
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: string, meta?: LogMetadata): Logger {
    return new Logger(`${this.context}:${additionalContext}`, {
      requestId: this.requestId,
      meta: { ...this.defaultMeta, ...meta },
    });
  }

  /**
   * Set request ID for request tracing
   */
  setRequestId(requestId: string): void {
    this.requestId = requestId;
  }

  log(level: LogLevel, message: string, meta?: LogMetadata): void {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.context,
      requestId: this.requestId,
      ...this.defaultMeta,
      ...meta,
    };

    writeLog(level, entry);
  }

  debug(message: string, meta?: LogMetadata): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: LogMetadata): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: LogMetadata): void {
    this.log('warn', message, meta);
  }

  error(message: string, error?: Error | unknown, meta?: LogMetadata): void {
    const errorInfo = error instanceof Error
      ? {
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
        }
      : error
        ? { error: { name: 'UnknownError', message: String(error) } }
        : {};

    this.log('error', message, { ...errorInfo, ...meta });
  }

  /**
   * Time an async operation
   */
  async time<T>(operation: string, fn: () => Promise<T>, meta?: LogMetadata): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = Math.round(performance.now() - start);
      this.info(`${operation} completed`, { duration, ...meta });
      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - start);
      this.error(`${operation} failed`, error, { duration, ...meta });
      throw error;
    }
  }

  /**
   * Time a sync operation
   */
  timeSync<T>(operation: string, fn: () => T, meta?: LogMetadata): T {
    const start = performance.now();
    try {
      const result = fn();
      const duration = Math.round(performance.now() - start);
      this.info(`${operation} completed`, { duration, ...meta });
      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - start);
      this.error(`${operation} failed`, error, { duration, ...meta });
      throw error;
    }
  }
}

/**
 * Create a request-scoped logger
 */
export function createRequestLogger(context: string, requestId?: string): Logger {
  return new Logger(context, { requestId });
}

/**
 * Default application logger
 */
export const logger = new Logger('App');

/**
 * Create a logger for a specific module
 */
export function createLogger(context: string): Logger {
  return new Logger(context);
}

/**
 * HTTP request logging middleware helper
 */
export function logRequest(
  logger: Logger,
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  meta?: LogMetadata
): void {
  const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
  logger.log(level, `${method} ${path} ${statusCode}`, { duration, statusCode, ...meta });
}

export default logger;
