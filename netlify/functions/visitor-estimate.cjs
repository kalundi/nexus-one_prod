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
 * for the grounding rules. Inputs are used for the calculation only:
 * nothing is logged or stored.
 */

const { json, parseBody } = require('./_shared/http.cjs');
const { createEstimator } = require('./_shared/visitor-estimate.cjs');

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
    return json(result.status, result.body);
  } catch (error) {
    return json(Number(error.statusCode || 500), {
      error: 'The estimate tool is unavailable right now. Please call (888) 639-5766 and the team will quote your trip.'
    });
  }
};
