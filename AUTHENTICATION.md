# Authentication & Authorization

This document describes the authentication and authorization system implemented in the Earthquake Catalogue Platform.

## Overview

The platform uses **NextAuth.js v4** for authentication with the following features:

- **Email/Password Authentication** - Secure credential-based login
- **Role-Based Access Control (RBAC)** - Three roles: Admin, Editor, Viewer
- **Permission System** - Granular permissions for different operations
- **API Key Management** - Programmatic access with scoped permissions
- **Audit Logging** - Comprehensive tracking of all user actions
- **Session Management** - JWT-based sessions with 30-day expiry

## User Roles

### Admin
- Full system access
- User management (create, update, delete users)
- View audit logs
- Manage all catalogues
- All editor and viewer permissions

### Editor
- Create, edit, and delete catalogues
- Import data from GeoNet
- Merge catalogues
- Export data
- All viewer permissions

### Viewer
- View catalogues and events
- Search and filter data
- View analytics
- Export data (read-only)

## Permissions

The system implements the following permissions:

| Permission | Admin | Editor | Viewer |
|------------|-------|--------|--------|
| VIEW_CATALOGUES | ✓ | ✓ | ✓ |
| CREATE_CATALOGUES | ✓ | ✓ | ✗ |
| EDIT_CATALOGUES | ✓ | ✓ | ✗ |
| DELETE_CATALOGUES | ✓ | ✓ | ✗ |
| IMPORT_DATA | ✓ | ✓ | ✗ |
| EXPORT_DATA | ✓ | ✓ | ✓ |
| MERGE_CATALOGUES | ✓ | ✓ | ✗ |
| MANAGE_USERS | ✓ | ✗ | ✗ |
| VIEW_AUDIT_LOGS | ✓ | ✗ | ✗ |
| MANAGE_API_KEYS | ✓ | ✓ | ✓ |
| MANAGE_SETTINGS | ✓ | ✓ | ✗ |

## Getting Started

### 1. User Registration

New users can register at `/auth/register`:

```typescript
POST /api/auth/register
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePassword123"
}
```

- Default role: `viewer`
- Password requirements: Minimum 8 characters
- Email must be unique

### 2. Login

Users can log in at `/auth/login`:

```typescript
// Using NextAuth signIn
import { signIn } from 'next-auth/react';

await signIn('credentials', {
  email: 'john@example.com',
  password: 'SecurePassword123',
  callbackUrl: '/dashboard'
});
```

### 3. Session Management

Sessions are managed using JWT tokens:

- **Session Duration**: 30 days
- **Auto-refresh**: Sessions are automatically refreshed on activity
- **Logout**: Sessions are invalidated on logout

```typescript
// Get current session
import { useSession } from 'next-auth/react';

const { data: session, status } = useSession();

// Logout
import { signOut } from 'next-auth/react';

await signOut({ callbackUrl: '/' });
```

## API Key Authentication

API keys provide programmatic access to the platform.

### Creating an API Key

1. Navigate to **Settings > Account > API Keys**
2. Click "Create New API Key"
3. Enter a name and select scopes
4. Optionally set an expiration date
5. Copy the generated key (shown only once!)

### Using API Keys

Include the API key in the `Authorization` header:

```bash
curl -H "Authorization: Bearer eck_xxxxxxxxxxxxxxxxxxxxx" \
  https://your-domain.com/api/catalogues
```

### API Key Format

- Prefix: `eck_` (earthquake catalogue key)
- Length: 32 characters (nanoid)
- Example: `eck_V1StGXR8_Z5jdHi6B-myT`

### API Key Scopes

- `read` - View catalogues and events
- `write` - Create and update catalogues
- `delete` - Delete catalogues
- `admin` - Full administrative access

## Protected Routes

### Page Protection

The following routes require authentication:

- `/dashboard` - All authenticated users
- `/catalogues` - All authenticated users
- `/upload` - Editors and Admins
- `/import` - Editors and Admins
- `/merge` - Editors and Admins
- `/analytics` - All authenticated users
- `/settings` - All authenticated users
- `/admin` - Admins only

### API Protection

All API endpoints support both session-based and API key authentication.

#### Example: Protected API Route

```typescript
import { requireAuth, requirePermission } from '@/lib/api-middleware';

export async function POST(request: Request) {
  // Require authentication
  const user = await requireAuth(request);
  
  // Require specific permission
  await requirePermission(request, 'CREATE_CATALOGUES');
  
  // Your logic here
}
```

## Audit Logging

All user actions are logged for security and compliance:

### Logged Actions

- `register` - User registration
- `login` - User login
- `logout` - User logout
- `update_profile` - Profile updates
- `change_password` - Password changes
- `create_catalogue` - Catalogue creation
- `update_catalogue` - Catalogue updates
- `delete_catalogue` - Catalogue deletion
- `merge_catalogues` - Catalogue merges
- `import_geonet` - GeoNet imports
- `create_api_key` - API key creation
- `revoke_api_key` - API key revocation

### Viewing Audit Logs

Admins can view audit logs at `/admin` under the "Audit Logs" tab.

### Audit Log Structure

```typescript
{
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: object;
  ip_address: string;
  user_agent: string;
  created_at: string;
}
```

## User Context Tracking

All catalogue operations track user context:

- `created_by` - User ID who created the catalogue
- `modified_by` - User ID who last modified the catalogue
- `modified_at` - Timestamp of last modification

This information is automatically set when:
- Creating catalogues (upload, import, merge)
- Updating catalogue metadata
- Renaming catalogues

## Security Best Practices

### For Users

1. **Use Strong Passwords** - Minimum 8 characters, mix of letters, numbers, symbols
2. **Protect API Keys** - Never commit API keys to version control
3. **Rotate API Keys** - Regularly rotate API keys, especially if compromised
4. **Use Scoped Keys** - Create API keys with minimal required scopes
5. **Set Expiration** - Use expiration dates for temporary access

### For Administrators

1. **Regular Audits** - Review audit logs regularly for suspicious activity
2. **Principle of Least Privilege** - Assign minimum required roles
3. **Deactivate Inactive Users** - Disable accounts that are no longer needed
4. **Monitor API Key Usage** - Track API key usage and revoke unused keys
5. **Review User Roles** - Periodically review and update user roles

## Environment Variables

Required environment variables for authentication:

```bash
# NextAuth.js Configuration
NEXTAUTH_SECRET=your-secret-key-here  # Generate with: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000    # Your application URL

# Database
DATABASE_PATH=./merged_catalogues.db

# Environment
NODE_ENV=development
```

## Database Schema

### Users Table

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'viewer',
  is_active BOOLEAN NOT NULL DEFAULT 1,
  email_verified BOOLEAN NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME
);
```

### Sessions Table

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### API Keys Table

```sql
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,
  key_prefix TEXT NOT NULL,
  scopes TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  expires_at DATETIME,
  last_used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### Audit Logs Table

```sql
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

## Troubleshooting

### Common Issues

#### 1. "Invalid credentials" error

- Verify email and password are correct
- Check if account is active (not deactivated by admin)
- Ensure password meets minimum requirements

#### 2. "Access denied" error

- Check user role and permissions
- Verify the route/action requires your role level
- Contact admin to upgrade role if needed

#### 3. API key not working

- Verify API key is active (not revoked)
- Check if API key has expired
- Ensure correct scopes are assigned
- Verify `Authorization` header format: `Bearer eck_xxxxx`

#### 4. Session expired

- Sessions expire after 30 days of inactivity
- Log in again to create a new session
- Check `NEXTAUTH_SECRET` is set correctly

## Migration Guide

If you have an existing database without authentication:

1. Run the authentication migration:
   ```bash
   node scripts/migrate-add-auth-tables.js
   ```

2. Run the user tracking migration:
   ```bash
   node scripts/migrate-add-user-tracking.js
   ```

3. Create an admin user (first user should be admin):
   - Register at `/auth/register`
   - Manually update role in database:
     ```sql
     UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';
     ```

## Support

For issues or questions about authentication:

1. Check this documentation
2. Review audit logs for security events
3. Contact system administrator
4. File an issue on GitHub (if applicable)

