/**
 * Database Migration Script
 * Adds QuakeML 1.2 columns to existing merged_events table
 */

import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'merged_catalogues.db');

function runMigration() {
  const db = new sqlite3.Database(dbPath);

  console.log('Starting database migration...');

  db.serialize(() => {
    // Add new columns for QuakeML 1.2 support
    const alterTableStatements = [
      // Event metadata
      'ALTER TABLE merged_events ADD COLUMN event_public_id TEXT',
      'ALTER TABLE merged_events ADD COLUMN event_type TEXT',
      'ALTER TABLE merged_events ADD COLUMN event_type_certainty TEXT',
      
      // Origin uncertainties
      'ALTER TABLE merged_events ADD COLUMN time_uncertainty REAL',
      'ALTER TABLE merged_events ADD COLUMN latitude_uncertainty REAL',
      'ALTER TABLE merged_events ADD COLUMN longitude_uncertainty REAL',
      'ALTER TABLE merged_events ADD COLUMN depth_uncertainty REAL',
      
      // Magnitude details
      'ALTER TABLE merged_events ADD COLUMN magnitude_type TEXT',
      'ALTER TABLE merged_events ADD COLUMN magnitude_uncertainty REAL',
      'ALTER TABLE merged_events ADD COLUMN magnitude_station_count INTEGER',
      
      // Origin quality metrics
      'ALTER TABLE merged_events ADD COLUMN azimuthal_gap REAL',
      'ALTER TABLE merged_events ADD COLUMN used_phase_count INTEGER',
      'ALTER TABLE merged_events ADD COLUMN used_station_count INTEGER',
      'ALTER TABLE merged_events ADD COLUMN standard_error REAL',
      
      // Evaluation metadata
      'ALTER TABLE merged_events ADD COLUMN evaluation_mode TEXT',
      'ALTER TABLE merged_events ADD COLUMN evaluation_status TEXT',
      
      // Preferred IDs
      'ALTER TABLE merged_events ADD COLUMN preferred_origin_id TEXT',
      'ALTER TABLE merged_events ADD COLUMN preferred_magnitude_id TEXT',
      
      // Complex nested data (stored as JSON)
      'ALTER TABLE merged_events ADD COLUMN origin_quality TEXT',
      'ALTER TABLE merged_events ADD COLUMN origins TEXT',
      'ALTER TABLE merged_events ADD COLUMN magnitudes TEXT',
      'ALTER TABLE merged_events ADD COLUMN picks TEXT',
      'ALTER TABLE merged_events ADD COLUMN arrivals TEXT',
      'ALTER TABLE merged_events ADD COLUMN focal_mechanisms TEXT',
      'ALTER TABLE merged_events ADD COLUMN amplitudes TEXT',
      'ALTER TABLE merged_events ADD COLUMN station_magnitudes TEXT',
      'ALTER TABLE merged_events ADD COLUMN event_descriptions TEXT',
      'ALTER TABLE merged_events ADD COLUMN comments TEXT',
      'ALTER TABLE merged_events ADD COLUMN creation_info TEXT',
    ];

    let completed = 0;
    let errors = 0;

    alterTableStatements.forEach((statement, index) => {
      db.run(statement, (err) => {
        if (err) {
          // Ignore "duplicate column name" errors (column already exists)
          if (err.message.includes('duplicate column name')) {
            console.log(`Column already exists (skipping): ${statement.match(/ADD COLUMN (\w+)/)?.[1]}`);
          } else {
            console.error(`Error executing statement ${index + 1}:`, err.message);
            errors++;
          }
        } else {
          console.log(`✓ Added column: ${statement.match(/ADD COLUMN (\w+)/)?.[1]}`);
        }
        
        completed++;
        
        if (completed === alterTableStatements.length) {
          // Create indexes after all columns are added
          console.log('\nCreating indexes...');
          
          const indexStatements = [
            'CREATE INDEX IF NOT EXISTS idx_merged_events_event_type ON merged_events(event_type)',
            'CREATE INDEX IF NOT EXISTS idx_merged_events_magnitude_type ON merged_events(magnitude_type)',
            'CREATE INDEX IF NOT EXISTS idx_merged_events_evaluation_status ON merged_events(evaluation_status)',
            'CREATE INDEX IF NOT EXISTS idx_merged_events_azimuthal_gap ON merged_events(azimuthal_gap)',
          ];
          
          let indexCompleted = 0;
          
          indexStatements.forEach((statement, index) => {
            db.run(statement, (err) => {
              if (err) {
                console.error(`Error creating index ${index + 1}:`, err.message);
              } else {
                console.log(`✓ Created index: ${statement.match(/idx_\w+/)?.[0]}`);
              }
              
              indexCompleted++;
              
              if (indexCompleted === indexStatements.length) {
                db.close((err) => {
                  if (err) {
                    console.error('Error closing database:', err.message);
                    process.exit(1);
                  }
                  
                  console.log('\n✅ Migration completed successfully!');
                  console.log(`   Columns added/verified: ${alterTableStatements.length}`);
                  console.log(`   Indexes created: ${indexStatements.length}`);
                  console.log(`   Errors: ${errors}`);
                  process.exit(0);
                });
              }
            });
          });
        }
      });
    });
  });
}

// Run migration
runMigration();

