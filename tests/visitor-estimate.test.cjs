'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEstimator, mergeSettings, roundEstimate } = require('../netlify/functions/_shared/visitor-estimate.cjs');

// Settings = the platform defaults (api.cjs DEFAULT_PRICING / fare rules):
// ambulatory $75 incl. 5 mi, $3.55/mi, fuel (SUV) $0.2842/mi, card fee 3%,
// premiums +30%. Fixture dates are far in the future so the fare engine's
// short-notice rule (<24h) never fires: 2027-01-06 is a Wednesday,
// 2027-01-02 is a Saturday.
const defaultSettings = async () => mergeSettings(null);
const estimator = createEstimator({ loadSettings: defaultSettings });

const baseInput = {
  pickup: '22505 Gateway Center Dr, Clarksburg, MD 20871',
  dropoff: '9100 Key West Ave, Rockville, MD 20850',
  service: 'ambulatory',
  tripType: 'ONE_WAY',
  date: '2027-01-06',
  time: '10:00',
  loadedMiles: 20,
  durationMinutes: 32
};

test('ambulatory 20 loaded miles, one way, weekday daytime: deterministic estimate', async () => {
  const { status, body } = await estimator.estimate(baseInput, '10.1.0.1');
  assert.equal(status, 200);
  assert.equal(body.mode, 'estimate');
  // Engine: base 75 + (20-5) x 3.55 = 53.25 + fuel 20 x 0.2842 = 5.684
  //   -> subtotal 133.934. Modeled deadhead: 50% of 20 mi = 10 mi x 3.55
  //   = 35.50. Total = (133.934 + 35.50) x 1.03 card fee = 174.52,
  //   displayed rounded to the nearest $5.
  assert.ok(Math.abs(body.estimate.total - 174.52) < 0.02, `total was ${body.estimate.total}`);
  assert.equal(body.estimate.displayTotal, 175);
  assert.equal(body.estimate.deadheadMiles, 10);
  assert.equal(body.estimate.premiumReason, null);
  assert.equal(body.estimate.shortNotice, false);
  assert.match(body.answer, /about \$175/);
  assert.match(body.answer, /estimated deadhead/i);
  assert.match(body.answer, /rough estimate, not a final quote/i);
  assert.match(body.answer, /mynexusride\.com/);
  assert.match(body.answer, /\(888\) 639-5766/);
});

test('round trip doubles the passenger legs and the modeled deadhead follows total miles', async () => {
  const { status, body } = await estimator.estimate({ ...baseInput, tripType: 'ROUND_TRIP' }, '10.1.0.2');
  assert.equal(status, 200);
  // Legs: 2 x 133.934 = 267.868. Deadhead: 50% of 40 mi = 20 mi x 3.55
  // = 71.00. Total = 338.868 x 1.03 = 349.03 -> displayed 350.
  assert.ok(Math.abs(body.estimate.total - 349.03) < 0.02, `total was ${body.estimate.total}`);
  assert.equal(body.estimate.displayTotal, 350);
  assert.equal(body.estimate.loadedMiles, 40);
  assert.equal(body.estimate.deadheadMiles, 20);
  assert.match(body.answer, /round trip/);
});

test('after-hours pickup applies the +30% uplift and labels it', async () => {
  const { status, body } = await estimator.estimate({ ...baseInput, time: '20:30' }, '10.1.0.3');
  assert.equal(status, 200);
  // Leg subtotal 133.934 x 1.3 = 174.1142; + deadhead 35.50 = 209.6142;
  // x 1.03 = 215.90 -> displayed 215.
  assert.ok(Math.abs(body.estimate.total - 215.90) < 0.02, `total was ${body.estimate.total}`);
  assert.equal(body.estimate.displayTotal, 215);
  assert.equal(body.estimate.premiumReason, 'after-hours');
  assert.equal(body.estimate.premiumPct, 30);
  assert.match(body.answer, /after-hours uplift is included/);
});

test('weekend pickup applies the +30% weekend uplift', async () => {
  const { body } = await estimator.estimate({ ...baseInput, date: '2027-01-02' }, '10.1.0.4');
  assert.equal(body.estimate.premiumReason, 'weekend');
  assert.equal(body.estimate.premiumPct, 30);
  assert.equal(body.estimate.displayTotal, 215);
  assert.match(body.answer, /weekend uplift is included/);
});

test('wheelchair pricing uses its own base, included miles and per-mile rate', async () => {
  const { body } = await estimator.estimate({ ...baseInput, service: 'wheelchair' }, '10.1.0.5');
  // Base 98 + (20-8) x 4.10 = 49.20 + fuel (bus) 20 x 0.5595 = 11.19
  //   -> 158.39. Deadhead 10 mi x 4.10 = 41.00. Total 199.39 x 1.03 = 205.37.
  assert.ok(Math.abs(body.estimate.total - 205.37) < 0.02, `total was ${body.estimate.total}`);
  assert.equal(body.estimate.displayTotal, 205);
});

test('one-way ambulatory under 20 loaded miles models no return deadhead at all', async () => {
  const { status, body } = await estimator.estimate({ ...baseInput, loadedMiles: 15 }, '10.1.0.14');
  assert.equal(status, 200);
  // Engine: base 75 + (15-5) x 3.55 = 35.50 + fuel 15 x 0.2842 = 4.263
  //   -> 114.763. The platform rule bills no return-to-yard deadhead on a
  //   one-way Ambulatory trip under 20 loaded miles, so the model adds
  //   none: total = 114.763 x 1.03 = 118.21 -> displayed 120.
  assert.equal(body.estimate.deadheadMiles, 0);
  assert.ok(Math.abs(body.estimate.total - 118.21) < 0.02, `total was ${body.estimate.total}`);
  assert.equal(body.estimate.displayTotal, 120);
  assert.ok(!/deadhead/i.test(body.answer), 'answer must not claim a deadhead charge');
});

test('one-way wheelchair under 20 loaded miles models no return deadhead at all', async () => {
  const { body } = await estimator.estimate({ ...baseInput, service: 'wheelchair', loadedMiles: 15 }, '10.1.0.15');
  // Base 98 + (15-8) x 4.10 = 28.70 + fuel (bus) 15 x 0.5595 = 8.3925
  //   -> 135.0925. No modeled deadhead: x 1.03 = 139.15 -> displayed 140.
  assert.equal(body.estimate.deadheadMiles, 0);
  assert.ok(Math.abs(body.estimate.total - 139.15) < 0.02, `total was ${body.estimate.total}`);
  assert.equal(body.estimate.displayTotal, 140);
  assert.ok(!/deadhead/i.test(body.answer), 'answer must not claim a deadhead charge');
});

test('one-way stretcher under 20 loaded miles still models half the return-to-yard miles', async () => {
  const { body } = await estimator.estimate({ ...baseInput, service: 'stretcher', loadedMiles: 10 }, '10.1.0.16');
  // Base 455 + (10-8) x 7.95 = 15.90 + fuel (bus) 10 x 0.5595 = 5.595
  //   -> 476.495. Stretcher has no exemption: deadhead = half the loaded
  //   miles (the yard-run stand-in) 5 mi x 7.95 = 39.75. Total 516.245
  //   x 1.03 = 531.73 -> displayed 530.
  assert.equal(body.estimate.deadheadMiles, 5);
  assert.ok(Math.abs(body.estimate.total - 531.73) < 0.02, `total was ${body.estimate.total}`);
  assert.equal(body.estimate.displayTotal, 530);
  assert.match(body.answer, /empty miles back to the yard/i);
});

test('stored Pricing Manager settings override the coded defaults', async () => {
  // Live settings pulled 2026-10-29 carry stretcher with 15 included
  // miles (the coded default says 8); the stored row must win.
  const live = createEstimator({
    loadSettings: async () => mergeSettings({ pricing: { stretcher: { base: 455, includedMiles: 15, perMile: 7.95, waitPer15: 24 } } })
  });
  const { body } = await live.estimate({ ...baseInput, service: 'stretcher', loadedMiles: 30 }, '10.1.0.6');
  // Base 455 + (30-15) x 7.95 = 119.25 + fuel 30 x 0.5595 = 16.785
  //   -> 591.035. Deadhead 15 mi x 7.95 = 119.25. Total 710.285 x 1.03 = 731.59.
  assert.ok(Math.abs(body.estimate.total - 731.59) < 0.02, `total was ${body.estimate.total}`);
  assert.equal(body.estimate.displayTotal, 730);
  assert.match(body.answer, /first 15 miles/);
});

test('ambulance maps to BLS platform pricing', async () => {
  const { body } = await estimator.estimate({ ...baseInput, service: 'ambulance', loadedMiles: 10 }, '10.1.0.7');
  // Base 1125 + 10 x 18.50 = 185 + fuel 10 x 0.7052 = 7.052 -> 1317.052.
  // Deadhead 5 mi x 18.50 = 92.50. Total 1409.552 x 1.03 = 1451.84.
  assert.equal(body.estimate.service, 'bls');
  assert.ok(Math.abs(body.estimate.total - 1451.84) < 0.02, `total was ${body.estimate.total}`);
  assert.equal(body.estimate.displayTotal, 1450);
});

test('no estimate without both addresses, a distance, and a date/time', async () => {
  for (const patch of [{ pickup: '' }, { dropoff: '' }, { loadedMiles: 0 }, { loadedMiles: undefined }, { date: '' }, { time: '25:00' }, { service: 'helicopter' }]) {
    const { status, body } = await estimator.estimate({ ...baseInput, ...patch }, '10.1.0.8');
    assert.equal(status, 400, JSON.stringify(patch));
    assert.equal(body.mode, 'needs_input');
    assert.ok(!/\$\s?\d/.test(body.error), 'error copy must not quote a figure');
  }
});

test('implausible road distance against geocoded points is rejected, never adjusted', async () => {
  // Clarksburg MD -> Baltimore MD is ~36 straight-line miles.
  const coords = { pickupLat: 39.235, pickupLng: -77.285, dropoffLat: 39.29, dropoffLng: -76.61 };
  const tooShort = await estimator.estimate({ ...baseInput, ...coords, loadedMiles: 5 }, '10.1.0.9');
  assert.equal(tooShort.status, 400);
  const tooLong = await estimator.estimate({ ...baseInput, ...coords, loadedMiles: 220 }, '10.1.0.9');
  assert.equal(tooLong.status, 400);
  const plausible = await estimator.estimate({ ...baseInput, ...coords, loadedMiles: 42 }, '10.1.0.9');
  assert.equal(plausible.status, 200);
});

test('out-of-area states (AK/HI) get an honest no-estimate answer with the phone number', async () => {
  const { status, body } = await estimator.estimate({ ...baseInput, pickupState: 'AK', dropoffState: 'MD' }, '10.1.0.10');
  assert.equal(status, 200);
  assert.equal(body.mode, 'out_of_area');
  assert.match(body.answer, /48 contiguous states/);
  assert.match(body.answer, /Alaska and Hawaii are out of area/);
  assert.match(body.answer, /\(888\) 639-5766/);
  assert.ok(!/about \$\d/.test(body.answer), 'must not quote an estimate figure');
});

test('in-area states MD/DC/VA pass the area check', async () => {
  const { status, body } = await estimator.estimate({ ...baseInput, pickupState: 'MD', dropoffState: 'VA' }, '10.1.0.11');
  assert.equal(status, 200);
  assert.equal(body.mode, 'estimate');
});

test('other contiguous states (PA) now pass the area check too', async () => {
  const { status, body } = await estimator.estimate({ ...baseInput, pickupState: 'PA', dropoffState: 'MD' }, '10.1.0.12');
  assert.equal(status, 200);
  assert.equal(body.mode, 'estimate');
});

test('a long-distance inter-state estimate (MD to Kansas) is priced, not refused', async () => {
  // Clarksburg MD (39.24, -77.28) to Topeka KS (39.05, -95.68):
  // straight line ~1,015 mi, so 1,100 road miles is plausible.
  const input = {
    ...baseInput,
    dropoff: 'Topeka, KS',
    pickupState: 'MD',
    dropoffState: 'KS',
    loadedMiles: 1100,
    durationMinutes: 1020,
    pickupLat: 39.24, pickupLng: -77.28,
    dropoffLat: 39.05, dropoffLng: -95.68
  };
  const { status, body } = await estimator.estimate(input, '10.1.0.13');
  assert.equal(status, 200);
  assert.equal(body.mode, 'estimate');
  assert.equal(body.estimate.loadedMiles, 1100);
  assert.equal(body.estimate.deadheadMiles, 550);
  assert.match(body.answer, /about \$\d/);
});

test('estimate requests are rate limited per IP', async () => {
  const limited = createEstimator({ loadSettings: defaultSettings, now: () => 5000000 });
  let last;
  for (let i = 0; i < 13; i++) last = await limited.estimate(baseInput, '10.9.9.9');
  assert.equal(last.status, 429);
});

test('mergeSettings ignores garbage and keeps defaults', () => {
  const merged = mergeSettings({ pricing: { ambulatory: { base: 'not-a-number', perMile: 4 } }, fareRules: { cardProcessingFeePct: 5 } });
  assert.equal(merged.pricing.ambulatory.base, 75);
  assert.equal(merged.pricing.ambulatory.perMile, 4);
  assert.equal(merged.fareRules.cardProcessingFeePct, 5);
  assert.equal(merged.pricing.wheelchair.base, 98);
});

test('roundEstimate rounds to whole dollars under $100 and nearest $5 above', () => {
  assert.equal(roundEstimate(82.4), 82);
  assert.equal(roundEstimate(99.6), 100);
  assert.equal(roundEstimate(174.52), 175);
  assert.equal(roundEstimate(205.37), 205);
  assert.equal(roundEstimate(731.59), 730);
});
