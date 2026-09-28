/**
 * Database Migration Script for Authentication and RBAC
 *
 * This script:
 * 1. Creates the user_roles collection with role definitions
 * 2. Updates the users collection schema with role and auth fields
 * 3. Creates necessary indexes for authentication
 * 4. Creates a default admin user (if specified)
 * 5. Reports (and, with --write, backfills) users missing is_active
 *
 *   npx tsx scripts/migrate-auth-schema.ts                # steps 1-4, step 5 dry-run
 *   npx tsx scripts/migrate-auth-schema.ts --write         # step 5 also applies
 */

import { UserRole, ROLE_PERMISSIONS } from '../lib/auth/types';
import type { IndexDefinition } from '../lib/event-indexes';
import { resolveDbTarget } from './lib/db-target';
import { confirmWrite } from './lib/confirm';

const ASSUME_YES = process.argv.includes('--yes');
const WRITE = process.argv.includes('--write');

const COLLECTIONS = {
  USERS: 'users',
  USER_ROLES: 'user_roles',
  SESSIONS: 'sessions',
};

/**
 * The indexes this migration maintains. users.role carries its DATABASE_INDEXES name
 * (lib/event-indexes.ts); the others keep the default names earlier runs gave them.
 */
const AUTH_INDEXES: IndexDefinition[] = [
  { collection: COLLECTIONS.USER_ROLES, name: 'id_1', key: { id: 1 }, options: { unique: true } },
  { collection: COLLECTIONS.USER_ROLES, name: 'role_1', key: { role: 1 }, options: { unique: true } },
  { collection: COLLECTIONS.USERS, name: 'users_role_idx', key: { role: 1 } },
  { collection: COLLECTIONS.USERS, name: 'is_active_1', key: { is_active: 1 } },
  { collection: COLLECTIONS.USERS, name: 'email_verified_1', key: { email_verified: 1 } },
];

async function migrateAuthSchema() {
  console.log('\n🔐 Starting Authentication Schema Migration...\n');

  // See scripts/migrate-add-region.ts for why this goes through lib/mongodb.ts's
  // getDb() instead of resolving MONGODB_URI/MONGODB_DATABASE itself (gs#3/gs#4).
  const target = await resolveDbTarget();

  const decision = await confirmWrite(
    target,
    `About to (re)seed role definitions/indexes in database "${target.db.databaseName}"` +
      (process.env.CREATE_ADMIN_USER === 'true' ? ', and create an admin user.' : '.'),
    'yes',
    ASSUME_YES,
  );
  if (!decision.ok) {
    console.error(`❌ ${decision.reason}`);
    await target.close();
    process.exitCode = 1;
    return;
  }

  try {
    console.log(`  Database: ${target.db.databaseName}\n`);
    const db = target.db;

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

    // Steps 2-3: indexes for user_roles and for the users auth fields. users.role is also
    // in lib/event-indexes.ts DATABASE_INDEXES, which init-database applies as
    // 'users_role_idx', while earlier runs of this script left it as 'role_1'. MongoDB
    // refuses a second index on an existing key pattern under another name
    // (IndexOptionsConflict, code 85), so each index is created only when no index on its
    // keys exists yet, whatever that one is called. Deferred import for the same reason
    // as lib/auth/utils.ts below.
    console.log('\n🔍 Ensuring indexes for user_roles and users...');
    const { ensureIndexDefinitions } = await import('../lib/event-indexes');
    const indexReport = await ensureIndexDefinitions(db, AUTH_INDEXES, line => console.log(`  ${line}`));
    if (indexReport.failed.length > 0) {
      throw new Error(`Could not ensure ${indexReport.failed.map(f => f.index).join(', ')}; see above.`);
    }
    const usersCollection = db.collection(COLLECTIONS.USERS);

    // Step 4: Create default admin user if specified via environment variables
    if (process.env.CREATE_ADMIN_USER === 'true') {
      console.log('\n👤 Creating default admin user...');

      const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
      const adminPassword = process.env.ADMIN_PASSWORD;
      const adminName = process.env.ADMIN_NAME || 'System Administrator';

      if (!adminPassword || adminPassword.length < 12) {
        throw new Error(
          'ADMIN_PASSWORD must be set to a strong temporary password of at least 12 characters ' +
          'when CREATE_ADMIN_USER=true.'
        );
      }

      // Go through the app's own createUser/getUserByEmail (lib/auth/utils.ts)
      // instead of a raw findOne/insertOne on ADMIN_EMAIL as typed. createUser
      // already normalises with trim().toLowerCase() and getUserByEmail already
      // matches case-insensitively; an exact-case findOne here (the old code)
      // could miss a self-registered account differing only in case and insert a
      // second, differently-cased admin row that the app's own case-insensitive
      // login may never reach — a silent, hard-to-diagnose lockout (gs#6).
      // Deferred to a dynamic import: lib/auth/utils.ts transitively imports
      // lib/mongodb.ts, whose module-level MONGODB_URI/DATABASE_NAME must be
      // computed AFTER resolveDbTarget() has loaded .env, not before (see
      // scripts/lib/db-target.ts).
      const { getUserByEmail, createUser } = await import('../lib/auth/utils');

      const existingAdmin = await getUserByEmail(adminEmail);

      if (existingAdmin) {
        console.log(`  ⚠ A user already exists for this email (stored as "${existingAdmin.email}", ` +
          `role "${existingAdmin.role}"). Not creating a duplicate account.`);
        console.log(`    To promote it instead, run: npx tsx scripts/promote-to-admin.ts ${existingAdmin.email}`);
      } else {
        const admin = await createUser(adminEmail, adminPassword, adminName, UserRole.ADMIN);
        console.log(`  ✓ Created admin user: ${admin.email}`);
        console.log('  IMPORTANT: Change the temporary admin password immediately after first login.');
      }
    }

    // Step 5: backfill users missing is_active (idempotent, dry-run by default).
    // authorize() (lib/auth/config.ts) rejects sign-in with `if (!user.is_active)`,
    // which is true when the field is simply ABSENT — but getSessionUserState
    // (lib/auth/utils.ts) reads a missing field as active (`is_active !== false`).
    // Legacy rows written before is_active existed are therefore active for an
    // already-signed-in session but unable to sign in again. This backfills the
    // data so both paths agree, rather than leaving it to whichever one runs
    // first; it never touches a row that already has an explicit true/false.
    console.log('\n🔎 Checking for users missing is_active...');
    const missingActiveFilter = { is_active: { $exists: false } };
    const missingActiveCount = await usersCollection.countDocuments(missingActiveFilter);
    if (missingActiveCount === 0) {
      console.log('  ✓ No users are missing is_active.');
    } else if (!WRITE) {
      console.log(
        `  ${missingActiveCount} user(s) are missing is_active (dry run — re-run with --write to set is_active: true).`
      );
    } else {
      const result = await usersCollection.updateMany(missingActiveFilter, {
        $set: { is_active: true, updated_at: new Date().toISOString() },
      });
      console.log(`  ✓ Set is_active: true on ${result.modifiedCount} user(s) that were missing it.`);
    }

    console.log('\n✅ Authentication schema migration completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await target.close();
  }
}

// Run migration
if (require.main === module) {
  migrateAuthSchema().then(() => process.exit(process.exitCode ?? 0));
}

export { migrateAuthSchema };
