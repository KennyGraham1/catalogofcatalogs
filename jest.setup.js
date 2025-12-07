import '@testing-library/jest-dom'

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
