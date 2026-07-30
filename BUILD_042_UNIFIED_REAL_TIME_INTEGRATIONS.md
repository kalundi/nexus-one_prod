# Nexus ONE Build 042 — Unified Booking & Real-Time Integrations

Build 042 upgrades the deployed Build 041 package with one shared Book a Ride behavior and production integration foundations.

## Included
- Universal pickup and destination enhancement on every page.
- Nexus facility search with Google Places fallback/upgrade.
- Google Maps browser configuration endpoint.
- PostgreSQL booking creation and trip tracking endpoint.
- Twilio SMS and SendGrid email confirmations.
- Stripe PaymentIntent creation endpoint.
- Authenticated GPS position ingestion and live vehicle updates.
- Integration health reporting and graceful unconfigured states.

## Required environment variables
- `DATABASE_URL`
- `GOOGLE_MAPS_BROWSER_KEY` (restrict by website referrer and API)
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `SENDGRID_API_KEY`
- `SENDGRID_FROM_EMAIL`
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET` (reserved for webhook deployment hardening)

## Deploy
1. `npm install`
2. Set environment variables in Netlify.
3. `npm run db:migrate`
4. `npm run verify`
5. `npm run build`
6. Deploy the project directory or connect it to Netlify.

## Verification URLs
- `/api/health`
- `/api/ready`
- `/api/integrations/health`
- `/api/integrations/config`
- `/?book=1`
