/**
 * Health Check Endpoint
 *
 * GET /api/health - Basic health check for monitoring
 *
 * Returns:
 * - 200 OK if the application is running
 * - Includes basic system information
 */

import { NextResponse } from 'next/server';
import { isConnected } from '@/lib/mongodb';

export async function GET() {
  const startTime = Date.now();

  try {
    // Check database connection
    const dbConnected = await isConnected();

    // Basic health check - just verify the API is responding
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      database: dbConnected ? 'connected' : 'disconnected',
    };

    const responseTime = Date.now() - startTime;

    return NextResponse.json({
      ...health,
      responseTime: `${responseTime}ms`,
    });
  } catch (error) {
    console.error('[Health] Health check failed:', error);

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    );
  }
}
