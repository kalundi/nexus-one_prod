# Nexus user management

Open Administration → User management → People. Search by name, email, phone or Nexus ID. **Manage** opens profile, primary role, operational function labels, account activation and login support. **Manage schedule** opens that driver's coverage directly.

Every database account receives a permanent random ID such as **N4827** when created. Existing accounts receive IDs during migration 086.001. Issued IDs stay reserved even after account deletion. The allocator checks uniqueness under a transaction lock; longer IDs are available if the four-digit pool becomes crowded. The ID never changes when an account is edited, deactivated, reactivated or given another role. UUID relationships remain intact; the short ID is the unique human-readable alternate key. Admin account and schedule APIs accept either key. Authentication responses, website account menus, the patient identity, driver dashboard, roster and schedule directory expose the same short ID.

Roles determine permissions and available experiences. Operational functions describe responsibilities (for example Driving, Patient care, Dispatch or Billing); checking a function does not grant a privileged role. Existing approved extra roles remain available through the access-request workflow.

## Driver coverage

Schedules use Eastern Time. Select a driver, start/end time, weekdays, effective start and optional end date. Shifts end later on the same day; use separate daily shifts for coverage across midnight.

- **Add schedule** creates additional coverage for the driver. For example, save Mon–Fri 6:00 AM–3:00 PM, then add Sat–Sun 10:00 AM–4:00 PM. Both schedules remain active. Separate shifts on the same day are also supported when their hours do not overlap.
- **Edit** revises the selected weekly pattern. A future effective date keeps previous coverage until the preceding day. Other patterns remain intact, and overlapping active coverage is rejected.
- **Deactivate / Activate** switches the selected pattern immediately. Reactivation cannot overlap active coverage or revive an ended date range; edit its dates instead.
- **Show inactive and ended** includes schedule history.

Booking availability, Dispatch approval and automatic assignment use the same account/employee/role/shift eligibility. Dispatch's scheduler also respects effective dates. Inactive accounts or shifts contribute no available drivers. The driver app checks coverage on startup, foregrounding and every 30 seconds, and prevents starting a shift or a new trip outside active coverage. Existing trip completion remains available when a scheduled window ends. Account deactivation revokes existing sessions without deleting the user's shifts.

Patient and driver bookings now link to the immutable account UUID. Migration 086.001 backfills unambiguous existing matches. Patient contact edits and driver name changes retain linked trips; caretaker approvals still control caregiver access. New patient accounts also link existing bookings with the same email. Historical display names and audit entries remain available.

## Validation

`node --test tests/user-manager.test.cjs tests/admin-experience-access.test.cjs tests/employee-driver-lookup.test.cjs`

`node node_modules/@playwright/test/cli.js test tests/admin-users.spec.js tests/driver-schedule-availability.spec.js`

These tests use an isolated PostgreSQL engine and mocked browser APIs; they do not change live accounts, schedules or send credential emails.
