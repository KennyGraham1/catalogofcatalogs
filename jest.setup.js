import '@testing-library/jest-dom'

// Polyfill Web APIs for Next.js App Router testing
// These are required for NextRequest/NextResponse in integration tests
import { TextEncoder, TextDecoder } from 'util'

global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Polyfill Request/Response/Headers for Next.js server components
// Only apply polyfills if running on Node.js 18+ where undici is compatible
// In CI (Node 18+), these will work; locally on older Node, integration tests may be skipped
if (typeof global.Request === 'undefined') {
  try {
    // Node 18+ has native fetch, try to use it
    if (typeof globalThis.fetch !== 'undefined') {
      // Native fetch available (Node 18+)
      global.Request = globalThis.Request
      global.Response = globalThis.Response
      global.Headers = globalThis.Headers
    }
  } catch (e) {
    // Polyfills not available - integration tests requiring NextRequest will fail gracefully
    console.warn('Web API polyfills not available. Integration tests may be skipped.')
  }
}

// Mock MongoDB module for tests
jest.mock('mongodb', () => ({
  MongoClient: {
    connect: jest.fn().mockResolvedValue({
      db: jest.fn().mockReturnValue({
        collection: jest.fn().mockReturnValue({
          find: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([]),
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
          }),
          findOne: jest.fn().mockResolvedValue(null),
          insertOne: jest.fn().mockResolvedValue({ insertedId: 'mock-id' }),
          updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
          deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
          countDocuments: jest.fn().mockResolvedValue(0),
          createIndex: jest.fn().mockResolvedValue('index-name'),
        }),
        listCollections: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([]),
        }),
        createCollection: jest.fn().mockResolvedValue({}),
      }),
      close: jest.fn().mockResolvedValue(undefined),
    }),
  },
  ObjectId: jest.fn().mockImplementation((id) => ({ toString: () => id || 'mock-object-id' })),
}));
