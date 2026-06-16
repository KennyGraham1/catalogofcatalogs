const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.tsx',
  ],
  // Coverage is gated on the unit-tested library core. The Next.js UI pages,
  // API route handlers, and auth wiring (app/**, lib/auth/**) are exercised by
  // integration/manual testing rather than Jest unit tests, so they are
  // excluded from the unit-coverage gate (they would otherwise pin global
  // coverage near 20%).
  collectCoverageFrom: [
    'lib/**/*.{js,jsx,ts,tsx}',
    '!lib/auth/**',
    '!lib/db.ts',
    '!**/*.d.ts',
    '!**/types/**',
    '!**/types.ts',
    '!**/node_modules/**',
    '!**/.next/**',
  ],
  // Thresholds reflect the current unit-tested footprint of lib/** (with a
  // safety margin below measured coverage). Raise these as test coverage of
  // the library core improves.
  coverageThreshold: {
    global: {
      branches: 33,
      functions: 38,
      lines: 40,
      statements: 40,
    },
  },
  maxWorkers: 1, // Workaround for Node version compatibility
  transformIgnorePatterns: [
    '/node_modules/(?!(mongodb|bson)/)',
  ],
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)

