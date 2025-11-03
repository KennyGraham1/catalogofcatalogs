/**
 * API Key Management Route
 * 
 * Manage individual API keys.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, auditApiAction, ApiError } from '@/lib/api-middleware';
import { getApiKeyById, revokeApiKey, deleteApiKey } from '@/lib/auth-db';

/**
 * DELETE /api/auth/api-keys/[id]
 * Delete an API key
 */
export const DELETE = withAuth(async (
  request: NextRequest,
  user: any,
  { params }: { params: { id: string } }
) => {
  const apiKey = await getApiKeyById(params.id);

  if (!apiKey) {
    throw new ApiError(404, 'API key not found');
  }

  // Check ownership
  if (apiKey.user_id !== user.id && user.role !== 'admin') {
    throw new ApiError(403, 'Forbidden: You can only delete your own API keys');
  }

  await deleteApiKey(params.id);
  await auditApiAction(request, 'delete_api_key', 'api_key', params.id, {
    name: apiKey.name,
  });

  return NextResponse.json({ success: true });
});

/**
 * PATCH /api/auth/api-keys/[id]
 * Revoke an API key
 */
export const PATCH = withAuth(async (
  request: NextRequest,
  user: any,
  { params }: { params: { id: string } }
) => {
  const apiKey = await getApiKeyById(params.id);

  if (!apiKey) {
    throw new ApiError(404, 'API key not found');
  }

  // Check ownership
  if (apiKey.user_id !== user.id && user.role !== 'admin') {
    throw new ApiError(403, 'Forbidden: You can only revoke your own API keys');
  }

  await revokeApiKey(params.id);
  await auditApiAction(request, 'revoke_api_key', 'api_key', params.id, {
    name: apiKey.name,
  });

  return NextResponse.json({ success: true });
});

