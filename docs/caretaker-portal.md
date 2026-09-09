# Caretaker portal

Open `/caretaker.html` or use **Caretakers** in the shared site navigation.
Caretakers sign in with existing Nexus accounts or register using the normal public account flow. The workspace is available to authenticated accounts without granting staff roles or access to existing patient records.

Caretakers can save their own patient profiles (with an authorization acknowledgement), save one-way transportation plans, remove profiles and plans, and transfer a plan into the booking form. They must complete the existing booking and payment workflow to request transportation. Plans are not confirmed reservations, and deleting a plan never cancels a booking. Existing patient records cannot be searched or linked through this module.

## Deployment

Apply `database/migrations/077.001_caretaker_planning.sql` using the repository migration runner before enabling the portal. The normal Netlify production build runs migrations, but its current configuration allows a build to continue after migration failure; verify migration 077.001 succeeded. Publish the static files and updated API together. No new environment variables are required.

Data uses the existing server PostgreSQL connection and session authentication. Both tables enable RLS and deny public/direct client access. Server queries enforce account ownership; the composite foreign key prevents a plan from referencing another account's patient. The server database role must have the same table-owner access used by existing application tables.

## Verification

`node --test tests/caretaker-api.test.cjs`

`npx playwright test tests/caretaker-portal.spec.js`

Tests use simulated database/API responses; run a staging smoke test with two separate accounts after migration to verify persistence and isolation against the real database. The initial module does not share profiles between caretakers or synchronize draft plans with completed bookings.
