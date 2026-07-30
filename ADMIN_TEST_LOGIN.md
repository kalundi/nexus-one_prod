# Build 042 Admin Test Login

Create or reset the local/test administrator with:

```powershell
$env:DATABASE_URL="your PostgreSQL connection string"
$env:NEXUS_ADMIN_EMAIL="admin@nexusmt.com"
$env:NEXUS_ADMIN_PASSWORD="NexusAdmin042!"
npm run admin:create-test
```

For local testing, the email and password environment variables are optional; the script defaults to the values shown above.

Start the app with:

```powershell
npx netlify dev --dir dist
```

Open `http://localhost:8888/livecare.html`, choose **Dispatch sign in**, and enter the administrator credentials. An ADMIN account is accepted by the dispatch sign-in workflow. Then open `http://localhost:8888/admin.html` to test administrator permissions.

Do not use the example password in production. Reset or disable the test account when permission testing is complete.
