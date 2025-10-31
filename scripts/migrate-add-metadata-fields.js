/**
 * Database Migration: Add Enhanced Metadata Fields
 * 
 * This migration adds comprehensive metadata fields to the merged_catalogues table
 * to support enhanced catalogue documentation and provenance tracking.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(process.cwd(), 'merged_catalogues.db');

console.log('🔧 Starting metadata fields migration...');
console.log('Database:', dbPath);
console.log('');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  }
  console.log('✓ Connected to database');
});

// Check if columns already exist
function checkColumnExists(tableName, columnName) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        const exists = rows.some(row => row.name === columnName);
        resolve(exists);
      }
    });
  });
}

// Add column if it doesn't exist
function addColumnIfNotExists(tableName, columnName, columnDef) {
  return new Promise(async (resolve, reject) => {
    try {
      const exists = await checkColumnExists(tableName, columnName);
      
      if (exists) {
        console.log(`  ℹ Column '${columnName}' already exists, skipping`);
        resolve();
      } else {
        db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`, (err) => {
          if (err) {
            reject(err);
          } else {
            console.log(`  ✓ Added column '${columnName}'`);
            resolve();
          }
        });
      }
    } catch (error) {
      reject(error);
    }
  });
}

// Run migration
async function runMigration() {
  try {
    console.log('\n📊 Adding metadata fields to merged_catalogues table...\n');

    // Basic metadata
    await addColumnIfNotExists('merged_catalogues', 'description', 'TEXT');
    await addColumnIfNotExists('merged_catalogues', 'data_source', 'TEXT');
    await addColumnIfNotExists('merged_catalogues', 'provider', 'TEXT');
    
    // Geographic coverage
    await addColumnIfNotExists('merged_catalogues', 'geographic_region', 'TEXT');
    
    // Time period coverage
    await addColumnIfNotExists('merged_catalogues', 'time_period_start', 'DATETIME');
    await addColumnIfNotExists('merged_catalogues', 'time_period_end', 'DATETIME');
    
    // Quality and completeness
    await addColumnIfNotExists('merged_catalogues', 'data_quality', 'TEXT'); // JSON: {completeness, accuracy, reliability}
    await addColumnIfNotExists('merged_catalogues', 'quality_notes', 'TEXT');
    
    // Contact and attribution
    await addColumnIfNotExists('merged_catalogues', 'contact_name', 'TEXT');
    await addColumnIfNotExists('merged_catalogues', 'contact_email', 'TEXT');
    await addColumnIfNotExists('merged_catalogues', 'contact_organization', 'TEXT');
    
    // License and usage
    await addColumnIfNotExists('merged_catalogues', 'license', 'TEXT');
    await addColumnIfNotExists('merged_catalogues', 'usage_terms', 'TEXT');
    await addColumnIfNotExists('merged_catalogues', 'citation', 'TEXT');
    
    // Additional metadata
    await addColumnIfNotExists('merged_catalogues', 'doi', 'TEXT'); // Digital Object Identifier
    await addColumnIfNotExists('merged_catalogues', 'version', 'TEXT');
    await addColumnIfNotExists('merged_catalogues', 'keywords', 'TEXT'); // JSON array
    await addColumnIfNotExists('merged_catalogues', 'reference_links', 'TEXT'); // JSON array of references
    await addColumnIfNotExists('merged_catalogues', 'notes', 'TEXT');
    
    // Merge-specific metadata (for merged catalogues)
    await addColumnIfNotExists('merged_catalogues', 'merge_description', 'TEXT');
    await addColumnIfNotExists('merged_catalogues', 'merge_use_case', 'TEXT');
    await addColumnIfNotExists('merged_catalogues', 'merge_methodology', 'TEXT');
    await addColumnIfNotExists('merged_catalogues', 'merge_quality_assessment', 'TEXT');
    
    // Provenance tracking
    await addColumnIfNotExists('merged_catalogues', 'created_by', 'TEXT');
    await addColumnIfNotExists('merged_catalogues', 'modified_at', 'DATETIME');
    await addColumnIfNotExists('merged_catalogues', 'modified_by', 'TEXT');

    console.log('\n✅ Migration completed successfully!');
    console.log('');
    console.log('Added metadata fields:');
    console.log('  • Basic: description, data_source, provider, geographic_region');
    console.log('  • Time period: time_period_start, time_period_end');
    console.log('  • Quality: data_quality, quality_notes');
    console.log('  • Contact: contact_name, contact_email, contact_organization');
    console.log('  • License: license, usage_terms, citation, doi');
    console.log('  • Additional: version, keywords, reference_links, notes');
    console.log('  • Merge-specific: merge_description, merge_use_case, merge_methodology, merge_quality_assessment');
    console.log('  • Provenance: created_by, modified_at, modified_by');
    console.log('');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      } else {
        console.log('✓ Database connection closed');
      }
      process.exit(0);
    });
  }
}

// Run the migration
runMigration();

