# TestFlight Internal Test Plan

## Goal
Validate Nexus Driver and Nexus Booking critical workflows before App Store review.

## Test Cohorts

- Operations lead
- Dispatch lead
- At least 2 active drivers
- 1 facility-side booking tester

## Build Setup

For each app build in TestFlight:

1. Confirm build number and version.
2. Confirm environment points to production URLs.
3. Confirm test credentials are active.

## Nexus Driver Test Cases

1. Authentication
- Sign in with valid account
- Reject invalid account
- Sign out and sign back in

2. Shift workflow
- Start shift
- Toggle break start/end
- End shift and confirm summary

3. Manifest and acceptance
- Accept single trip
- Accept All behavior
- Verify accepted visual state updates

4. Trip progression
- Open trip detail
- Start Trip behavior on mobile
- Early-start reason modal appears when required
- Move through statuses to completion

5. Exception paths
- Mark no-show
- Verify missed/no-show presentation

6. Mileage
- Log trip leg
- Verify totals and dashboard reflection

7. Dashboard analytics
- Confirm charts render on mobile
- Switch 7D/14D/30D tabs
- Validate insight summary updates

## Nexus Booking Test Cases

1. Authentication and access
2. Create booking request
3. Edit booking details
4. Confirm booking appears correctly in downstream systems
5. Error handling for missing/invalid fields

## Device Coverage

Minimum:
- iPhone current generation
- iPhone one older generation

Preferred:
- iOS latest major
- iOS previous major

## Pass/Fail Criteria

Pass if:
- No blocker bugs in core workflow
- No crash in tested flows
- Data writes/reads succeed for critical actions

Fail if:
- Any blocker in sign-in, accept/start trip, status update, or booking submission

## Defect Triage

Severity levels:
- P0: Release blocker
- P1: Major workflow impact
- P2: Minor usability issue

## Exit Checklist Before App Review

- All P0 fixed and retested
- All P1 either fixed or approved workaround documented
- App Review Notes test account verified
- Final screenshots and metadata prepared
