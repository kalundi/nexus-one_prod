const http = require('http');
const { URL } = require('url');

function createState() {
  return {
    nextBrokerId: 1,
    nextRateId: 1,
    nextRequestId: 1,
    brokers: [],
    rates: [],
    requests: []
  };
}

function getState() {
  if (!global.__localTestServerState) {
    global.__localTestServerState = createState();
  }
  return global.__localTestServerState;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    },
    body: JSON.stringify(body)
  };
}

function text(statusCode, body, contentType = 'text/plain; charset=utf-8') {
  return {
    statusCode,
    headers: {
      'content-type': contentType,
      'cache-control': 'no-store'
    },
    body
  };
}

function clean(value) {
  return String(value ?? '').trim();
}

function normalizePath(rawPath) {
  if (!rawPath) {
    return { path: '', searchParams: new URLSearchParams() };
  }
  const [pathPart, queryPart] = String(rawPath).split('?');
  const path = pathPart || '';
  const searchParams = new URLSearchParams(queryPart || '');
  return { path, searchParams };
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(Object.assign(new Error('Invalid JSON body'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function parseEmailBody(text) {
  const bodyText = clean(text);
  const lines = bodyText.split(/\r?\n/).map((line) => clean(line)).filter(Boolean);
  const parsed = {
    pickup: null,
    destination: null,
    trip_date: null,
    trip_time: null,
    service: 'MEDICAL_TRANSPORT',
    broker_quoted_rate: 0,
    broker_name: 'Unknown',
    notes: ''
  };

  const datePatterns = [/(\d{4}-\d{2}-\d{2})/, /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/];
  const timePattern = /\b(\d{1,2}:\d{2})\b/;
  const ratePattern = /\$?(\d+(?:\.\d{2})?)/;
  const extractValue = (line) => {
    const separator = line.indexOf(':');
    if (separator >= 0) {
      return clean(line.slice(separator + 1));
    }
    return clean(line);
  };

  const pickupMatch = bodyText.match(/(?:^|\r?\n)\s*(pickup|origin|from)\s*[:|-]\s*(.+?)(?=(?:\r?\n|$))/i);
  const destinationMatch = bodyText.match(/(?:^|\r?\n)\s*(destination|dropoff|drop off|to)\s*[:|-]\s*(.+?)(?=(?:\r?\n|$))/i);
  const dateMatch = bodyText.match(/(?:^|\r?\n)\s*(date)\s*[:|-]\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
  const timeMatch = bodyText.match(/(?:^|\r?\n)\s*(time)\s*[:|-]\s*(\d{1,2}:\d{2})/i);
  const rateMatch = bodyText.match(/(?:^|\r?\n)\s*(rate|cost|price|quote)\s*[:|-]?\s*\$?(\d+(?:\.\d{2})?)/i);

  if (pickupMatch) {
    parsed.pickup = clean(pickupMatch[2]);
  }
  if (destinationMatch) {
    parsed.destination = clean(destinationMatch[2]);
  }
  if (dateMatch) {
    parsed.trip_date = clean(dateMatch[2]);
  }
  if (timeMatch) {
    parsed.trip_time = clean(timeMatch[2]);
  }
  if (rateMatch) {
    parsed.broker_quoted_rate = Number(rateMatch[2]);
  }

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!parsed.pickup && /(pickup|origin|from)/.test(lower)) {
      parsed.pickup = extractValue(line);
    }
    if (!parsed.destination && /(destination|dropoff|drop off|to)/.test(lower)) {
      parsed.destination = extractValue(line);
    }
    if (!parsed.trip_date) {
      const matchedDate = datePatterns.map((pattern) => line.match(pattern)?.[1]).find(Boolean);
      if (matchedDate) {
        parsed.trip_date = matchedDate;
      }
    }
    if (!parsed.trip_time) {
      const timeMatch = line.match(timePattern);
      if (timeMatch) {
        parsed.trip_time = timeMatch[1];
      }
    }
    if (parsed.broker_quoted_rate <= 0 && /(rate|quote|price|cost)/.test(lower)) {
      const rateMatch = line.match(ratePattern);
      if (rateMatch) {
        parsed.broker_quoted_rate = Number(rateMatch[1]);
      }
    }
  }

  if (!parsed.pickup || !parsed.destination || !parsed.trip_date || !parsed.trip_time || parsed.broker_quoted_rate <= 0) {
    return null;
  }

  return parsed;
}

function handleBrokerRoutes(path, method, body, searchParams) {
  const state = getState();
  const parts = path.split('/').filter(Boolean);

  if (parts[0] === 'admin' && parts[1] === 'brokers' && parts.length === 2 && method === 'POST') {
    const name = clean(body.name);
    if (!name) {
      return json(400, { error: 'name is required' });
    }
    const broker = {
      id: state.nextBrokerId++,
      name,
      contact_email: clean(body.contact_email) || null,
      contact_person: clean(body.contact_person) || null,
      contact_phone: clean(body.contact_phone) || null,
      net_terms_days: Number(body.net_terms_days) || 30,
      notes: clean(body.notes) || null,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    state.brokers.push(broker);
    return json(201, { broker });
  }

  if (parts[0] === 'admin' && parts[1] === 'brokers' && parts.length === 2 && method === 'GET') {
    return json(200, { brokers: state.brokers.filter((broker) => broker.status === 'ACTIVE') });
  }

  if (parts[0] === 'admin' && parts[1] === 'brokers' && parts.length === 3 && method === 'GET') {
    const broker = state.brokers.find((entry) => entry.id === Number(parts[2]));
    if (!broker) {
      return json(404, { error: 'Broker not found' });
    }
    const rates = state.rates.filter((entry) => entry.broker_id === broker.id && entry.effective_to === null);
    return json(200, { broker, rates });
  }

  if (parts[0] === 'admin' && parts[1] === 'brokers' && parts.length === 3 && method === 'PATCH') {
    const broker = state.brokers.find((entry) => entry.id === Number(parts[2]));
    if (!broker) {
      return json(404, { error: 'Broker not found' });
    }
    if (body.contact_person !== undefined) broker.contact_person = clean(body.contact_person) || null;
    if (body.contact_phone !== undefined) broker.contact_phone = clean(body.contact_phone) || null;
    if (body.net_terms_days !== undefined) broker.net_terms_days = Number(body.net_terms_days) || 30;
    if (body.notes !== undefined) broker.notes = clean(body.notes) || null;
    broker.updated_at = new Date().toISOString();
    return json(200, { broker });
  }

  if (parts[0] === 'admin' && parts[1] === 'brokers' && parts.length === 4 && parts[3] === 'rates' && method === 'POST') {
    const broker = state.brokers.find((entry) => entry.id === Number(parts[2]));
    if (!broker) {
      return json(404, { error: 'Broker not found' });
    }
    state.rates
      .filter((entry) => entry.broker_id === broker.id && entry.service === clean(body.service) && entry.effective_to === null)
      .forEach((entry) => {
        entry.effective_to = new Date().toISOString();
      });
    const rate = {
      id: state.nextRateId++,
      broker_id: broker.id,
      service: clean(body.service),
      base_rate: Number(body.base_rate) || 0,
      per_mile_rate: Number(body.per_mile_rate) || 0,
      notes: clean(body.notes) || null,
      effective_from: new Date().toISOString(),
      effective_to: null,
      created_at: new Date().toISOString()
    };
    state.rates.push(rate);
    return json(201, { rate });
  }

  if (parts[0] === 'broker-requests' && method === 'POST') {
    const request = {
      id: state.nextRequestId++,
      broker_id: body.broker_id !== undefined && body.broker_id !== null ? Number(body.broker_id) : null,
      booking_reference: clean(body.booking_reference) || null,
      broker_name: clean(body.broker_name) || 'Unknown',
      service: clean(body.service) || 'MEDICAL_TRANSPORT',
      pickup: clean(body.pickup),
      destination: clean(body.destination),
      pickup_lat: body.pickup_lat !== undefined && body.pickup_lat !== null ? Number(body.pickup_lat) : null,
      pickup_lng: body.pickup_lng !== undefined && body.pickup_lng !== null ? Number(body.pickup_lng) : null,
      destination_lat: body.destination_lat !== undefined && body.destination_lat !== null ? Number(body.destination_lat) : null,
      destination_lng: body.destination_lng !== undefined && body.destination_lng !== null ? Number(body.destination_lng) : null,
      trip_date: clean(body.trip_date),
      trip_time: clean(body.trip_time),
      broker_quoted_rate: Number(body.broker_quoted_rate) || 0,
      platform_calculated_rate: Number(body.platform_calculated_rate) || 0,
      rate_delta: (Number(body.broker_quoted_rate) || 0) - (Number(body.platform_calculated_rate) || 0),
      submission_method: clean(body.submission_method) || 'FORM',
      submitted_by: clean(body.submitted_by) || 'ANONYMOUS',
      request_status: 'AUTO_CONFIRMED',
      dispatch_reviewed: false,
      dispatch_reviewed_at: null,
      dispatch_reviewed_by: null,
      dispatch_notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    state.requests.push(request);
    const confirmationMessage = 'Your broker request has been received and is being reviewed. We will follow up shortly.';
    return json(201, {
      request,
      autoConfirmed: true,
      clientMessage: confirmationMessage,
      message: confirmationMessage
    });
  }

  if (parts[0] === 'admin' && parts[1] === 'broker-requests' && method === 'GET' && parts.length === 2) {
    const status = searchParams.get('status') || 'AUTO_CONFIRMED';
    return json(200, {
      requests: state.requests.filter((entry) => entry.request_status === status)
    });
  }

  if (parts[0] === 'admin' && parts[1] === 'broker-requests' && parts.length === 3 && method === 'PATCH') {
    const request = state.requests.find((entry) => entry.id === Number(parts[2]));
    if (!request) {
      return json(404, { error: 'Request not found' });
    }
    request.request_status = clean(body.dispatch_status) || request.request_status;
    request.dispatch_reviewed = true;
    request.dispatch_reviewed_at = new Date().toISOString();
    request.dispatch_reviewed_by = clean(body.dispatch_reviewed_by) || 'dispatcher';
    request.dispatch_notes = clean(body.dispatch_notes) || null;
    request.updated_at = new Date().toISOString();
    return json(200, { request });
  }

  if (parts[0] === 'admin' && parts[1] === 'brokers' && parts.length === 4 && parts[3] === 'dashboard' && method === 'GET') {
    const broker = state.brokers.find((entry) => entry.id === Number(parts[2]));
    if (!broker) {
      return json(404, { error: 'Broker not found' });
    }
    const month = new Date();
    const start = new Date(month.getFullYear(), month.getMonth(), 1).toISOString().split('T')[0];
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 0).toISOString().split('T')[0];
    const currentPeriod = {
      start,
      end,
      rides: state.requests.filter((entry) => entry.broker_id === broker.id && entry.trip_date >= start && entry.trip_date <= end && entry.request_status === 'AUTO_CONFIRMED').length,
      revenue: state.requests.filter((entry) => entry.broker_id === broker.id && entry.trip_date >= start && entry.trip_date <= end && entry.request_status === 'AUTO_CONFIRMED').reduce((sum, entry) => sum + Number(entry.broker_quoted_rate || 0), 0)
    };
    return json(200, { broker, currentPeriod, recentInvoices: [] });
  }

  if (parts[0] === 'admin' && parts[1] === 'brokers' && parts.length === 4 && parts[3] === 'export' && method === 'GET') {
    const broker = state.brokers.find((entry) => entry.id === Number(parts[2]));
    if (!broker) {
      return json(404, { error: 'Broker not found' });
    }
    const lines = ['booking_reference,service,pickup,destination,date,time,broker_rate,platform_rate,delta,status'];
    for (const request of state.requests.filter((entry) => entry.broker_id === broker.id)) {
      lines.push(`${request.booking_reference || 'N/A'},${request.service},"${request.pickup}","${request.destination}",${request.trip_date},${request.trip_time},${request.broker_quoted_rate},${request.platform_calculated_rate},${request.rate_delta},${request.request_status}`);
    }
    return text(200, lines.join('\n'), 'text/csv; charset=utf-8');
  }

  return json(404, { error: 'Route not found' });
}

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const pathname = url.pathname;

      if (pathname === '/health' || pathname === '/api/health') {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'ok', environment: 'local-test', build: '042' }));
        return;
      }

      if (pathname === '/.netlify/functions/api' || pathname === '/api') {
        const body = req.method === 'GET' ? {} : await parseBody(req);
        const rawPath = url.searchParams.get('path') || '';
        const { path, searchParams } = normalizePath(rawPath || pathname.replace(/^\/\.netlify\/functions\/api\/?/, '').replace(/^\/api\/?/, ''));
        const response = handleBrokerRoutes(path, req.method, body, searchParams);
        res.writeHead(response.statusCode, response.headers);
        res.end(response.body);
        return;
      }

      const fs = require('fs');
      const path = require('path');
      const workspaceRoot = path.resolve(__dirname, '..');
      const filePath = pathname === '/'
        ? path.join(workspaceRoot, '__deploy_temp', 'index.html')
        : path.join(workspaceRoot, pathname.replace(/^\//, ''));
      const isStaticAsset = /\.(html|js|css|png|jpg|jpeg|gif|svg|ico|json|txt|md)$/.test(pathname);
      if (isStaticAsset && fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const contentTypes = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.txt': 'text/plain; charset=utf-8',
          '.md': 'text/markdown; charset=utf-8',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon'
        };
        res.writeHead(200, { 'content-type': contentTypes[ext] || 'application/octet-stream' });
        res.end(content);
        return;
      }

      if (pathname === '/.netlify/functions/broker-email-webhook') {
        const body = req.method === 'GET' ? {} : await parseBody(req);
        const parsed = parseEmailBody(body.text || body.body || body.html || '');
        if (!parsed) {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: 'Could not parse pickup, destination, date, time, or rate from email body' }));
          return;
        }
        const state = getState();
        const request = {
          id: state.nextRequestId++,
          broker_id: null,
          broker_name: body.sender_name || 'Unknown',
          service: parsed.service,
          pickup: parsed.pickup,
          destination: parsed.destination,
          trip_date: parsed.trip_date,
          trip_time: parsed.trip_time,
          broker_quoted_rate: parsed.broker_quoted_rate,
          platform_calculated_rate: 0,
          rate_delta: parsed.broker_quoted_rate,
          submission_method: 'EMAIL',
          submitted_by: body.from || 'unknown@broker.local',
          request_status: 'AUTO_CONFIRMED',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        state.requests.push(request);
        res.writeHead(201, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          request_id: request.id,
          broker_id: request.broker_id,
          broker_name: request.broker_name,
          parsed_route: `${request.pickup} → ${request.destination}`,
          parsed_date: request.trip_date,
          parsed_time: request.trip_time,
          parsed_rate: `$${request.broker_quoted_rate}`,
          auto_confirmed: true
        }));
        return;
      }

      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: error.message || 'Internal server error' }));
    }
  });
}

const port = Number(process.env.PORT || 4173);
const server = createServer();
server.listen(port, '127.0.0.1', () => {
  console.log(`Local test server listening on http://127.0.0.1:${port}`);
});
