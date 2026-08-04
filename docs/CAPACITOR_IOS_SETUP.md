# Nexus iOS Packaging with Capacitor

This repository now includes two Capacitor iOS wrappers:

- `mobile/driver-ios` -> `https://nexusmt.com/driver-app.html`
- `mobile/booking-ios` -> `https://nexusmt.com/booking-app.html`

## 1) Install Wrapper Dependencies

From repo root:

```bash
npm run mobile:driver:install
npm run mobile:booking:install
```

## 2) Create iOS Native Projects (one-time)

From repo root:

```bash
npm run mobile:driver:ios:add
npm run mobile:booking:ios:add
```

This creates `ios/` inside each wrapper folder.

## 3) Sync Capacitor Config to iOS

Whenever web URL/config changes:

```bash
npm run mobile:driver:ios:sync
npm run mobile:booking:ios:sync
```

## 4) Open in Xcode

```bash
npm run mobile:driver:ios:open
npm run mobile:booking:ios:open
```

## 5) Xcode Required Configuration

For each app target:

1. Set Team and Signing in `Signing & Capabilities`.
2. Confirm Bundle Identifier:
   - Driver: `com.nexusmt.driver`
   - Booking: `com.nexusmt.booking`
3. Set App Version and Build.
4. Configure App Icons and Launch Screen.

### Driver App Privacy Keys (Info.plist)

Add/confirm:

- `NSLocationWhenInUseUsageDescription`
- `NSLocationAlwaysAndWhenInUseUsageDescription` (only if background location is truly required)

Recommended text examples:

- `Nexus Driver uses location to support trip navigation and real-time dispatch updates.`
- `Nexus Driver uses location in the background during active shifts to keep dispatch and patients updated.`

### Booking App Privacy Keys

Only add location key(s) if booking flow requires user location.

## 6) TestFlight Flow

1. In Xcode, select `Any iOS Device (arm64)`.
2. `Product` -> `Archive`.
3. In Organizer, `Distribute App` -> `App Store Connect` -> `Upload`.
4. In App Store Connect, assign build to Internal Testers.
5. Validate login, critical booking/driver workflows, maps, and permissions.

## 7) App Store Submission Checklist

1. Fill App Privacy details accurately.
2. Add iPhone screenshots for required sizes.
3. Add support URL and privacy policy URL.
4. Add review notes:
   - test account credentials
   - role-specific login behavior
   - location usage purpose
5. Submit for review.

## Notes and Caveats

- These wrappers currently load production-hosted pages from `nexusmt.com` using Capacitor `server.url`.
- Apple may reject apps that appear to be only thin web wrappers.
- To strengthen approval odds, prioritize native-value behavior:
  - robust location handling
  - meaningful offline or degraded-mode UX
  - push notifications and trip alerts
  - platform-polished interactions and error handling
