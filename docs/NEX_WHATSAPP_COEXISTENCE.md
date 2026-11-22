# Nexus WhatsApp Business app coexistence — Phase 1 (read-only)

## Purpose and current limits
Use **360dialog coexistence onboarding**, not a destructive number migration.
The existing WhatsApp Business app and number stay in use on the iPhone.
This implementation is a safe technical foundation, **not a live connection**:
it receives new inbound message metadata and outgoing WhatsApp Business app
message echoes only. It does **not** ingest actual message text, any patient
data, contact names/numbers, historical conversation bodies, contact sync,
message-status callbacks, media, or group messages. It never asks Nex AI to
process a WhatsApp message and never sends replies. Do not describe this
as a working AI inbox until the later privacy review and implementation.

## Before connecting the number
1. Back up WhatsApp Business on the iPhone and verify backup completion.
2. Ensure a suitable Meta business portfolio and 360dialog account.
3. Confirm that the account is eligible for *WhatsApp Business app Coexistence*.
4. Create and deploy this pull request; apply migration
   `999.005_nex_whatsapp_intake.sql`; test on a nonproduction environment.
5. Create protected environment variables in Netlify (NEVER commit values):
   - `WHATSAPP_INGEST_ENABLED=true` (only after migration and verification)
   - `WHATSAPP_BASIC_AUTH_USER` (random, dedicated webhook username)
   - `WHATSAPP_BASIC_AUTH_PASSWORD` (long, random, dedicated password)
   - `WHATSAPP_PHONE_NUMBER_ID` (Meta number ID issued during onboarding)
   - `WHATSAPP_CONTACT_HMAC_KEY` (random 32+ characters, protected secret)
6. Configure the number-level webhook at:
   `https://nexusmt.com/.netlify/functions/whatsapp-webhook`
   and configure 360dialog to send an Authorization: Basic header matching the
   credentials above. Do not put credentials in the URL.
7. Use the provider's coexistence signup so the app remains active, and test
   from a controlled non-patient number.

## Preserve messages
Existing conversations remain in the iPhone app. This service **does not**
copy them into Nexus. Do not opt in to importing historical chats for this
Phase 1 implementation: the history payload is intentionally ignored.
360dialog says direct-client history is only available within the limited
onboarding window and is not stored for later replay; if Nex requires import
later, implement and validate a protected encrypted pipeline **before**
initiating history sync. Do not imply history has been imported.

## Verification
- POST without credentials: 401; disabled or missing config: 503.
- POST known inbound test event: 200; one `inbound` metadata record.
- POST same event again: 200; unique key prevents duplicate record.
- POST app-originated echo: 200; one `outbound_app` record.
- POST history and contact-sync: 200, no stored records or message bodies.
- POST unauthorized phone number: 403.
- Staff user must not access the status endpoint; active ADMIN session only:
  `GET /.netlify/functions/whatsapp-inbox-status` with Bearer token.
- No phone number or chat body should appear in database or logs.
- Unsuccessful database writes must return 503 so the provider retries.

## Next phase (NOT implemented)
- Privacy/security review, HIPAA applicability, BAAs for vendors where
  appropriate, encryption and minimum-necessary content access.
- Durable webhook ingestion queue that acknowledges quickly even for large
  batches; current database write is synchronous and must be load-tested for
  360dialog's five-second acknowledgement requirement.
- A metadata-only administrator monitor is included at
  `/nex-whatsapp-status.html` (protected page and API); this is not a chat inbox.
- A privacy-approved human-review inbox, retention and deletion policies,
  and PHI escalation remain unimplemented.
- A separate gated drafting workflow using only authorized data and approved
  Nex knowledge. No auto-send before explicit business approval and tests.
- Opt-in history import only through a compliant, verified, encrypted pipeline.

Provider references:
- https://docs.360dialog.com/docs/hub/embedded-signup/coexistence-onboarding
- https://docs.360dialog.com/docs/messaging/webhook
- https://docs.360dialog.com/docs/messaging/webhook/webhook-reference

## Provider delivery detail (verified November 2026)
The number-level endpoint receives inbound events in `changes[].value.messages`
and app-originated echoes in `changes[].value.message_echoes` with
`field=smb_message_echoes`. 360dialog supports a configured `Authorization`
Basic header for the callback. Payloads must be acknowledged within 5 seconds.
From January 12, 2027, `history`, `smb_app_state_sync`, and `user_preferences`
stop being sent to partner webhook URLs; phone-number webhooks remain supported.
The Nexus integration ignores the history and contact contents intentionally.
