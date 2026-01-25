/**
 * Custom error classes and error handling utilities
 */

/**
 * Error details for structured error reporting
 */
export interface ErrorDetails {
  field?: string;
  value?: unknown;
  expected?: string;
  received?: string;
  line?: number;
  column?: number;
  lastError?: string;
  [key: string]: unknown;
}

/**
 * Metadata for structured logging
 */
export interface LogMetadata {
  [key: string]: unknown;
}

/**
 * Route context for API handlers
 */
export interface RouteContext {
  params?: Record<string, string>;
  [key: string]: unknown;
}

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: ErrorDetails
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, 500, 'DATABASE_ERROR', details);
    this.name = 'DatabaseError';
  }
}

export class ParseError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, 400, 'PARSE_ERROR', details);
    this.name = 'ParseError';
  }
}

export class FileUploadError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, 400, 'FILE_UPLOAD_ERROR', details);
    this.name = 'FileUploadError';
  }
}

/**
 * Logger utility for structured logging
 */
export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  private formatMessage(level: string, message: string, meta?: LogMetadata): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level}] [${this.context}] ${message}${metaStr}`;
  }

  info(message: string, meta?: LogMetadata): void {
    console.log(this.formatMessage('INFO', message, meta));
  }

  warn(message: string, meta?: LogMetadata): void {
    console.warn(this.formatMessage('WARN', message, meta));
  }

  error(message: string, error?: Error | unknown, meta?: LogMetadata): void {
    const errorMeta: LogMetadata = error instanceof Error
      ? { message: error.message, stack: error.stack, ...meta }
      : { error, ...meta };
    console.error(this.formatMessage('ERROR', message, errorMeta));
  }

  debug(message: string, meta?: LogMetadata): void {
    if (process.env.NODE_ENV === 'development') {
      console.debug(this.formatMessage('DEBUG', message, meta));
    }
  }
}

/**
 * Error response formatter for API routes
 */
export function formatErrorResponse(error: unknown): {
  error: string;
  code?: string;
  details?: ErrorDetails;
  statusCode: number;
} {
  if (error instanceof AppError) {
    return {
      error: error.message,
      code: error.code,
      details: error.details,
      statusCode: error.statusCode
    };
  }

  if (error instanceof Error) {
    return {
      error: error.message,
      statusCode: 500
    };
  }

  return {
    error: 'An unexpected error occurred',
    statusCode: 500
  };
}

/**
 * Async error handler wrapper for API routes
 */
export function asyncHandler(
  handler: (request: Request, context?: RouteContext) => Promise<Response>
): (request: Request, context?: RouteContext) => Promise<Response> {
  return async (request: Request, context?: RouteContext): Promise<Response> => {
    try {
      return await handler(request, context);
    } catch (error) {
      const logger = new Logger('API');
      logger.error('Unhandled error in API route', error);

      const errorResponse = formatErrorResponse(error);
      
      return new Response(
        JSON.stringify({
          error: errorResponse.error,
          code: errorResponse.code,
          details: errorResponse.details
        }),
        {
          status: errorResponse.statusCode,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  };
}

/**
 * Retry utility for database operations
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries) {
        const logger = new Logger('RetryOperation');
        logger.warn(`Operation failed, retrying (${attempt}/${maxRetries})`, {
          error: lastError.message
        });
        
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }
  }

  throw new DatabaseError(
    `Operation failed after ${maxRetries} attempts`,
    { lastError: lastError?.message }
  );
}

/**
 * Safe JSON parse with error handling
 */
export function safeJSONParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    const logger = new Logger('JSONParse');
    logger.warn('Failed to parse JSON, using fallback', { error });
    return fallback;
  }
}

/**
 * Validate required environment variables
 */
export function validateEnv(requiredVars: string[]): void {
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

