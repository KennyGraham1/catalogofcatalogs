Change Password Feature
=======================


This guide explains how users can change their password in the Earthquake Catalogue Platform.

Overview
--------


All authenticated users can change their own password at any time. This is a security best practice to:
- Keep accounts secure
- Update passwords periodically
- Change passwords if they've been compromised
- Set a new password after initial registration



How to Change Your Password
---------------------------


Method 1: From the User Menu (Recommended)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


1. **Click your avatar** in the top right corner
2. **Click "Change Password"** from the dropdown menu
3. You'll be redirected to the change password page

Method 2: From Your Profile Page
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


1. Go to your **Profile** page (``/profile``)
2. Click the **"Change Password"** button at the bottom
3. You'll be redirected to the change password page

Method 3: Direct URL
^^^^^^^^^^^^^^^^^^^^


Navigate directly to: **``/change-password``**



Change Password Form
--------------------


The change password page requires three fields:

1. Current Password
^^^^^^^^^^^^^^^^^^^

- Your existing password
- Required to verify your identity
- Must match your current password exactly

2. New Password
^^^^^^^^^^^^^^^

- Your new password
- Must be at least **8 characters long**
- Should be different from your current password
- Use a strong password with a mix of:
  - Uppercase and lowercase letters
  - Numbers
  - Special characters

3. Confirm New Password
^^^^^^^^^^^^^^^^^^^^^^^

- Re-enter your new password
- Must match the "New Password" field exactly
- Helps prevent typos



Password Requirements
---------------------


✅ **Minimum length:** 8 characters  
✅ **Must be different** from current password  
✅ **Must match** confirmation field  

**Recommended:**
- Use a mix of uppercase and lowercase letters
- Include numbers
- Include special characters (!@#$%^&*)
- Avoid common words or patterns
- Don't reuse passwords from other sites



Step-by-Step Instructions
-------------------------


Step 1: Access the Change Password Page
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Choose one of the methods above to navigate to ``/change-password``.

Step 2: Enter Your Current Password
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


1. In the **"Current Password"** field, enter your existing password
2. Click the eye icon to show/hide the password if needed

Step 3: Enter Your New Password
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


1. In the **"New Password"** field, enter your new password
2. Make sure it's at least 8 characters long
3. Use a strong, unique password

Step 4: Confirm Your New Password
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


1. In the **"Confirm New Password"** field, re-enter your new password
2. Make sure it matches exactly

Step 5: Submit the Form
^^^^^^^^^^^^^^^^^^^^^^^


1. Click the **"Change Password"** button
2. Wait for the confirmation message

Step 6: Success!
^^^^^^^^^^^^^^^^


- You'll see a success message: "Password changed successfully!"
- You'll be automatically redirected to your profile page
- Your new password is now active
- You can use it immediately for future logins



Common Errors and Solutions
---------------------------


"Current password is incorrect"
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**Problem:** The current password you entered doesn't match your actual password.

**Solution:**
- Double-check your current password
- Make sure Caps Lock is off
- Try clicking the eye icon to see what you're typing
- If you've forgotten your password, you'll need to contact an admin

"New password must be at least 8 characters long"
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**Problem:** Your new password is too short.

**Solution:**
- Make your password at least 8 characters
- Consider using a longer password for better security

"New passwords do not match"
^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**Problem:** The "New Password" and "Confirm New Password" fields don't match.

**Solution:**
- Re-enter both fields carefully
- Use the eye icon to verify what you're typing
- Copy-paste is not recommended for passwords

"New password must be different from current password"
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**Problem:** You're trying to change to the same password you already have.

**Solution:**
- Choose a different password
- This is a security measure to ensure you're actually updating your password



Security Best Practices
-----------------------


When to Change Your Password
^^^^^^^^^^^^^^^^^^^^^^^^^^^^


✅ **Regularly** - Every 3-6 months  
✅ **After a security incident** - If you suspect your account was compromised  
✅ **After using a public computer** - If you logged in on a shared device  
✅ **If you shared it** - If you accidentally shared your password  
✅ **After initial registration** - Change from any temporary password  

Creating Strong Passwords
^^^^^^^^^^^^^^^^^^^^^^^^^


**Good Examples:**
- ``MyC@t$Name2024!``
- ``Tr0pic@lSt0rm#99``
- ``B1ueM00n&Stars!``

**Bad Examples:**
- ``password`` (too common)
- ``12345678`` (too simple)
- ``qwerty`` (keyboard pattern)
- ``admin123`` (predictable)

**Tips:**
- Use a password manager to generate and store strong passwords
- Don't reuse passwords across different sites
- Don't share your password with anyone
- Don't write it down in plain text



For Administrators
------------------


Resetting User Passwords
^^^^^^^^^^^^^^^^^^^^^^^^


Admins cannot see user passwords (they're hashed), but they can help users who forgot their password:

**Option 1: Manual Database Update**

.. code-block:: bash

   # Generate a new password hash
   npx tsx -e "import bcrypt from 'bcryptjs'; bcrypt.hash('newpassword123', 10).then(console.log)"
   
   # Update in MongoDB
   mongosh eq-catalogue --eval 'db.users.updateOne({email:"user@email.com"},{$set:{password_hash:"<hash>"}})'


**Option 2: Create a Password Reset Script**

Consider creating a password reset script for easier admin password resets.



API Endpoint
------------


The password change functionality uses the following API endpoint:

**Endpoint:** ``POST /api/auth/change-password``

**Request Body:**
.. code-block:: json

   {
     "currentPassword": "oldpassword123",
     "newPassword": "newpassword456"
   }


**Success Response (200):**
.. code-block:: json

   {
     "message": "Password changed successfully"
   }


**Error Responses:**

- **401 Unauthorized** - Not logged in
- **401 Unauthorized** - Current password is incorrect
- **400 Bad Request** - Missing required fields
- **400 Bad Request** - New password too short
- **404 Not Found** - User not found
- **500 Internal Server Error** - Server error



Troubleshooting
---------------


Can't Access the Change Password Page
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**Problem:** Getting redirected to login page.

**Solution:**
- You must be logged in to change your password
- Log in first, then try again

Form Not Submitting
^^^^^^^^^^^^^^^^^^^


**Problem:** Nothing happens when you click "Change Password".

**Solution:**
- Check for error messages on the page
- Make sure all fields are filled in
- Check that passwords meet requirements
- Check browser console for errors (F12)

Password Changed But Can't Login
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**Problem:** Changed password successfully but can't log in with new password.

**Solution:**
- Make sure you're using the NEW password, not the old one
- Check for typos
- Make sure Caps Lock is off
- Clear browser cache and try again
- If still having issues, contact an admin



Related Documentation
---------------------


- **Authentication Guide** - ``docs/AUTHENTICATION.md``
- **User Profile** - ``docs/USER_PROFILE.md``
- **How to Become Admin** - ``docs/HOW_TO_BECOME_ADMIN.md``
- **Getting Started** - ``docs/GETTING_STARTED_AUTH.md``



Quick Reference
---------------


Access Change Password Page
^^^^^^^^^^^^^^^^^^^^^^^^^^^


.. code-block:: text

   Method 1: Avatar Menu → "Change Password"
   Method 2: Profile Page → "Change Password" button
   Method 3: Direct URL → /change-password


Password Requirements
^^^^^^^^^^^^^^^^^^^^^


.. code-block:: text

   ✅ Minimum 8 characters
   ✅ Different from current password
   ✅ Must match confirmation


Common Commands
^^^^^^^^^^^^^^^


.. code-block:: bash

   # Check user's current info (doesn't show password)
   npx tsx scripts/check-user-role.ts user@email.com
   
   # Generate password hash (for admin password resets)
   npx tsx -e "import bcrypt from 'bcryptjs'; bcrypt.hash('newpassword', 10).then(console.log)"
