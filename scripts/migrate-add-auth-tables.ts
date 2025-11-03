/**
 * Database Migration: Add Authentication Tables
 * 
 * This migration adds the following tables:
 * - users: User accounts with roles and authentication
 * - sessions: User sessions for authentication
 * - api_keys: API keys for programmatic access
 * - audit_logs: Audit trail for all user actions
 */

import { join } from 'path';
import sqlite3 from 'sqlite3';

const DB_PATH = join(process.cwd(), 'merged_catalogues.db');

function runMigration() {
  return new Promise<void>((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }

      console.log('Starting migration: Add authentication tables\n');

      // SQL statements for creating authentication tables
      const statements = [
        // Users table
        `CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name TEXT,
          role TEXT NOT NULL DEFAULT 'viewer',
          is_active INTEGER NOT NULL DEFAULT 1,
          email_verified INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_login DATETIME,
          CONSTRAINT role_check CHECK (role IN ('admin', 'editor', 'viewer'))
        )`,

        // Sessions table
        `CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token TEXT UNIQUE NOT NULL,
          expires_at DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          ip_address TEXT,
          user_agent TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        // API Keys table
        `CREATE TABLE IF NOT EXISTS api_keys (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          key_hash TEXT UNIQUE NOT NULL,
          key_prefix TEXT NOT NULL,
          scopes TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          expires_at DATETIME,
          last_used_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        // Audit Logs table
        `CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          action TEXT NOT NULL,
          resource_type TEXT NOT NULL,
          resource_id TEXT,
          details TEXT,
          ip_address TEXT,
          user_agent TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )`,

        // Indexes for users table
        `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
        `CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`,
        `CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active)`,

        // Indexes for sessions table
        `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)`,
        `CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`,

        // Indexes for api_keys table
        `CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash)`,
        `CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active)`,

        // Indexes for audit_logs table
        `CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`,
        `CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type)`,
        `CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)`,
      ];

      let completed = 0;
      const total = statements.length;

      statements.forEach((sql, index) => {
        db.run(sql, (err) => {
          if (err) {
            console.error(`Error executing statement ${index + 1}:`, err.message);
          } else {
            completed++;
            if (index < 4) {
              console.log(`✓ Created table: ${sql.match(/TABLE IF NOT EXISTS (\w+)/)?.[1]}`);
            } else {
              console.log(`✓ Created index: ${sql.match(/INDEX IF NOT EXISTS (\w+)/)?.[1]}`);
            }
          }

          if (completed === total) {
            console.log('\n✅ Migration completed successfully!');
            console.log(`   Tables created: 4`);
            console.log(`   Indexes created: ${total - 4}`);
            
            db.close((err) => {
              if (err) {
                console.error('Error closing database:', err);
                reject(err);
              } else {
                resolve();
              }
            });
          }
        });
      });
    });
  });
}

// Run migration
runMigration()
  .then(() => {
    console.log('\n🎉 Authentication tables migration complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });

