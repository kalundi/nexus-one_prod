# Nex Group Intelligence — unofficial linked-device pilot (disabled by default)

## What this is (and is NOT)
An optional **unofficial WhatsApp Web linked device** using the **existing Nexus WhatsApp Business account** as explicitly selected by the account owner, on a secured, persistent VPS. A separate dedicated account remains available as a safer fallback. It is **not** Meta's official
WhatsApp Cloud API. It may violate WhatsApp's Business App terms, break at any
time, or lead to restrictions or suspension of the dedicated account. Do not
use the existing Nexus customer-facing WhatsApp account without explicitly accepting the risk that the number may be suspended or its business operation disrupted.

This pilot tracks *new* messages in explicitly allowlisted, non-patient,
business-only groups. It looks locally for heuristic action categories
(task, deadline, question, decision, other), then transmits a signed metadata
event to Nexus. It does **not** store or upload WhatsApp message bodies, names,
media, phone numbers, JIDs, contact lists, or historical transcripts in
PostgreSQL. It never posts to WhatsApp. It does not yet produce full summaries,
create real tasks, assign responsibilities or monitor patient care. The
WhatsApp Web browser profile, however, can cache conversation material locally
on the VPS; secure and restrict this storage.

The prototype requires an administrator to explicitly enable group monitoring
after group members have been informed and proper organizational consent
has been obtained. If patient details appear, disconnect or stop monitoring,
assess the data, and use an authorized communications channel.

## Deployment prerequisites
- The existing Nexus WhatsApp Business account remains primary on the iPhone.
  The user has chosen to link this **existing business number**. No replacement
  number, migration or 360dialog subscription is required. The account must
  already be a member of every group being monitored.
- **Critical risk:** the unofficial automation may breach WhatsApp Business App
  terms, cause the **actual live Nexus customer-facing number** to be restricted,
  and interrupt patient/transport operations. The account owner must review
  and accept that risk outside of this repository before scanning a QR.
- Linked-device browser synchronization and local session data may contain
  messages from **all chats**, including DMs or unapproved groups, even when
  Nexus uploads only approved-group signal categories. The software cannot
  guarantee that unrelated chats never reach the VPS browser cache.
- Back up the phone's WhatsApp Business chats first. Use a segregated, encrypted
  VPS session and obtain authorization from the relevant group administrators.
- A non-root Unix service account on Nexus's persistent VPS (not Netlify).
- Restricted VPS access, full disk encryption where available, strong SSH
  authentication, OS patching, supervised process, protected backups.
- Node.js >=20.20, Chromium/Puppeteer runtime dependencies, persistent auth
  directory outside Git checkout (e.g. /var/lib/nex-wa/session) with 0700.
- Review and run SQL migration `999.006_nex_group_signals.sql` on the same
  Nexus PostgreSQL database used by Netlify.
- Notify every monitored group about automated activity classification,
  purpose, storage and retention before enabling. For example:

  "Nexus uses a read-only Nex assistant account in this group to count
  operational topics such as action items, deadlines and questions.
  No chat text is uploaded to the Nexus dashboard. Please do not post
  patient-identifying information. Contact the group administrator with
  questions or to object before monitoring starts."

## One-time discovery (no forwarding)
Install inside `tools/nex-whatsapp-group-bridge/` using `npm install`.
Use a protected environment file readable only by the service account,
never committed to Git. Example variable NAMES (not real values):

```dotenv
NEX_GROUP_ACCOUNT_MODE=existing_business
NEX_GROUP_EXISTING_BUSINESS_OWNER_AUTHORIZED=true
NEX_GROUP_EXISTING_BUSINESS_RISK_ACKNOWLEDGED=true
NEX_GROUP_OTHER_CHAT_SYNC_RISK_ACKNOWLEDGED=true
NEX_GROUP_EXPECTED_PHONE_E164=<your-business-number-in-international-format>
NEX_GROUP_AUTH_DIR=/var/lib/nex-wa/session
NEX_GROUP_DISCOVERY_MODE=true
NEX_GROUP_SHARED_SECRET=<generate-private-random-secret-at-least-32-chars>
```

Run `node index.cjs` from an interactive SSH terminal. A QR code is displayed
only when the process has an interactive terminal; do not stream it into
persistent logs. On the **current Nexus WhatsApp Business iPhone**, choose WhatsApp Business >
Settings > Linked Devices > Link a Device and scan that QR. This is a
**high-risk action**, because the unofficial client connects to the real
customer-facing number. Do not scan before the security and policy review.
Keep WhatsApp Business installed on the iPhone; do not migrate or unregister
its number. On connection, the process prints group
names, group JIDs and corresponding HMAC digests to your terminal ONLY.
Copy the JIDs and digests to secure administrative configuration. This pilot
DOES NOT automatically read or publish conversation text.

**Note:** WhatsApp Web or its session cache may synchronize information
locally even in discovery mode. Do not use it with unapproved groups.
Stop the discovery process before configuring continuous service.

## Production enablement (manual, after review)
Set protected VPS service variables (DO NOT place secrets in Git, Netlify
source, or chat messages):

```dotenv
NEX_GROUP_DISCOVERY_MODE=false
NEX_GROUP_ACCOUNT_MODE=existing_business
NEX_GROUP_EXISTING_BUSINESS_OWNER_AUTHORIZED=true
NEX_GROUP_EXISTING_BUSINESS_RISK_ACKNOWLEDGED=true
NEX_GROUP_OTHER_CHAT_SYNC_RISK_ACKNOWLEDGED=true
NEX_GROUP_EXPECTED_PHONE_E164=<your-business-number-in-international-format>
NEX_GROUP_BRIDGE_ENABLED=true
NEX_GROUP_NOTICE_CONFIRMED=true
NEX_GROUP_ALLOWLIST=<comma-separated-exact-approved-group-JIDs>
NEX_GROUP_SHARED_SECRET=<same-long-random-secret-as-Netlify>
NEX_GROUP_INGEST_URL=https://nexusmt.com/.netlify/functions/nex-group-ingest
NEX_GROUP_AUTH_DIR=/var/lib/nex-wa/session
```

Set protected Netlify environment variables (only after migration and
security review):

```dotenv
NEX_GROUP_INGEST_ENABLED=true
NEX_GROUP_SHARED_SECRET=<same-long-random-secret-as-VPS>
NEX_GROUP_ALLOWED_DIGESTS=<comma-separated-HMAC-group-digests-from-discovery>
```

To stop ingestion immediately, set `NEX_GROUP_INGEST_ENABLED=false` on
Netlify and restart the VPS service with `NEX_GROUP_BRIDGE_ENABLED=false`.
Stopping only the server endpoint does not prevent the linked device from
continuing to receive messages: **stop/unlink the device as well**.

Data protections:
- Deny non-group chats, history events, self messages, media, and unapproved JIDs.
- Require messages to be newer than live monitor startup (3-second clock tolerance),
  discard delayed messages over 10 minutes old, and never bulk import history.
- HMAC pseudonyms, signed request timestamps, HTTP body size cap, server-side
  group allowlist, idempotent unique event digests.
- Only aggregate event categories in admin UI; no names, user identifiers or
  message text. A scheduled purge deletes metadata older than 30 days.
- Limited in-memory queue (100), no persistent message queue. Some events may
  be lost on restarts, disconnects, retries or outages. No completeness SLA.
- No network egress besides WhatsApp Web services and the approved Nexus
  ingestion endpoint. No outbound WhatsApp sending functions.
- A whitelist category detector may misclassify text; counts are indicators
  only, not confirmed obligations or dispatch decisions.

## Validation before starting
1. `node --test tests/nex-group-bridge.test.cjs` from repo root.
2. Check group-member notice/consent and allowed group IDs/digests.
   Independently review the increased risk of using the **existing, active
   Nexus business number**, its WhatsApp Business App terms, any customer data
   accessible to browser cache, and the need for service continuity.
3. Check server migration, endpoint disabled-by-default behavior and timestamp
   replay protection with nonpatient, controlled test messages.
4. Confirm the dashboard at `/nex-group-monitor.html` is ADMIN-only.
5. Test disconnection/kill switch, retention purge, session profile ownership,
   and ensure no QR/session secrets or text enter logs.
6. Make a separate reviewed privacy/security decision before allowing *any*
   message-body collection or AI-generated summaries.

This is a technical pilot and **not a guarantee of continuous WhatsApp access**.
There is no 360dialog platform fee for this architecture, but there can be
VPS operating costs and significant maintenance risk.

References:
https://wwebjs.dev/guide/creating-your-bot/authentication.html
https://www.whatsapp.com/legal/WhatsApp-Terms-for-WhatsApp-Business-App

## Optional dedicated account instead
To switch back to a dedicated Nex number (lower business-continuity risk),
set `NEX_GROUP_ACCOUNT_MODE=dedicated` and
`NEX_GROUP_DEDICATED_ACCOUNT_CONFIRMED=true` instead of the three
existing-business acknowledgement flags. **The exact business phone number belongs in the protected VPS environment only.**
Do not commit it in the repository, write it in PR comments, or place it in
browser-facing JavaScript. The bridge compares the signed-in account's
`client.info.wid.user` against the configured E.164 number and refuses to
monitor mismatched sessions. The expected account number must be checked
in the phone app before pairing. A matching number does not make the unofficial
link safe or approved by WhatsApp.

The two account modes use separate
`LocalAuth` browser profiles. Never share an active authentication profile
between account modes.
