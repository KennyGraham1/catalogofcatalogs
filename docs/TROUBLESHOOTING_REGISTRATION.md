# Troubleshooting User Registration

This guide helps you debug and fix common issues with the user registration functionality.

## Quick Diagnostic Checklist

### 1. Check Environment Variables

```bash
# Verify your .env file has these required variables
cat .env | grep -E "NEXTAUTH_SECRET|NEXTAUTH_URL|MONGODB"
```

**Required variables:**
```bash
NEXTAUTH_SECRET=<your-secret-key>  # Must be set!
NEXTAUTH_URL=http://localhost:3001  # Note: Server is on port 3001
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=earthquake_catalogue
```

**⚠️ IMPORTANT**: The server is running on port **3001** (not 3000), so update `NEXTAUTH_URL`:
```bash
NEXTAUTH_URL=http://localhost:3001
```

### 2. Run Database Migration

```bash
# Run the migration to set up authentication tables
npm run migrate:auth
```

**Expected output:**
```
🔐 Starting Authentication Schema Migration...
✓ Connected to MongoDB
✓ Created/Updated role: Administrator
✓ Created/Updated role: Editor
✓ Created/Updated role: Viewer
✓ Created/Updated role: Guest
✅ Authentication schema migration completed successfully!
```

### 3. Check MongoDB Connection

```bash
# Test MongoDB is running
mongosh --eval "db.version()"

# Or if using MongoDB Compass, connect to:
mongodb://localhost:27017
```

### 4. Browser Developer Tools Debugging

Open your browser's Developer Tools (F12) and check:

#### **Console Tab** - Look for JavaScript errors:
```
Common errors:
- "Failed to fetch" → API endpoint not responding
- "NetworkError" → CORS or network issue
- "Unexpected token" → JSON parsing error
- "NEXTAUTH_SECRET" → Environment variable not set
```

#### **Network Tab** - Monitor the registration request:

1. Open Network tab
2. Click "Create account" button
3. Look for `POST /api/auth/register` request

**Successful response (201):**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "user_1234567890_abc123",
    "email": "test@example.com",
    "name": "Test User",
    "role": "viewer",
    "is_active": true,
    "email_verified": false,
    "created_at": "2026-01-20T..."
  }
}
```

**Error responses:**

**400 - Validation Error:**
```json
{
  "error": "Email, password, and name are required"
}
// OR
{
  "error": "Invalid email format"
}
// OR
{
  "error": "Password must be at least 8 characters long"
}
```

**409 - User Already Exists:**
```json
{
  "error": "User with this email already exists"
}
```

**500 - Server Error:**
```json
{
  "error": "Registration failed"
}
```

## Common Issues and Solutions

### Issue 1: "Failed to fetch" or Network Error

**Symptoms:**
- Button click does nothing
- Network tab shows failed request
- Console shows fetch error

**Solutions:**

1. **Check server is running:**
   ```bash
   # Should see: ▲ Next.js 13.5.11 - Local: http://localhost:3001
   npm run dev
   ```

2. **Verify correct URL:**
   - Registration page: `http://localhost:3001/register`
   - NOT `http://localhost:3000/register`

3. **Check firewall/antivirus** isn't blocking localhost:3001

### Issue 2: "NEXTAUTH_SECRET must be provided"

**Symptoms:**
- 500 error in Network tab
- Server logs show NextAuth error

**Solution:**
```bash
# Generate a secure secret
openssl rand -base64 32

# Add to .env file
echo "NEXTAUTH_SECRET=<generated-secret>" >> .env

# Restart the server
npm run dev
```

### Issue 3: "Database not initialized" or MongoDB Connection Error

**Symptoms:**
- 500 error with "Database not initialized"
- Server logs show MongoDB connection error

**Solutions:**

1. **Start MongoDB:**
   ```bash
   # macOS/Linux
   sudo systemctl start mongod
   # OR
   brew services start mongodb-community
   
   # Windows
   net start MongoDB
   ```

2. **Verify MongoDB is running:**
   ```bash
   mongosh --eval "db.runCommand({ ping: 1 })"
   ```

3. **Check MONGODB_URI:**
   ```bash
   # In .env
   MONGODB_URI=mongodb://localhost:27017
   ```

4. **Run migration:**
   ```bash
   npm run migrate:auth
   ```

### Issue 4: "User with this email already exists"

**Symptoms:**
- 409 error when trying to register
- Same email used before

**Solutions:**

1. **Use a different email address**

2. **Delete existing user (for testing):**
   ```bash
   mongosh earthquake_catalogue
   db.users.deleteOne({ email: "test@example.com" })
   ```

3. **Login instead of registering** at `/login`

### Issue 5: Form Validation Not Working

**Symptoms:**
- Can submit empty form
- No error messages shown
- Passwords don't match but form submits

**Check:**

1. **Browser console for React errors**

2. **Form state in React DevTools**

3. **Verify form validation logic:**
   - Email format check
   - Password length (min 8 characters)
   - Password confirmation match

### Issue 6: Registration Succeeds but Can't Login

**Symptoms:**
- Registration returns 201 success
- Login fails with "Invalid email or password"

**Solutions:**

1. **Check password was hashed correctly:**
   ```bash
   mongosh earthquake_catalogue
   db.users.findOne({ email: "test@example.com" })
   # Should see password_hash field, NOT plain password
   ```

2. **Verify NextAuth configuration:**
   - Check `lib/auth/config.ts` exists
   - Check `app/api/auth/[...nextauth]/route.ts` exists

3. **Clear browser cookies and try again**

## Manual Testing Steps

### Test 1: Successful Registration

1. Navigate to `http://localhost:3001/register`
2. Fill in form:
   - Name: "Test User"
   - Email: "test@example.com"
   - Password: "password123"
   - Confirm Password: "password123"
3. Click "Create account"
4. Should redirect to `/login?registered=true`
5. Login with same credentials
6. Should redirect to `/` (home page)

### Test 2: Duplicate Email

1. Try to register with same email again
2. Should see error: "User with this email already exists"

### Test 3: Password Validation

1. Try password "short" (< 8 chars)
2. Should see error: "Password must be at least 8 characters long"

### Test 4: Password Mismatch

1. Password: "password123"
2. Confirm: "password456"
3. Should see error: "Passwords do not match"

## Debugging with curl

Test the API directly:

```bash
# Successful registration
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "password123"
  }'

# Should return 201 with user object

# Test duplicate email
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User 2",
    "email": "test@example.com",
    "password": "password456"
  }'

# Should return 409 error
```

## Check Server Logs

Monitor the terminal where `npm run dev` is running for errors:

```
Common log messages:
✓ Compiled successfully
✓ Ready in 3.8s
⚠ Port 3000 is in use, trying 3001 instead
```

Look for errors like:
```
Error: NEXTAUTH_SECRET must be provided
MongoServerError: connect ECONNREFUSED
TypeError: Cannot read property 'findOne' of undefined
```

## Database Verification

Check if user was created:

```bash
mongosh earthquake_catalogue

# List all users
db.users.find().pretty()

# Check specific user
db.users.findOne({ email: "test@example.com" })

# Verify password is hashed
db.users.findOne({ email: "test@example.com" }, { password_hash: 1 })
# Should see: password_hash: "$2a$10$..."
```

## Still Having Issues?

1. **Clear all data and start fresh:**
   ```bash
   # Stop server (Ctrl+C)
   # Drop database
   mongosh earthquake_catalogue --eval "db.dropDatabase()"
   # Run migration
   npm run migrate:auth
   # Restart server
   npm run dev
   ```

2. **Check file permissions:**
   ```bash
   ls -la .env
   # Should be readable
   ```

3. **Verify all files exist:**
   ```bash
   ls -la app/api/auth/register/route.ts
   ls -la lib/auth/utils.ts
   ls -la lib/auth/config.ts
   ```

4. **Check for TypeScript errors:**
   ```bash
   npm run build
   ```

## Getting Help

When reporting issues, include:
1. Browser console errors (screenshot)
2. Network tab request/response (screenshot)
3. Server terminal output
4. Environment variables (redact secrets!)
5. MongoDB connection status
6. Steps to reproduce

## Quick Fix Script

Create a file `scripts/test-registration.sh`:

```bash
#!/bin/bash
echo "Testing registration system..."
echo "1. Checking MongoDB..."
mongosh --eval "db.version()" > /dev/null 2>&1 && echo "✓ MongoDB running" || echo "✗ MongoDB not running"

echo "2. Checking environment..."
grep -q "NEXTAUTH_SECRET" .env && echo "✓ NEXTAUTH_SECRET set" || echo "✗ NEXTAUTH_SECRET missing"

echo "3. Testing API..."
curl -s -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@test.com","password":"test1234"}' \
  | jq '.' || echo "✗ API not responding"

echo "Done!"
```

Run with: `bash scripts/test-registration.sh`

