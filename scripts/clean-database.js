const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🧹 Cleaning Database...');
console.log('================================\n');

// Remove old database file
const dbPath = path.join(process.cwd(), 'merged_catalogues.db');
if (fs.existsSync(dbPath)) {
  console.log('✓ Removing old database file...');
  fs.unlinkSync(dbPath);
  console.log('✓ Database file removed\n');
} else {
  console.log('ℹ No existing database file found\n');
}

console.log('🔧 Running Database Migration...');
console.log('================================\n');

// Run migration script
try {
  execSync('npx tsx scripts/migrate-database.ts', { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
}

console.log('\n📊 Populating Test Data...');
console.log('================================\n');

// Run test data population script
try {
  execSync('node scripts/populate-test-data.js', { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Test data population failed:', error.message);
  process.exit(1);
}

console.log('\n✅ Database setup complete!');
console.log('================================\n');
console.log('Summary:');
console.log('- Old database removed');
console.log('- New database created with QuakeML 1.2 schema');
console.log('- Test data populated (5 catalogues, ~192 events)\n');
console.log('You can now start the application with: npm run dev\n');

