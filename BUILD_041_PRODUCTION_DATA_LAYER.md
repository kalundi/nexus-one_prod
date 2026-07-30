# Build 041 — Production Data Layer Integration

## Implemented
- Netlify Functions API gateway at `/api/*`.
- PostgreSQL connection pool supporting `DATABASE_URL` and Netlify's `NETLIFY_DB_URL`.
- Versioned migration `041.001` for facilities, patients, vehicles, recurring trips, and invoices.
- Database-backed authentication sessions, role-scoped trip retrieval, dispatch status updates, fleet telemetry, facilities, and patients.
- Central browser client `nexus-data.js`.
- Health and readiness endpoints.
- Database migration, connectivity, static build, and structural verification scripts.
- Existing static portal preserved as the current working interface.

## Security
- No database credentials are included in the package.
- Preview credentials are not created.
- API responses are no-store and role checks are enforced server-side.
- Every dispatch state change is written to status history and audit log.

## Deployment
1. Rotate any previously exposed database credential.
2. Set `DATABASE_URL` in Netlify, or rely on `NETLIFY_DB_URL`.
3. Run `npm install` locally once to create a lockfile.
4. Run `npm run db:migrate` against the intended database.
5. Deploy to Netlify.
6. Verify `/api/health` and `/api/ready`.

## Scope note
The uploaded artifact was a compiled deployment package rather than the original React source tree. Build 041 therefore adds the production backend and data client without rebuilding the compiled React bundle. The next source-based build should replace remaining localStorage write paths in the original source components.
