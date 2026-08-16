import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from '@playwright/test';

const root = process.cwd();
const out = join(root, 'output', 'social-video', 'app-states');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml', '.json':'application/json' };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/')) {
    res.setHeader('content-type', 'application/json');
    if (url.pathname === '/api/bookings' && req.method === 'POST') {
      res.end(JSON.stringify({ persisted:true, booking:{ reference:'NMT-20260815-4821', status:'CONFIRMED', estimatedFare:128.40 }, message:'Booking created. Reference: NMT-20260815-4821', requiresOnlinePayment:true }));
    } else if (url.pathname === '/api/integrations/config') {
      res.end(JSON.stringify({ stripeEnabled:true, squareEnabled:false, googleMapsEnabled:false }));
    } else if (url.pathname === '/api/fleet/live') {
      res.end(JSON.stringify({ generatedAt:new Date().toISOString(), vehicles:[] }));
    } else {
      res.statusCode = 404; res.end(JSON.stringify({ error:'Local capture mock' }));
    }
    return;
  }
  try {
    const relative = url.pathname === '/' ? 'booking-app.html' : decodeURIComponent(url.pathname.slice(1));
    const path = normalize(join(root, relative));
    if (!path.startsWith(root)) throw new Error('invalid path');
    const body = await readFile(path);
    res.setHeader('content-type', mime[extname(path)] || 'application/octet-stream');
    res.end(body);
  } catch {
    res.statusCode = 404; res.end('Not found');
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:540, height:960 }, deviceScaleFactor:1 });
const states = [];

async function focusAndShot(id, name, target, title, caption, voice) {
  await page.locator(id).scrollIntoViewIfNeeded();
  await page.evaluate(selector => window.scrollBy(0, -95), id);
  await page.waitForTimeout(350);
  await page.screenshot({ path:join(out, name), animations:'disabled' });
  const box = await page.locator(target).boundingBox();
  states.push({ file:name, title, caption, voice, target:{ x:Math.round(box.x + box.width / 2), y:Math.round(box.y + box.height / 2) } });
}

async function activate(id) {
  await page.evaluate(selector => {
    const target = document.querySelector(selector);
    document.querySelectorAll('.nexusFocusItem').forEach(item => {
      const active = item === target;
      item.classList.toggle('is-focused', active);
      item.setAttribute('aria-expanded', String(active));
    });
    target.style.display = 'block';
    target.style.maxHeight = 'none';
    target.style.opacity = '1';
  }, id);
  await page.waitForTimeout(250);
}

await import('node:fs/promises').then(fs => fs.mkdir(out, { recursive:true }));
await page.goto(`http://127.0.0.1:${port}/booking-app.html`, { waitUntil:'networkidle' });
await activate('#bookingLoginSection');
await focusAndShot('#bookingLoginSection', '01-login.png', '#signUpBtn', 'CHOOSE GUEST OR SIGN IN', 'Book as a guest, or sign in to save 5%.', 'Book as a guest, or sign in or create an account to save five percent.');
await activate('#riderDetailsSection');
await focusAndShot('#riderDetailsSection', '02-rider-empty.png', '#name', 'ENTER RIDER DETAILS', 'Enter the passenger information.', 'Enter the passenger name, phone number, and email.');
await page.fill('#name', 'Jordan Matthews');
await page.fill('#phone', '(240) 555-0147');
await page.fill('#email', 'jordan@example.com');
await focusAndShot('#confirmRiderBtn', '03-rider-filled.png', '#confirmRiderBtn', 'CONFIRM THE RIDER', 'Confirm to unlock the next section.', 'Select Confirm Details to unlock the pickup and destination section.');
await page.evaluate(() => document.querySelector('#confirmRiderBtn').click());
await activate('#pickupDropoffSection');
await focusAndShot('#pickupDropoffSection', '04-route-empty.png', '#pickup', 'ADD PICKUP + DESTINATION', 'Enter each address or add multiple stops.', 'Enter the pickup address and destination. You can also add multiple stops.');
await page.fill('#pickup', '100 Community Place, Crownsville, MD');
await page.fill('#destination', '2001 Medical Parkway, Annapolis, MD');
await focusAndShot('#confirmPickupDropoffBtn', '05-route-filled.png', '#confirmPickupDropoffBtn', 'CONFIRM THE ROUTE', 'Confirm every required stop.', 'Select Confirm Details after every required stop is entered.');
await page.evaluate(() => document.querySelector('#confirmPickupDropoffBtn').click());
await activate('#rideTypeSection');
await focusAndShot('#rideTypeSection', '06-ride-type.png', '[data-service="wheelchair"]', 'CHOOSE THE RIDE TYPE', 'Select the transportation support needed.', 'Choose the ride type and transportation support the passenger needs.');
await page.evaluate(() => document.querySelector('[data-service="wheelchair"]').click());
await page.fill('#tripDate', '2026-08-20');
await page.fill('#appointmentTime', '10:30');
await page.evaluate(() => {
  const pickupTime = document.querySelector('#tripTime');
  pickupTime.value = '09:15';
  pickupTime.dispatchEvent(new Event('input', { bubbles:true }));
  pickupTime.dispatchEvent(new Event('change', { bubbles:true }));
  document.querySelector('#confirmPickupDropoffBtn').click();
});
await focusAndShot('#rideTypeSection', '07-ride-filled.png', '#appointmentTime', 'SET DATE + APPOINTMENT', 'Pickup time and fare update automatically.', 'Set the trip date and appointment time. Nexus calculates the pickup estimate.');
await page.evaluate(() => {
  const pickupTime = document.querySelector('#tripTime');
  pickupTime.value = '09:15';
  pickupTime.dispatchEvent(new Event('input', { bubbles:true }));
  pickupTime.dispatchEvent(new Event('change', { bubbles:true }));
});
await activate('#telemetrySection');
await focusAndShot('#telemetrySection', '08-telemetry.png', '#telemetryMap', 'REVIEW ROUTE VISIBILITY', 'Preview the route and live fleet visibility.', 'Review the route preview and live fleet visibility for the ride.');
await activate('#fareSummarySection');
await focusAndShot('#fareSummarySection', '09-fare.png', '#fareSummaryAmount', 'REVIEW THE FARE', 'Check distance, ETA, and estimated fare.', 'Review the distance, estimated arrival time, and fare before booking.');
await focusAndShot('#submitBtn', '10-ready-to-book.png', '#submitBtn', 'BOOK MY RIDE', 'Submit the completed ride request.', 'When every section is complete, select Book My Ride to submit the request.');
await page.evaluate(() => {
  const pickupTime = document.querySelector('#tripTime');
  pickupTime.value = '09:15';
  document.querySelector('#confirmPickupDropoffBtn').click();
});
await page.evaluate(() => document.querySelector('#submitBtn').click());
await page.waitForTimeout(500);
await page.evaluate(() => document.querySelector('#nexusGlobalTripPopup')?.remove());
await focusAndShot('#bookingOutcomeStatus', '11-confirmed.png', '#bookingOutcomeStatus', 'BOOKING CONFIRMED', 'Save the reference number for updates.', 'The booking is confirmed. Save the reference number for ride updates.');
await activate('#paymentSection');
await focusAndShot('#paymentSection', '12-payment.png', '#payDepositBtn', 'CHOOSE PAYMENT', 'Pay a 25% deposit or pay the fare in full.', 'Choose to pay a twenty five percent deposit, or pay the estimated fare in full.');
await import('node:fs/promises').then(fs => fs.writeFile(join(out, 'states.json'), JSON.stringify(states, null, 2)));

await browser.close();
server.close();
console.log(out);
