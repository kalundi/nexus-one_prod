# User Story — Secure Driver Login and Scoped Trip Access

## Story

As a Nexus Medical Transit driver, I want to sign in through the public Livecare entry point using my issued credentials so that I can securely open the Driver App, view only the trips assigned to me, perform required driver workflow tasks, and remain blocked from administrative or organization-wide data that I do not need to perform my job.

## Business Value

This protects patient information under a minimum-necessary access model, gives drivers a predictable mobile-first workflow, reduces failed logins and blank-page states, and provides auditable evidence that DRIVER permissions are enforced before protected content is rendered.

## Acceptance Criteria

1. A driver begins at `/livecare` and selects **Driver** secure access.
2. The login panel clearly identifies the expected role as `DRIVER`.
3. Valid issued credentials authenticate through `/api/auth/login` without exposing the password in source control, browser logs, screenshots, traces, or repository history.
4. After successful authentication, the user is routed to `/driver-app` or `/driver-app.html`.
5. The protected Driver App is not rendered until `/api/auth/me` confirms the authenticated user has an allowed role.
6. A `DRIVER` user can load `/api/driver/assignments` and receives only that driver's assigned-trip data.
7. The Driver App remains usable when there are zero active assignments and presents a clear empty state instead of a blank screen.
8. The driver can access driver workflow features required for assigned trips, including manifest, trip status workflow, route/GPS context, mileage, inspection, and shift functions as applicable.
9. A `DRIVER` session cannot gain DRIVER authorization on Admin, Dispatch, Executive, Billing, Facility-wide, or other privileged workspaces.
10. Expired, invalid, unauthorized, or timed-out sessions fail closed and return the user to secure sign-in rather than revealing protected content.
11. Logout clears the active browser session and protected pages require authentication again.
12. Playwright captures a trace, video, checkpoint screenshots, API assertions, and browser console errors for the live journey when live-test credentials are supplied securely through environment variables or CI secrets.

## Security and Quality Standards

- No production password or access token is committed to GitHub.
- Authorization is enforced by the server and verified by the client before protected content is shown.
- Role comparisons are normalized and explicit.
- Sensitive access defaults to deny when authentication is unavailable or ambiguous.
- Tests use stable IDs, roles, and attributes already established in the Nexus UI rather than brittle visual coordinates.
- Test evidence must not intentionally capture password values or authorization tokens.
- Driver data follows the minimum-necessary principle: assigned-trip information only.
- New implementation should preserve or improve existing accessibility, responsive design, error handling, auditability, and coding conventions.

## Playwright Evidence

Live test: `tests/driver-login-live.spec.js`

Required environment variables:

- `NEXUS_LIVE_DRIVER_EMAIL`
- `NEXUS_LIVE_DRIVER_PASSWORD`
- `NEXUS_LIVE_BASE_URL` (optional; defaults to `https://nexusmt.com`)

Expected evidence is stored in Playwright's test-results output and includes the full trace/video plus screenshots of Livecare entry, Driver sign-in, and authenticated Driver dashboard.
