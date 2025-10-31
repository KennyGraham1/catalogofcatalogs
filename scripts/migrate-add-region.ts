/**
 * Migration script to add region and location_name fields to merged_events table
 * Run this script to update existing databases
 */

import sqlite3 from 'sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'merged_catalogues.db');

function runMigration() {
  const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('Error opening database:', err);
      process.exit(1);
    }
    console.log('Connected to database');
  });

  db.serialize(() => {
    // Check if columns already exist
    db.all("PRAGMA table_info(merged_events)", (err, columns: any[]) => {
      if (err) {
        console.error('Error checking table schema:', err);
        db.close();
        process.exit(1);
      }

      const hasRegion = columns.some(col => col.name === 'region');
      const hasLocationName = columns.some(col => col.name === 'location_name');

      if (hasRegion && hasLocationName) {
        console.log('✓ Columns already exist, no migration needed');
        db.close();
        return;
      }

      console.log('Adding new columns to merged_events table...');

      // Add region column if it doesn't exist
      if (!hasRegion) {
        db.run('ALTER TABLE merged_events ADD COLUMN region TEXT', (err) => {
          if (err) {
            console.error('Error adding region column:', err);
          } else {
            console.log('✓ Added region column');
          }
        });
      }

      // Add location_name column if it doesn't exist
      if (!hasLocationName) {
        db.run('ALTER TABLE merged_events ADD COLUMN location_name TEXT', (err) => {
          if (err) {
            console.error('Error adding location_name column:', err);
          } else {
            console.log('✓ Added location_name column');
          }
        });
      }

      // Create index for region
      if (!hasRegion) {
        db.run('CREATE INDEX IF NOT EXISTS idx_merged_events_region ON merged_events(region)', (err) => {
          if (err) {
            console.error('Error creating region index:', err);
          } else {
            console.log('✓ Created index on region column');
          }
        });
      }

      // Close database after all operations
      setTimeout(() => {
        db.close((err) => {
          if (err) {
            console.error('Error closing database:', err);
          } else {
            console.log('\n✓ Migration completed successfully');
          }
        });
      }, 1000);
    });
  });
}

// Run migration
console.log('Starting migration: Add region and location_name fields\n');
runMigration();

