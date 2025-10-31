/**
 * Query optimization utilities for analyzing and improving database performance
 */

import sqlite3 from 'sqlite3';
import { promisify } from 'util';

export interface QueryPlan {
  id: number;
  parent: number;
  notused: number;
  detail: string;
}

export interface QueryAnalysis {
  query: string;
  plan: QueryPlan[];
  usesIndex: boolean;
  scanType: 'SCAN' | 'SEARCH' | 'UNKNOWN';
  warnings: string[];
  suggestions: string[];
}

/**
 * Analyze a query using EXPLAIN QUERY PLAN
 */
export async function analyzeQuery(db: sqlite3.Database, query: string, params: any[] = []): Promise<QueryAnalysis> {
  const dbAll = promisify(db.all.bind(db)) as (sql: string, params?: any[]) => Promise<any[]>;

  const explainQuery = `EXPLAIN QUERY PLAN ${query}`;
  const plan = await dbAll(explainQuery, params) as QueryPlan[];

  const analysis: QueryAnalysis = {
    query,
    plan,
    usesIndex: false,
    scanType: 'UNKNOWN',
    warnings: [],
    suggestions: [],
  };

  // Analyze the query plan
  for (const step of plan) {
    const detail = step.detail.toUpperCase();

    // Check if using index
    if (detail.includes('USING INDEX') || detail.includes('USING COVERING INDEX')) {
      analysis.usesIndex = true;
      analysis.scanType = 'SEARCH';
    }

    // Check for table scans (bad for large tables)
    if (detail.includes('SCAN TABLE')) {
      analysis.scanType = 'SCAN';
      analysis.warnings.push(`Full table scan detected: ${step.detail}`);
      analysis.suggestions.push('Consider adding an index to improve performance');
    }

    // Check for temporary B-trees (can indicate missing indexes)
    if (detail.includes('USE TEMP B-TREE')) {
      analysis.warnings.push(`Temporary B-tree used: ${step.detail}`);
      analysis.suggestions.push('Consider adding a composite index for ORDER BY or GROUP BY clauses');
    }

    // Check for automatic index creation
    if (detail.includes('AUTOMATIC')) {
      analysis.warnings.push(`Automatic index created: ${step.detail}`);
      analysis.suggestions.push('Consider creating a permanent index for this query pattern');
    }
  }

  return analysis;
}

/**
 * Measure query execution time
 */
export async function measureQueryTime<T>(
  db: sqlite3.Database,
  query: string,
  params: any[] = []
): Promise<{ result: T[]; executionTime: number }> {
  const dbAll = promisify(db.all.bind(db)) as (sql: string, params?: any[]) => Promise<any[]>;

  const start = performance.now();
  const result = await dbAll(query, params) as T[];
  const executionTime = performance.now() - start;

  return { result, executionTime };
}

/**
 * Analyze and log slow queries
 */
export async function analyzeSlowQuery(
  db: sqlite3.Database,
  query: string,
  params: any[] = [],
  threshold: number = 100 // milliseconds
): Promise<void> {
  const { executionTime } = await measureQueryTime(db, query, params);

  if (executionTime > threshold) {
    console.warn(`[Query Optimizer] Slow query detected (${executionTime.toFixed(2)}ms):`);
    console.warn(`Query: ${query}`);
    console.warn(`Params: ${JSON.stringify(params)}`);

    const analysis = await analyzeQuery(db, query, params);

    if (analysis.warnings.length > 0) {
      console.warn('Warnings:');
      analysis.warnings.forEach(w => console.warn(`  - ${w}`));
    }

    if (analysis.suggestions.length > 0) {
      console.warn('Suggestions:');
      analysis.suggestions.forEach(s => console.warn(`  - ${s}`));
    }

    console.warn('Query Plan:');
    analysis.plan.forEach(step => console.warn(`  ${step.detail}`));
  }
}

/**
 * Get index usage statistics
 */
export async function getIndexStats(db: sqlite3.Database): Promise<Array<{
  table: string;
  index: string;
  unique: boolean;
  columns: string;
}>> {
  const dbAll = promisify(db.all.bind(db)) as (sql: string, params?: any[]) => Promise<any[]>;

  // Get all tables
  const tables = await dbAll(`
    SELECT name FROM sqlite_master
    WHERE type = 'table'
    AND name NOT LIKE 'sqlite_%'
  `) as Array<{ name: string }>;

  const results: Array<{
    table: string;
    index: string;
    unique: boolean;
    columns: string;
  }> = [];

  for (const { name: tableName } of tables) {
    const indexes = await dbAll(`PRAGMA index_list(${tableName})`) as Array<{
      name: string;
      unique: number;
    }>;

    for (const index of indexes) {
      const indexInfo = await dbAll(`PRAGMA index_info(${index.name})`) as Array<{
        name: string;
      }>;

      results.push({
        table: tableName,
        index: index.name,
        unique: index.unique === 1,
        columns: indexInfo.map(i => i.name).join(', '),
      });
    }
  }

  return results;
}

/**
 * Get table statistics
 */
export async function getTableStats(db: sqlite3.Database): Promise<Array<{
  table: string;
  rowCount: number;
  avgRowSize: number;
  totalSize: number;
}>> {
  const dbAll = promisify(db.all.bind(db)) as (sql: string, params?: any[]) => Promise<any[]>;
  const dbGet = promisify(db.get.bind(db)) as (sql: string, params?: any[]) => Promise<any>;

  const tables = await dbAll(`
    SELECT name FROM sqlite_master
    WHERE type = 'table'
    AND name NOT LIKE 'sqlite_%'
  `) as Array<{ name: string }>;

  const results = [];

  for (const { name } of tables) {
    const countResult = await dbGet(`SELECT COUNT(*) as count FROM ${name}`) as { count: number };

    // Note: dbstat is not always available, so we'll estimate size
    const rowCount = countResult.count;
    const avgRowSize = 0; // Would need dbstat for accurate size
    const totalSize = 0;

    results.push({
      table: name,
      rowCount,
      avgRowSize,
      totalSize,
    });
  }

  return results;
}

/**
 * Suggest indexes based on query patterns
 */
export async function suggestIndexes(db: sqlite3.Database, queries: string[]): Promise<string[]> {
  const suggestions: Set<string> = new Set();

  for (const query of queries) {
    try {
      const analysis = await analyzeQuery(db, query);

      // Look for WHERE clauses without indexes
      const whereMatch = query.match(/WHERE\s+(\w+)\s*=/i);
      if (whereMatch && !analysis.usesIndex) {
        const column = whereMatch[1];
        const tableMatch = query.match(/FROM\s+(\w+)/i);
        if (tableMatch) {
          const table = tableMatch[1];
          suggestions.add(`CREATE INDEX IF NOT EXISTS idx_${table}_${column} ON ${table}(${column});`);
        }
      }

      // Look for ORDER BY without indexes
      const orderByMatch = query.match(/ORDER BY\s+([\w,\s]+)/i);
      if (orderByMatch && analysis.warnings.some(w => w.includes('TEMP B-TREE'))) {
        const columns = orderByMatch[1].split(',').map(c => c.trim().split(' ')[0]);
        const tableMatch = query.match(/FROM\s+(\w+)/i);
        if (tableMatch) {
          const table = tableMatch[1];
          suggestions.add(`CREATE INDEX IF NOT EXISTS idx_${table}_${columns.join('_')} ON ${table}(${columns.join(', ')});`);
        }
      }
    } catch (error) {
      // Skip invalid queries
      console.error(`Failed to analyze query: ${query}`, error);
    }
  }

  return Array.from(suggestions);
}

/**
 * Optimize database with ANALYZE and VACUUM
 */
export async function optimizeDatabase(db: sqlite3.Database): Promise<void> {
  const dbRun = promisify(db.run.bind(db)) as (sql: string) => Promise<void>;

  console.log('[Query Optimizer] Running ANALYZE...');
  await dbRun('ANALYZE');

  console.log('[Query Optimizer] Running VACUUM...');
  await dbRun('VACUUM');

  console.log('[Query Optimizer] Database optimization complete');
}

/**
 * Get comprehensive database performance report
 */
export async function getDatabaseReport(db: sqlite3.Database): Promise<{
  tables: Awaited<ReturnType<typeof getTableStats>>;
  indexes: Awaited<ReturnType<typeof getIndexStats>>;
  totalSize: number;
  pageSize: number;
  pageCount: number;
}> {
  const dbGet = promisify(db.get.bind(db)) as (sql: string, params?: any[]) => Promise<any>;

  const tables = await getTableStats(db);
  const indexes = await getIndexStats(db);

  const pragmaPageSize = await dbGet('PRAGMA page_size') as { page_size: number };
  const pragmaPageCount = await dbGet('PRAGMA page_count') as { page_count: number };

  const totalSize = tables.reduce((sum, t) => sum + t.totalSize, 0);

  return {
    tables,
    indexes,
    totalSize,
    pageSize: pragmaPageSize.page_size,
    pageCount: pragmaPageCount.page_count,
  };
}

