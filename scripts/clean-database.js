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

console.log('🔧 Initializing Database Schema...');
console.log('================================\n');

// Run database initialization script
try {
  execSync('npx tsx scripts/init-database.ts', { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Database initialization failed:', error.message);
  process.exit(1);
}

console.log('\n📊 Populating Realistic NZ Earthquake Data...');
console.log('================================\n');

// Run realistic NZ data population script
try {
  execSync('npx tsx scripts/populate-realistic-nz-data.ts', { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Data population failed:', error.message);
  process.exit(1);
}

console.log('\n✅ Database setup complete!');
console.log('================================\n');

// Optional: Populate GeoNet baseline catalogue with real data
console.log('📡 GeoNet Baseline Catalogue (Optional)');
console.log('================================\n');
console.log('Would you like to import real earthquake data from GeoNet?');
console.log('This will create a baseline catalogue with actual NZ seismic data.');
console.log('');
console.log('To import GeoNet data now, run:');
console.log('  npx tsx scripts/populate-geonet-baseline.ts');
console.log('');
console.log('Or visit http://localhost:3000/import to import data manually.');
console.log('');

