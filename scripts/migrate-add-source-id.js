/**
 * Migration script to add source_id column to merged_events table
 * and create import_history table
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'merged_catalogues.db');

console.log('🔄 Running database migration...\n');
console.log(`Database: ${dbPath}\n`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to database\n');
});

db.serialize(() => {
  // Check if source_id column exists
  db.all(`PRAGMA table_info(merged_events)`, (err, columns) => {
    if (err) {
      console.error('❌ Error checking table info:', err.message);
      db.close();
      process.exit(1);
    }
    
    const hasSourceId = columns.some(col => col.name === 'source_id');
    
    if (!hasSourceId) {
      console.log('📝 Adding source_id column to merged_events table...');
      db.run(`ALTER TABLE merged_events ADD COLUMN source_id TEXT`, (err) => {
        if (err) {
          console.error('❌ Error adding source_id column:', err.message);
          db.close();
          process.exit(1);
        }
        console.log('✅ Added source_id column\n');
        
        // Create index
        console.log('📝 Creating index on source_id...');
        db.run(`CREATE INDEX IF NOT EXISTS idx_merged_events_source_id ON merged_events(source_id)`, (err) => {
          if (err) {
            console.error('❌ Error creating index:', err.message);
            db.close();
            process.exit(1);
          }
          console.log('✅ Created index on source_id\n');
          
          createImportHistoryTable();
        });
      });
    } else {
      console.log('ℹ️  source_id column already exists\n');
      createImportHistoryTable();
    }
  });
});

function createImportHistoryTable() {
  // Check if import_history table exists
  db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='import_history'`, (err, row) => {
    if (err) {
      console.error('❌ Error checking for import_history table:', err.message);
      db.close();
      process.exit(1);
    }
    
    if (!row) {
      console.log('📝 Creating import_history table...');
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
          db.close();
          process.exit(1);
        }
        console.log('✅ Created import_history table\n');
        
        // Create indexes
        console.log('📝 Creating indexes on import_history...');
        db.run(`CREATE INDEX IF NOT EXISTS idx_import_history_catalogue_id ON import_history(catalogue_id)`, (err) => {
          if (err) {
            console.error('❌ Error creating catalogue_id index:', err.message);
            db.close();
            process.exit(1);
          }
          
          db.run(`CREATE INDEX IF NOT EXISTS idx_import_history_created_at ON import_history(created_at)`, (err) => {
            if (err) {
              console.error('❌ Error creating created_at index:', err.message);
              db.close();
              process.exit(1);
            }
            console.log('✅ Created indexes on import_history\n');
            
            finishMigration();
          });
        });
      });
    } else {
      console.log('ℹ️  import_history table already exists\n');
      finishMigration();
    }
  });
}

function finishMigration() {
  db.close((err) => {
    if (err) {
      console.error('❌ Error closing database:', err.message);
      process.exit(1);
    }
    console.log('✅ Database migration completed successfully!\n');
  });
}

