/**
 * Query optimization utilities for analyzing and improving database performance
 */

import { Db, Collection } from 'mongodb';
import { getDb, COLLECTIONS } from './mongodb';

export interface IndexInfo {
  collection: string;
  name: string;
  key: Record<string, number>;
  unique: boolean;
}

export interface CollectionStats {
  collection: string;
  documentCount: number;
  avgDocumentSize: number;
  totalSize: number;
  indexCount: number;
}

/**
 * Get index information for all collections
 */
export async function getIndexStats(db?: Db): Promise<IndexInfo[]> {
  const database = db || await getDb();
  const results: IndexInfo[] = [];

  for (const collectionName of Object.values(COLLECTIONS)) {
    try {
      const collection = database.collection(collectionName);
      const indexes = await collection.indexes();

      for (const index of indexes) {
        results.push({
          collection: collectionName,
          name: index.name || 'unknown',
          key: index.key as Record<string, number>,
          unique: index.unique || false,
        });
      }
    } catch (error) {
      console.error(`Failed to get indexes for ${collectionName}:`, error);
    }
  }

  return results;
}

/**
 * Get collection statistics
 */
export async function getCollectionStats(db?: Db): Promise<CollectionStats[]> {
  const database = db || await getDb();
  const results: CollectionStats[] = [];

  for (const collectionName of Object.values(COLLECTIONS)) {
    try {
      const collection = database.collection(collectionName);
      const stats = await database.command({ collStats: collectionName });
      const indexes = await collection.indexes();

      results.push({
        collection: collectionName,
        documentCount: stats.count || 0,
        avgDocumentSize: stats.avgObjSize || 0,
        totalSize: stats.size || 0,
        indexCount: indexes.length,
      });
    } catch (error) {
      // Collection might not exist yet
      results.push({
        collection: collectionName,
        documentCount: 0,
        avgDocumentSize: 0,
        totalSize: 0,
        indexCount: 0,
      });
    }
  }

  return results;
}

/**
 * Get comprehensive database performance report
 */
export async function getDatabaseReport(db?: Db): Promise<{
  collections: CollectionStats[];
  indexes: IndexInfo[];
  totalSize: number;
  totalDocuments: number;
}> {
  const database = db || await getDb();

  const collections = await getCollectionStats(database);
  const indexes = await getIndexStats(database);

  const totalSize = collections.reduce((sum, c) => sum + c.totalSize, 0);
  const totalDocuments = collections.reduce((sum, c) => sum + c.documentCount, 0);

  return {
    collections,
    indexes,
    totalSize,
    totalDocuments,
  };
}

/**
 * Get server status information
 */
export async function getServerStatus(db?: Db): Promise<Record<string, any>> {
  const database = db || await getDb();

  try {
    const status = await database.command({ serverStatus: 1 });
    return {
      version: status.version,
      uptime: status.uptime,
      connections: status.connections,
      opcounters: status.opcounters,
      mem: status.mem,
    };
  } catch (error) {
    console.error('Failed to get server status:', error);
    return {};
  }
}

/**
 * Compact a collection (MongoDB equivalent of VACUUM)
 */
export async function compactCollection(collectionName: string, db?: Db): Promise<void> {
  const database = db || await getDb();

  console.log(`[Query Optimizer] Compacting collection ${collectionName}...`);
  await database.command({ compact: collectionName });
  console.log(`[Query Optimizer] Collection ${collectionName} compacted`);
}

/**
 * Reindex a collection
 */
export async function reindexCollection(collectionName: string, db?: Db): Promise<void> {
  const database = db || await getDb();

  console.log(`[Query Optimizer] Reindexing collection ${collectionName}...`);
  await database.command({ reIndex: collectionName });
  console.log(`[Query Optimizer] Collection ${collectionName} reindexed`);
}
