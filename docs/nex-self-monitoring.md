# Nex self-monitoring and reliability · Phase 157

## Purpose
Run synthetic, privacy-safe checks every six hours. This monitor does not impersonate patients, dispatchers or administrators; it does not look up any live bookings and never logs sample questions, customer messages, IP addresses, or patient information.

## Included checks
- **booking:** the approved booking how-to answer resolves and has a curated video and direct booking link
- **services:** a recognized service-overview answer
- **estimate-guidance:** pricing guidance stays sourced, without inventing a fare
- **emergency:** urgent language correctly directs callers to 911 and does not show social content
- **unknown-fallback:** an unsupported question gets the bounded fallback instead of invented facts
- **public-page:** the deployed Ask Nex page responds to a HEAD request with HTML
- **booking-video:** the narrated booking MP4 responds to HEAD with `video/mp4`, rather than a missing asset or SPA HTML fallback

These checks measure **deterministic public knowledge and asset availability**, not live GPS/routing, map keys, Netlify database migrations, or private-role operations. Those are covered by separate CI and require synthetic staging accounts for future live integration tests.

## How it runs
Netlify schedules `netlify/functions/nex-monitor.cjs` from `netlify.toml` at `15 */6 * * *` (UTC).

The target defaults to `https://nexusmt.com`; `NEX_MONITOR_BASE_URL` may be set only to `https://nexusmt.com` or `https://www.nexusmt.com`. The monitor prevents redirect following and accepts only the expected response types.

The handler returns `200` for all checks healthy or `503` for degraded, with only check IDs and boolean results. It also emits a short code-only `[NEX_MONITOR]` warning in Netlify function logs for degraded checks.

## Optional alert delivery
Configure `NEX_MONITOR_ALERT_WEBHOOK_URL` in Netlify **protected environment variables** to an HTTPS webhook under your control, then deploy. Leave it unset to enable log-only monitoring.

The alert contains only the failed check IDs and a pointer to logs. There is no chat text, patient data, session token or internal operational data. Alert delivery errors do not block the monitor. A webhook message is posted every unhealthy run; persistent alert deduplication and incident history are follow-up work.

## Validate before merging
Run `node --test tests/nex-self-monitoring.test.cjs`. In CI, run the Nex unit and Playwright suites. The repository has reported no usable Actions runs for recent merges; confirm GitHub Actions repository settings/runner availability rather than interpreting a missing check as success.

After deployment inspect Netlify's scheduled function run at the next scheduled UTC interval. Verify HTTP status, checks and code-only logs, test the configured webhook in a nonproduction destination, and separately test signed-in Nex roles, live estimates and admin UI manually.

## Failure response
If `booking` fails, review FAQ intent grounding, visitor knowledge and video catalog. If `booking-video` fails, verify the MP4 is published with `Content-Type: video/mp4`. If `public-page` fails, check Netlify deployment/redirects. If `emergency` fails, treat it as a release-blocking safety regression and disable risky changes until fixed.

**No self-healing code deployment or automatic production changes** are included. Monitor failures should guide humans and approved remediation workflows, not grant unsupervised privileges.
