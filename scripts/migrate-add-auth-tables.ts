/**
 * Database Migration: Add Authentication Collections
 *
 * This migration ensures the following MongoDB collections exist:
 * - users: User accounts with roles and authentication
 * - sessions: User sessions for authentication
 * - api_keys: API keys for programmatic access
 * - audit_logs: Audit trail for all user actions
 *
 * Note: With MongoDB, this migration is mostly for ensuring indexes exist.
 * The init-database.ts script already creates these collections and indexes.
 */

import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.MONGODB_DATABASE || 'earthquake_catalogue';

// Auth collection names
const AUTH_COLLECTIONS = {
  USERS: 'users',
  SESSIONS: 'sessions',
  API_KEYS: 'api_keys',
  AUDIT_LOGS: 'audit_logs',
};

async function runMigration() {
  console.log('Starting migration: Add authentication collections\n');
  console.log(`   URI: ${MONGODB_URI}`);
  console.log(`   Database: ${DATABASE_NAME}\n`);

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✓ Connected to MongoDB\n');

    const db = client.db(DATABASE_NAME);

    // Create collections
    console.log('📦 Creating auth collections...');
    for (const [name, collectionName] of Object.entries(AUTH_COLLECTIONS)) {
      try {
        await db.createCollection(collectionName);
        console.log(`✓ Created collection: ${collectionName}`);
      } catch (err: any) {
        if (err.code === 48) {
          console.log(`  Collection already exists: ${collectionName}`);
        } else {
          console.error(`❌ Error creating collection ${collectionName}:`, err.message);
        }
      }
    }

    // Create indexes
    console.log('\n🔍 Creating indexes...');
    let indexCount = 0;

    // Users collection indexes
    const usersCollection = db.collection(AUTH_COLLECTIONS.USERS);
    await usersCollection.createIndex({ id: 1 }, { name: 'idx_id', unique: true });
    await usersCollection.createIndex({ email: 1 }, { name: 'idx_email', unique: true });
    await usersCollection.createIndex({ role: 1 }, { name: 'idx_role' });
    await usersCollection.createIndex({ is_active: 1 }, { name: 'idx_is_active' });
    console.log(`✓ Created indexes for ${AUTH_COLLECTIONS.USERS}`);
    indexCount += 4;

    // Sessions collection indexes
    const sessionsCollection = db.collection(AUTH_COLLECTIONS.SESSIONS);
    await sessionsCollection.createIndex({ id: 1 }, { name: 'idx_id', unique: true });
    await sessionsCollection.createIndex({ user_id: 1 }, { name: 'idx_user_id' });
    await sessionsCollection.createIndex({ token: 1 }, { name: 'idx_token', unique: true });
    await sessionsCollection.createIndex({ expires_at: 1 }, { name: 'idx_expires_at', expireAfterSeconds: 0 });
    console.log(`✓ Created indexes for ${AUTH_COLLECTIONS.SESSIONS}`);
    indexCount += 4;

    // API keys collection indexes
    const apiKeysCollection = db.collection(AUTH_COLLECTIONS.API_KEYS);
    await apiKeysCollection.createIndex({ id: 1 }, { name: 'idx_id', unique: true });
    await apiKeysCollection.createIndex({ user_id: 1 }, { name: 'idx_user_id' });
    await apiKeysCollection.createIndex({ key_prefix: 1 }, { name: 'idx_key_prefix' });
    await apiKeysCollection.createIndex({ is_active: 1 }, { name: 'idx_is_active' });
    console.log(`✓ Created indexes for ${AUTH_COLLECTIONS.API_KEYS}`);
    indexCount += 4;

    // Audit logs collection indexes
    const auditLogsCollection = db.collection(AUTH_COLLECTIONS.AUDIT_LOGS);
    await auditLogsCollection.createIndex({ id: 1 }, { name: 'idx_id', unique: true });
    await auditLogsCollection.createIndex({ user_id: 1 }, { name: 'idx_user_id' });
    await auditLogsCollection.createIndex({ action: 1 }, { name: 'idx_action' });
    await auditLogsCollection.createIndex({ resource_type: 1 }, { name: 'idx_resource_type' });
    await auditLogsCollection.createIndex({ created_at: -1 }, { name: 'idx_created_at' });
    console.log(`✓ Created indexes for ${AUTH_COLLECTIONS.AUDIT_LOGS}`);
    indexCount += 5;

    console.log('\n✅ Migration completed successfully!');
    console.log(`   Collections created: ${Object.keys(AUTH_COLLECTIONS).length}`);
    console.log(`   Indexes created: ${indexCount}`);

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await client.close();
    console.log('\n✓ Disconnected from MongoDB');
  }
}

// Run migration
runMigration()
  .then(() => {
    console.log('\n🎉 Authentication collections migration complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
