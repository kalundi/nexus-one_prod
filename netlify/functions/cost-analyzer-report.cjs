// Netlify scheduled function: sends a recurring Cost Analyzer summary to admins and Teams.
// Schedule is configured in netlify.toml.

const {query} = require('./_shared/db.cjs');

const DRIVER_PAY_RATES = {ambulatory: 20, wheelchair: 25, stretcher: 30, ambulance: 40};

const envEnabled = (name) => Boolean(process.env[name]);
const clean = (value) => String(value ?? '').trim();
const n = (value, fallback = 0) => {
 const parsed = Number(value);
 return Number.isFinite(parsed) ? parsed : fallback;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function buildEmailRecipients(input) {
 if (!input) return [];
 const values = Array.isArray(input) ? input : String(input).split(/[;,]/g);
 return values.map((value) => clean(value).toLowerCase()).filter(Boolean);
}

async function listAdminEmails() {
 const rowset = await query(`SELECT DISTINCT lower(trim(email)) AS email FROM users WHERE role='ADMIN' AND active=true AND email IS NOT NULL AND trim(email)<>''`).catch(() => ({rows: []}));
 const emails = new Set((rowset.rows || []).map((row) => clean(row.email).toLowerCase()).filter(Boolean));
 if (clean(process.env.NEXUS_ADMIN_EMAIL)) emails.add(clean(process.env.NEXUS_ADMIN_EMAIL).toLowerCase());
 emails.add('admin@nexusmt.com');
 return Array.from(emails);
}

async function sendEmail(to, subject, html) {
 const recipients = buildEmailRecipients(to);
 if (!envEnabled('SENDGRID_API_KEY') || !envEnabled('SENDGRID_FROM_EMAIL') || recipients.length === 0) return {status: 'skipped'};
 const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
  method: 'POST',
  headers: {authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'content-type': 'application/json'},
  body: JSON.stringify({
   personalizations: [{to: recipients.map((email) => ({email}))}],
   from: {email: process.env.SENDGRID_FROM_EMAIL, name: 'Nexus Medical Transit'},
   subject,
   content: [{type: 'text/html', value: html}]
  })
 });
 if (!r.ok) throw new Error(`SendGrid request failed (${r.status})`);
 return {status: 'sent'};
}

async function sendTeamsAlert(text, title = 'Nexus Medical Transit') {
 const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
 if (!webhookUrl) return {status: 'skipped'};
 const isPowerAutomateWebhook = /environment\.api\.powerplatform\.com|\/powerautomate\/automations\/direct\//i.test(webhookUrl);
 const body = isPowerAutomateWebhook
  ? {
   type: 'message',
   attachments: [{
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
     '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
     type: 'AdaptiveCard',
     version: '1.4',
     body: [
      {type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: String(title || 'Nexus Medical Transit')},
      {type: 'TextBlock', text: String(text || ''), wrap: true}
     ]
    }
   }]
  }
  : {
   '@type': 'MessageCard', '@context': 'https://schema.org/extensions',
   themeColor: '#082f49', summary: title, title, text
  };
 try {
  const r = await fetch(webhookUrl, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
  return r.ok ? {status: 'sent'} : {status: 'failed', code: r.status};
 } catch (error) {
  return {status: 'failed', error: error.message};
 }
}

function resolveCostBand(service) {
 const normalized = clean(service).toLowerCase();
 if (/ambulance|bls|als/.test(normalized)) return 'ambulance';
 if (/stretcher|bariatric/.test(normalized)) return 'stretcher';
 if (/wheelchair/.test(normalized)) return 'wheelchair';
 return 'ambulatory';
}

function utcDateOnly(date) {
 return date.toISOString().slice(0, 10);
}

function shiftUtcDate(date, offsetDays) {
 const next = new Date(date.getTime());
 next.setUTCDate(next.getUTCDate() + offsetDays);
 return next;
}

function getReportPeriod() {
 const days = clamp(Math.floor(n(process.env.COST_ANALYZER_REPORT_DAYS, 1)), 1, 365);
 const today = new Date();
 const end = shiftUtcDate(today, -1);
 const start = shiftUtcDate(end, -(days - 1));
 return {start: utcDateOnly(start), end: utcDateOnly(end), days};
}

async function getCostAnalyzerAnalytics(options) {
 const fareRulesResult = await query(`SELECT value FROM system_settings WHERE key='platform' LIMIT 1`).catch(() => ({rows: []}));
 const fareRules = fareRulesResult.rows?.[0]?.value || {};
 const fuelIndexPrice = n(fareRules.fuelIndexPricePerGallon, 0);
 const fuelPricePerGallon = fuelIndexPrice > 0 ? fuelIndexPrice : n(fareRules.fuelBaselinePricePerGallon, 3.25);
 const defaultMpg = clamp(n(fareRules.fuelEfficiencyMpg, 10), 1, 100);
 const fuelBufferPct = clamp(n(fareRules.fuelOperationalBufferPct, 0), 0, 300);
 const tollCostPerTrip = clamp(n(fareRules.tollCostPerTrip, 0), 0, 1000);
 const maintenanceCostPerMile = clamp(n(fareRules.maintenanceCostPerMile, 0), 0, 100);
 const insuranceCostPerTrip = clamp(n(fareRules.insuranceCostPerTrip, 0), 0, 1000);
 const dispatchOverheadPerTrip = clamp(n(fareRules.dispatchOverheadPerTrip, 0), 0, 1000);
 const cleaningCostPerTrip = clamp(n(fareRules.cleaningCostPerTrip, 0), 0, 1000);
 const complianceCostPerTrip = clamp(n(fareRules.complianceCostPerTrip, 0), 0, 1000);
 const otherVariableCostPerTrip = clamp(n(fareRules.otherVariableCostPerTrip, 0), 0, 1000);

 const rows = await query(
  `SELECT
    b.reference,b.trip_date,b.trip_time,b.service,b.status,b.booking_source,
    b.driver_name,b.vehicle_unit,
    COALESCE(b.distance_miles,0)::numeric(12,2) AS distance_miles,
    COALESCE(b.estimated_fare,0)::numeric(12,2) AS estimated_fare,
    v.vehicle_type,
    v.fuel_efficiency_mpg,
    COALESCE(NULLIF(v.metadata->>'mpg_rating',''),'0')::numeric(12,2) AS vehicle_metadata_mpg
   FROM bookings b
   LEFT JOIN vehicles v ON v.unit_number=b.vehicle_unit
   WHERE b.trip_date >= $1
     AND b.trip_date <= $2
     AND COALESCE(b.status,'') <> 'CANCELLED'
   ORDER BY b.trip_date DESC, b.trip_time DESC, b.reference DESC`,
  [options.start, options.end]
 );

 const breakdownByVehicle = {};
 const breakdownByDriver = {};
 const breakdownByService = {};

 let totalTrips = 0;
 let totalRevenue = 0;
 let totalCost = 0;
 let totalDriverPay = 0;
 let totalFuelCost = 0;
 let totalTollCost = 0;
 let totalMaintenanceCost = 0;
 let totalInsuranceCost = 0;
 let totalDispatchOverheadCost = 0;
 let totalCleaningCost = 0;
 let totalComplianceCost = 0;
 let totalOtherVariableCost = 0;

 for (const row of rows.rows || []) {
  const distance = n(row.distance_miles, 0);
  const estimatedFare = n(row.estimated_fare, 0);
  const band = resolveCostBand(row.service);
  const driverPay = n(DRIVER_PAY_RATES[band], 20);
  const mpgCandidate = n(row.fuel_efficiency_mpg, 0) > 0 ? n(row.fuel_efficiency_mpg, 0) : n(row.vehicle_metadata_mpg, 0);
  const mpgUsed = mpgCandidate > 0 ? mpgCandidate : defaultMpg;
  const gallonsUsed = distance > 0 ? distance / mpgUsed : 0;
  const fuelCost = gallonsUsed * fuelPricePerGallon * (1 + (fuelBufferPct / 100));
  const tollCost = tollCostPerTrip;
  const maintenanceCost = distance * maintenanceCostPerMile;
  const insuranceCost = insuranceCostPerTrip;
  const dispatchOverheadCost = dispatchOverheadPerTrip;
  const cleaningCost = cleaningCostPerTrip;
  const complianceCost = complianceCostPerTrip;
  const otherVariableCost = otherVariableCostPerTrip;
  const otherCostTotal = tollCost + maintenanceCost + insuranceCost + dispatchOverheadCost + cleaningCost + complianceCost + otherVariableCost;
  const tripCost = driverPay + fuelCost + otherCostTotal;
  const profit = estimatedFare - tripCost;

  totalTrips += 1;
  totalRevenue += estimatedFare;
  totalCost += tripCost;
  totalDriverPay += driverPay;
  totalFuelCost += fuelCost;
  totalTollCost += tollCost;
  totalMaintenanceCost += maintenanceCost;
  totalInsuranceCost += insuranceCost;
  totalDispatchOverheadCost += dispatchOverheadCost;
  totalCleaningCost += cleaningCost;
  totalComplianceCost += complianceCost;
  totalOtherVariableCost += otherVariableCost;

  const driverKey = clean(row.driver_name) || 'Unassigned';
  if (!breakdownByDriver[driverKey]) breakdownByDriver[driverKey] = {driver: driverKey, trips: 0, totalCost: 0, totalRevenue: 0, totalProfit: 0};
  breakdownByDriver[driverKey].trips += 1;
  breakdownByDriver[driverKey].totalCost += tripCost;
  breakdownByDriver[driverKey].totalRevenue += estimatedFare;
  breakdownByDriver[driverKey].totalProfit += profit;

  const vehicleKey = clean(row.vehicle_unit) || 'Unassigned';
  if (!breakdownByVehicle[vehicleKey]) breakdownByVehicle[vehicleKey] = {vehicleUnit: vehicleKey, vehicleType: clean(row.vehicle_type) || 'Unknown', trips: 0, totalCost: 0, totalRevenue: 0, totalProfit: 0};
  breakdownByVehicle[vehicleKey].trips += 1;
  breakdownByVehicle[vehicleKey].totalCost += tripCost;
  breakdownByVehicle[vehicleKey].totalRevenue += estimatedFare;
  breakdownByVehicle[vehicleKey].totalProfit += profit;

  const serviceKey = clean(row.service) || 'unknown';
  if (!breakdownByService[serviceKey]) breakdownByService[serviceKey] = {service: serviceKey, trips: 0, totalCost: 0, totalRevenue: 0, totalProfit: 0};
  breakdownByService[serviceKey].trips += 1;
  breakdownByService[serviceKey].totalCost += tripCost;
  breakdownByService[serviceKey].totalRevenue += estimatedFare;
  breakdownByService[serviceKey].totalProfit += profit;
 }

 const summary = {
  trips: totalTrips,
  totalCost: Number(totalCost.toFixed(2)),
  totalRevenue: Number(totalRevenue.toFixed(2)),
  totalProfit: Number((totalRevenue - totalCost).toFixed(2)),
  averageCostPerTrip: totalTrips ? Number((totalCost / totalTrips).toFixed(2)) : 0,
  averageRevenuePerTrip: totalTrips ? Number((totalRevenue / totalTrips).toFixed(2)) : 0,
  averageProfitPerTrip: totalTrips ? Number(((totalRevenue - totalCost) / totalTrips).toFixed(2)) : 0,
  driverLaborCost: Number(totalDriverPay.toFixed(2)),
  fuelCost: Number(totalFuelCost.toFixed(2)),
  tollCost: Number(totalTollCost.toFixed(2)),
  maintenanceCost: Number(totalMaintenanceCost.toFixed(2)),
  insuranceCost: Number(totalInsuranceCost.toFixed(2)),
  dispatchOverheadCost: Number(totalDispatchOverheadCost.toFixed(2)),
  cleaningCost: Number(totalCleaningCost.toFixed(2)),
  complianceCost: Number(totalComplianceCost.toFixed(2)),
  otherVariableCost: Number(totalOtherVariableCost.toFixed(2)),
  nonFuelVariableCost: Number((totalTollCost + totalMaintenanceCost + totalInsuranceCost + totalDispatchOverheadCost + totalCleaningCost + totalComplianceCost + totalOtherVariableCost).toFixed(2))
 };

 const topVehicle = Object.values(breakdownByVehicle).sort((a, b) => b.totalCost - a.totalCost || b.trips - a.trips)[0];
 const topDriver = Object.values(breakdownByDriver).sort((a, b) => b.totalCost - a.totalCost || b.trips - a.trips)[0];

 return {
  period: {...options},
  assumptions: {
   fuelPricePerGallon: Number(fuelPricePerGallon.toFixed(3)),
   fuelSource: fuelIndexPrice > 0 ? 'platform_fuel_index' : 'platform_fuel_baseline',
   defaultMpg,
   fuelOperationalBufferPct: Number(fuelBufferPct.toFixed(2)),
  tollCostPerTrip: Number(tollCostPerTrip.toFixed(2)),
  maintenanceCostPerMile: Number(maintenanceCostPerMile.toFixed(4)),
  insuranceCostPerTrip: Number(insuranceCostPerTrip.toFixed(2)),
  dispatchOverheadPerTrip: Number(dispatchOverheadPerTrip.toFixed(2)),
  cleaningCostPerTrip: Number(cleaningCostPerTrip.toFixed(2)),
  complianceCostPerTrip: Number(complianceCostPerTrip.toFixed(2)),
  otherVariableCostPerTrip: Number(otherVariableCostPerTrip.toFixed(2)),
   driverPayRates: DRIVER_PAY_RATES
  },
  summary,
  topVehicle,
  topDriver,
  breakdowns: {
   byVehicle: Object.values(breakdownByVehicle).sort((a, b) => b.totalCost - a.totalCost || b.trips - a.trips).map((item) => ({
    vehicleUnit: item.vehicleUnit,
    vehicleType: item.vehicleType,
    trips: item.trips,
    totalCost: Number(item.totalCost.toFixed(2)),
    totalRevenue: Number(item.totalRevenue.toFixed(2)),
    totalProfit: Number(item.totalProfit.toFixed(2)),
    averageCostPerTrip: item.trips ? Number((item.totalCost / item.trips).toFixed(2)) : 0
   })),
   byDriver: Object.values(breakdownByDriver).sort((a, b) => b.totalCost - a.totalCost || b.trips - a.trips).map((item) => ({
    driver: item.driver,
    trips: item.trips,
    totalCost: Number(item.totalCost.toFixed(2)),
    totalRevenue: Number(item.totalRevenue.toFixed(2)),
    totalProfit: Number(item.totalProfit.toFixed(2))
   }))
  }
 };
}

async function sendCostAnalyzerReport(analytics, requestedBy = 'Automated Cost Analyzer Schedule') {
 const summary = analytics.summary || {};
 const period = analytics.period || {};
 const topVehicle = analytics.topVehicle || analytics.breakdowns?.byVehicle?.[0];
 const topDriver = analytics.topDriver || analytics.breakdowns?.byDriver?.[0];
 const title = `📊 Cost Analyzer Report — ${period.start} to ${period.end}`;
 const emails = await listAdminEmails();
 const teamsText = [
  `**Cost Analyzer** (${period.start} → ${period.end})`,
  `- **Trips:** ${summary.trips || 0}`,
  `- **Total Cost:** $${Number(summary.totalCost || 0).toFixed(2)}`,
  `- **Total Revenue:** $${Number(summary.totalRevenue || 0).toFixed(2)}`,
  `- **Total Profit:** $${Number(summary.totalProfit || 0).toFixed(2)}`,
  `- **Driver Labor:** $${Number(summary.driverLaborCost || 0).toFixed(2)}`,
  `- **Fuel:** $${Number(summary.fuelCost || 0).toFixed(2)}`,
  `- **Tolls:** $${Number(summary.tollCost || 0).toFixed(2)}`,
  `- **Other Variable Costs:** $${Number(summary.nonFuelVariableCost || 0).toFixed(2)}`,
  topVehicle ? `- **Highest Cost Vehicle:** ${topVehicle.vehicleUnit} ($${Number(topVehicle.totalCost || 0).toFixed(2)})` : null,
  topDriver ? `- **Highest Cost Driver:** ${topDriver.driver} ($${Number(topDriver.totalCost || 0).toFixed(2)})` : null,
  `- **Requested by:** ${requestedBy}`
 ].filter(Boolean).join('\n');
 const html = `<h2 style="color:#082f49">Cost Analyzer Report</h2><p><strong>Period:</strong> ${period.start} to ${period.end}</p><table style="width:100%;border-collapse:collapse;margin:12px 0"><tr><td style="padding:8px;font-weight:700;border:1px solid #dbe5ed">Trips</td><td style="padding:8px;border:1px solid #dbe5ed">${summary.trips || 0}</td></tr><tr><td style="padding:8px;font-weight:700;border:1px solid #dbe5ed">Total Cost</td><td style="padding:8px;border:1px solid #dbe5ed">$${Number(summary.totalCost || 0).toFixed(2)}</td></tr><tr><td style="padding:8px;font-weight:700;border:1px solid #dbe5ed">Total Revenue</td><td style="padding:8px;border:1px solid #dbe5ed">$${Number(summary.totalRevenue || 0).toFixed(2)}</td></tr><tr><td style="padding:8px;font-weight:700;border:1px solid #dbe5ed">Total Profit</td><td style="padding:8px;border:1px solid #dbe5ed">$${Number(summary.totalProfit || 0).toFixed(2)}</td></tr><tr><td style="padding:8px;font-weight:700;border:1px solid #dbe5ed">Driver Labor Cost</td><td style="padding:8px;border:1px solid #dbe5ed">$${Number(summary.driverLaborCost || 0).toFixed(2)}</td></tr><tr><td style="padding:8px;font-weight:700;border:1px solid #dbe5ed">Fuel Cost</td><td style="padding:8px;border:1px solid #dbe5ed">$${Number(summary.fuelCost || 0).toFixed(2)}</td></tr><tr><td style="padding:8px;font-weight:700;border:1px solid #dbe5ed">Toll Cost</td><td style="padding:8px;border:1px solid #dbe5ed">$${Number(summary.tollCost || 0).toFixed(2)}</td></tr><tr><td style="padding:8px;font-weight:700;border:1px solid #dbe5ed">Other Variable Costs</td><td style="padding:8px;border:1px solid #dbe5ed">$${Number(summary.nonFuelVariableCost || 0).toFixed(2)}</td></tr></table><p><strong>Top vehicle by cost:</strong> ${topVehicle ? `${topVehicle.vehicleUnit} ($${Number(topVehicle.totalCost || 0).toFixed(2)})` : 'N/A'}</p><p><strong>Top driver by cost:</strong> ${topDriver ? `${topDriver.driver} ($${Number(topDriver.totalCost || 0).toFixed(2)})` : 'N/A'}</p><p style="color:#62758a">Generated by ${requestedBy}</p>`;

 const [emailResult, teamsResult] = await Promise.allSettled([
  sendEmail(emails, `Nexus Cost Analyzer Report — ${period.start} to ${period.end}`, html),
  sendTeamsAlert(teamsText, title)
 ]);

 return {
  recipients: emails,
  email: emailResult.status === 'fulfilled' ? emailResult.value : {status: 'failed', error: emailResult.reason?.message},
  teams: teamsResult.status === 'fulfilled' ? teamsResult.value : {status: 'failed', error: teamsResult.reason?.message}
 };
}

exports.handler = async () => {
 try {
  const period = getReportPeriod();
  const analytics = await getCostAnalyzerAnalytics(period);
  const delivery = await sendCostAnalyzerReport(analytics, 'Automated Cost Analyzer Schedule');
  console.log(`[Cost Analyzer] Sent scheduled report for ${period.start} to ${period.end}`);
  return {
   statusCode: 200,
   body: JSON.stringify({period, summary: analytics.summary, delivery})
  };
 } catch (error) {
  console.error('[Cost Analyzer] Scheduled report failed:', error.message);
  return {statusCode: 500, body: JSON.stringify({error: error.message})};
 }
};
