# Registration Debugging Guide

## Quick Start - Immediate Actions

### Step 1: Update NEXTAUTH_URL
Your server is running on port **3001**, not 3000. Update your `.env` file:

```bash
# Change this:
NEXTAUTH_URL=http://localhost:3000

# To this:
NEXTAUTH_URL=http://localhost:3001
```

Then restart the server:
```bash
# Press Ctrl+C to stop
npm run dev
```

### Step 2: Run the Test Script

```bash
npx tsx scripts/test-registration.ts
```

This will check:
- ✅ Environment variables
- ✅ MongoDB connection
- ✅ Database collections
- ✅ User roles
- ✅ API endpoint

### Step 3: Use the Test Page

Navigate to: `http://localhost:3001/test-registration.html`

This standalone test page will:
- Show detailed error messages
- Display API responses
- Log everything to browser console
- Work independently of React/Next.js

## Debugging Workflow

### 1. Check Browser Console (F12)

**What to look for:**
- Red errors (JavaScript exceptions)
- Network errors (failed fetch requests)
- CORS errors
- NextAuth errors

**Common errors and fixes:**

| Error | Cause | Fix |
|-------|-------|-----|
| `Failed to fetch` | Server not running or wrong port | Check server is on port 3001 |
| `NEXTAUTH_SECRET must be provided` | Missing env variable | Add to .env and restart |
| `NetworkError` | CORS or network issue | Check server logs |
| `Unexpected token` | JSON parsing error | Check API response format |

### 2. Check Network Tab

1. Open DevTools (F12) → Network tab
2. Click "Create account"
3. Look for `POST /api/auth/register`

**Successful request:**
```
Status: 201 Created
Response:
{
  "message": "User registered successfully",
  "user": {
    "id": "user_...",
    "email": "test@example.com",
    "name": "Test User",
    "role": "viewer",
    "is_active": true
  }
}
```

**Failed requests:**

| Status | Error | Solution |
|--------|-------|----------|
| 400 | "Email, password, and name are required" | Fill all fields |
| 400 | "Invalid email format" | Use valid email |
| 400 | "Password must be at least 8 characters" | Use longer password |
| 409 | "User with this email already exists" | Use different email or delete existing user |
| 500 | "Registration failed" | Check server logs and MongoDB |

### 3. Check Server Logs

Look at the terminal where `npm run dev` is running:

**Good signs:**
```
✓ Compiled successfully
✓ Ready in 3.8s
⚠ Port 3000 is in use, trying 3001 instead
```

**Bad signs:**
```
Error: NEXTAUTH_SECRET must be provided
MongoServerError: connect ECONNREFUSED
TypeError: Cannot read property 'findOne' of undefined
```

### 4. Test with curl

```bash
# Test successful registration
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "password123"
  }' | jq '.'

# Expected: 201 status with user object

# Test duplicate email
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User 2",
    "email": "test@example.com",
    "password": "password456"
  }' | jq '.'

# Expected: 409 status with error message
```

## Common Issues and Solutions

### Issue 1: Button Does Nothing

**Symptoms:**
- Click "Create account" button
- Nothing happens
- No errors in console

**Debug steps:**
1. Open browser console (F12)
2. Check for JavaScript errors
3. Verify form is submitting: Add `console.log('Form submitted')` in handleSubmit
4. Check if loading state is stuck

**Solution:**
- Check if there's a JavaScript error preventing form submission
- Verify all required fields are filled
- Check browser's ad blocker isn't blocking the request

### Issue 2: "Failed to fetch" Error

**Symptoms:**
- Error in console: "Failed to fetch"
- Network tab shows failed request
- Red error in browser

**Debug steps:**
1. Verify server is running: `npm run dev`
2. Check correct port: Should be 3001, not 3000
3. Test API directly: `curl http://localhost:3001/api/auth/register`

**Solution:**
```bash
# Update .env
NEXTAUTH_URL=http://localhost:3001

# Restart server
npm run dev

# Navigate to correct URL
http://localhost:3001/register
```

### Issue 3: "NEXTAUTH_SECRET must be provided"

**Symptoms:**
- 500 error in Network tab
- Server logs show NextAuth error

**Solution:**
```bash
# Generate secret
openssl rand -base64 32

# Add to .env
echo "NEXTAUTH_SECRET=<paste-generated-secret>" >> .env

# Restart server
npm run dev
```

### Issue 4: MongoDB Connection Error

**Symptoms:**
- 500 error with "Database not initialized"
- Server logs show MongoDB error

**Debug steps:**
1. Check MongoDB is running:
   ```bash
   mongosh --eval "db.version()"
   ```

2. Test connection:
   ```bash
   mongosh mongodb://localhost:27017
   ```

3. Check .env:
   ```bash
   grep MONGODB .env
   ```

**Solution:**
```bash
# Start MongoDB
sudo systemctl start mongod
# OR
brew services start mongodb-community

# Run migration
npm run migrate:auth

# Restart server
npm run dev
```

### Issue 5: User Already Exists

**Symptoms:**
- 409 error
- "User with this email already exists"

**Solutions:**

**Option 1: Use different email**
```
test1@example.com
test2@example.com
etc.
```

**Option 2: Delete existing user**
```bash
mongosh earthquake_catalogue
db.users.deleteOne({ email: "test@example.com" })
```

**Option 3: Login instead**
Navigate to `/login` and use existing credentials

## Testing Checklist

- [ ] Environment variables set (NEXTAUTH_SECRET, NEXTAUTH_URL, MONGODB_URI)
- [ ] MongoDB is running
- [ ] Database migration completed (`npm run migrate:auth`)
- [ ] Dev server is running on port 3001
- [ ] Browser console shows no errors
- [ ] Network tab shows 201 response for successful registration
- [ ] Can login after registration

## Files to Check

If issues persist, verify these files exist and have no syntax errors:

```bash
# Core files
ls -la app/(auth)/register/page.tsx
ls -la app/api/auth/register/route.ts
ls -la lib/auth/utils.ts
ls -la lib/auth/config.ts
ls -la lib/auth/types.ts

# Check for TypeScript errors
npm run build
```

## Get More Help

Run the comprehensive test:
```bash
npx tsx scripts/test-registration.ts
```

Use the test page:
```
http://localhost:3001/test-registration.html
```

Check detailed troubleshooting:
```
docs/TROUBLESHOOTING_REGISTRATION.md
```

## Emergency Reset

If nothing works, reset everything:

```bash
# 1. Stop server (Ctrl+C)

# 2. Drop database
mongosh earthquake_catalogue --eval "db.dropDatabase()"

# 3. Clear .env and recreate
rm .env
cp .env.example .env

# 4. Add required variables
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)" >> .env
echo "NEXTAUTH_URL=http://localhost:3001" >> .env
echo "MONGODB_URI=mongodb://localhost:27017" >> .env
echo "MONGODB_DATABASE=earthquake_catalogue" >> .env

# 5. Run migration
npm run migrate:auth

# 6. Start server
npm run dev

# 7. Test
npx tsx scripts/test-registration.ts
```

## Success Criteria

Registration is working when:
1. ✅ Form submits without errors
2. ✅ Network tab shows 201 status
3. ✅ User appears in database
4. ✅ Can login with new credentials
5. ✅ Redirects to login page after registration

