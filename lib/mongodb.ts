/**
 * MongoDB Connection Module
 *
 * Provides MongoDB client singleton with connection pooling and health checks.
 * Optimized for MongoDB Atlas with retry logic and resilient connections.
 */

import { MongoClient, Db, Collection, MongoClientOptions } from 'mongodb';

// MongoDB connection URI from environment variable
// Supports both local MongoDB and Atlas connection strings:
//   - mongodb://localhost:27017
//   - mongodb+srv://user:pass@cluster.mongodb.net/dbname
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';

// Detect if using Atlas (mongodb+srv://)
const IS_ATLAS = MONGODB_URI.startsWith('mongodb+srv://');

// Extract database name from connection string or use environment variable
function extractDatabaseName(uri: string): string {
  // Check environment variable first
  if (process.env.MONGODB_DATABASE) {
    return process.env.MONGODB_DATABASE;
  }

  try {
    // Parse database name from URI path (e.g., mongodb+srv://...mongodb.net/mydb?options)
    const url = new URL(uri);
    const pathname = url.pathname;
    if (pathname && pathname.length > 1) {
      // Remove leading slash and any query params
      return pathname.slice(1).split('?')[0];
    }
  } catch {
    // URL parsing failed, try regex for non-standard URIs
    const match = uri.match(/\/([^/?]+)(\?|$)/);
    if (match && match[1]) {
      return match[1];
    }
  }

  // Default database name
  return 'earthquake_catalogue';
}

const DATABASE_NAME = extractDatabaseName(MONGODB_URI);

// MongoDB client options optimized for Atlas
const clientOptions: MongoClientOptions = {
  // Connection pooling
  maxPoolSize: IS_ATLAS ? 50 : 10,  // Atlas can handle more connections
  minPoolSize: IS_ATLAS ? 5 : 2,
  maxIdleTimeMS: 30000,

  // Timeouts - longer for Atlas due to network latency
  waitQueueTimeoutMS: IS_ATLAS ? 10000 : 5000,
  serverSelectionTimeoutMS: IS_ATLAS ? 10000 : 5000,
  connectTimeoutMS: IS_ATLAS ? 20000 : 10000,
  socketTimeoutMS: IS_ATLAS ? 45000 : 30000,

  // Atlas-specific options
  retryWrites: true,      // Automatically retry failed writes
  retryReads: true,       // Automatically retry failed reads
  w: 'majority',          // Write concern for data durability

  // Compression for better performance over network
  compressors: ['zlib'],
};

// Global MongoDB client instance (singleton pattern for connection reuse)
let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

// Retry configuration for Atlas connections
const RETRY_CONFIG = {
  maxRetries: IS_ATLAS ? 5 : 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

// Connection stats for monitoring
const connectionStats = {
  totalConnections: 0,
  activeConnections: 0,
  errors: 0,
  retries: 0,
  lastConnected: null as Date | null,
  lastError: null as string | null,
};

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Connect to MongoDB with retry logic
 */
async function connectWithRetry(retryCount = 0): Promise<MongoClient> {
  try {
    const connectedClient = await MongoClient.connect(MONGODB_URI, clientOptions);

    // Log connection info (mask password for security)
    const maskedUri = MONGODB_URI.replace(/:([^@]+)@/, ':****@');
    console.log(`[MongoDB] Connected successfully to ${IS_ATLAS ? 'Atlas' : 'local'}`);
    console.log(`[MongoDB] Database: ${DATABASE_NAME}`);
    if (IS_ATLAS) {
      console.log(`[MongoDB] URI: ${maskedUri.split('@')[1]?.split('/')[0] || 'cluster'}`);
    }

    return connectedClient;
  } catch (error) {
    connectionStats.errors++;
    connectionStats.lastError = error instanceof Error ? error.message : 'Unknown error';

    if (retryCount < RETRY_CONFIG.maxRetries) {
      const delay = Math.min(
        RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, retryCount),
        RETRY_CONFIG.maxDelayMs
      );

      connectionStats.retries++;
      console.warn(`[MongoDB] Connection failed, retrying in ${delay}ms (attempt ${retryCount + 1}/${RETRY_CONFIG.maxRetries})...`);
      console.warn(`[MongoDB] Error: ${connectionStats.lastError}`);

      await sleep(delay);
      return connectWithRetry(retryCount + 1);
    }

    console.error(`[MongoDB] All ${RETRY_CONFIG.maxRetries} connection attempts failed`);
    throw error;
  }
}

/**
 * Get the MongoDB client instance (creates one if not exists)
 * Uses retry logic for resilient Atlas connections
 */
export async function getMongoClient(): Promise<MongoClient> {
  if (typeof window !== 'undefined') {
    throw new Error('MongoDB client cannot be used on the client side');
  }

  // Return existing client if connected
  if (client) {
    // Verify connection is still alive for Atlas
    if (IS_ATLAS) {
      try {
        await client.db(DATABASE_NAME).command({ ping: 1 });
        return client;
      } catch {
        // Connection lost, reconnect
        console.warn('[MongoDB] Connection lost, reconnecting...');
        client = null;
        clientPromise = null;
      }
    } else {
      return client;
    }
  }

  // Return pending connection promise if exists
  if (clientPromise) {
    return clientPromise;
  }

  // Create new connection with retry logic
  clientPromise = connectWithRetry()
    .then((connectedClient) => {
      client = connectedClient;
      connectionStats.totalConnections++;
      connectionStats.activeConnections++;
      connectionStats.lastConnected = new Date();

      // Set up connection monitoring for Atlas
      if (IS_ATLAS) {
        connectedClient.on('close', () => {
          console.warn('[MongoDB] Connection closed');
          connectionStats.activeConnections = 0;
        });

        connectedClient.on('error', (err) => {
          console.error('[MongoDB] Connection error:', err.message);
          connectionStats.errors++;
        });

        connectedClient.on('timeout', () => {
          console.warn('[MongoDB] Connection timeout');
        });
      }

      return client;
    })
    .catch((error) => {
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

