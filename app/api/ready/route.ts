/**
 * Readiness Check Endpoint
 * 
 * GET /api/ready - Readiness check for load balancers and orchestrators
 * 
 * Returns:
 * - 200 OK if the application is ready to serve traffic
 * - 503 Service Unavailable if dependencies are not ready
 * 
 * Checks:
 * - Database connectivity
 * - Critical services availability
 */

import { NextResponse } from 'next/server';
import { isConnected, getDb } from '@/lib/mongodb';
import { dbQueries } from '@/lib/db';
import { geonetClient } from '@/lib/geonet-client';

interface ReadinessCheck {
  name: string;
  status: 'healthy' | 'unhealthy';
  message?: string;
  responseTime?: number;
}

export async function GET() {
  const startTime = Date.now();
  const checks: ReadinessCheck[] = [];
  let allHealthy = true;

  // 1. Check database connectivity
  try {
    const dbStartTime = Date.now();

    if (!isConnected()) {
      // Try to connect
      await getDb();
    }

    // Try a simple query
    if (dbQueries) {
      await dbQueries.getCatalogues({ page: 1, pageSize: 1 });
    }

    checks.push({
      name: 'database',
      status: 'healthy',
      responseTime: Date.now() - dbStartTime,
    });
  } catch (error) {
    allHealthy = false;
    checks.push({
      name: 'database',
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Database check failed',
    });
  }

  // 2. Check GeoNet API circuit breaker status
  try {
    const circuitBreakerStats = geonetClient.getCircuitBreakerStats();
    
    if (circuitBreakerStats.state === 'OPEN') {
      // Circuit breaker is open, but this shouldn't make the app unhealthy
      // Just report it as a warning
      checks.push({
        name: 'geonet_api',
        status: 'healthy',
        message: `Circuit breaker is OPEN (${circuitBreakerStats.failures} failures)`,
      });
    } else {
      checks.push({
        name: 'geonet_api',
        status: 'healthy',
        message: `Circuit breaker is ${circuitBreakerStats.state}`,
      });
    }
  } catch (error) {
    // GeoNet API check failure shouldn't make the app unhealthy
    checks.push({
      name: 'geonet_api',
      status: 'healthy',
      message: 'Circuit breaker check skipped',
    });
  }

  // 3. Check memory usage
  try {
    const memUsage = process.memoryUsage();
    const memUsageMB = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
    };

    // Warn if heap usage is > 90%
    const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    
    checks.push({
      name: 'memory',
      status: heapUsagePercent > 90 ? 'unhealthy' : 'healthy',
      message: `Heap: ${memUsageMB.heapUsed}MB / ${memUsageMB.heapTotal}MB (${Math.round(heapUsagePercent)}%)`,
    });

    if (heapUsagePercent > 90) {
      allHealthy = false;
    }
  } catch (error) {
    checks.push({
      name: 'memory',
      status: 'healthy',
      message: 'Memory check skipped',
    });
  }

  const totalResponseTime = Date.now() - startTime;

  const response = {
    status: allHealthy ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks,
    responseTime: `${totalResponseTime}ms`,
  };

  return NextResponse.json(
    response,
    { status: allHealthy ? 200 : 503 }
  );
}

