# DriveFlex dashboard

Routes:

- `/driveflex`: public opportunities, fixed payouts, filters, and signed-in driver requests.
- `/driveflex/apply`: private applicant checklist and training requests.
- `/driveflex/manage`: staff trip publishing, request selection, and payment recording.
- `/driveflex/manage?view=applications`: administrator checklist review and driver linking.
- `/driveflex/dispatch`: existing open-shift publishing and review.

Selection is provisional. Staff must finalize the assignment in dispatch. Recording an issued payment does not transfer money.

## Local verification

Run `node --test tests/driveflex-marketplace.node.cjs` and `npx playwright test --config playwright.driveflex-design.config.js`. Browser tests mock API responses; the backend test executes the marketplace migration and trip lifecycle in an isolated PGlite database. Production integrations are not exercised by these tests.

## Release requirements

Before production use, apply `database/migrations/092.001_driveflex_marketplace.sql` using the repository's migration workflow. Configure `DRIVEFLEX_DOCUMENT_KEY` as a base64-encoded, cryptographically random 32-byte secret in the server environment. Preserve this key securely: uploaded files require the same key for decryption. Verify the existing application email service delivers private return links.

Deploy the page assets, API module, shared checklist/marketplace modules, and Netlify rewrites together. The local work does not apply the migration, configure the production secret, or deploy the application. Confirm production driver sign-in, applicant email delivery, secure upload/download, and dispatch assignment handoff before rollout.
