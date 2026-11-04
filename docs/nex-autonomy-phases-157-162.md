# Nex autonomy foundation — combined phases 157–162

Nex can proactively monitor its public knowledge, create *pending* improvements, recommend curated media, and guide authenticated staff within their permissions. **It does not publish website edits, alter prices, complete bookings, make assignments or change patient records without the existing approval and operational systems.**

## What runs automatically

| Phase | Capability | Behavior |
|---|---|---|
| 157 | Reliability probes | Every six hours: deterministic public booking, services, price guidance, emergency fallback, Ask Nex availability, narrated MP4 MIME type |
| 158 | Website learning | Once daily: fetch allowlisted public Nexus source pages and compare normalized text hashes; record first baseline without triggering a review |
| 159 | Improvement proposals | Public page changes and recurring *anonymous, aggregated* unanswered intents generate deduplicated pending suggestions in the existing administrator review queue |
| 160 | Business workflow guidance | Authenticated Nex explains next steps for allowed driver, dispatch, facility, and admin workflows; actual actions still require existing permissions and confirmations |
| 161 | Social media index | Uses the repository's editorial social feed to select first-party video assets by topic; the chat uses its existing inline video player and safe fallback |
| 162 | Performance dashboard | Admin-only `nex-insights.html` panel shows recent coded health runs, changed public pages, review signals and indexed media counts |

## Database

Run the migration `database/migrations/999.004_nex_autonomy.sql` before the scheduled cycle.
It adds snapshots (hashes only), change signals (page path and hash), deduplicated weekly intent signals, and health run summaries. The database never stores HTML bodies, exact customer questions, responses, names, travel addresses, sessions or patient medical data in these tables.

If a database migration is missing or a probe fails, the automation reports degraded/unavailable rather than claiming success.

## Scheduling and alerts

`nex-monitor` runs at minute 15 every six hours UTC and saves coded results to the private health-history table when available. `nex-autonomy-cycle` runs daily at 05:35 UTC and checks approved public pages, then generates review items for changed pages or recurring unanswered topics. The cycle may take longer when the site is slow; check scheduled Netlify logs for actual execution.

Set **optional** protected Netlify variable `NEX_MONITOR_ALERT_WEBHOOK_URL` to receive an alert when synthetic checks degrade. The webhook receives only bounded failed check identifiers. A missing webhook leaves monitoring in logs and the admin dashboard.

For new pages, the first successful fetch becomes the baseline. A changed hash thereafter creates a pending review suggestion. A site-content hash does **not** prove the content is correct, only that the text changed.

## Editorial and operational approval

- All new FAQ recommendations appear as **pending**. An ADMIN must verify source facts, mark reviewed, draft a proposed answer, and approve it for export. Publishing still needs a separately reviewed GitHub change and deployment.
- New workflow guidance is read-only, selected from server-trusted roles. It cannot authorize new data access, bypass dispatch checks or create a trip.
- The social feed is an internally curated source list; a media asset reference is not proof that a platform has published the same video. The video player can fall back if the MP4 is not served after deployment.
- No automatic fixes or re-deployments are performed on failure.

## Validation before declaring production ready

1. Run `npm ci` and `node --test tests/nex-self-monitoring.test.cjs tests/nex-autonomy-cycle.test.cjs`, the full Nex unit suite, and desktop/mobile Playwright.
2. Verify GitHub Actions runner availability. No Actions result means tests are **unverified**, not passed.
3. Run database migration `999.004`; verify scheduled function visibility in Netlify and health/history database permissions.
4. Open Nex Insights signed in as ADMIN. Verify non-ADMIN sessions receive 403 for the status API.
5. Ask booking how-to as visitor and as ADMIN/DISPATCHER; verify video, links, estimates, and role-specific board access.
6. Confirm outside-click collapse preserves on-page conversation and draft input.
7. Test website drift using a staging-only page update and confirm it creates one pending review, never an automatically published answer.

## Operational follow-up work beyond these foundations

True hands-off operation still requires production incident routing, synthetic role test accounts, robust transaction execution policies, higher-quality semantic retrieval, approved website publishing automation, documented rollback controls, security review and reliable production observability. This release establishes the automated monitoring, triage, and guarded assistance layers, not unsupervised business decision-making.
