#!/usr/bin/env node
/**
 * Add 10 test bookings to the Nexus system via API
 * Usage: node scripts/add-test-bookings-api.mjs https://www.nexusmt.com
 */

const BASE_URL = process.argv[2] || 'https://www.nexusmt.com';

const testBookings = [
  {
    name: 'James Mitchell',
    phone: '202-555-0101',
    email: 'james.mitchell@test.com',
    service: 'Medical Transportation',
    pickup: '3800 Reservoir Road NW, Washington, DC 20007',
    destination: '18101 Prince Philip Drive, Olney, MD 20832',
    date: '2026-07-25',
    time: '10:00'
  },
  {
    name: 'Patricia Lopez',
    phone: '202-555-0102',
    email: 'patricia.lopez@test.com',
    service: 'Medical Transportation',
    pickup: '110 Irving Street NW, Washington, DC 20010',
    destination: '2800 M Street NW, Washington, DC 20007',
    date: '2026-07-26',
    time: '14:30'
  },
  {
    name: 'Robert Chen',
    phone: '703-555-0103',
    email: 'robert.chen@test.com',
    service: 'Wheelchair Accessible Transport',
    pickup: '3900 Reservoir Road NW, Washington, DC 20007',
    destination: '1150 Varnum Street NE, Washington, DC 20017',
    date: '2026-07-27',
    time: '09:00'
  },
  {
    name: 'Margaret Williams',
    phone: '240-555-0104',
    email: 'margaret.williams@test.com',
    service: 'Stretcher Service',
    pickup: '5255 Loughboro Road NW, Washington, DC 20016',
    destination: '1447 Kennedy Street NW, Washington, DC 20011',
    date: '2026-07-28',
    time: '11:15'
  },
  {
    name: 'David Rodriguez',
    phone: '571-555-0105',
    email: 'david.rodriguez@test.com',
    service: 'Medical Transportation',
    pickup: '3300 Gallows Road, Falls Church, VA 22042',
    destination: 'Holy Cross Hospital, 1447 Kennedy Street NW, Washington, DC 20011',
    date: '2026-07-29',
    time: '13:45'
  },
  {
    name: 'Susan Thompson',
    phone: '202-555-0106',
    email: 'susan.thompson@test.com',
    service: 'Wheelchair Accessible Transport',
    pickup: '600 North Wolfe Street, Baltimore, MD 21287',
    destination: 'Montgomery County Medical Center, 18101 Prince Philip Drive, Olney, MD 20832',
    date: '2026-07-30',
    time: '15:00'
  },
  {
    name: 'Michael Johnson',
    phone: '301-555-0107',
    email: 'michael.johnson@test.com',
    service: 'Medical Transportation',
    pickup: '22 South Greene Street, Baltimore, MD 21201',
    destination: '8110 Good Luck Road, Seabrook, MD 20706',
    date: '2026-07-31',
    time: '08:30'
  },
  {
    name: 'Jennifer Smith',
    phone: '202-555-0108',
    email: 'jennifer.smith@test.com',
    service: 'Ambulatory Transport',
    pickup: '110 Irving Street NW, Washington, DC 20010',
    destination: 'Roosevelt Hospital, 1150 Varnum Street NE, Washington, DC 20017',
    date: '2026-08-01',
    time: '10:00'
  },
  {
    name: 'Christopher Davis',
    phone: '703-555-0109',
    email: 'christopher.davis@test.com',
    service: 'Wheelchair Accessible Transport',
    pickup: '3800 Reservoir Road NW, Washington, DC 20007',
    destination: 'Howard University Hospital, 2041 Georgia Avenue NW, Washington, DC 20060',
    date: '2026-08-02',
    time: '12:00'
  },
  {
    name: 'Lisa Anderson',
    phone: '240-555-0110',
    email: 'lisa.anderson@test.com',
    service: 'Medical Transportation',
    pickup: '5255 Loughboro Road NW, Washington, DC 20016',
    destination: '2041 Georgia Avenue NW, Washington, DC 20060',
    date: '2026-08-03',
    time: '16:30'
  }
];

async function addTestBooking(booking) {
  try {
    const response = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(booking)
    });

    const data = await response.json();
    if (!response.ok) {
      console.error(`  ✗ ${booking.name}: ${data.error || 'Failed to create booking'}`);
      return null;
    }

    const ref = data.booking?.reference;
    console.log(`  ✓ ${booking.name}: ${ref}`);
    return ref;
  } catch (error) {
    console.error(`  ✗ ${booking.name}: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log(`\n📋 Adding 10 Test Bookings to Nexus Medical Transit`);
  console.log(`   API URL: ${BASE_URL}\n`);

  let created = 0;
  const refs = [];

  for (const booking of testBookings) {
    const ref = await addTestBooking(booking);
    if (ref) {
      created++;
      refs.push({ name: booking.name, phone: booking.phone, ref });
    }
  }

  console.log(`\n✅ Created ${created} test bookings out of ${testBookings.length}\n`);

  if (refs.length > 0) {
    console.log('📝 Use these for testing "Manage Existing Trip":');
    console.log('   Reference       Name                 Phone');
    console.log('   ' + '-'.repeat(60));
    refs.forEach(({ ref, name, phone }) => {
      console.log(`   ${ref}     ${name.padEnd(20)}  ${phone}`);
    });
    console.log('');
  }
}

main().catch(console.error);
