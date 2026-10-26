# System email through Postmark

All outbound email (account setup/recovery, trip notifications, broker attachments, training, reports and outreach) uses `netlify/functions/_shared/email.cjs`. There is no SendGrid fallback.

In Netlify's **Production / Functions** environment, configure:

| Variable | Purpose |
| --- | --- |
| `POSTMARK_SERVER_TOKEN` | Postmark **Server API token**, not the Account API token. |
| `EMAIL_FROM` | Verified sender address, such as `dispatch@nexusmt.com`. |
| `POSTMARK_FROM_EMAIL` | Optional override of `EMAIL_FROM`. |
| `POSTMARK_MESSAGE_STREAM` | Optional transactional stream ID; defaults to `outbound`. |
| `POSTMARK_BROADCAST_MESSAGE_STREAM` | Required only for marketing outreach; the ID of a **Broadcast** stream. Outreach remains unavailable until configured. |

Verify the sender/domain and configure the DNS authentication records shown by Postmark. Outreach uses `fletcher@nexusmt.com` as its sender and reply address, so that sender must also be verified. Broadcast messages include Postmark's unsubscribe link and preserve existing campaign approvals, suppression checks and delivery claims.

Redeploy after environment changes. The public `/api/integrations/health` reports `emailProvider: "Postmark"` and `postmark: "configured"` when the required variables exist; this is configuration readiness, not a successful connection test.

An authenticated administrator can POST `/api/admin/integrations/test-email` with `{"recipient":"the-authorized-recipient@example.com"}`. Success returns HTTP 202, `accepted: true`, provider `Postmark` and a `messageId`. This means Postmark accepted the email; confirm actual delivery in Postmark Activity or the recipient's inbox. Failure reports HTTP/provider error codes without exposing credentials.

After a successful production test, unused `SENDGRID_API_KEY` / `SENDGRID_FROM_EMAIL` variables can be removed from Netlify. Inbound Microsoft Graph/broker ingestion and SMS settings are separate and unchanged.

References: [Postmark Email API](https://postmarkapp.com/developer/api/email-api), [Message Streams](https://postmarkapp.com/support/article/how-to-create-and-send-through-message-streams), [Unsubscribe management](https://postmarkapp.com/manual#unsubscribes).
