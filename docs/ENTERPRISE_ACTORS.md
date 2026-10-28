# Enterprise Actor foundation

An Actor is a shared business identity, separate from authentication. A person may be an employee, patient and contact; an entity may be a facility and provider organization. Multiple classifications are supported. EMT, Advanced EMT, Paramedic and the other EMS titles remain distinct from canonical workspace permissions.

## Production integration

Migration 097.001 adds Actor foreign keys to users, employees, patients, facilities and organizations. Existing records are backfilled, and triggers maintain identities for future records and name changes. An employee shares an Actor with its explicitly linked user. Matching names or emails never merge identities. Patient and facility records preserve their existing primary keys and operational fields.

Authoritative existing links seed and maintain `WORKS_FOR` (employee user to organization), `CONTACT_FOR` (facility manager to assigned facility), and `RECEIVES_CARE_AT` (patient record to facility). Administrators can record `OPERATES`, `SERVES` and additional contact relationships. Relationships can have several targets. Source-generated and manual classifications are stored separately so source synchronization preserves manual classifications.

Changing an employee's explicit user link moves its current classification to that user's identity. The prior identity and manually recorded relationships remain for administrator reconciliation; the migration never guesses how to merge histories. Actor active status is independent of account activation and does not control login.

## Administrator directory

Open **Admin → Enterprise directory** (`/enterprise.html`). Search or filter the existing identities, inspect source records, add classifications, create directory identities, and record business relationships. Creating a directory identity does not create a login, employee credential record, patient transport profile, or facility billing account. Continue to use the existing operational workflows for those records.

The `/api/admin/actors` endpoints require the active ADMIN permission. The database tables have RLS enabled and public/client access revoked. Writes use parameterized queries, validation and transactions, with actor events recorded in the same transaction. Facility managers and other nonadministrators cannot query this organization-wide directory. Classifications and relationships never change `users.role`, `access_title`, `scope_id` or approved access grants.

## Incremental scope

This release establishes identities and relationships around current records. Trips, communications and frequently visited locations continue using their established patient, facility and user foreign keys; those source records now point to Actors. It does not reassign historical bookings, infer facility types from names, or infer organization ownership. Administrators classify Hospital, Dialysis, SNF, ALF, Clinic, Provider, Payer, Vendor and Government explicitly from known records.

Validation covers migration replay, backfill, same-name separation, explicit employee identity sharing, future records, title and facility changes, multi-classification, invalid kinds, transactional rollback, access denial and desktop/mobile directory workflows.
