# Twilio Voice Receptionist Setup

This document covers webhook URLs, transfer behavior, ride-request intake, and required environment variables for the Nexus Virtual Receptionist.

## Implemented API endpoints

- Incoming call webhook: `POST /api/voice/incoming-call`
- Live transfer webhook: `POST /api/voice/transfer-dispatch`
- Dial fallback webhook: `POST /api/voice/dispatch-fallback`
- Primary webhook failure URL: `POST /api/voice/primary-webhook-failure`
- Pending ride-request API: `POST /api/voice/ride-request`

## Twilio Console configuration

### Voice number: A call comes in

- Primary webhook URL:
  - `https://nexusmt.com/api/voice/incoming-call`
  - Method: `HTTP POST`

- Primary webhook failure URL:
  - `https://nexusmt.com/api/voice/primary-webhook-failure`
  - Method: `HTTP POST`

### Transfer to dispatch from AI

When the AI determines transfer intent (for example: "dispatch", "representative", "human"), your app should update the active Twilio call with:

- `https://nexusmt.com/api/voice/transfer-dispatch`

This endpoint returns TwiML using `<Dial>` and automatically invokes fallback logic via `/api/voice/dispatch-fallback`.

## Fallback behavior

The fallback endpoint handles `DialCallStatus` from Twilio and performs:

1. Try secondary dispatch number when primary is unavailable (busy/no-answer/failed).
2. If secondary fails, route to after-hours voicemail number (if configured).
3. If no voicemail number is configured, play a callback message.

## Business-hours and after-hours behavior

- During business hours:
  - Incoming calls receive the required greeting and are connected to your secure media stream URL.
- After hours:
  - Calls are routed to voicemail if `AFTER_HOURS_VOICEMAIL_NUMBER` is configured.

## Environment variables

### Required for transfer and fallback

- `DISPATCH_PRIMARY_NUMBER`
- `DISPATCH_CALLER_ID`

### Strongly recommended

- `DISPATCH_SECONDARY_NUMBER`
- `AFTER_HOURS_VOICEMAIL_NUMBER`
- `BUSINESS_HOURS_TZ` (default: `America/New_York`)
- `BUSINESS_HOURS_START` (default: `08:00`)
- `BUSINESS_HOURS_END` (default: `18:00`)
- `BUSINESS_HOURS_DAYS` (default: `1,2,3,4,5`; ISO weekday: Monday=1)
- `TWILIO_MEDIA_STREAM_URL` (for `<Connect><Stream ... />`)

### Privacy and intake controls

- `NON_PHI_MODE` (default: `true`)
- `ALLOW_PHI_INTAKE` (default: `false`)

When `NON_PHI_MODE=true` and `ALLOW_PHI_INTAKE=false`, `/api/voice/ride-request` is blocked and returns a compliance error.

## Pending ride-request workflow

`POST /api/voice/ride-request` accepts the first-release intake fields and writes a pending request into Nexus with status `REQUESTED`, sends dispatch notifications, and returns the non-confirmation message:

"I have submitted your transportation request for review. This is not yet a confirmed reservation. A Nexus representative will contact you to confirm availability, pickup details, and pricing."

## Transfer conditions to enforce in your AI layer

Trigger transfer for:

- Caller asks for a person
- Active trip problem
- Driver cannot be located
- Time-sensitive discharge
- Caller upset
- Out-of-scope request
- Same question repeated twice without resolution

## Security and privacy reminders

- Validate Twilio signatures before production go-live.
- Avoid recording calls by default.
- Do not send PHI through ordinary email or unsecured SMS.
- Keep role-based access controls and audit logging enabled.
