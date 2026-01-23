/**
 * Database Migration Script for Authentication and RBAC
 * 
 * This script:
 * 1. Creates the user_roles collection with role definitions
 * 2. Updates the users collection schema with role and auth fields
 * 3. Creates necessary indexes for authentication
 * 4. Creates a default admin user (if specified)
 */

import { config } from 'dotenv';
import { MongoClient } from 'mongodb';
import * as bcrypt from 'bcryptjs';
import { UserRole, Permission, ROLE_PERMISSIONS } from '../lib/auth/types';

// Load environment variables
config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.MONGODB_DATABASE || 'earthquake_catalogue';

const COLLECTIONS = {
  USERS: 'users',
  USER_ROLES: 'user_roles',
  SESSIONS: 'sessions',
};

async function migrateAuthSchema() {
  const client = new MongoClient(MONGODB_URI);

  try {
    console.log('\n🔐 Starting Authentication Schema Migration...\n');
    
    await client.connect();
    console.log('✓ Connected to MongoDB');
    console.log(`  Database: ${DATABASE_NAME}\n`);

    const db = client.db(DATABASE_NAME);

    // Step 1: Create user_roles collection with role definitions
    console.log('📦 Creating user_roles collection...');
    const userRolesCollection = db.collection(COLLECTIONS.USER_ROLES);
    
    const roleDefinitions = [
      {
        id: 'role_admin',
        role: UserRole.ADMIN,
        name: 'Administrator',
        description: 'Full system access including user management and system settings',
        permissions: ROLE_PERMISSIONS[UserRole.ADMIN],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'role_editor',
        role: UserRole.EDITOR,
        name: 'Editor',
        description: 'Can create, upload, import, merge, and export catalogues',
        permissions: ROLE_PERMISSIONS[UserRole.EDITOR],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'role_viewer',
        role: UserRole.VIEWER,
        name: 'Viewer',
        description: 'Read-only access with export capabilities',
        permissions: ROLE_PERMISSIONS[UserRole.VIEWER],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'role_guest',
        role: UserRole.GUEST,
        name: 'Guest',
        description: 'Limited access to public/demo catalogues only',
        permissions: ROLE_PERMISSIONS[UserRole.GUEST],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    // Insert or update role definitions
    for (const roleDef of roleDefinitions) {
      await userRolesCollection.updateOne(
        { role: roleDef.role },
        { $set: roleDef },
        { upsert: true }
      );
      console.log(`  ✓ Created/Updated role: ${roleDef.name}`);
    }

    // Step 2: Create indexes for user_roles collection
    console.log('\n🔍 Creating indexes for user_roles...');
    await userRolesCollection.createIndex({ id: 1 }, { unique: true });
    await userRolesCollection.createIndex({ role: 1 }, { unique: true });
    console.log('  ✓ Created indexes for user_roles');

    // Step 3: Update users collection indexes (already exists, but ensure auth fields are indexed)
    console.log('\n🔍 Updating users collection indexes...');
    const usersCollection = db.collection(COLLECTIONS.USERS);
    
    // Ensure these indexes exist
    await usersCollection.createIndex({ role: 1 });
    await usersCollection.createIndex({ is_active: 1 });
    await usersCollection.createIndex({ email_verified: 1 });
    console.log('  ✓ Updated users collection indexes');

    // Step 4: Create default admin user if specified via environment variables
    if (process.env.CREATE_ADMIN_USER === 'true') {
      console.log('\n👤 Creating default admin user...');
      
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
      const adminName = process.env.ADMIN_NAME || 'System Administrator';

      const existingAdmin = await usersCollection.findOne({ email: adminEmail });
      
      if (existingAdmin) {
        console.log(`  ⚠ Admin user already exists: ${adminEmail}`);
      } else {
        const passwordHash = await bcrypt.hash(adminPassword, 10);
        
        await usersCollection.insertOne({
          id: `user_${Date.now()}`,
          email: adminEmail,
          name: adminName,
          password_hash: passwordHash,
          role: UserRole.ADMIN,
          is_active: true,
          email_verified: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        
        console.log(`  ✓ Created admin user: ${adminEmail}`);
        console.log(`  ⚠ Default password: ${adminPassword}`);
        console.log(`  ⚠ IMPORTANT: Change this password immediately after first login!`);
      }
    }

    console.log('\n✅ Authentication schema migration completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

// Run migration
migrateAuthSchema();

