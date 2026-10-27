# Montgomery County outreach automation

The approved audience contains 262 deduplicated Tier A Montgomery County contacts from `Nexus_Healthcare_Network_Prospects.xlsx`. The campaign retains its existing ID so the 25 previously recorded initial emails are never resent. Rebuild the audience only from that source with `python scripts/prepare-outreach-draft.py SOURCE data/montgomery-tier-a-outreach-pilot.json all`; existing suppression and delivery records always take precedence over the workbook's original status.

The published Netlify scheduler checks each minute in the possible UTC hours and gates sends to Tuesday–Thursday, 9:30–10:30 AM America/New_York, including daylight saving changes. It sends at most 25 initial messages and 25 due follow-ups per day, one message per invocation to fit Netlify's 30-second scheduled-function limit. Each prospect receives an initial message and at most one follow-up after five business days, in the next allowed sending window. There is no repeating follow-up loop.

The Admin Outreach workspace shows all contacts, initial/follow-up status, due dates, reply checks, last run and connection errors. Pause/resume is stored in the database. The page does not need to remain open. A new deployment preserves the database's enabled/paused state. Initial setup starts paused; an administrator enables the approved campaign through the workspace or its authenticated automation endpoint.

## Connections

- `POSTMARK_SERVER_TOKEN`: valid server-level token for a Live Postmark server.
- `EMAIL_FROM` or `POSTMARK_FROM_EMAIL`: configured sender; the campaign sends as `fletcher@nexusmt.com` with replies to that same mailbox.
- `POSTMARK_BROADCAST_MESSAGE_STREAM`: the ID of an active Broadcast stream, with Postmark unsubscribe handling. Marketing is never routed through the transactional stream.
- Existing `M365_TENANT_ID`, `M365_CLIENT_ID`, `M365_CLIENT_SECRET` (or their `MICROSOFT_*` aliases): application credentials with read access to `fletcher@nexusmt.com`. The campaign checks that specific reply mailbox without changing the broker-ingestion mailbox setting.

Before each send, the worker verifies the Live server/stream, imports Postmark suppressions, scans replies, rechecks the pause switch and local suppressions, then claims a unique `(campaign_id,email,stage)` record. A short database lease prevents concurrent workers from exceeding the quotas. Responses to the campaign stop the sequence. Explicit opt-out replies and provider suppressions prevent subsequent outreach. Only the relevant reply status and timestamp are stored; message bodies are not stored in outreach tables.

The protected **Check connections** action sends no email. A provider rejection holds future deliveries until the administrator fixes the connection or account approval and checks connections again. `SENDING` or `UNKNOWN` records are intentionally not retried automatically: a timeout or database interruption can occur after provider acceptance. Verify the recipient and stage against Postmark before repairing a record. Already accepted emails must retain their delivery record. A failed/unknown prospect remains visible for review while no automatic resend is attempted.

Closing the browser, refreshing the dashboard, checking connections, or enabling automation outside the send window does not immediately send messages. Only the scheduled worker sends campaign messages in the window. The separately labeled test button sends one explicit test to the existing test recipient.

Validation: `node --test tests/outreach-automation.test.cjs tests/postmark-email.test.cjs` and `node node_modules/@playwright/test/cli.js test tests/outreach-dashboard.spec.js`.
