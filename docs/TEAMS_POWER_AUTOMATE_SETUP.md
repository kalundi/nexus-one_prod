# Teams alerts through Power Automate

Nexus uses the protected production Functions variable `TEAMS_WEBHOOK_URL`. Keep the full URL in Netlify only: its signature is a credential. Bookings, broker intake/review, pickup reminders and cost reports share `netlify/functions/_shared/teams.cjs`.

Power Automate endpoints receive a `type: message` wrapper containing an Adaptive Card. Existing legacy Teams webhooks retain MessageCard support. Every send has a 15-second timeout; errors do not expose the URL or automatically retry an uncertain send.

## Check the existing workflow

1. Sign in to Power Automate with the Nexus workflow owner, `fletcher@nexusmt.com`.
2. Open **When specific users receive a webhook alert, notify Admin_NMT** in My flows and confirm it is enabled.
3. Repair a Microsoft Teams connection marked **Reconnect**. Renew the existing connection rather than changing recipients or access permissions.
4. Check the posting action targets the intended Admin_NMT team/channel or group chat. The destination is defined in the flow, not in Nexus's webhook payload.
5. Check trigger authentication matches the server integration. Do not broaden trigger access or regenerate the URL without reviewing the change. If the webhook URL changes, update `TEAMS_WEBHOOK_URL` and redeploy.

## Verify without sending patient data

An authenticated ADMIN can POST `/api/admin/integrations/test-teams` with an empty JSON body. It posts one fixed **Nexus Teams connection test**, including a unique test reference and no patient information. The endpoint does not accept custom messages or webhook URLs.

HTTP 202 / `accepted: true` confirms the webhook accepted the request. It does **not** confirm the Teams posting action succeeded: check Power Automate's run history and the destination Teams conversation. An expired Teams connection can make a run fail after the trigger accepted it. Successful results include `deliveryConfirmed: false` until the destination is independently verified.

`/api/integrations/health` exposes only configuration readiness as `teams` and `teamsProvider`. It does not validate Microsoft authentication, flow runs or group delivery.

Reference: [Microsoft Teams webhook workflows](https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook).
