# Annapolis demo manager in User Management

`annapolis.demo@nexusmt.com` is a production user-directory record with a normal Nexus user ID, primary role `FACILITY`, and reserved scope `futurecare-annapolis-demo`. Admin → User Management lists it as **Facility demo only**. Its password hash, display name and active status are managed there. This is an integration with production identity management, not permission to see real patients, create real dispatch bookings or use production billing.

The production build initializes the account once using `NEXUS_ANNAPOLIS_DEMO_INITIAL_HASH` (production/build scope only). The initial plaintext password is delivered privately to the requesting owner, never committed or logged. Later deployments never overwrite the managed account's password or active status, even if the initialization hash is still present. After successful initialization, the build variable can be removed.

Both the facility demo sign-in and the main LiveCare Facility sign-in accept the same managed password. The main login recognizes the reserved account and redirects it to `/facility-demo.html`. It receives a demo-scoped token, never a production session. Production authorization also rejects this reserved identity even if an old production session exists.

Admins can edit the name/contact, activate/deactivate the account, and select **Manage → Issue demo password**. The password is generated server-side, shown once to the administrator, and stored only as a hash. No email is sent. New passwords invalidate previous demo tokens immediately. Active-status changes rotate the demo signing secret so reactivation cannot revive old tokens. The role and scope remain fixed to the presentation demo. Other account workflows continue to use their existing password policy.

Existing fictional trips, patient rosters, edits, invoice history and demo state remain intact. The old independent password hash is removed from demo configuration. The admin-only **Prepare demo manager access** action can initialize a missing account; if it exists, it points administrators to User Management rather than resetting it silently.

Validation: isolated PostgreSQL tests exercise initialization idempotence, legacy configuration migration with state preservation, actual main-login API integration, User Management listing and password issuance, access denial to production, old-password/session rejection, deactivation/reactivation and fixed role/scope.
