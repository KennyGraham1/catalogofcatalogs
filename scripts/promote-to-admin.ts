#!/usr/bin/env tsx

/**
 * Promote User to Admin Script
 *
 * This script promotes a user to admin role by email address.
 *
 * Usage:
 *   npx tsx scripts/promote-to-admin.ts <email>
 *
 * Example:
 *   npx tsx scripts/promote-to-admin.ts test@example.com
 */

import { MongoClient } from 'mongodb';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env file
config({ path: resolve(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DATABASE = process.env.MONGODB_DATABASE || 'eq-catalogue';

async function promoteToAdmin(email: string) {
  if (!MONGODB_URI) {
    console.error('❌ Error: MONGODB_URI environment variable is not set');
    process.exit(1);
  }

  if (!email) {
    console.error('❌ Error: Email address is required');
    console.log('\nUsage: npx tsx scripts/promote-to-admin.ts <email>');
    console.log('Example: npx tsx scripts/promote-to-admin.ts test@example.com');
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    console.log('🔌 Connecting to MongoDB...');
    await client.connect();
    console.log('✓ Connected to MongoDB\n');

    const db = client.db(MONGODB_DATABASE);
    const usersCollection = db.collection('users');

    // Find the user
    const user = await usersCollection.findOne({ email });

    if (!user) {
      console.error(`❌ Error: User with email "${email}" not found`);
      console.log('\nAvailable users:');
      const allUsers = await usersCollection.find({}, { projection: { email: 1, name: 1, role: 1 } }).toArray();
      allUsers.forEach(u => {
        console.log(`  - ${u.email} (${u.name}) - Role: ${u.role}`);
      });
      process.exit(1);
    }

    console.log('📋 Current user details:');
    console.log(`   Name: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Current Role: ${user.role}`);
    console.log('');

    if (user.role === 'admin') {
      console.log('ℹ️  User is already an admin!');
      process.exit(0);
    }

    // Promote to admin
    const result = await usersCollection.updateOne(
      { email },
      { 
        $set: { 
          role: 'admin',
          updated_at: new Date().toISOString()
        } 
      }
    );

    if (result.modifiedCount === 1) {
      console.log('✅ Successfully promoted user to admin!');
      console.log('');
      console.log('📋 Updated user details:');
      console.log(`   Name: ${user.name}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   New Role: admin`);
      console.log('');
      console.log('🔄 The user needs to log out and log back in for changes to take effect.');
    } else {
      console.error('❌ Error: Failed to update user role');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n✓ Disconnected from MongoDB');
  }
}

// Get email from command line arguments
const email = process.argv[2];
promoteToAdmin(email);

