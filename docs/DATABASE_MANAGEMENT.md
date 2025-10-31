# Database Storage and Maintenance Guide

## 📁 Database File Locations

### Current Database Files

**Primary Database**: `merged_catalogues.db`
- **Location**: `/home/kennyg/projects/catalogofcatalogs/merged_catalogues.db` (project root)
- **Size**: ~252 KB (as of last check)
- **Purpose**: Main application database storing all catalogues, events, and metadata
- **Format**: SQLite 3 database file

**Configuration**: Defined in `lib/db.ts` line 188:
```typescript
db = new sqlite3.Database(join(process.cwd(), 'merged_catalogues.db'));
```

### Database File Naming Convention

**Current Convention**:
- Main database: `merged_catalogues.db`
- Journal files (auto-generated): `merged_catalogues.db-journal`
- WAL files (if enabled): `merged_catalogues.db-wal`, `merged_catalogues.db-shm`

**Recommended Convention for Backups**:
- Timestamped backups: `merged_catalogues_backup_YYYY-MM-DD_HH-MM-SS.db`
- Pre-migration backups: `merged_catalogues_pre_migration_v{version}.db`
- Development snapshots: `merged_catalogues_dev_snapshot_{description}.db`

---

## 🔒 Version Control Considerations

### Current .gitignore Configuration

The database files are **already excluded** from version control in `.gitignore`:

```gitignore
# database files
*.db
*.db-journal
*.db-shm
*.db-wal
```

**Lines 38-42** in `.gitignore`

### ✅ Best Practice: Database Files Should NOT Be in Git

**Reasons**:
1. **Size**: Database files can grow large (MBs to GBs)
2. **Binary Format**: Git doesn't handle binary diffs efficiently
3. **Merge Conflicts**: Impossible to resolve database merge conflicts
4. **Security**: May contain sensitive earthquake data or user information
5. **Environment-Specific**: Each developer/environment should have their own database

**Current Status**: ✅ **CORRECT** - Database files are properly excluded

---

## 🗄️ Database Schema

### Tables

The database contains the following tables (defined in `lib/db.ts`):

1. **`merged_catalogues`** (lines 197-207)
   - Stores catalogue metadata
   - Fields: id, name, created_at, source_catalogues, merge_config, event_count, status

2. **`merged_events`** (lines 209-263)
   - Stores earthquake events with full QuakeML 1.2 schema
   - 29 additional fields beyond basic event data
   - Fields include: time, latitude, longitude, depth, magnitude, uncertainties, quality metrics, focal mechanisms, picks, arrivals

3. **`mapping_templates`** (lines 265-283)
   - Stores field mapping templates for data import
   - Fields: id, name, description, mapping, created_at, updated_at

4. **`import_history`** (lines 288-302)
   - Tracks GeoNet import history
   - Fields: id, catalogue_id, start_time, end_time, total_fetched, new_events, updated_events, skipped_events, errors, created_at

### Indexes

- `idx_merged_events_catalogue_id` - Fast catalogue lookups
- `idx_merged_events_time` - Time-based queries
- `idx_merged_events_magnitude` - Magnitude filtering
- `idx_mapping_templates_name` - Template name lookups
- `idx_import_history_catalogue_id` - Import history by catalogue
- `idx_import_history_created_at` - Recent imports

---

## 🛠️ Database Maintenance Scripts

### Available Scripts

Located in `scripts/` directory:

#### 1. **`clean-database.js`** (Node.js)
**Purpose**: Complete database reset and repopulation

**What it does**:
- Removes existing `merged_catalogues.db`
- Runs migration script to create fresh schema
- Populates test data

**Usage**:
```bash
node scripts/clean-database.js
```

**When to use**:
- Schema changes require fresh start
- Database corruption
- Development reset needed

---

#### 2. **`clean-and-setup-database.sh`** (Bash)
**Purpose**: Same as clean-database.js but as shell script

**What it does**:
- Removes `merged_catalogues.db`
- Runs `migrate-database.ts`
- Runs `populate-test-data.js`

**Usage**:
```bash
bash scripts/clean-and-setup-database.sh
# or
chmod +x scripts/clean-and-setup-database.sh
./scripts/clean-and-setup-database.sh
```

**Output**:
- Creates new database with QuakeML 1.2 schema
- Populates 5 catalogues with ~192 test events

---

#### 3. **`migrate-database.ts`** (TypeScript)
**Purpose**: Database schema migration (adds QuakeML 1.2 columns)

**What it does**:
- Adds new columns to existing `merged_events` table
- Non-destructive (preserves existing data)
- Adds QuakeML 1.2 fields if they don't exist

**Usage**:
```bash
npx tsx scripts/migrate-database.ts
```

**When to use**:
- Upgrading existing database to new schema
- Adding new fields without losing data

---

#### 4. **`migrate-add-source-id.js`** (Node.js)
**Purpose**: Adds `source_id` column and creates `import_history` table

**What it does**:
- Checks if `source_id` column exists
- Adds column if missing
- Creates `import_history` table for GeoNet imports

**Usage**:
```bash
node scripts/migrate-add-source-id.js
```

---

#### 5. **`populate-test-data.js`** (Node.js)
**Purpose**: Populate database with test earthquake data

**What it does**:
- Creates 5 test catalogues
- Inserts ~192 earthquake events
- Includes various magnitude ranges and locations

**Usage**:
```bash
node scripts/populate-test-data.js
```

**When to use**:
- After fresh database creation
- Development testing
- Demo data needed

---

#### 6. **`test-geonet-import.js`** (Node.js)
**Purpose**: Test GeoNet FDSN import functionality

**What it does**:
- Fetches real earthquake data from GeoNet
- Tests import service
- Validates data parsing

**Usage**:
```bash
node scripts/test-geonet-import.js
```

---

## 💾 Backup Strategy

### Recommended Backup Approach

#### 1. **Manual Backups**

**Before major changes**:
```bash
# Create timestamped backup
cp merged_catalogues.db "merged_catalogues_backup_$(date +%Y-%m-%d_%H-%M-%S).db"
```

**Before migrations**:
```bash
# Create pre-migration backup
cp merged_catalogues.db merged_catalogues_pre_migration_v2.db
```

#### 2. **Automated Backups** (Recommended for Production)

Create a backup script `scripts/backup-database.sh`:
```bash
#!/bin/bash
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
DB_FILE="merged_catalogues.db"

mkdir -p "$BACKUP_DIR"
cp "$DB_FILE" "$BACKUP_DIR/merged_catalogues_$TIMESTAMP.db"

# Keep only last 10 backups
ls -t "$BACKUP_DIR"/merged_catalogues_*.db | tail -n +11 | xargs -r rm

echo "✅ Backup created: $BACKUP_DIR/merged_catalogues_$TIMESTAMP.db"
```

**Usage**:
```bash
chmod +x scripts/backup-database.sh
./scripts/backup-database.sh
```

**Automate with cron** (Linux/Mac):
```bash
# Backup daily at 2 AM
0 2 * * * cd /path/to/catalogofcatalogs && ./scripts/backup-database.sh
```

#### 3. **Export to SQL Dump**

**Export entire database**:
```bash
sqlite3 merged_catalogues.db .dump > merged_catalogues_dump.sql
```

**Restore from dump**:
```bash
sqlite3 merged_catalogues_new.db < merged_catalogues_dump.sql
```

**Advantages**:
- Human-readable SQL
- Can be version controlled (if small)
- Easy to inspect changes

---

## 🔄 Migration Approach

### Adding New Columns (Non-Destructive)

**Example**: Adding a new field to `merged_events`

1. **Create migration script** `scripts/migrate-add-field.js`:
```javascript
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'merged_catalogues.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Check if column exists
  db.all(`PRAGMA table_info(merged_events)`, (err, columns) => {
    const hasNewField = columns.some(col => col.name === 'new_field_name');
    
    if (!hasNewField) {
      db.run(`ALTER TABLE merged_events ADD COLUMN new_field_name TEXT`, (err) => {
        if (err) {
          console.error('❌ Error adding column:', err.message);
        } else {
          console.log('✅ Column added successfully');
        }
      });
    } else {
      console.log('ℹ Column already exists');
    }
  });
});

db.close();
```

2. **Run migration**:
```bash
node scripts/migrate-add-field.js
```

### Schema Changes (Destructive)

For major schema changes:

1. **Backup current database**
2. **Export data to JSON/CSV**
3. **Run clean-database.js** to create new schema
4. **Re-import data** with transformation

---

## 📊 Database Inspection Tools

### SQLite Command Line

**Open database**:
```bash
sqlite3 merged_catalogues.db
```

**Useful commands**:
```sql
-- List all tables
.tables

-- Show table schema
.schema merged_events

-- Count events
SELECT COUNT(*) FROM merged_events;

-- Count catalogues
SELECT COUNT(*) FROM merged_catalogues;

-- Show recent imports
SELECT * FROM import_history ORDER BY created_at DESC LIMIT 5;

-- Exit
.quit
```

### GUI Tools

**Recommended**:
- **DB Browser for SQLite** (Free, cross-platform)
  - Download: https://sqlitebrowser.org/
  - Features: Visual schema editor, query builder, data browser

- **DBeaver** (Free, cross-platform)
  - Download: https://dbeaver.io/
  - Features: Advanced SQL editor, ER diagrams, data export

---

## 🚨 Common Issues and Solutions

### Issue 1: Database Locked

**Error**: `SQLITE_BUSY: database is locked`

**Causes**:
- Another process has the database open
- Development server is running
- Previous connection not closed

**Solutions**:
```bash
# Stop development server
# Kill any node processes
pkill -f "next dev"

# Check for lock files
ls -la merged_catalogues.db*

# Remove lock files (if safe)
rm merged_catalogues.db-journal
rm merged_catalogues.db-wal
rm merged_catalogues.db-shm
```

### Issue 2: Database Corruption

**Symptoms**:
- Errors reading data
- Unexpected query results
- File size anomalies

**Solutions**:
```bash
# Check integrity
sqlite3 merged_catalogues.db "PRAGMA integrity_check;"

# If corrupted, restore from backup
cp merged_catalogues_backup_YYYY-MM-DD.db merged_catalogues.db

# Or rebuild from scratch
node scripts/clean-database.js
```

### Issue 3: Schema Mismatch

**Error**: `no such column: ...`

**Solution**:
```bash
# Run latest migration
npx tsx scripts/migrate-database.ts

# Or rebuild database
node scripts/clean-database.js
```

---

## 📝 Summary

### ✅ Current Setup

- **Database File**: `merged_catalogues.db` in project root
- **Size**: ~252 KB
- **Version Control**: ✅ Properly excluded in `.gitignore`
- **Schema**: QuakeML 1.2 compliant with 4 tables
- **Maintenance Scripts**: 6 scripts available for various tasks

### 🎯 Recommendations

1. **Keep database files out of Git** ✅ (Already done)
2. **Create regular backups** before major changes
3. **Use migration scripts** for schema changes
4. **Document schema changes** in migration scripts
5. **Test migrations** on backup copy first
6. **Use `clean-database.js`** for fresh starts
7. **Use `migrate-database.ts`** for non-destructive updates

### 🔗 Related Files

- Database configuration: `lib/db.ts`
- Maintenance scripts: `scripts/` directory
- Git ignore rules: `.gitignore` (lines 38-42)
- Schema documentation: This file

---

**Last Updated**: 2025-10-25
**Database Version**: QuakeML 1.2 Schema
**Current Size**: ~252 KB

