# Social Media Automation Guide

This guide defines a safe, repeatable posting system for Nexus Medical Transit social channels.

## Goals

- Grow local awareness across Maryland, Washington, DC, and Northern Virginia.
- Drive traffic to public service pages and booking.
- Reinforce trust, accessibility, and care coordination.
- Build a reusable queue for automatic posting.

## Active Channels

- YouTube: `https://www.youtube.com/@nexus_m_t`
- TikTok: `https://www.tiktok.com/@nexus_m_t`
- Instagram: `https://www.instagram.com/nexus_m_t/`
- Facebook: `https://www.facebook.com/profile.php?id=61581462908206`
- Bluesky: `https://bsky.app/profile/nexusmt.bsky.social`

## Public URLs To Promote

- Homepage: `https://nexusmt.com/`
- Booking: `https://nexusmt.com/booking-app.html`
- Livecare: `https://nexusmt.com/livecare.html`
- Wheelchair transportation: `https://nexusmt.com/wheelchair-transportation.html`
- Stretcher transportation: `https://nexusmt.com/stretcher-transportation.html`
- Dialysis transportation: `https://nexusmt.com/dialysis-transportation.html`
- Hospital discharge transportation: `https://nexusmt.com/hospital-discharge-transportation.html`

## Posting Rules

- Never post patient names, trip references, addresses, or any rider-identifying details.
- Never promise emergency response. Use `For emergencies call 911.` when relevant.
- Avoid clinical claims you cannot prove.
- Keep the public main line as `(888) 639-5766`.
- Use the brand tone: calm, accessible, coordinated, professional.

## Recommended Weekly Cadence

- Monday: service education post
- Tuesday: service-area awareness post
- Wednesday: trust/compliance/accessibility post
- Thursday: booking or Livecare feature post
- Friday: caregiver/facility coordination post
- Weekend: light brand-awareness or recurring ride reminder post

## Automation Notes

- Use [social\evergreen-posts.json](c:/Users/OWNER/Documents/Business%20Apps/Nexus%20Medical%20Transit/nexus-one_prod/social/evergreen-posts.json) as the source feed.
- Rotate by `pillar` to avoid repetitive posting.
- Prefer 1 post per day on Facebook, Instagram, and Bluesky.
- Rework the shortest captions for TikTok overlays and YouTube Shorts descriptions.
- Pair each post with one of the existing asset files listed in the JSON.

## Suggested Publishing Windows

- Facebook: 8:00 AM to 10:00 AM local time
- Instagram: 11:00 AM to 1:00 PM local time
- TikTok: 12:00 PM to 3:00 PM local time
- Bluesky: 8:00 AM to 9:30 AM local time
- YouTube Shorts: 12:00 PM to 4:00 PM local time

## Content Pillars

- `service-awareness`
- `service-area`
- `recurring-care`
- `discharge-coordination`
- `ride-visibility`
- `accessibility`
- `caregiver-support`
- `facility-partnership`
- `trust-and-safety`

## Recommended Next Step

Load the JSON file into your scheduler or automation tool and map each post to a channel-specific template:

- Facebook: long caption + link + image
- Instagram: short caption + branded image + link in bio reference
- TikTok: short hook + on-screen text + caption
- Bluesky: concise text + direct page link
- YouTube Shorts: headline + short description + CTA link in description

## Code Automation (Implemented)

The repository now includes a daily scheduler function and helpers:

- `netlify/functions/social-publisher.cjs`
- `netlify/functions/_shared/social-queue.cjs`
- `netlify/functions/_shared/social-formatters.cjs`
- `netlify/functions/_shared/social-clients.cjs`

The scheduler is configured in `netlify.toml` as:

- `[functions.social-publisher]`
- `schedule = "0 14 * * *"` (daily, 14:00 UTC)

## Safe Rollout Mode

By default, posting runs in dry-run mode so nothing is published publicly.

Set environment variables in Netlify:

- `SOCIAL_AUTOMATION_DRY_RUN=true` (default/safe)
- `SOCIAL_AUTOMATION_CHANNELS=facebook,instagram,bluesky`

When ready for live posting:

- `SOCIAL_AUTOMATION_DRY_RUN=false`

## Channel Credentials

Current live publisher support in code:

- Bluesky (live when credentials are set)

Required Bluesky variables:

- `BLUESKY_IDENTIFIER`
- `BLUESKY_APP_PASSWORD`

Planned next integrations (placeholders currently return skipped):

- Facebook
- Instagram
- TikTok
- YouTube Shorts

## Data Logging

Migration `database/migrations/056.001_social_automation.sql` adds:

- `social_publish_history` (run log, payload, response, error)
- `social_channel_credentials` (channel enablement/credential hints)
