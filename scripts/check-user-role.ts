#!/usr/bin/env tsx

/**
 * Check User Role Script
 * 
 * This script checks the role of a user by email address.
 * 
 * Usage:
 *   npx tsx scripts/check-user-role.ts <email>
 * 
 * Example:
 *   npx tsx scripts/check-user-role.ts test@example.com
 */

import { MongoClient } from 'mongodb';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env file
config({ path: resolve(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DATABASE = process.env.MONGODB_DATABASE || 'eq-catalogue';

async function checkUserRole(email: string) {
  if (!MONGODB_URI) {
    console.error('❌ Error: MONGODB_URI environment variable is not set');
    process.exit(1);
  }

  if (!email) {
    console.error('❌ Error: Email address is required');
    console.log('\nUsage: npx tsx scripts/check-user-role.ts <email>');
    console.log('Example: npx tsx scripts/check-user-role.ts test@example.com');
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
    const user = await usersCollection.findOne(
      { email },
      { projection: { name: 1, email: 1, role: 1, is_active: 1, created_at: 1 } }
    );

    if (!user) {
      console.error(`❌ Error: User with email "${email}" not found\n`);
      console.log('Available users:');
      const allUsers = await usersCollection.find(
        {},
        { projection: { email: 1, name: 1, role: 1 } }
      ).toArray();
      
      if (allUsers.length === 0) {
        console.log('  No users found in database');
      } else {
        allUsers.forEach(u => {
          console.log(`  - ${u.email} (${u.name}) - Role: ${u.role}`);
        });
      }
      process.exit(1);
    }

    console.log('👤 User Details:');
    console.log('━'.repeat(50));
    console.log(`   Name:       ${user.name}`);
    console.log(`   Email:      ${user.email}`);
    console.log(`   Role:       ${user.role}`);
    console.log(`   Status:     ${user.is_active ? '✅ Active' : '❌ Inactive'}`);
    console.log(`   Created:    ${new Date(user.created_at).toLocaleString()}`);
    console.log('━'.repeat(50));
    console.log('');

    // Show permissions based on role
    console.log('🔐 Permissions:');
    console.log('━'.repeat(50));
    
    switch (user.role) {
      case 'admin':
        console.log('   ✅ View all catalogues');
        console.log('   ✅ Create, edit, delete catalogues');
        console.log('   ✅ Import and merge data');
        console.log('   ✅ Export catalogues');
        console.log('   ✅ Manage users (ADMIN)');
        console.log('   ✅ Access system settings (ADMIN)');
        break;
      case 'editor':
        console.log('   ✅ View all catalogues');
        console.log('   ✅ Create, edit, delete catalogues');
        console.log('   ✅ Import and merge data');
        console.log('   ✅ Export catalogues');
        console.log('   ❌ Manage users (Admin only)');
        console.log('   ❌ Access system settings (Admin only)');
        break;
      case 'viewer':
        console.log('   ✅ View all catalogues');
        console.log('   ✅ Export catalogues');
        console.log('   ❌ Create, edit, delete catalogues (Editor+ only)');
        console.log('   ❌ Import and merge data (Editor+ only)');
        console.log('   ❌ Manage users (Admin only)');
        console.log('   ❌ Access system settings (Admin only)');
        break;
      case 'guest':
        console.log('   ✅ View public catalogues');
        console.log('   ❌ Export catalogues (Viewer+ only)');
        console.log('   ❌ Create, edit, delete catalogues (Editor+ only)');
        console.log('   ❌ Import and merge data (Editor+ only)');
        console.log('   ❌ Manage users (Admin only)');
        console.log('   ❌ Access system settings (Admin only)');
        break;
    }
    console.log('━'.repeat(50));
    console.log('');

    if (user.role === 'admin') {
      console.log('🎉 This user has ADMIN privileges!');
      console.log('   They can access /admin/users and manage all users.');
    } else {
      console.log('ℹ️  To promote this user to admin, run:');
      console.log(`   npx tsx scripts/promote-to-admin.ts ${email}`);
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
checkUserRole(email);

