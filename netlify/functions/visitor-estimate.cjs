'use strict';
/*
 * Public visitor rough-estimate endpoint (Nex chat).
 *
 * POST /.netlify/functions/visitor-estimate
 *   { pickup, dropoff, service, tripType, date, time,
 *     loadedMiles, returnMiles?, durationMinutes?,
 *     pickupState, dropoffState, pickupLat, pickupLng, dropoffLat, dropoffLng }
 * -> { mode: 'estimate', answer, estimate: {...} }
 *
 * The widget measures road distance in the browser with the Google
 * Maps Directions service (the booking app's own method, browser key),
 * then this endpoint prices the trip with the platform's fare engine
 * and live Pricing Manager settings — see _shared/visitor-estimate.cjs
 * for the grounding rules. Inputs are used for the calculation only and
 * are never logged or stored; the only analytics kept is the anonymous
 * service category of a completed estimate (see _shared/nex-intent-insights.cjs),
 * so estimate usage shows alongside chat questions in Nex Insights.
 */

const { json, parseBody } = require('./_shared/http.cjs');
const { createEstimator } = require('./_shared/visitor-estimate.cjs');
const { query } = require('./_shared/db.cjs');
const NexInsights = require('./_shared/nex-intent-insights.cjs');

const estimator = createEstimator({});

function clientIp(event) {
  const headers = event.headers || {};
  const forwarded = headers['x-nf-client-connection-ip'] || headers['x-forwarded-for'] || '';
  return String(forwarded).split(',')[0].trim() || 'unknown';
}

exports.handler = async (event) => {
  try {
    if (String(event.httpMethod || 'GET').toUpperCase() !== 'POST') {
      return json(405, { error: 'Method not allowed' });
    }
    const body = parseBody(event);
    const result = await estimator.estimate(body, clientIp(event));
    // Save only the coarse, non-identifying service category of a
    // completed estimate; logging failures never block the estimate.
    if (result.status === 200 && result.body && (result.body.mode === 'estimate' || result.body.mode === 'out_of_area')) {
      const service = (result.body.estimate && result.body.estimate.service) || body.service;
      await NexInsights.storeEstimate(query, service, result.body.mode).catch(error => {
        // Never log trip inputs, the estimate, or DB connection details.
        // A bounded code-only diagnostic makes write failures observable.
        const code = String(error?.code || 'unknown');
        const safeCode = /^[A-Z0-9]{4,6}$/i.test(code) ? code : 'unknown';
        console.warn('[NEX_INSIGHTS] Analytics event write failed (code ' + safeCode + ').');
      });
    }
    return json(result.status, result.body);
  } catch (error) {
    return json(Number(error.statusCode || 500), {
      error: 'The estimate tool is unavailable right now. Please call (888) 639-5766 and the team will quote your trip.'
    });
  }
};
