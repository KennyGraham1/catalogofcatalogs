/**
 * Test Registration System
 * Run with: npx tsx scripts/test-registration.ts [--yes]
 */

import { resolveDbTarget } from './lib/db-target';
import { confirmWrite } from './lib/confirm';

const ASSUME_YES = process.argv.includes('--yes');

async function testRegistration() {
  console.log('🧪 Testing Registration System\n');

  // See scripts/migrate-add-region.ts for why this goes through lib/mongodb.ts's
  // getDb() instead of resolving MONGODB_URI/MONGODB_DATABASE itself (gs#3), and
  // why only the host is ever logged, never the full URI (gs#4) — this script
  // used to print `Connecting to: ${MONGODB_URI}` verbatim, credentials included.
  const target = await resolveDbTarget();

  try {
    // Test 1: Check environment variables
    console.log('1️⃣  Checking environment variables...');
    const requiredEnvVars = ['NEXTAUTH_SECRET', 'NEXTAUTH_URL', 'MONGODB_URI'];
    const missingVars = requiredEnvVars.filter(v => !process.env[v]);

    if (missingVars.length > 0) {
      console.log('   ❌ Missing environment variables:', missingVars.join(', '));
      console.log('   💡 Add these to your .env file\n');
    } else {
      console.log('   ✅ All required environment variables are set\n');
    }

    console.log('2️⃣  MongoDB connection...');
    console.log(`   Host: ${target.host}`);
    console.log(`   Database: ${target.db.databaseName}`);
    console.log('   ✅ MongoDB connection successful\n');

    const db = target.db;

    // Test 3: Check collections exist
    console.log('3️⃣  Checking database collections...');
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    const requiredCollections = ['users', 'user_roles'];
    const missingCollections = requiredCollections.filter(c => !collectionNames.includes(c));

    if (missingCollections.length > 0) {
      console.log('   ❌ Missing collections:', missingCollections.join(', '));
      console.log('   💡 Run: npm run migrate:auth\n');
    } else {
      console.log('   ✅ All required collections exist\n');
    }

    // Test 4: Check user_roles collection
    console.log('4️⃣  Checking user roles...');
    const rolesCollection = db.collection('user_roles');
    const roles = await rolesCollection.find({}).toArray();

    if (roles.length === 0) {
      console.log('   ❌ No roles found in database');
      console.log('   💡 Run: npm run migrate:auth\n');
    } else {
      console.log(`   ✅ Found ${roles.length} roles:`);
      roles.forEach(role => {
        // migrate-auth-schema.ts writes { id, role, name, ... } — there has never
        // been a `role_id` field, so this printed "(undefined)" for every role.
        console.log(`      - ${role.name} (${role.id})`);
      });
      console.log('');
    }

    // Test 5: Check users collection
    console.log('5️⃣  Checking users collection...');
    const usersCollection = db.collection('users');
    const userCount = await usersCollection.countDocuments();
    console.log(`   ℹ️  Total users in database: ${userCount}\n`);

    // Test 6: Check indexes
    console.log('6️⃣  Checking database indexes...');
    const indexes = await usersCollection.indexes();
    const hasEmailIndex = indexes.some(idx => idx.key.email);

    if (!hasEmailIndex) {
      console.log('   ⚠️  Email index not found');
      console.log('   💡 Run: npm run migrate:auth\n');
    } else {
      console.log('   ✅ Email index exists\n');
    }

    // Test 7: Test API endpoint (creates and deletes a throwaway user — confirm first)
    console.log('7️⃣  Testing registration API endpoint...');

    const decision = await confirmWrite(
      target,
      `About to POST a throwaway user to the registration API and delete it from ` +
        `database "${target.db.databaseName}".`,
      'yes',
      ASSUME_YES,
    );

    if (!decision.ok) {
      console.log(`   ⏭  Skipped: ${decision.reason}\n`);
    } else {
      const testEmail = `test_${Date.now()}@example.com`;
      const testData = {
        name: 'Test User',
        email: testEmail,
        password: 'testpassword123'
      };

      try {
        const response = await fetch('http://localhost:3001/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(testData),
        });

        if (response.ok) {
          const data = await response.json();
          console.log('   ✅ API endpoint is working!');
          console.log(`   Created test user: ${data.user.email}`);
          console.log(`   User ID: ${data.user.id}`);
          console.log(`   Role: ${data.user.role}\n`);

          // Clean up test user
          await usersCollection.deleteOne({ email: testEmail });
          console.log('   🧹 Cleaned up test user\n');
        } else {
          const error = await response.json();
          console.log(`   ❌ API returned error: ${response.status}`);
          console.log(`   Error: ${error.error}\n`);
        }
      } catch (fetchError) {
        console.log('   ❌ Could not connect to API endpoint');
        console.log('   💡 Make sure the dev server is running: npm run dev');
        console.log(`   Error: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}\n`);
      }
    }

    // Summary
    console.log('━'.repeat(50));
    console.log('📊 Summary\n');

    if (missingVars.length === 0 && missingCollections.length === 0 && roles.length > 0) {
      console.log('✅ Registration system is properly configured!');
      console.log('\n📝 Next steps:');
      console.log('   1. Make sure dev server is running: npm run dev');
      console.log('   2. Navigate to: http://localhost:3001/register');
      console.log('   3. Try creating an account');
    } else {
      console.log('⚠️  Some issues were found. Please fix them:');
      if (missingVars.length > 0) {
        console.log(`   - Add missing environment variables: ${missingVars.join(', ')}`);
      }
      if (missingCollections.length > 0 || roles.length === 0) {
        console.log('   - Run database migration: npm run migrate:auth');
      }
    }

    console.log('━'.repeat(50));

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    console.log('\n💡 Troubleshooting tips:');
    console.log('   1. Make sure MongoDB is running');
    console.log('   2. Check your .env file has correct MONGODB_URI');
    console.log('   3. Run: npm run migrate:auth');
    console.log('   4. Check docs/source/appendix/troubleshooting_registration.rst');
    process.exitCode = 1;
  } finally {
    await target.close();
  }
}

if (require.main === module) {
  testRegistration()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .then(() => process.exit(process.exitCode ?? 0));
}

export { testRegistration };
