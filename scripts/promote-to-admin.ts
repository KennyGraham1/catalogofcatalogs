#!/usr/bin/env tsx

/**
 * Promote User to Admin Script
 *
 * This script promotes a user to admin role by email address.
 *
 * Usage:
 *   npx tsx scripts/promote-to-admin.ts <email> [--yes]
 *
 * Example:
 *   npx tsx scripts/promote-to-admin.ts test@example.com
 */

import { resolveDbTarget } from './lib/db-target';
import { confirmWrite } from './lib/confirm';

const ASSUME_YES = process.argv.includes('--yes');

async function promoteToAdmin(email: string) {
  if (!email) {
    console.error('❌ Error: Email address is required');
    console.log('\nUsage: npx tsx scripts/promote-to-admin.ts <email>');
    console.log('Example: npx tsx scripts/promote-to-admin.ts test@example.com');
    process.exitCode = 1;
    return;
  }

  // See scripts/migrate-add-region.ts for why this goes through lib/mongodb.ts's
  // getDb() instead of resolving MONGODB_URI/MONGODB_DATABASE itself (gs#3/gs#4).
  const target = await resolveDbTarget();

  try {
    // getUserByEmail (lib/auth/utils.ts) matches case-insensitively, the same way
    // login does. An exact-case findOne({ email }) here would miss an account
    // whose stored (createUser-normalised, lower-cased) email differs only in
    // case from what the operator typed, and report "not found" even though the
    // account exists — the same root cause as gs#6, applied to this script's own
    // lookup. Deferred import: see migrate-auth-schema.ts for why.
    const { getUserByEmail } = await import('../lib/auth/utils');

    const user = await getUserByEmail(email);

    if (!user) {
      console.error(`❌ Error: User with email "${email}" not found`);
      console.log('\nAvailable users:');
      const usersCollection = target.db.collection('users');
      const allUsers = await usersCollection.find({}, { projection: { email: 1, name: 1, role: 1 } }).toArray();
      allUsers.forEach((u: any) => {
        console.log(`  - ${u.email} (${u.name}) - Role: ${u.role}`);
      });
      process.exitCode = 1;
      return;
    }

    console.log('📋 Current user details:');
    console.log(`   Name: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Current Role: ${user.role}`);
    console.log('');

    if (user.role === 'admin') {
      console.log('ℹ️  User is already an admin!');
      return;
    }

    const decision = await confirmWrite(
      target,
      `About to grant ADMIN to "${user.email}" (currently "${user.role}") in database "${target.db.databaseName}".`,
      'yes',
      ASSUME_YES,
    );
    if (!decision.ok) {
      console.error(`❌ ${decision.reason}`);
      process.exitCode = 1;
      return;
    }

    // Match by the stable id, not by (possibly differently-cased) email.
    const usersCollection = target.db.collection('users');
    const result = await usersCollection.updateOne(
      { id: user.id },
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
      process.exitCode = 1;
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
  promoteToAdmin(email).then(() => process.exit(process.exitCode ?? 0));
}

export { promoteToAdmin };
