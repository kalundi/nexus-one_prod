# Nexus KeyMark Connector Setup

KeyMark uses a vendor-neutral appointment model internally. Do not commit credentials, private keys, member identifiers, or production payload samples to the repository.

## Required platform configuration

- `KEYMARK_INTEGRATION_API_KEY`: high-entropy credential used by approved inbound interface engines.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`: required for consent-verified SMS and voice outreach.
- `KEYMARK_PAYER_ENDPOINT`, `KEYMARK_PAYER_TOKEN`: reserved for the selected eligibility clearinghouse. KeyMark does not transmit payer requests until both are configured and the member-identifier handling design is approved.
- `KEYMARK_JWT_PRIVATE_KEY`: P-384 private signing key used by the FHIR connection record through `privateKeyEnvVar`. The JWKS endpoint derives and publishes only its public coordinates. Store it only as a protected environment variable.
- `KEYMARK_JWT_PUBLIC_KEY`: optional matching PEM public key. Omit it on Netlify to conserve the AWS Lambda 4 KB environment-variable allowance.
- `KEYMARK_JWT_KEY_ID`: stable identifier included in both the published JWK and signed JWT header.

## Epic public JWK Set URL

KeyMark exposes `GET /.well-known/keymark-jwks.json` without application authentication so Epic can verify backend-service client assertions. The endpoint publishes public verification material only and returns `503` until configured.

Use separate deployments and key pairs for each Epic environment:

- Non-Production JWK Set URL: `https://<staging-domain>/.well-known/keymark-jwks.json`
- Production JWK Set URL: `https://<production-domain>/.well-known/keymark-jwks.json`

Generate a P-384/ES384 key pair outside the repository, put only the private PEM in the deployment's protected `KEYMARK_JWT_PRIVATE_KEY` environment variable, and use a unique `KEYMARK_JWT_KEY_ID` such as `keymark-staging-2026-01`. Multiline PEM values may use literal newlines or escaped `\\n` characters. The compact EC key avoids Netlify/AWS Lambda's 4 KB total environment-variable limit.

For rotation without interruption, set `KEYMARK_JWKS_JSON` to a public-only JWK Set containing both the current and next public keys. It takes precedence over `KEYMARK_JWT_PUBLIC_KEY`. Begin signing with the new private key and matching `KEYMARK_JWT_KEY_ID` only after Epic can retrieve both keys; remove the old public key after the transition window.

## Inbound FHIR R4

Endpoint: `POST /api/keymark/integrations/fhir`

Headers:

- `content-type: application/fhir+json` or `application/json`
- `x-keymark-api-key: <configured secret>`
- `x-keymark-source-system: EPIC`, `ORACLE_HEALTH`, `MEDITECH`, or another approved identifier
- `x-keymark-facility-id: <Nexus facility scope>` when applicable

The body may be an R4 `Appointment` or `{ "resource": <Appointment>, "patient": { "id", "name", "phone", "email" } }`. Patient contact data should only be supplied when the health system has authorized that use and the interface has a minimum-necessary data agreement.

Required mappings:

- source appointment identifier -> `Appointment.id` or `Appointment.identifier[0].value`
- appointment time -> `Appointment.start`
- patient -> `Appointment.participant.actor` referencing `Patient/{id}`
- location or department -> Location participant
- appointment type -> `Appointment.appointmentType`, `serviceType`, or description

## Inbound HL7 v2

Endpoint: `POST /api/keymark/integrations/hl7`

Use the same KeyMark headers and send an SIU S12-S16 message as the request body. The current canonical mapping reads MSH, SCH, PID, AIS, and AIL. Each organization must approve its field mapping because local HL7 conventions vary.

## Epic onboarding

Collect:

- Epic customer environment and FHIR base URL
- non-production and production client IDs
- backend-services private key and registered public JWKS, or the customer-approved OAuth flow
- authorized FHIR scopes
- Appointment, Patient, and Location mapping decisions
- event delivery approach: customer interface engine, subscription, polling, or other approved mechanism

## Oracle Health onboarding

Collect:

- Millennium tenant and R4 service root
- registered client and OAuth credentials
- system or provider authorization model
- customer-provided patient, practitioner, and location identifiers
- supported Appointment search parameters and polling window

## MEDITECH onboarding

Collect:

- Expanse or 6.x customer environment
- enabled FHIR endpoint and implementation version
- registered application credentials and scopes
- whether scheduling data is available through FHIR Appointment or an HL7 SIU feed
- facility-specific patient, appointment, department, and location mappings

## SMS and voice governance

KeyMark only sends allowlisted templates from `keymark-outreach.cjs`. Consent is checked when outreach is queued and again when the scheduled processor sends it. Free-text messages are not accepted. The current templates avoid patient name, diagnosis, department, appointment time, and medical-record identifiers.

## Payer eligibility

Select a clearinghouse and document:

- transport-benefit eligibility product and supported payer network
- X12 270/271 or vendor JSON/API contract
- member identifier encryption/tokenization strategy
- required subscriber and dependent fields
- request correlation and idempotency fields
- response mapping for eligibility, authorization, covered modes, limits, and denial reasons
- retention, audit, and permitted-use requirements

Until this design is approved, payer requests remain queued and the KeyMark health endpoint reports `connectorConfigured: false`.

## Operational verification

- `GET /api/keymark/integration-health` reports configuration state without returning secrets.
- inbound messages are deduplicated by source system and SHA-256 payload digest.
- raw inbound payloads are not stored in `keymark_integration_messages`.
- all appointment ingestion, outreach, payer requests, and care-team updates produce audit records.
