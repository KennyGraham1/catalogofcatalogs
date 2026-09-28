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

import { resolveDbTarget } from './lib/db-target';

async function checkUserRole(email: string) {
  if (!email) {
    console.error('❌ Error: Email address is required');
    console.log('\nUsage: npx tsx scripts/check-user-role.ts <email>');
    console.log('Example: npx tsx scripts/check-user-role.ts test@example.com');
    process.exitCode = 1;
    return;
  }

  // See scripts/migrate-add-region.ts for why this goes through lib/mongodb.ts's
  // getDb() instead of resolving MONGODB_URI/MONGODB_DATABASE itself (gs#3/gs#4).
  // Read-only script, so no write confirmation is needed here.
  const target = await resolveDbTarget();

  try {
    console.log(`   Database: ${target.db.databaseName}\n`);

    // getUserByEmail matches case-insensitively, the same way login does — an
    // exact-case findOne could report "not found" for an account that exists
    // under different casing (same root cause as gs#6). Deferred import: see
    // migrate-auth-schema.ts for why.
    const { getUserByEmail } = await import('../lib/auth/utils');
    const user = await getUserByEmail(email);

    if (!user) {
      console.error(`❌ Error: User with email "${email}" not found\n`);
      console.log('Available users:');
      const usersCollection = target.db.collection('users');
      const allUsers = await usersCollection.find(
        {},
        { projection: { email: 1, name: 1, role: 1 } }
      ).toArray();

      if (allUsers.length === 0) {
        console.log('  No users found in database');
      } else {
        allUsers.forEach((u: any) => {
          console.log(`  - ${u.email} (${u.name}) - Role: ${u.role}`);
        });
      }
      process.exitCode = 1;
      return;
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
    process.exitCode = 1;
  } finally {
    await target.close();
    console.log('\n✓ Disconnected from MongoDB');
  }
}

// Get email from command line arguments
if (require.main === module) {
  const email = process.argv[2];
  checkUserRole(email).then(() => process.exit(process.exitCode ?? 0));
}

export { checkUserRole };
