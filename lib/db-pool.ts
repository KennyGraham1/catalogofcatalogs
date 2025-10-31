/**
 * Database connection pool for SQLite
 * 
 * Note: SQLite handles concurrent reads well but serializes writes.
 * This pool provides better concurrency handling and connection management.
 */

import sqlite3 from 'sqlite3';
import { promisify } from 'util';

interface PoolConfig {
  filename: string;
  maxConnections?: number;
  timeout?: number;
  busyTimeout?: number;
}

interface PoolConnection {
  db: sqlite3.Database;
  inUse: boolean;
  lastUsed: number;
}

export class DatabasePool {
  private connections: PoolConnection[] = [];
  private config: Required<PoolConfig>;
  private waitQueue: Array<(conn: PoolConnection) => void> = [];
  private stats = {
    totalConnections: 0,
    activeConnections: 0,
    waitingRequests: 0,
    totalQueries: 0,
    errors: 0,
  };

  constructor(config: PoolConfig) {
    this.config = {
      filename: config.filename,
      maxConnections: config.maxConnections || 5,
      timeout: config.timeout || 30000, // 30 seconds
      busyTimeout: config.busyTimeout || 5000, // 5 seconds
    };
  }

  /**
   * Initialize the connection pool
   */
  async initialize(): Promise<void> {
    // Create initial connection
    const conn = await this.createConnection();
    this.connections.push(conn);
    console.log(`[DB Pool] Initialized with 1 connection (max: ${this.config.maxConnections})`);
  }

  /**
   * Create a new database connection
   */
  private async createConnection(): Promise<PoolConnection> {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.config.filename, (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Set busy timeout to handle concurrent writes
        db.run(`PRAGMA busy_timeout = ${this.config.busyTimeout}`, (err) => {
          if (err) {
            reject(err);
            return;
          }

          // Enable WAL mode for better concurrency
          db.run('PRAGMA journal_mode = WAL', (err) => {
            if (err) {
              console.warn('[DB Pool] Failed to enable WAL mode:', err);
            }

            this.stats.totalConnections++;
            resolve({
              db,
              inUse: false,
              lastUsed: Date.now(),
            });
          });
        });
      });
    });
  }

  /**
   * Acquire a connection from the pool
   */
  async acquire(): Promise<PoolConnection> {
    // Try to find an available connection
    const available = this.connections.find(conn => !conn.inUse);
    
    if (available) {
      available.inUse = true;
      available.lastUsed = Date.now();
      this.stats.activeConnections++;
      return available;
    }

    // Create a new connection if under the limit
    if (this.connections.length < this.config.maxConnections) {
      const conn = await this.createConnection();
      conn.inUse = true;
      this.connections.push(conn);
      this.stats.activeConnections++;
      return conn;
    }

    // Wait for a connection to become available
    return new Promise((resolve, reject) => {
      this.stats.waitingRequests++;
      
      const timeout = setTimeout(() => {
        const index = this.waitQueue.indexOf(resolve);
        if (index > -1) {
          this.waitQueue.splice(index, 1);
          this.stats.waitingRequests--;
          reject(new Error('Connection pool timeout'));
        }
      }, this.config.timeout);

      this.waitQueue.push((conn) => {
        clearTimeout(timeout);
        this.stats.waitingRequests--;
        resolve(conn);
      });
    });
  }

  /**
   * Release a connection back to the pool
   */
  release(conn: PoolConnection): void {
    conn.inUse = false;
    conn.lastUsed = Date.now();
    this.stats.activeConnections--;

    // If there are waiting requests, give the connection to the next one
    const next = this.waitQueue.shift();
    if (next) {
      conn.inUse = true;
      this.stats.activeConnections++;
      next(conn);
    }
  }

  /**
   * Execute a query with automatic connection management
   */
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const conn = await this.acquire();
    
    try {
      this.stats.totalQueries++;
      const dbAll = promisify(conn.db.all.bind(conn.db)) as (sql: string, params?: any[]) => Promise<any[]>;
      const result = await dbAll(sql, params);
      return result as T[];
    } catch (error) {
      this.stats.errors++;
      throw error;
    } finally {
      this.release(conn);
    }
  }

  /**
   * Execute a single-row query
   */
  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    const conn = await this.acquire();
    
    try {
      this.stats.totalQueries++;
      const dbGet = promisify(conn.db.get.bind(conn.db)) as (sql: string, params?: any[]) => Promise<any>;
      const result = await dbGet(sql, params);
      return result as T | undefined;
    } catch (error) {
      this.stats.errors++;
      throw error;
    } finally {
      this.release(conn);
    }
  }

  /**
   * Execute a write query (INSERT, UPDATE, DELETE)
   */
  async execute(sql: string, params: any[] = []): Promise<void> {
    const conn = await this.acquire();
    
    try {
      this.stats.totalQueries++;
      const dbRun = promisify(conn.db.run.bind(conn.db)) as (sql: string, params?: any[]) => Promise<void>;
      await dbRun(sql, params);
    } catch (error) {
      this.stats.errors++;
      throw error;
    } finally {
      this.release(conn);
    }
  }

  /**
   * Execute a transaction
   */
  async transaction<T>(callback: (db: sqlite3.Database) => Promise<T>): Promise<T> {
    const conn = await this.acquire();
    const dbRun = promisify(conn.db.run.bind(conn.db)) as (sql: string) => Promise<void>;
    
    try {
      await dbRun('BEGIN TRANSACTION');
      const result = await callback(conn.db);
      await dbRun('COMMIT');
      return result;
    } catch (error) {
      try {
        await dbRun('ROLLBACK');
      } catch (rollbackError) {
        console.error('[DB Pool] Failed to rollback transaction:', rollbackError);
      }
      this.stats.errors++;
      throw error;
    } finally {
      this.release(conn);
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      ...this.stats,
      totalConnections: this.connections.length,
      availableConnections: this.connections.filter(c => !c.inUse).length,
      waitingRequests: this.waitQueue.length,
    };
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    const closePromises = this.connections.map(conn => {
      return new Promise<void>((resolve, reject) => {
        conn.db.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });

    await Promise.all(closePromises);
    this.connections = [];
    this.stats.totalConnections = 0;
    this.stats.activeConnections = 0;
    console.log('[DB Pool] All connections closed');
  }

  /**
   * Clean up idle connections
   */
  async cleanup(maxIdleTime: number = 5 * 60 * 1000): Promise<void> {
    const now = Date.now();
    const toRemove: PoolConnection[] = [];

    for (const conn of this.connections) {
      if (!conn.inUse && now - conn.lastUsed > maxIdleTime && this.connections.length > 1) {
        toRemove.push(conn);
      }
    }

    for (const conn of toRemove) {
      await new Promise<void>((resolve, reject) => {
        conn.db.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const index = this.connections.indexOf(conn);
      if (index > -1) {
        this.connections.splice(index, 1);
        this.stats.totalConnections--;
      }
    }

    if (toRemove.length > 0) {
      console.log(`[DB Pool] Cleaned up ${toRemove.length} idle connections`);
    }
  }
}

