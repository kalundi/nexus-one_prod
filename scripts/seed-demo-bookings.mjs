import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL;
if (!connectionString) {
  console.log('[SEED-BOOKINGS] No database connection — skipping demo bookings.');
  process.exit(0);
}

const pool = new Pool({
  connectionString,
  ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false }
});

// Helper to generate booking reference
function generateReference() {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const id = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `NMT-${date}-${id}`;
}

// Helper to generate demo dates (next 7 days)
function getRandomFutureDate() {
  const today = new Date();
  const daysFromNow = Math.floor(Math.random() * 7) + 1;
  const date = new Date(today);
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split('T')[0];
}

function getRandomTime() {
  const hours = Math.floor(Math.random() * 16) + 8; // 8 AM to 11 PM
  const minutes = Math.floor(Math.random() * 4) * 15; // 0, 15, 30, 45
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

const services = ['wheelchair', 'ambulatory', 'broda', 'stretcher', 'bariatric', 'bls', 'als1', 'als2'];

// Demo locations in Washington Metropolitan Area
const pickupLocations = [
  { name: 'Georgetown Hospital Center', address: '3800 Reservoir Road NW, Washington, DC 20007', lat: 38.9086, lng: -77.0732 },
  { name: 'Washington Hospital Center', address: '110 Irving Street NW, Washington, DC 20010', lat: 38.9235, lng: -77.0379 },
  { name: 'MedStar Georgetown', address: '3900 Reservoir Road NW, Washington, DC 20007', lat: 38.9095, lng: -77.0745 },
  { name: 'Sibley Memorial Hospital', address: '5255 Loughboro Road NW, Washington, DC 20016', lat: 38.9495, lng: -77.1099 },
  { name: 'Inova Fairfax Hospital', address: '3300 Gallows Road, Falls Church, VA 22042', lat: 38.8817, lng: -77.1714 },
  { name: 'Johns Hopkins Hospital', address: '600 North Wolfe Street, Baltimore, MD 21287', lat: 39.2974, lng: -76.5898 },
  { name: 'University of Maryland Medical Center', address: '22 South Greene Street, Baltimore, MD 21201', lat: 39.2894, lng: -76.6213 }
];

const destinationLocations = [
  { name: 'Montgomery County Medical Center', address: '18101 Prince Philip Drive, Olney, MD 20832', lat: 39.1163, lng: -77.0407 },
  { name: 'Adventist Healthcare', address: '8110 Good Luck Road, Seabrook, MD 20706', lat: 39.0131, lng: -76.8258 },
  { name: 'Calvary Hospital', address: '2800 M Street NW, Washington, DC 20007', lat: 38.9024, lng: -77.0456 },
  { name: 'Roosevelt Hospital', address: '1150 Varnum Street NE, Washington, DC 20017', lat: 38.9415, lng: -77.0214 },
  { name: 'Holy Cross Hospital', address: '1447 Kennedy Street NW, Washington, DC 20011', lat: 38.9545, lng: -77.0235 },
  { name: 'Howard University Hospital', address: '2041 Georgia Avenue NW, Washington, DC 20060', lat: 38.9275, lng: -77.0213 }
];

const demoRides = [
  // 5 from Facility Administrator (facility-entered)
  {
    name: 'James Mitchell',
    phone: '(202) 555-0101',
    email: 'james.mitchell@example.com',
    service: 'wheelchair',
    source: 'FACILITY',
    notes: 'Regular dialysis appointment, requires accessible vehicle'
  },
  {
    name: 'Patricia Lopez',
    phone: '(202) 555-0102',
    email: 'patricia.lopez@example.com',
    service: 'ambulatory',
    source: 'FACILITY',
    notes: 'Post-operative follow-up visit'
  },
  {
    name: 'Robert Chen',
    phone: '(703) 555-0103',
    email: 'robert.chen@example.com',
    service: 'broda',
    source: 'FACILITY',
    notes: 'Bariatric chair transfer required'
  },
  {
    name: 'Margaret Williams',
    phone: '(240) 555-0104',
    email: 'margaret.williams@example.com',
    service: 'stretcher',
    source: 'FACILITY',
    notes: 'Emergency transport, non-ambulatory'
  },
  {
    name: 'David Rodriguez',
    phone: '(571) 555-0105',
    email: 'david.rodriguez@example.com',
    service: 'ambulatory',
    source: 'FACILITY',
    notes: 'Weekly chemotherapy session'
  },
  // 2 from Dispatch
  {
    name: 'Susan Thompson',
    phone: '(202) 555-0106',
    email: 'susan.thompson@example.com',
    service: 'wheelchair',
    source: 'DISPATCH',
    notes: 'Dispatch-scheduled urgent care visit'
  },
  {
    name: 'Michael Johnson',
    phone: '(301) 555-0107',
    email: 'michael.johnson@example.com',
    service: 'ambulatory',
    source: 'DISPATCH',
    notes: 'Emergency department coordination'
  },
  // 3 from Book a Ride
  {
    name: 'Jennifer Smith',
    phone: '(202) 555-0108',
    email: 'jennifer.smith@example.com',
    service: 'ambulatory',
    source: 'BOOK_A_RIDE',
    notes: 'Online booking - routine appointment'
  },
  {
    name: 'Christopher Davis',
    phone: '(703) 555-0109',
    email: 'christopher.davis@example.com',
    service: 'wheelchair',
    source: 'BOOK_A_RIDE',
    notes: 'Online booking - accessible transport needed'
  },
  {
    name: 'Lisa Anderson',
    phone: '(240) 555-0110',
    email: 'lisa.anderson@example.com',
    service: 'ambulatory',
    source: 'BOOK_A_RIDE',
    notes: 'Online booking - same-day service'
  }
];

try {
  // Check if bookings table exists
  const tableCheck = await pool.query("SELECT to_regclass('public.bookings') AS name");
  if (!tableCheck.rows[0]?.name) {
    console.log('[SEED-BOOKINGS] bookings table not found — skipping.');
    await pool.end();
    process.exit(0);
  }

  let created = 0;
  for (const ride of demoRides) {
    const ref = generateReference();
    const tripDate = getRandomFutureDate();
    const tripTime = getRandomTime();
    const pickup = pickupLocations[Math.floor(Math.random() * pickupLocations.length)];
    const destination = destinationLocations[Math.floor(Math.random() * destinationLocations.length)];

    try {
      await pool.query(
        `INSERT INTO bookings(
          reference, name, phone, email, service,
          pickup, destination, trip_date, trip_time,
          pickup_lat, pickup_lng, destination_lat, destination_lng,
          status, notes, created_at, updated_at
        ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'SUBMITTED', $14, now(), now())`,
        [
          ref, ride.name, ride.phone, ride.email, ride.service,
          pickup.address, destination.address,
          tripDate, tripTime,
          pickup.lat, pickup.lng, destination.lat, destination.lng,
          ride.notes
        ]
      );

      // Create status history entry
      await pool.query(
        `INSERT INTO trip_status_history(booking_reference, status, status_label, note, actor)
         VALUES($1, $2, $3, $4, $5)`,
        [ref, 'SUBMITTED', 'submitted', `${ride.source} transportation request`, ride.source]
      );

      console.log(`[SEED-BOOKINGS] Created: ${ref} - ${ride.name} (${ride.source})`);
      created++;
    } catch (err) {
      console.error(`[SEED-BOOKINGS] Error creating ride for ${ride.name}:`, err.message);
    }
  }

  console.log(`[SEED-BOOKINGS] Done. Created ${created} demo bookings.`);
  console.log(`  - 5 from Facility administrators`);
  console.log(`  - 2 from Dispatch`);
  console.log(`  - 3 from Book a Ride`);
} catch (err) {
  console.error('[SEED-BOOKINGS] Error:', err.message);
} finally {
  await pool.end();
}
