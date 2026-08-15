# Nexus KeyMark Staging Deployment

## Current gate

KeyMark can be deployed to staging with its EHR connector left in `CONFIGURATION_REQUIRED`. Do not activate FHIR polling until the healthcare administrator supplies the tenant-specific FHIR base URL, OAuth token URL, authentication method, and approved scopes.

## Before creating the staging deploy

1. Use a dedicated KeyMark branch and exclude unrelated test artifacts or driver changes from the commit.
2. Configure a staging PostgreSQL database as `DATABASE_URL` or `NETLIFY_DB_URL`.
3. Configure `NEXUS_ADMIN_PASSWORD` as a protected Netlify environment variable. Never place it in `netlify.toml`.
4. Configure a high-entropy `KEYMARK_INTEGRATION_API_KEY` as a protected staging-only value.
5. Keep `ALLOW_FALLBACK_AUTH=false`.
6. Leave Twilio and payer credentials unset until their workflows are approved. Outreach and payer health should report unconfigured rather than send traffic.

## Verification commands

```text
npm.cmd run verify:keymark:staging
node --test tests/keymark-connectors.test.cjs tests/keymark-fhir-client.test.cjs tests/keymark-outreach.test.cjs
npm.cmd run build
```

## Database migration

Run `npm.cmd run db:migrate` against the staging database and verify that `schema_migrations` contains `062.001` and `063.001`. Do not point the command at production during staging preparation.

## Staging smoke test

1. Sign in with an authorized Admin or Dispatcher staging account.
2. Open `/keymark` and confirm unauthorized users are redirected.
3. Create a synthetic appointment with no real patient information.
4. Confirm it appears in the care-team queue and analytics.
5. Update barriers, transportation status, and arrival outcome.
6. Confirm facility-scoped users cannot access appointments outside their facility.
7. Submit the same synthetic FHIR payload twice and confirm deduplication.
8. Confirm `/api/keymark/integration-health` does not expose secrets.
9. Confirm scheduled FHIR sync does not call an EHR while no active connection exists.
10. Confirm outreach remains blocked unless consent is `GRANTED` and Twilio is configured.

## EHR activation gate

After the administrator supplies the connection information, create the sandbox connection, store its secret or private key in the protected environment, run the connection test, and validate `Appointment`, `Patient`, and `Location` access using non-production data before enabling production polling.
