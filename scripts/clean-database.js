const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Pass --yes through if the caller supplied it, so `node scripts/clean-database.js
// --yes` can run non-interactively (e.g. from clean-and-setup-database.sh).
const extraArgs = process.argv.slice(2).includes('--yes') ? ['--yes'] : [];

console.log('🧹 Cleaning Database...');
console.log('================================\n');

// Remove the legacy SQLite file, if one is still lying around from before the
// MongoDB migration (a542dc1). Harmless no-op otherwise.
const dbPath = path.join(process.cwd(), 'merged_catalogues.db');
if (fs.existsSync(dbPath)) {
  console.log('✓ Removing old SQLite file...');
  fs.unlinkSync(dbPath);
  console.log('✓ SQLite file removed\n');
}

console.log('🗄️  Resetting MongoDB...');
console.log('================================\n');

// The actual database wipe, with its own "type the database name" confirmation
// (scripts/lib/db-reset.ts) — this used to be a no-op here (it only ever deleted
// the SQLite file above), so every catalogue and event survived a "clean".
// stdio: 'inherit' so the interactive confirmation prompt reaches this terminal.
try {
  execSync(`npx tsx scripts/lib/db-reset.ts ${extraArgs.join(' ')}`.trim(), { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Database reset failed or was not confirmed:', error.message);
  process.exit(1);
}

console.log('\n🔧 Initializing Database Schema...');
console.log('================================\n');

try {
  execSync('npx tsx scripts/init-database.ts', { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Database initialization failed:', error.message);
  process.exit(1);
}

console.log('\n✅ Database is clean and re-initialized (empty).');
console.log('================================\n');

// scripts/populate-realistic-nz-data.ts, previously invoked here, was deleted in
// 401ffa0 — this step has not run successfully since before the MongoDB
// migration. Point at the population paths that actually exist instead of
// shelling out to a missing script.
console.log('📊 Populate it with data');
console.log('================================\n');
console.log('This script no longer populates synthetic data itself. To add data:');
console.log('');
console.log('  Synthetic NZ test catalogues (writes JSON files, then import via the UI/API):');
console.log('    python3 scripts/generate_test_data.py');
console.log('');
console.log('  Real GeoNet baseline catalogue:');
console.log('    npx tsx scripts/populate-geonet-baseline.ts');
console.log('');
console.log('  Or visit http://localhost:3000/import to import data manually.');
console.log('');
