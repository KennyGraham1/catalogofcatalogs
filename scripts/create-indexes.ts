#!/usr/bin/env npx tsx
/**
 * Database Index Creation Script
 *
 * This script creates optimal indexes for the MongoDB collections used by the
 * Earthquake Catalogue Platform. Run this script after initial deployment or
 * when adding new indexes.
 *
 * Usage:
 *   npx tsx scripts/create-indexes.ts
 *
 * Environment:
 *   MONGODB_URI - MongoDB connection string (required)
 *   MONGODB_DATABASE - Database name (optional, defaults to earthquake_catalogue)
 */

import { MongoClient, CreateIndexesOptions } from 'mongodb';

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.MONGODB_DATABASE || 'earthquake_catalogue';

interface IndexDefinition {
  collection: string;
  name: string;
  keys: Record<string, 1 | -1 | 'text'>;
  options?: CreateIndexesOptions;
}

// Index definitions for optimal query performance
const indexes: IndexDefinition[] = [
  // Events collection indexes
  {
    collection: 'merged_events',
    name: 'idx_events_catalogue_time',
    keys: { catalogue_id: 1, time: -1 },
    options: { background: true },
  },
  {
    collection: 'merged_events',
    name: 'idx_events_catalogue_source',
    keys: { catalogue_id: 1, source_id: 1 },
    options: { background: true, sparse: true },
  },
  {
    collection: 'merged_events',
    name: 'idx_events_magnitude',
    keys: { catalogue_id: 1, magnitude: 1 },
    options: { background: true },
  },
  {
    collection: 'merged_events',
    name: 'idx_events_depth',
    keys: { catalogue_id: 1, depth: 1 },
    options: { background: true, sparse: true },
  },
  {
    collection: 'merged_events',
    name: 'idx_events_location',
    keys: { catalogue_id: 1, latitude: 1, longitude: 1 },
    options: { background: true },
  },
  {
    collection: 'merged_events',
    name: 'idx_events_event_type',
    keys: { catalogue_id: 1, event_type: 1 },
    options: { background: true, sparse: true },
  },
  {
    collection: 'merged_events',
    name: 'idx_events_created_at',
    keys: { created_at: -1 },
    options: { background: true },
  },

  // Catalogues collection indexes
  {
    collection: 'merged_catalogues',
    name: 'idx_catalogues_created_at',
    keys: { created_at: -1 },
    options: { background: true },
  },
  {
    collection: 'merged_catalogues',
    name: 'idx_catalogues_name',
    keys: { name: 1 },
    options: { background: true },
  },
  {
    collection: 'merged_catalogues',
    name: 'idx_catalogues_status',
    keys: { status: 1 },
    options: { background: true },
  },

  // Users collection indexes
  {
    collection: 'users',
    name: 'idx_users_email',
    keys: { email: 1 },
    options: { background: true, unique: true },
  },
  {
    collection: 'users',
    name: 'idx_users_role',
    keys: { role: 1 },
    options: { background: true },
  },

  // Sessions collection indexes
  {
    collection: 'sessions',
    name: 'idx_sessions_token',
    keys: { session_token: 1 },
    options: { background: true, unique: true },
  },
  {
    collection: 'sessions',
    name: 'idx_sessions_user',
    keys: { user_id: 1 },
    options: { background: true },
  },

  // Import history indexes
  {
    collection: 'import_history',
    name: 'idx_import_catalogue',
    keys: { catalogue_id: 1, created_at: -1 },
    options: { background: true },
  },

  // Saved filters indexes
  {
    collection: 'saved_filters',
    name: 'idx_filters_created_at',
    keys: { created_at: -1 },
    options: { background: true },
  },

  // Mapping templates indexes
  {
    collection: 'mapping_templates',
    name: 'idx_templates_name',
    keys: { name: 1 },
    options: { background: true },
  },

  // Role requests indexes
  {
    collection: 'role_requests',
    name: 'idx_role_requests_user',
    keys: { user_id: 1, status: 1 },
    options: { background: true },
  },
  {
    collection: 'role_requests',
    name: 'idx_role_requests_status',
    keys: { status: 1, created_at: -1 },
    options: { background: true },
  },

  // Password reset tokens indexes
  {
    collection: 'password_reset_tokens',
    name: 'idx_reset_tokens_hash',
    keys: { token_hash: 1 },
    options: { background: true, unique: true },
  },
  {
    collection: 'password_reset_tokens',
    name: 'idx_reset_tokens_user',
    keys: { user_id: 1 },
    options: { background: true },
  },
  {
    collection: 'password_reset_tokens',
    name: 'idx_reset_tokens_expiry',
    keys: { expires_at: 1 },
    options: { background: true, expireAfterSeconds: 0 }, // TTL index
  },

  // Audit logs indexes
  {
    collection: 'audit_logs',
    name: 'idx_audit_user',
    keys: { user_id: 1, created_at: -1 },
    options: { background: true },
  },
  {
    collection: 'audit_logs',
    name: 'idx_audit_action',
    keys: { action: 1, created_at: -1 },
    options: { background: true },
  },
];

async function createIndexes(): Promise<void> {
  console.log('🔄 Connecting to MongoDB...');
  console.log(`   Database: ${DATABASE_NAME}`);

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(DATABASE_NAME);

    console.log('✅ Connected successfully\n');
    console.log('📊 Creating indexes...\n');

    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const index of indexes) {
      try {
        const collection = db.collection(index.collection);

        // Check if index already exists
        const existingIndexes = await collection.indexes();
        const exists = existingIndexes.some((idx) => idx.name === index.name);

        if (exists) {
          console.log(`   ⏭️  ${index.collection}.${index.name} (already exists)`);
          skipped++;
          continue;
        }

        await collection.createIndex(index.keys, {
          ...index.options,
          name: index.name,
        });

        console.log(`   ✅ ${index.collection}.${index.name}`);
        created++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`   ❌ ${index.collection}.${index.name}: ${message}`);
        failed++;
      }
    }

    console.log('\n📈 Summary:');
    console.log(`   Created: ${created}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Failed:  ${failed}`);

    if (failed > 0) {
      console.log('\n⚠️  Some indexes failed to create. Check the errors above.');
      process.exit(1);
    }

    console.log('\n✅ Index creation complete!');
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

// Run the script
createIndexes().catch(console.error);
