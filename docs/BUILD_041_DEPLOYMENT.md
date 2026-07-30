# Build 041 deployment procedure

```cmd
npm install
npm run verify
npm run db:check
npm run db:migrate
npm run db:check
npm run build
```

After deployment, open:
- `/api/health` — PostgreSQL connectivity
- `/api/ready` — required migration readiness

Production must return HTTP 200 from both endpoints before traffic is enabled.
