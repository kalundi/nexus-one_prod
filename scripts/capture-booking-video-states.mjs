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
      res.end(JSON.stringify({ persisted:true, booking:{ reference:'NMT-20260815-4821', status:'CONFIRMED', estimatedFare:128.40 }, message:'Booking created. Reference: NMT-20260815-4821', requiresOnlinePayment:false }));
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

async function focusAndShot(id, name, target = id) {
  await page.locator(id).scrollIntoViewIfNeeded();
  await page.evaluate(selector => window.scrollBy(0, -95), id);
  await page.waitForTimeout(350);
  await page.screenshot({ path:join(out, name), animations:'disabled' });
  const box = await page.locator(target).boundingBox();
  states.push({ file:name, target:{ x:Math.round(box.x + box.width / 2), y:Math.round(box.y + box.height / 2) } });
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
await activate('#riderDetailsSection');
await focusAndShot('#riderDetailsSection', '01-rider-empty.png', '#name');
await page.fill('#name', 'Jordan Matthews');
await page.fill('#phone', '(240) 555-0147');
await page.fill('#email', 'jordan@example.com');
await focusAndShot('#confirmRiderBtn', '02-rider-filled.png');
await page.evaluate(() => document.querySelector('#confirmRiderBtn').click());
await activate('#pickupDropoffSection');
await focusAndShot('#pickupDropoffSection', '03-route-empty.png', '#pickup');
await page.fill('#pickup', '100 Community Place, Crownsville, MD');
await page.fill('#destination', '2001 Medical Parkway, Annapolis, MD');
await focusAndShot('#confirmPickupDropoffBtn', '04-route-filled.png');
await page.evaluate(() => document.querySelector('#confirmPickupDropoffBtn').click());
await activate('#rideTypeSection');
await focusAndShot('#rideTypeSection', '05-ride-type.png', '[data-service="wheelchair"]');
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
await focusAndShot('#rideTypeSection', '06-ride-filled.png', '#appointmentTime');
await page.evaluate(() => {
  const pickupTime = document.querySelector('#tripTime');
  pickupTime.value = '09:15';
  pickupTime.dispatchEvent(new Event('input', { bubbles:true }));
  pickupTime.dispatchEvent(new Event('change', { bubbles:true }));
});
await focusAndShot('#submitBtn', '07-ready-to-book.png');
await page.evaluate(() => {
  const pickupTime = document.querySelector('#tripTime');
  pickupTime.value = '09:15';
  document.querySelector('#confirmPickupDropoffBtn').click();
});
await page.evaluate(() => document.querySelector('#submitBtn').click());
await page.waitForTimeout(500);
await focusAndShot('#bookingOutcomeStatus', '08-confirmed.png');
await import('node:fs/promises').then(fs => fs.writeFile(join(out, 'states.json'), JSON.stringify(states, null, 2)));

await browser.close();
server.close();
console.log(out);
