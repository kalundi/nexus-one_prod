# Background system health

The production-only Netlify scheduled function `maintenance-monitor` runs every five minutes. It checks fixed `https://nexusmt.com` public pages/modules, verifies that three sensitive API routes reject requests without credentials, checks database connectivity, and reports whether Maps has a browser key. It does not sign in as a patient or mutate business records. Two consecutive failures open an incident; a successful check records recovery. One failed sample stays visible as an unconfirmed finding.

Administrators open **Admin → System health** (`/admin-maintenance.html`) to review current findings, acknowledge incidents, run checks, download a developer review brief, and request AI recommendations when connected. Acknowledgment does not resolve an issue. Reports older than 15 minutes display as stale. Recent incident/recovery history is capped at 100 entries, acknowledgments at active incidents. Scheduled and manual runs share a database lease and 60-second cooldown. The monitor stores no page bodies, booking records, credentials, or raw exceptions. If hosting or the database itself is unavailable, this same-platform monitor cannot independently alert; an external uptime monitor remains separate work.

## AI connection

No AI connection existed when this version was created. The monitor works without one and shows **Not connected**. To enable optional OpenAI investigation, configure a protected production `MAINTENANCE_AI_API_KEY` and an explicit `MAINTENANCE_AI_MODEL`; existing `OPENAI_API_KEY` / `OPENAI_MODEL` can be reused. Never put a key in browser code or source control. No new provider account, subscription, or paid AI call is created by this release.

Investigation is administrator-triggered and limited to once per hour across all administrators. Only fixed check labels, synthetic status details and consecutive failure counts are sent. No patient information, logs, response bodies, source code, or secrets are included. The Responses API uses `store:false`, no tools, an 18-second deadline, and a 1,600-token output cap. AI failures leave monitoring/reporting intact. Output is rendered as plain text and marked **Review required**, with the source report timestamp.

This prepares hypotheses, suggested fixes, validation steps and rollback notes for review. It does not create code patches or pull requests, execute recommendations, deploy changes, or automatically repair the application. Full authenticated booking, fare correctness, map routes, payment transactions, message delivery and browser behavior require separate tests. Passing checks do not assert that those workflows work.

API routes: administrator-only `GET /api/admin/maintenance`, `POST .../run`, `POST .../acknowledge` with `{ "id": "check-id" }`, and `POST .../investigate`. Migration `092.001` stores the bounded report in an RLS-protected table. No public table policies are granted. The Netlify schedule makes the function unavailable as a public HTTP endpoint.

References: [Netlify scheduled functions](https://docs.netlify.com/build/functions/scheduled-functions/) and [OpenAI Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses).
