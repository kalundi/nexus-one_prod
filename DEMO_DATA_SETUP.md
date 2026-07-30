# Demo Data Setup Guide

This document explains how to populate the system with demo rides for testing and development.

## Quick Start

To seed 10 demo transportation requests into your database:

```bash
npm run seed:demo
```

This will create:
- **5 rides** from Facility administrators (entered into their facility management panel)
- **2 rides** from Dispatch staff (entered through dispatch coordination center)
- **3 rides** from Book a Ride online portal (public booking requests)

## What Gets Created

Each demo ride includes:
- Realistic passenger names and contact information
- Various medical transportation service types (wheelchair, ambulatory, stretcher, etc.)
- Pickup and destination locations across the Washington Metropolitan Area
- Scheduled dates for the next 7 days
- Appropriate notes and special instructions

The rides are created with:
- Status: `SUBMITTED` (awaiting dispatch coordination)
- Trip status history entries tracking creation
- Proper audit trail logging

## Prerequisites

Before running the seed script, ensure:
1. Database is connected and migrated: `npm run db:migrate`
2. Test users exist: `npm run test:create-users`
3. Admin account configured: `npm run admin:create-test`

## Data Reset (Optional)

To clear all bookings and start fresh:

```sql
DELETE FROM trip_status_history;
DELETE FROM bookings;
```

Then run `npm run seed:demo` again.

## Book a Ride Form Fixes

The universal-booking.js has been enhanced to properly handle address input fields:

### Improvements Made:
1. **Flexible Field Detection** - Detects address fields by:
   - Input name attributes: `name="pickup"`, `name="destination"`
   - Placeholder text patterns: "pickup", "Pickup", "destination", "Destination", "address", "Address"

2. **Auto-naming** - Automatically sets proper `name` attributes on address fields for form submission

3. **Enhanced Autocomplete** - Provides:
   - Google Places address autocomplete (when configured)
   - Facility location suggestions
   - Data attribute storage (placeId, lat, lng) for coordinates

### For Developers

If you have address input fields that aren't being enhanced:

**Ensure one of the following:**
- Set `name="pickup"` or `name="destination"` attributes
- Use placeholder text containing "pickup", "destination", or "address" (case-insensitive)
- Call `window.NexusBooking.refresh()` after dynamically adding fields

### Example Form Integration

```html
<!-- Method 1: Using name attributes (preferred) -->
<input name="pickup" type="text" placeholder="Pickup address" required>
<input name="destination" type="text" placeholder="Destination address" required>

<!-- Method 2: Using placeholder text patterns -->
<input type="text" placeholder="Pickup address" required>
<input type="text" placeholder="Destination address" required>
```

## Testing the Seed Data

After seeding:

1. **Login to Livecare**: Go to `/livecare.html` and sign in with any test account
2. **Check Dispatch Center**: View all 10 rides at `/dispatch.html`
3. **Check Facility Portal**: View the 5 facility-entered rides at `/facility.html`
4. **Verify Coordinates**: Address fields should now have proper autocomplete in the booking form

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `No database connection` | Check DATABASE_URL or NETLIFY_DB_URL environment variable |
| `bookings table not found` | Run `npm run db:migrate` first |
| `Address fields not enhanced` | Check browser console for errors, verify field names/placeholders |
| `Autocomplete not working` | Ensure GOOGLE_MAPS_BROWSER_KEY is configured in integrations |

## Next Steps

1. Test the dispatch workflow with the demo rides
2. Advance ride statuses from SUBMITTED → CONFIRMED → DRIVER_ASSIGNED
3. Test driver assignment and GPS tracking
4. Verify billing and payment processing with demo data
