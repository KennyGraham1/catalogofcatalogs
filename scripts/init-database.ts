/**
 * Initialize Database Schema
 * Creates all tables from scratch
 */

import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'merged_catalogues.db');

function initializeDatabase() {
  const db = new sqlite3.Database(dbPath);

  console.log('🔧 Initializing database schema...\n');

  db.serialize(() => {
    // Create merged_catalogues table
    db.run(`
      CREATE TABLE IF NOT EXISTS merged_catalogues (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        source_catalogues TEXT NOT NULL,
        merge_config TEXT NOT NULL,
        event_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'processing',
        min_latitude REAL,
        max_latitude REAL,
        min_longitude REAL,
        max_longitude REAL
      )
    `, (err) => {
      if (err) {
        console.error('❌ Error creating merged_catalogues table:', err.message);
      } else {
        console.log('✓ Created merged_catalogues table');
      }
    });

    // Create merged_events table with full QuakeML 1.2 schema
    db.run(`
      CREATE TABLE IF NOT EXISTS merged_events (
        id TEXT PRIMARY KEY,
        catalogue_id TEXT NOT NULL,
        source_id TEXT,
        time DATETIME NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        depth REAL,
        magnitude REAL NOT NULL,
        source_events TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        -- QuakeML 1.2 Event metadata
        event_public_id TEXT,
        event_type TEXT,
        event_type_certainty TEXT,

        -- Origin uncertainties
        time_uncertainty REAL,
        latitude_uncertainty REAL,
        longitude_uncertainty REAL,
        depth_uncertainty REAL,

        -- Magnitude details
        magnitude_type TEXT,
        magnitude_uncertainty REAL,
        magnitude_station_count INTEGER,

        -- Origin quality metrics
        azimuthal_gap REAL,
        used_phase_count INTEGER,
        used_station_count INTEGER,
        standard_error REAL,

        -- Evaluation metadata
        evaluation_mode TEXT,
        evaluation_status TEXT,

        -- Complex nested data as JSON
        origin_quality TEXT,
        origins TEXT,
        magnitudes TEXT,
        picks TEXT,
        arrivals TEXT,
        focal_mechanisms TEXT,
        amplitudes TEXT,
        station_magnitudes TEXT,
        event_descriptions TEXT,
        comments TEXT,
        creation_info TEXT,

        FOREIGN KEY (catalogue_id) REFERENCES merged_catalogues(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) {
        console.error('❌ Error creating merged_events table:', err.message);
      } else {
        console.log('✓ Created merged_events table');
      }
    });

    // Create mapping_templates table
    db.run(`
      CREATE TABLE IF NOT EXISTS mapping_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        mappings TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error('❌ Error creating mapping_templates table:', err.message);
      } else {
        console.log('✓ Created mapping_templates table');
      }
    });

    // Create import_history table
    db.run(`
      CREATE TABLE IF NOT EXISTS import_history (
        id TEXT PRIMARY KEY,
        catalogue_id TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        total_fetched INTEGER NOT NULL,
        new_events INTEGER NOT NULL,
        updated_events INTEGER NOT NULL,
        skipped_events INTEGER NOT NULL,
        errors TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (catalogue_id) REFERENCES merged_catalogues(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) {
        console.error('❌ Error creating import_history table:', err.message);
      } else {
        console.log('✓ Created import_history table');
      }
    });

    // Create indexes
    console.log('\n🔍 Creating indexes...');

    const indexes = [
      // Single column indexes
      'CREATE INDEX IF NOT EXISTS idx_merged_events_catalogue_id ON merged_events(catalogue_id)',
      'CREATE INDEX IF NOT EXISTS idx_merged_events_source_id ON merged_events(source_id)',
      'CREATE INDEX IF NOT EXISTS idx_merged_events_time ON merged_events(time)',
      'CREATE INDEX IF NOT EXISTS idx_merged_events_magnitude ON merged_events(magnitude)',
      'CREATE INDEX IF NOT EXISTS idx_merged_events_depth ON merged_events(depth)',
      'CREATE INDEX IF NOT EXISTS idx_merged_events_latitude ON merged_events(latitude)',
      'CREATE INDEX IF NOT EXISTS idx_merged_events_longitude ON merged_events(longitude)',
      'CREATE INDEX IF NOT EXISTS idx_merged_events_event_type ON merged_events(event_type)',
      'CREATE INDEX IF NOT EXISTS idx_merged_events_magnitude_type ON merged_events(magnitude_type)',
      'CREATE INDEX IF NOT EXISTS idx_merged_events_evaluation_status ON merged_events(evaluation_status)',
      'CREATE INDEX IF NOT EXISTS idx_merged_events_azimuthal_gap ON merged_events(azimuthal_gap)',
      'CREATE INDEX IF NOT EXISTS idx_merged_events_used_station_count ON merged_events(used_station_count)',
      'CREATE INDEX IF NOT EXISTS idx_merged_events_standard_error ON merged_events(standard_error)',

      // Composite indexes for common query patterns
      'CREATE INDEX IF NOT EXISTS idx_merged_events_catalogue_time ON merged_events(catalogue_id, time DESC)',
      'CREATE INDEX IF NOT EXISTS idx_merged_events_catalogue_magnitude ON merged_events(catalogue_id, magnitude DESC)',
      'CREATE INDEX IF NOT EXISTS idx_merged_events_location ON merged_events(latitude, longitude)',

      // Other table indexes
      'CREATE INDEX IF NOT EXISTS idx_mapping_templates_name ON mapping_templates(name)',
      'CREATE INDEX IF NOT EXISTS idx_import_history_catalogue_id ON import_history(catalogue_id)',
      'CREATE INDEX IF NOT EXISTS idx_import_history_created_at ON import_history(created_at)'
    ];

    let indexCount = 0;
    indexes.forEach((indexSql) => {
      db.run(indexSql, (err) => {
        if (err) {
          console.error(`❌ Error creating index: ${err.message}`);
        } else {
          indexCount++;
          const indexName = indexSql.match(/idx_\w+/)?.[0];
          console.log(`✓ Created index: ${indexName}`);
        }

        if (indexCount === indexes.length) {
          db.close((err) => {
            if (err) {
              console.error('❌ Error closing database:', err.message);
              process.exit(1);
            }

            console.log('\n✅ Database schema initialized successfully!');
            console.log(`   Tables created: 4`);
            console.log(`   Indexes created: ${indexes.length}\n`);
            process.exit(0);
          });
        }
      });
    });
  });
}

// Run initialization
initializeDatabase();

