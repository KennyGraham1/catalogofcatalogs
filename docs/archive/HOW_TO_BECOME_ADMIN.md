# How to Become an Admin

This guide explains the different ways to promote a user to admin role in the Earthquake Catalogue Platform.

## Overview

The system has 4 user roles:
- **Guest** - Limited access to public catalogues
- **Viewer** - Read-only access with export capabilities (default for new users)
- **Editor** - Create, edit, delete catalogues, import/merge data
- **Admin** - Full system access including user management

**New users are created as Viewers by default.** To access admin features, you need to be promoted to admin.

---

## Method 1: Using the Promotion Script (Recommended)

The easiest way to promote a user to admin is using the provided script.

### Step 1: Find Your Email

If you're already logged in, you can see your email in the user menu (top right avatar dropdown).

Or list all users:
```bash
mongosh eq-catalogue --eval "db.users.find({}, {email:1, name:1, role:1}).pretty()"
```

### Step 2: Run the Promotion Script

```bash
npx tsx scripts/promote-to-admin.ts <your-email>
```

**Example:**
```bash
npx tsx scripts/promote-to-admin.ts test@example.com
```

**Output:**
```
🔌 Connecting to MongoDB...
✓ Connected to MongoDB

📋 Current user details:
   Name: Test User
   Email: test@example.com
   Current Role: viewer

✅ Successfully promoted user to admin!

📋 Updated user details:
   Name: Test User
   Email: test@example.com
   New Role: admin

🔄 The user needs to log out and log back in for changes to take effect.

✓ Disconnected from MongoDB
```

### Step 3: Log Out and Log Back In

1. Click your avatar in the top right
2. Click "Sign Out"
3. Log back in with your credentials
4. You should now see "User Management" in your user menu

---

## Method 2: Using MongoDB Shell

If you prefer to use MongoDB directly:

### Step 1: Connect to MongoDB

```bash
mongosh "mongodb+srv://kerry_graham:<YOUR_PASSWORD>@serverlessinstance0.ta8golw.mongodb.net/eq-catalogue"
```

Or if using local MongoDB:
```bash
mongosh eq-catalogue
```

### Step 2: Update the User Role

```javascript
db.users.updateOne(
  { email: "your@email.com" },
  { $set: { role: "admin", updated_at: new Date().toISOString() } }
)
```

**Example:**
```javascript
db.users.updateOne(
  { email: "test@example.com" },
  { $set: { role: "admin", updated_at: new Date().toISOString() } }
)
```

### Step 3: Verify the Change

```javascript
db.users.findOne({ email: "test@example.com" }, { name: 1, email: 1, role: 1 })
```

**Expected output:**
```javascript
{
  _id: ObjectId("..."),
  name: 'Test User',
  email: 'test@example.com',
  role: 'admin'
}
```

### Step 4: Log Out and Log Back In

Same as Method 1, Step 3.

---

## Method 3: Using MongoDB Compass (GUI)

If you prefer a graphical interface:

### Step 1: Connect to MongoDB

1. Open MongoDB Compass
2. Connect using your connection string:
   ```
   mongodb+srv://kerry_graham:<YOUR_PASSWORD>@serverlessinstance0.ta8golw.mongodb.net/eq-catalogue
   ```

### Step 2: Navigate to Users Collection

1. Select the `eq-catalogue` database
2. Click on the `users` collection

### Step 3: Find and Edit Your User

1. Find your user by email (use the filter: `{ email: "your@email.com" }`)
2. Click the "Edit" button (pencil icon)
3. Change the `role` field from `"viewer"` to `"admin"`
4. Update the `updated_at` field to the current date/time
5. Click "Update"

### Step 4: Log Out and Log Back In

Same as Method 1, Step 3.

---

## Method 4: Admin User Management (Once You Have an Admin)

Once you have at least one admin user, admins can promote other users through the web interface:

### Step 1: Log in as Admin

Log in with an admin account.

### Step 2: Go to User Management

1. Click your avatar in the top right
2. Click "User Management"
3. Or navigate directly to `/admin/users`

### Step 3: Promote a User

1. Find the user you want to promote
2. Click the "Edit" or role dropdown button
3. Change their role to "Admin"
4. Save the changes

The user will need to log out and log back in for the changes to take effect.

---

## Verifying Admin Access

After promoting to admin and logging back in, you should see:

### In the User Menu (Top Right Avatar)
- Your role should show as "admin"
- You should see a "User Management" menu item with a shield icon

### Admin Features You Can Access
- **User Management** (`/admin/users`) - View, edit, and manage all users
- **Change User Roles** - Promote/demote users
- **Activate/Deactivate Users** - Enable or disable user accounts
- **Delete Users** - Remove users from the system

### Admin Permissions
As an admin, you have all permissions:
- ✅ View all catalogues
- ✅ Create, edit, delete catalogues
- ✅ Import and merge data
- ✅ Export catalogues
- ✅ Manage users
- ✅ Access system settings

---

## Troubleshooting

### "User not found" Error

If the script says user not found, list all users:
```bash
mongosh eq-catalogue --eval "db.users.find({}, {email:1, name:1, role:1}).pretty()"
```

Make sure you're using the exact email address from the database.

### Changes Not Taking Effect

**You MUST log out and log back in** for role changes to take effect. The role is stored in the JWT session token, which is only updated on login.

Steps:
1. Click avatar → Sign Out
2. Go to `/login`
3. Enter your credentials
4. Log in
5. Check avatar menu for "User Management"

### Can't Connect to MongoDB

Make sure your `.env` file has the correct MongoDB connection string:
```bash
MONGODB_URI=mongodb+srv://kerry_graham:<YOUR_PASSWORD>@serverlessinstance0.ta8golw.mongodb.net/eq-catalogue
MONGODB_DATABASE=eq-catalogue
```

### Script Errors

If the promotion script fails, try using MongoDB shell directly (Method 2).

---

## Quick Reference

### Promote User to Admin (Quick Command)

```bash
# Using the script
npx tsx scripts/promote-to-admin.ts your@email.com

# Using MongoDB shell
mongosh eq-catalogue --eval 'db.users.updateOne({email:"your@email.com"},{$set:{role:"admin",updated_at:new Date().toISOString()}})'
```

### List All Users

```bash
mongosh eq-catalogue --eval "db.users.find({}, {email:1, name:1, role:1}).pretty()"
```

### Check Your Current Role

```bash
mongosh eq-catalogue --eval 'db.users.findOne({email:"your@email.com"}, {name:1, email:1, role:1})'
```

---

## Security Notes

- **Protect admin accounts** - Admin users have full system access
- **Use strong passwords** - Especially for admin accounts
- **Limit admin users** - Only promote trusted users to admin
- **Audit admin actions** - Monitor what admins do in the system
- **First admin must be created manually** - Use Method 1 or 2 to create the first admin

---

## Next Steps

After becoming an admin:

1. **Test User Management** - Go to `/admin/users` and explore the interface
2. **Create More Users** - Register additional test accounts
3. **Test Role Changes** - Practice promoting/demoting users
4. **Explore Admin Features** - Check out all the admin-only functionality
5. **Set Up Production** - Change default passwords and secure your admin accounts

For more information, see:
- `docs/AUTHENTICATION.md` - Complete authentication documentation
- `docs/GETTING_STARTED_AUTH.md` - Authentication quick start guide

