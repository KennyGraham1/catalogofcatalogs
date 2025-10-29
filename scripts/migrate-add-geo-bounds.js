/**
 * Migration script to add geographic bounds columns to merged_catalogues table
 * and populate them from existing event data
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(process.cwd(), 'merged_catalogues.db');
const db = new sqlite3.Database(dbPath);

console.log('Starting migration: Add geographic bounds to catalogues...');

db.serialize(() => {
  // Add columns if they don't exist
  db.run(`
    ALTER TABLE merged_catalogues ADD COLUMN min_latitude REAL
  `, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding min_latitude:', err.message);
    } else {
      console.log('✓ Added min_latitude column');
    }
  });

  db.run(`
    ALTER TABLE merged_catalogues ADD COLUMN max_latitude REAL
  `, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding max_latitude:', err.message);
    } else {
      console.log('✓ Added max_latitude column');
    }
  });

  db.run(`
    ALTER TABLE merged_catalogues ADD COLUMN min_longitude REAL
  `, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding min_longitude:', err.message);
    } else {
      console.log('✓ Added min_longitude column');
    }
  });

  db.run(`
    ALTER TABLE merged_catalogues ADD COLUMN max_longitude REAL
  `, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding max_longitude:', err.message);
    } else {
      console.log('✓ Added max_longitude column');
    }
  });

  // Wait a bit for columns to be added, then populate bounds
  setTimeout(() => {
    console.log('\nPopulating geographic bounds from existing events...');
    
    db.all('SELECT id FROM merged_catalogues', [], (err, catalogues) => {
      if (err) {
        console.error('Error fetching catalogues:', err.message);
        db.close();
        return;
      }

      if (!catalogues || catalogues.length === 0) {
        console.log('No catalogues found.');
        db.close();
        return;
      }

      let processed = 0;
      catalogues.forEach((catalogue) => {
        db.get(
          `SELECT 
            MIN(latitude) as min_lat,
            MAX(latitude) as max_lat,
            MIN(longitude) as min_lon,
            MAX(longitude) as max_lon
          FROM merged_events
          WHERE catalogue_id = ?`,
          [catalogue.id],
          (err, bounds) => {
            if (err) {
              console.error(`Error calculating bounds for catalogue ${catalogue.id}:`, err.message);
            } else if (bounds && bounds.min_lat !== null) {
              db.run(
                `UPDATE merged_catalogues 
                SET min_latitude = ?, max_latitude = ?, min_longitude = ?, max_longitude = ?
                WHERE id = ?`,
                [bounds.min_lat, bounds.max_lat, bounds.min_lon, bounds.max_lon, catalogue.id],
                (err) => {
                  if (err) {
                    console.error(`Error updating bounds for catalogue ${catalogue.id}:`, err.message);
                  } else {
                    console.log(`✓ Updated bounds for catalogue ${catalogue.id}`);
                  }
                  
                  processed++;
                  if (processed === catalogues.length) {
                    console.log('\n✓ Migration completed successfully!');
                    db.close();
                  }
                }
              );
            } else {
              console.log(`⚠ No events found for catalogue ${catalogue.id}`);
              processed++;
              if (processed === catalogues.length) {
                console.log('\n✓ Migration completed successfully!');
                db.close();
              }
            }
          }
        );
      });
    });
  }, 1000);
});

