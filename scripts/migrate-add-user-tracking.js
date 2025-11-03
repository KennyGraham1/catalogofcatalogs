/**
 * Migration: Add user tracking fields to merged_catalogues table
 * 
 * Adds created_by, modified_at, and modified_by columns to track
 * which user created or modified each catalogue.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(process.cwd(), 'merged_catalogues.db');
const db = new sqlite3.Database(dbPath);

console.log('Starting migration: Add user tracking fields to merged_catalogues');

db.serialize(() => {
  // Add created_by column
  db.run(`
    ALTER TABLE merged_catalogues 
    ADD COLUMN created_by TEXT
  `, (err) => {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('✓ Column created_by already exists');
      } else {
        console.error('Error adding created_by column:', err.message);
      }
    } else {
      console.log('✓ Added column: created_by');
    }
  });

  // Add modified_at column
  db.run(`
    ALTER TABLE merged_catalogues 
    ADD COLUMN modified_at DATETIME
  `, (err) => {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('✓ Column modified_at already exists');
      } else {
        console.error('Error adding modified_at column:', err.message);
      }
    } else {
      console.log('✓ Added column: modified_at');
    }
  });

  // Add modified_by column
  db.run(`
    ALTER TABLE merged_catalogues 
    ADD COLUMN modified_by TEXT
  `, (err) => {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('✓ Column modified_by already exists');
      } else {
        console.error('Error adding modified_by column:', err.message);
      }
    } else {
      console.log('✓ Added column: modified_by');
    }
  });

  // Create index on created_by for faster queries
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_merged_catalogues_created_by 
    ON merged_catalogues(created_by)
  `, (err) => {
    if (err) {
      console.error('Error creating index on created_by:', err.message);
    } else {
      console.log('✓ Created index: idx_merged_catalogues_created_by');
    }
  });

  // Create index on modified_by for faster queries
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_merged_catalogues_modified_by 
    ON merged_catalogues(modified_by)
  `, (err) => {
    if (err) {
      console.error('Error creating index on modified_by:', err.message);
    } else {
      console.log('✓ Created index: idx_merged_catalogues_modified_by');
    }
  });

  // Verify the migration
  db.all(`PRAGMA table_info(merged_catalogues)`, (err, rows) => {
    if (err) {
      console.error('Error verifying migration:', err.message);
    } else {
      const hasCreatedBy = rows.some(row => row.name === 'created_by');
      const hasModifiedAt = rows.some(row => row.name === 'modified_at');
      const hasModifiedBy = rows.some(row => row.name === 'modified_by');

      console.log('\nMigration verification:');
      console.log(`  created_by: ${hasCreatedBy ? '✓' : '✗'}`);
      console.log(`  modified_at: ${hasModifiedAt ? '✓' : '✗'}`);
      console.log(`  modified_by: ${hasModifiedBy ? '✓' : '✗'}`);

      if (hasCreatedBy && hasModifiedAt && hasModifiedBy) {
        console.log('\n✅ Migration completed successfully!');
      } else {
        console.log('\n⚠️  Migration incomplete - some columns are missing');
      }
    }

    db.close();
  });
});

