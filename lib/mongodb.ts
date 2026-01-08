/**
 * MongoDB Connection Module
 * 
 * Provides MongoDB client singleton with connection pooling and health checks.
 */

import { MongoClient, Db, Collection, MongoClientOptions } from 'mongodb';

// MongoDB connection URI from environment variable
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.MONGODB_DATABASE || 'earthquake_catalogue';

// MongoDB client options for connection pooling
const clientOptions: MongoClientOptions = {
  maxPoolSize: 10,
  minPoolSize: 2,
  maxIdleTimeMS: 30000,
  waitQueueTimeoutMS: 5000,
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000,
};

// Global MongoDB client instance (singleton pattern for connection reuse)
let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

// Connection stats for monitoring
const connectionStats = {
  totalConnections: 0,
  activeConnections: 0,
  errors: 0,
  lastConnected: null as Date | null,
};

/**
 * Get the MongoDB client instance (creates one if not exists)
 */
export async function getMongoClient(): Promise<MongoClient> {
  if (typeof window !== 'undefined') {
    throw new Error('MongoDB client cannot be used on the client side');
  }

  if (client) {
    return client;
  }

  if (clientPromise) {
    return clientPromise;
  }

  clientPromise = MongoClient.connect(MONGODB_URI, clientOptions)
    .then((connectedClient) => {
      client = connectedClient;
      connectionStats.totalConnections++;
      connectionStats.activeConnections++;
      connectionStats.lastConnected = new Date();
      console.log('[MongoDB] Connected successfully');
      return client;
    })
    .catch((error) => {
      connectionStats.errors++;
      console.error('[MongoDB] Connection failed:', error);
      clientPromise = null;
      throw error;
    });

  return clientPromise;
}

/**
 * Get the MongoDB database instance
 */
export async function getDb(): Promise<Db> {
  const mongoClient = await getMongoClient();
  return mongoClient.db(DATABASE_NAME);
}

/**
 * Get a specific collection from the database
 */
export async function getCollection<T extends Document = Document>(
  collectionName: string
): Promise<Collection<T>> {
  const db = await getDb();
  return db.collection<T>(collectionName);
}

/**
 * Close the MongoDB connection
 */
export async function closeConnection(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    clientPromise = null;
    connectionStats.activeConnections = 0;
    console.log('[MongoDB] Connection closed');
  }
}

/**
 * Check if MongoDB is connected
 */
export async function isConnected(): Promise<boolean> {
  if (!client) {
    return false;
  }
  try {
    const db = client.db(DATABASE_NAME);
    await db.command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get connection statistics
 */
export function getConnectionStats() {
  return { ...connectionStats };
}

/**
 * Collection names used in the application
 */
export const COLLECTIONS = {
  CATALOGUES: 'merged_catalogues',
  EVENTS: 'merged_events',
  MAPPING_TEMPLATES: 'mapping_templates',
  IMPORT_HISTORY: 'import_history',
  SAVED_FILTERS: 'saved_filters',
  USERS: 'users',
  SESSIONS: 'sessions',
  API_KEYS: 'api_keys',
  AUDIT_LOGS: 'audit_logs',
} as const;

export { MongoClient, Db, Collection };

