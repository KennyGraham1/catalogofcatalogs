/**
 * Environment Variable Validation
 * 
 * Validates required environment variables on application startup to prevent
 * runtime errors due to missing configuration.
 * 
 * This module ensures that all critical environment variables are present
 * and properly formatted before the application starts.
 */

/**
 * Required environment variables
 */
const REQUIRED_ENV_VARS = [
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
] as const;

/**
 * Optional environment variables with defaults
 */
const OPTIONAL_ENV_VARS = {
  DATABASE_PATH: './merged_catalogues.db',
  NODE_ENV: 'development',
} as const;

/**
 * Validate a single environment variable
 * 
 * @param name - Environment variable name
 * @param value - Environment variable value
 * @returns Validation result
 */
function validateEnvVar(name: string, value: string | undefined): {
  valid: boolean;
  error?: string;
} {
  // Check if value exists
  if (!value || value.trim() === '') {
    return {
      valid: false,
      error: `${name} is required but not set`,
    };
  }

  // Specific validations
  switch (name) {
    case 'NEXTAUTH_SECRET':
      // Should be at least 32 characters for security
      if (value.length < 32) {
        return {
          valid: false,
          error: `${name} should be at least 32 characters long for security. Generate with: openssl rand -base64 32`,
        };
      }
      // Warn if using default/example value
      if (value === 'your-secret-key-here' || value === 'change-me') {
        return {
          valid: false,
          error: `${name} is set to a default value. Please generate a secure secret with: openssl rand -base64 32`,
        };
      }
      break;

    case 'NEXTAUTH_URL':
      // Should be a valid URL
      try {
        new URL(value);
      } catch {
        return {
          valid: false,
          error: `${name} must be a valid URL (e.g., http://localhost:3000 or https://example.com)`,
        };
      }
      break;

    case 'NODE_ENV':
      // Should be one of the standard values
      const validEnvs = ['development', 'production', 'test'];
      if (!validEnvs.includes(value)) {
        return {
          valid: false,
          error: `${name} must be one of: ${validEnvs.join(', ')}`,
        };
      }
      break;
  }

  return { valid: true };
}

/**
 * Validate all required environment variables
 * Throws an error if any required variables are missing or invalid
 * 
 * @throws Error if validation fails
 */
export function validateEnvironment(): void {
  const errors: string[] = [];

  // Validate required variables
  for (const varName of REQUIRED_ENV_VARS) {
    const value = process.env[varName];
    const result = validateEnvVar(varName, value);

    if (!result.valid) {
      errors.push(result.error!);
    }
  }

  // Validate optional variables if they are set
  for (const [varName, defaultValue] of Object.entries(OPTIONAL_ENV_VARS)) {
    const value = process.env[varName];
    
    if (value) {
      const result = validateEnvVar(varName, value);
      if (!result.valid) {
        errors.push(result.error!);
      }
    }
  }

  // If there are errors, throw with detailed message
  if (errors.length > 0) {
    const errorMessage = [
      '❌ Environment variable validation failed:',
      '',
      ...errors.map(err => `  • ${err}`),
      '',
      'Please check your .env file or environment configuration.',
      'See .env.example for reference.',
    ].join('\n');

    throw new Error(errorMessage);
  }

  // Log success in development
  if (process.env.NODE_ENV === 'development') {
    console.log('✅ Environment variables validated successfully');
  }
}

/**
 * Typed environment configuration
 * Provides type-safe access to environment variables with defaults
 */
export const env = {
  // Required variables (validated on startup)
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET!,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL!,
  
  // Optional variables with defaults
  DATABASE_PATH: process.env.DATABASE_PATH || OPTIONAL_ENV_VARS.DATABASE_PATH,
  NODE_ENV: (process.env.NODE_ENV || OPTIONAL_ENV_VARS.NODE_ENV) as 'development' | 'production' | 'test',
  
  // Computed values
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  IS_DEVELOPMENT: process.env.NODE_ENV === 'development',
  IS_TEST: process.env.NODE_ENV === 'test',
} as const;

/**
 * Validate environment on module load (server-side only)
 * This ensures validation happens before the application starts
 * Uses a flag to ensure validation only runs once
 */
let hasValidated = false;

if (typeof window === 'undefined' && !hasValidated) {
  hasValidated = true;
  try {
    validateEnvironment();
  } catch (error) {
    // Log error and exit process
    console.error(error instanceof Error ? error.message : String(error));

    // In production, exit the process
    // In development, just warn (to allow hot reload)
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
}

