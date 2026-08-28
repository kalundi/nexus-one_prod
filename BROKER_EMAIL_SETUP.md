# Broker Email Integration Setup

This guide explains how to configure incoming email routing for broker rate requests to the `/.netlify/functions/broker-email-webhook` endpoint.

## Overview

Brokers send rate quotes to **contact@nexusmt.com**. The system needs to forward these emails to your webhook endpoint, which parses them and creates broker requests automatically.

## Long-Term Recommendation

For a durable production setup, use **Microsoft Graph** instead of Power Automate for live email intake. The repo now includes a Graph sync job that polls the mailbox and passes each qualifying email into the same broker-processing pipeline, with dedupe by message id.

### Azure App Registration Setup

1. In the Azure Portal, create or open an app registration for the mailbox ingester.
2. Record the **Tenant ID** and **Application (client) ID** from the app overview.
3. Create a **client secret** under **Certificates & secrets** and store the value securely.
4. Add **Microsoft Graph application permissions**:
  - `Mail.Read`
  - `User.Read.All` if you want to look up mailbox metadata later
5. Grant **admin consent** for the tenant.
6. Make sure the mailbox you want to read is the one in `M365_MAILBOX_ADDRESS`.

### Netlify Environment Variables

Set these in Netlify so the scheduled sync and optional webhook can authenticate:

- `M365_TENANT_ID`
- `M365_CLIENT_ID`
- `M365_CLIENT_SECRET`
- `M365_MAILBOX_ADDRESS`

Optional tuning variables:

- `GRAPH_MAIL_SYNC_SINCE` - defaults to `2026-07-31T00:00:00Z`
- `GRAPH_MAIL_SYNC_FOLDER` - defaults to `Inbox`
- `GRAPH_MAIL_SYNC_SENDER` - defaults to `driverdeveloper@gotandt.com`
- `GRAPH_MAIL_SYNC_SUBJECT_CONTAINS` - defaults to `confirmation`


### Graph flow endpoints

- `/.netlify/functions/graph-mail-sync` - scheduled polling/backfill job
- `/.netlify/functions/graph-mail-webhook` - optional Graph change-notification endpoint

### Mailbox Scope Lockdown (Recommended)

After granting `Mail.Read` application permission, lock the app to only approved mailboxes using an Exchange Application Access Policy.

1. Install and import Exchange Online module:
  ```powershell
  Install-Module ExchangeOnlineManagement -Scope CurrentUser
  Import-Module ExchangeOnlineManagement
  ```
2. Connect:
  ```powershell
  Connect-ExchangeOnline
  ```
3. Set values:
  ```powershell
  $appId = "YOUR_APP_CLIENT_ID"
  $mailbox = "fletcher@nexusmt.com"
  $groupName = "Nexus-Graph-MailboxScope"
  $policyName = "Nexus-Graph-Restrict-MailRead"
  ```
4. Create a mail-enabled security group (skip if it already exists):
  ```powershell
  New-DistributionGroup -Name $groupName -Type Security
  ```
5. Add the mailbox to scope:
  ```powershell
  Add-DistributionGroupMember -Identity $groupName -Member $mailbox
  ```
6. Create the application access policy:
  ```powershell
  New-ApplicationAccessPolicy -AppId $appId -PolicyScopeGroupId $groupName -AccessRight RestrictAccess -Description $policyName
  ```
7. Verify policy and test access:
  ```powershell
  Get-ApplicationAccessPolicy | Format-Table AppId,PolicyScopeGroupId,AccessRight,Description
  Test-ApplicationAccessPolicy -Identity $mailbox -AppId $appId
  Test-ApplicationAccessPolicy -Identity "someotheruser@yourtenant.com" -AppId $appId
  ```
8. Disconnect:
  ```powershell
  Disconnect-ExchangeOnline -Confirm:$false
  ```

Expected result:

- `Test-ApplicationAccessPolicy` returns `Access Granted` for the scoped mailbox.
- `Test-ApplicationAccessPolicy` returns `Access Denied` for mailboxes outside the scope group.

### Graph Go-Live Checklist

Use this checklist to validate end-to-end readiness before relying on production intake:

1. Azure app registration exists and `Mail.Read` application permission is granted with admin consent.
2. Netlify environment variables are set: `M365_TENANT_ID`, `M365_CLIENT_ID`, `M365_CLIENT_SECRET`, `M365_MAILBOX_ADDRESS`.
3. Mailbox scope lockdown policy is applied and verified with `Test-ApplicationAccessPolicy`.
4. Scheduled polling exists in `netlify.toml` for `graph-mail-sync`.
5. Deploy completed successfully with no function build errors.
6. Run a manual sync once:
  ```bash
  curl "https://your-site.netlify.app/.netlify/functions/graph-mail-sync?since=2026-07-31T00:00:00Z"
  ```
7. Confirm successful ingestion from response fields:
  - `processed` is greater than 0 for known test data.
  - no repeated duplicates for the same source email id.
8. Verify operational outputs:
  - broker request appears in admin broker queue,
  - booking is created when confirmation + attachment conditions are met,
  - Teams review notification is posted to `Admin_NMT`.
9. Verify forwarding rule behavior:
  - incoming mail to `fletcher@nexusmt.com` from `driverdeveloper@gotandt.com` is forwarded to `jubilee@nexusmt.com`.
10. Monitor first 24 hours:
  - check Netlify function logs for `graph-mail-sync` and `broker-email-webhook`,
  - confirm no auth/token failures and no parsing regressions.

### Incident Response: Common Graph Failures

Use this section during incidents to quickly identify root cause and recovery action.

#### 1) Token or Authentication Failures

Symptoms:

- Function logs contain `Graph token request failed`.
- HTTP 401 responses from Graph.

Checks:

- Confirm `M365_TENANT_ID`, `M365_CLIENT_ID`, `M365_CLIENT_SECRET` are present and current.
- Verify the client secret has not expired.
- Confirm the app registration still exists in the expected tenant.

Actions:

- Rotate the client secret and update Netlify env var.
- Redeploy and re-run manual sync.

#### 2) Permission or Consent Failures

Symptoms:

- Graph returns HTTP 403.
- Errors indicate insufficient privileges.

Checks:

- App has `Mail.Read` as an application permission.
- Admin consent was granted after permission changes.

Actions:

- Re-grant admin consent.
- Wait a few minutes for propagation, then retry manual sync.

#### 3) Mailbox Scope Policy Denials

Symptoms:

- Graph auth succeeds, but mailbox access is denied.
- `Test-ApplicationAccessPolicy` does not return expected scope access.

Checks:

- Mailbox is a member of the policy scope group.
- Policy AppId matches `M365_CLIENT_ID`.

Actions:

- Add mailbox to the scope group and retest.
- Recreate policy if AppId or group was incorrect.

#### 4) No Messages Processed

Symptoms:

- Sync succeeds but `processed` is `0` when messages are expected.

Checks:

- Sender and subject filters match actual inbound mail.
- `M365_MAILBOX_ADDRESS` is correct.
- Since timestamp is not too recent.

Actions:

- Run manual sync with explicit query params:
  ```bash
  curl "https://your-site.netlify.app/.netlify/functions/graph-mail-sync?since=2026-07-31T00:00:00Z&sender=driverdeveloper@gotandt.com&subjectContains=confirmation"
  ```
- Relax filter values temporarily to confirm pipeline health.

#### 5) Parsing or Booking Creation Failures

Symptoms:

- Messages are found, but broker request/booking is not created.
- Logs show parse errors or missing required fields.

Checks:

- Confirmation email includes expected attachment content.
- Subject still contains the expected keyword.
- Attachment payload is text-extractable.

Actions:

- Capture one failed sample and test against webhook locally.
- Add/update parser patterns in broker intake logic.

#### 6) Duplicate Intake or Replay Concerns

Symptoms:

- Same message appears processed more than once.

Checks:

- Confirm `source_message_id` dedupe metadata exists and is populated.
- Confirm replay runs are not using conflicting source IDs.

Actions:

- Keep replay windows bounded by `since`.
- Validate dedupe metadata in the database for suspect messages.

#### 7) Teams/Email Notification Gaps

Symptoms:

- Broker request exists, but admin notification did not post.

Checks:

- `TEAMS_WEBHOOK_URL` and email settings exist in environment.
- No outbound webhook errors in function logs.

Actions:

- Re-test with a known sample payload.
- Rotate webhook URL if Teams endpoint changed.

Supported email services:
- **SendGrid** (Recommended - most integration-friendly)
- **AWS SES** + SNS
- **Zapier** (Universal option, works with any email provider)
- **Gmail** + Google Sheets (via IFTTT or Zapier)

---

## Option 1: SendGrid (Recommended)

### Setup Steps

1. **Log in to SendGrid Dashboard**: https://app.sendgrid.com/

2. **Create an Email Receiving Endpoint**:
   - Go to **Settings > Inbound Parse**
   - Click **Create New Endpoint**
   - Enter:
     - **Hostname**: `contact.nexusmt.com` (or your MX record domain)
     - **URL**: `https://your-netlify-site.netlify.app/.netlify/functions/broker-email-webhook`
     - **POST the raw, full email** (checkbox) - **ENABLED**
     - **Spam Check** (checkbox) - ENABLED

3. **Configure SendGrid Webhook Authentication** (Optional but recommended):
   - In your `.env.local` or netlify.toml:
     ```
     SENDGRID_WEBHOOK_KEY=your_sendgrid_signature_key
     ```
   - Update `broker-email-webhook.cjs` to verify signature:
     ```javascript
     const signature = event.headers['x-twilio-email-event-signature'];
     const timestamp = event.headers['x-twilio-email-event-timestamp'];
     // Verify HMAC-SHA256 signature
     ```

4. **Point MX Records to SendGrid**:
   - Add to your DNS provider:
     ```
     contact.nexusmt.com MX 5 mx.sendgrid.net
     contact.nexusmt.com CNAME bounce.sendgrid.net
     ```

5. **Test**:
   ```bash
   curl -X POST https://your-netlify-site.netlify.app/.netlify/functions/broker-email-webhook \
     -H "Content-Type: application/json" \
     -d '{
       "from":"broker@example.com",
       "sender_name":"Test Broker",
       "text":"Pickup: 123 Main St, Boston MA\nDestination: 456 Oak Ave, Quincy MA\nDate: 2026-08-15\nTime: 14:30\nRate Quote: $85.00"
     }'
   ```

---

## Option 2: AWS SES + SNS

### Setup Steps

1. **Verify Domain in SES**:
   ```bash
   aws ses verify-domain-identity --domain nexusmt.com
   ```

2. **Enable Email Receiving**:
   ```bash
   aws ses create-receipt-rule-set --rule-set-name broker-rules
   aws ses create-receipt-rule \
     --rule-set-name broker-rules \
     --rule '{
       "Name": "contact-to-webhook",
       "Enabled": true,
       "TlsPolicy": "Optional",
       "Recipients": ["contact@nexusmt.com"],
       "Actions": [
         {
           "SNSAction": {
             "TopicArn": "arn:aws:sns:us-east-1:123456789:broker-emails"
           }
         }
       ]
     }'
   ```

3. **Create SNS Topic and Subscription**:
   ```bash
   aws sns subscribe \
     --topic-arn arn:aws:sns:us-east-1:123456789:broker-emails \
     --protocol https \
     --notification-endpoint https://your-netlify-site.netlify.app/.netlify/functions/broker-email-webhook
   ```

4. **Update Webhook to Handle SNS Format**:
   - AWS SNS sends emails in a different format
   - Update `parseEmailBody()` in `broker-email-webhook.cjs`:
     ```javascript
     const snsMessage = JSON.parse(body.Message);
     const emailBody = snsMessage.content;
     const senderEmail = snsMessage.mail.source;
     ```

5. **Test**:
   ```bash
   aws sns publish \
     --topic-arn arn:aws:sns:us-east-1:123456789:broker-emails \
     --message '{"from":"broker@example.com","text":"Pickup: ...Rate: $85"}'
   ```

---

## Option 3: Zapier (Universal, Works with Gmail, Outlook, etc.)

### Setup Steps

1. **Create Zapier Account**: https://zapier.com

2. **Create Zap**:
   - **Trigger**: Email in Gmail/Outlook
     - Label/Filter: `Brokers` or `contact@nexusmt.com`
   - **Action**: Webhooks by Zapier
     - **Method**: POST
     - **URL**: `https://your-netlify-site.netlify.app/.netlify/functions/broker-email-webhook`
     - **Data**:
       ```
       from: [From Email]
       sender_name: [From Name]
       text: [Email Body Text]
       html: [Email Body HTML]
       subject: [Subject]
       ```

3. **Test**: Send test email to trigger the Zap

---

## Email Format Expected by Parser

The webhook's `parseEmailBody()` function looks for these patterns:

```
Pickup: 123 Main St, Boston MA
Destination: 456 Oak Ave, Quincy MA
Date: 2026-08-15 (or 08/15/2026 or 08-15-2026)
Time: 14:30 (24-hour format)
Service: MEDICAL_TRANSPORT (or similar)
Rate: $85.00 (or 85.00, or "Quote: $85")
```

**Example broker email**:
```
Subject: Rate Quote for Boston Route

Hi Nexus,

Please provide transport for the following:

Pickup: 123 Main St, Boston MA
Destination: 456 Oak Ave, Quincy MA
Date: 08/15/2026
Time: 2:30 PM
Service: MEDICAL_TRANSPORT

Our rate: $85.00

Thanks,
John Broker
ABC Transport Inc.
```

---

## Response from Webhook

When a broker email is successfully parsed, you'll receive:

```json
{
  "success": true,
  "request_id": 12345,
  "broker_id": 5,
  "broker_name": "ABC Transport Inc.",
  "parsed_route": "123 Main St, Boston MA → 456 Oak Ave, Quincy MA",
  "parsed_date": "2026-08-15",
  "parsed_time": "14:30",
  "parsed_rate": "$85.00",
  "auto_confirmed": true
}
```

The request is **automatically confirmed** and a notification is sent to dispatch for review.

---

## Debugging

### Check Webhook Logs

View Netlify Function logs:
```bash
netlify functions:invoke broker-email-webhook --payload '{...}'
```

Or check production logs:
- Netlify Dashboard > Functions > broker-email-webhook > Logs

### Common Parsing Failures

| Issue | Solution |
|-------|----------|
| "Could not parse rate from email" | Ensure email contains "Rate: $XX" or "Quote: $XX" |
| "Could not parse date" | Use format: MM/DD/YYYY or DD-MM-YYYY |
| "Could not parse time" | Use format: HH:MM (24-hour) or HH:MM AM/PM |
| "Missing pickup or destination" | Label fields clearly: "Pickup:" and "Destination:" |

### Test Payload

```bash
curl -X POST https://your-site.netlify.app/.netlify/functions/broker-email-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "from":"broker@abc-transport.com",
    "sender_name":"John Broker",
    "text":"Pickup: 123 Main\\nDestination: 456 Oak\\nDate: 08/15/2026\\nTime: 14:30\\nRate: $85.00",
    "subject":"Rate Quote - Boston Route"
  }'
```

---

## Production Checklist

- [ ] Email service configured and tested
- [ ] MX records pointing to email service
- [ ] Webhook endpoint HTTPS and accessible
- [ ] Rate parsing tested with 3+ sample emails
- [ ] Dispatch notification working (SMS/email sent)
- [ ] Broker auto-confirm logs appear in Netlify Functions
- [ ] Rate delta correctly calculated
- [ ] Dispatch review workflow tested (approve/reject)

---

## Rate Calculation Example

When a broker emails a $85 rate for a route Nexus calculates as $80:

1. **Webhook receives** rate=$85, platform_rate=$80
2. **Creates broker_request** with delta=+$5
3. **Notifies dispatch** via SMS: "Broker quote $5 higher than platform rate"
4. **Dispatcher reviews** and approves/rejects via admin dashboard
5. **If approved**: Booking created at broker's $85 rate, settled at net terms

---

## Future Enhancements

- [ ] Support for Excel/CSV file attachments (rate lists)
- [ ] Automatic broker verification (DNS TXT record check)
- [ ] Rate comparison with historical brokers for anomaly detection
- [ ] Multi-broker aggregation ("send to all available brokers")
- [ ] Broker rating based on actual vs quoted times/rates
