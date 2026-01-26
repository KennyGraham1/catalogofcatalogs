Debug Tools for Registration
============================


Browser Console Debugger
------------------------


Paste this into your browser console (F12) while on the registration page:

.. code-block:: javascript

   // Registration Debugger
   (function() {
     console.log('🔍 Registration Debugger Started');
     console.log('━'.repeat(50));
     
     // Check current page
     console.log('📍 Current URL:', window.location.href);
     console.log('📍 Expected URL:', window.location.origin + '/register');
     
     // Check form exists
     const form = document.querySelector('form');
     if (form) {
       console.log('✅ Form found');
       
       // Check inputs
       const inputs = {
         name: document.querySelector('#name, input[name="name"]'),
         email: document.querySelector('#email, input[type="email"]'),
         password: document.querySelector('#password, input[type="password"]'),
       };
       
       Object.entries(inputs).forEach(([name, input]) => {
         if (input) {
           console.log(`✅ ${name} input found, value: "${input.value}"`);
         } else {
           console.log(`❌ ${name} input NOT found`);
         }
       });
       
       // Check submit button
       const submitBtn = document.querySelector('button[type="submit"]');
       if (submitBtn) {
         console.log('✅ Submit button found:', submitBtn.textContent);
         console.log('   Disabled:', submitBtn.disabled);
       } else {
         console.log('❌ Submit button NOT found');
       }
     } else {
       console.log('❌ Form NOT found on page');
     }
     
     // Test API endpoint
     console.log('\n🌐 Testing API endpoint...');
     fetch('/api/auth/register', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         name: 'Debug Test',
         email: `debug_${Date.now()}@test.com`,
         password: 'debugtest123'
       })
     })
     .then(res => {
       console.log('📡 API Response Status:', res.status);
       return res.json();
     })
     .then(data => {
       console.log('📡 API Response Data:', data);
       if (data.user) {
         console.log('✅ API is working! Test user created:', data.user.email);
         // Clean up test user
         console.log('🧹 Note: Test user created, you may want to delete it');
       } else if (data.error) {
         console.log('⚠️  API returned error:', data.error);
       }
     })
     .catch(err => {
       console.log('❌ API request failed:', err.message);
     });
     
     console.log('━'.repeat(50));
     console.log('💡 Tip: Check the Network tab for detailed request info');
   })();


Quick Test Function
-------------------


Add this to your browser console to quickly test registration:

.. code-block:: javascript

   async function testRegistration(email = `test_${Date.now()}@example.com`) {
     console.log('🧪 Testing registration with:', email);
     
     try {
       const response = await fetch('/api/auth/register', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           name: 'Test User',
           email: email,
           password: 'testpassword123'
         })
       });
       
       const data = await response.json();
       
       console.log('Status:', response.status);
       console.log('Response:', data);
       
       if (response.ok) {
         console.log('✅ SUCCESS! User created:', data.user.id);
         return data.user;
       } else {
         console.log('❌ FAILED:', data.error);
         return null;
       }
     } catch (error) {
       console.log('❌ ERROR:', error.message);
       return null;
     }
   }
   
   // Usage:
   // testRegistration()  // Uses random email
   // testRegistration('myemail@example.com')  // Uses specific email


Monitor Form Submission
-----------------------


Paste this to watch form submissions in real-time:

.. code-block:: javascript

   // Form Submission Monitor
   const form = document.querySelector('form');
   if (form) {
     form.addEventListener('submit', (e) => {
       console.log('📝 Form submitted!');
       console.log('Form data:', {
         name: document.querySelector('#name')?.value,
         email: document.querySelector('#email')?.value,
         password: '***hidden***',
       });
     });
     console.log('✅ Form monitor installed');
   } else {
     console.log('❌ No form found');
   }


Check Environment
-----------------


Quick environment check:

.. code-block:: javascript

   async function checkEnvironment() {
     console.log('🔍 Environment Check');
     console.log('━'.repeat(50));
     
     // Check API endpoint
     try {
       const res = await fetch('/api/auth/session');
       console.log('✅ API is accessible');
     } catch (e) {
       console.log('❌ API not accessible:', e.message);
     }
     
     // Check current session
     try {
       const res = await fetch('/api/auth/session');
       const session = await res.json();
       if (session.user) {
         console.log('ℹ️  Already logged in as:', session.user.email);
       } else {
         console.log('ℹ️  Not logged in');
       }
     } catch (e) {
       console.log('⚠️  Could not check session');
     }
     
     console.log('━'.repeat(50));
   }
   
   checkEnvironment();


Network Request Logger
----------------------


Log all fetch requests:

.. code-block:: javascript

   // Intercept fetch requests
   const originalFetch = window.fetch;
   window.fetch = function(...args) {
     console.log('🌐 Fetch Request:', args[0]);
     if (args[1]) {
       console.log('   Method:', args[1].method || 'GET');
       if (args[1].body) {
         try {
           const body = JSON.parse(args[1].body);
           console.log('   Body:', { ...body, password: '***' });
         } catch (e) {
           console.log('   Body:', args[1].body);
         }
       }
     }
     
     return originalFetch.apply(this, args)
       .then(response => {
         console.log('📡 Response:', response.status, response.statusText);
         return response;
       })
       .catch(error => {
         console.log('❌ Fetch Error:', error.message);
         throw error;
       });
   };
   
   console.log('✅ Fetch logger installed');


Bookmarklet
-----------


Create a bookmark with this URL to run the debugger on any page:

.. code-block:: javascript

   javascript:(function(){console.log('🔍 Registration Debugger');const form=document.querySelector('form');if(form){console.log('✅ Form found');const inputs={name:document.querySelector('#name'),email:document.querySelector('#email'),password:document.querySelector('#password')};Object.entries(inputs).forEach(([name,input])=>{if(input){console.log(`✅ ${name}: ${input.value}`)}else{console.log(`❌ ${name} NOT found`)}})}else{console.log('❌ Form NOT found')};fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Debug',email:`debug_${Date.now()}@test.com`,password:'debug123'})}).then(r=>r.json()).then(d=>console.log('API Response:',d)).catch(e=>console.log('API Error:',e))})();


**To use:**
1. Create a new bookmark
2. Name it "Debug Registration"
3. Paste the above code as the URL
4. Click the bookmark while on the registration page

React DevTools
--------------


If you have React DevTools installed:

1. Open React DevTools
2. Find the ``RegisterPage`` component
3. Check the state:
   - ``name``
   - ``email``
   - ``password``
   - ``confirmPassword``
   - ``error``
   - ``loading``

MongoDB Query Helper
--------------------


Run in MongoDB shell to check users:

.. code-block:: javascript

   // Connect to database
   use earthquake_catalogue
   
   // Count users
   db.users.countDocuments()
   
   // Find all users (hide passwords)
   db.users.find({}, { password_hash: 0 }).pretty()
   
   // Find specific user
   db.users.findOne({ email: "test@example.com" })
   
   // Check if email exists
   db.users.findOne({ email: "test@example.com" }) ? "EXISTS" : "NOT FOUND"
   
   // Delete test users
   db.users.deleteMany({ email: /^test_.*@example\.com$/ })
   
   // Check user roles
   db.user_roles.find().pretty()
   
   // Verify indexes
   db.users.getIndexes()


Server-Side Debugging
---------------------


Add to ``app/api/auth/register/route.ts`` for detailed logging:

.. code-block:: typescript

   export async function POST(request: NextRequest) {
     console.log('🔍 Registration request received');
     
     try {
       const body = await request.json();
       console.log('📝 Request body:', { ...body, password: '***' });
       
       const { email, password, name } = body;
       
       // ... rest of the code
       
       console.log('✅ User created successfully:', user.id);
       
       return NextResponse.json(/* ... */);
     } catch (error) {
       console.error('❌ Registration error:', error);
       // ... error handling
     }
   }


Quick Commands
--------------


.. code-block:: bash

   # Check if server is running
   curl -I http://localhost:3001
   
   # Test registration API
   curl -X POST http://localhost:3001/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"name":"Test","email":"test@test.com","password":"test1234"}'
   
   # Check MongoDB
   mongosh --eval "use earthquake_catalogue; db.users.countDocuments()"
   
   # View server logs
   npm run dev 2>&1 | tee server.log
   
   # Check environment variables
   env | grep -E "NEXTAUTH|MONGODB"


Automated Test Script
---------------------


Save as ``test-reg.sh``:

.. code-block:: bash

   #!/bin/bash
   EMAIL="test_$(date +%s)@example.com"
   echo "Testing registration with: $EMAIL"
   
   curl -X POST http://localhost:3001/api/auth/register \
     -H "Content-Type: application/json" \
     -d "{\"name\":\"Test User\",\"email\":\"$EMAIL\",\"password\":\"testpass123\"}" \
     -w "\nHTTP Status: %{http_code}\n" \
     | jq '.'


Run with: ``bash test-reg.sh``

Tips
----


1. **Always check browser console first** - Most issues show up there
2. **Use Network tab** - See exact request/response
3. **Check server logs** - Backend errors appear here
4. **Test with curl** - Isolate frontend vs backend issues
5. **Use test page** - ``http://localhost:3001/test-registration.html``
6. **Run test script** - ``npx tsx scripts/test-registration.ts``

Common Console Commands
-----------------------


.. code-block:: javascript

   // Check if logged in
   fetch('/api/auth/session').then(r=>r.json()).then(console.log)
   
   // Test registration
   fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Test',email:'test@test.com',password:'test1234'})}).then(r=>r.json()).then(console.log)
   
   // Check form state (if using React DevTools)
   $r.state  // or $r.props
