/**
 * API Keys Management Route
 * 
 * Manage user API keys.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, auditApiAction, ApiError } from '@/lib/api-middleware';
import { createApiKey, getUserApiKeys } from '@/lib/auth-db';

const createApiKeySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  scopes: z.array(z.string()).optional(),
  expires_at: z.string().optional(),
});

/**
 * GET /api/auth/api-keys
 * Get user's API keys
 */
export const GET = withAuth(async (request: NextRequest, user: any) => {
  const apiKeys = await getUserApiKeys(user.id);

  // Remove key hashes from response
  const sanitizedKeys = apiKeys.map(key => ({
    id: key.id,
    name: key.name,
    key_prefix: key.key_prefix,
    scopes: key.scopes,
    is_active: key.is_active,
    expires_at: key.expires_at,
    last_used_at: key.last_used_at,
    created_at: key.created_at,
  }));

  return NextResponse.json({ apiKeys: sanitizedKeys });
});

/**
 * POST /api/auth/api-keys
 * Create a new API key
 */
export const POST = withAuth(async (request: NextRequest, user: any) => {
  const body = await request.json();
  const validatedFields = createApiKeySchema.safeParse(body);

  if (!validatedFields.success) {
    throw new ApiError(400, 'Validation failed', validatedFields.error.flatten().fieldErrors);
  }

  const { name, scopes, expires_at } = validatedFields.data;

  // Create API key
  const { apiKey, plainKey } = await createApiKey({
    user_id: user.id,
    name,
    scopes,
    expires_at,
  });

  // Audit log
  await auditApiAction(request, 'create_api_key', 'api_key', apiKey.id, {
    name,
    scopes,
  });

  // Return the plain key (only shown once!)
  return NextResponse.json({
    apiKey: {
      id: apiKey.id,
      name: apiKey.name,
      key_prefix: apiKey.key_prefix,
      scopes: apiKey.scopes,
      is_active: apiKey.is_active,
      expires_at: apiKey.expires_at,
      created_at: apiKey.created_at,
    },
    plainKey, // Only returned on creation
    warning: 'Save this key securely. It will not be shown again.',
  }, { status: 201 });
});

