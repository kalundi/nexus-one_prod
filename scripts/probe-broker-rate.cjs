const http = require('http');

function request(path, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', port: 4173, path, method, headers: { 'content-type': 'application/json' } }, (res) => {
      let responseText = '';
      res.on('data', (chunk) => { responseText += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: responseText });
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(data);
    }
    req.end();
  });
}

(async () => {
  const createResponse = await request('/.netlify/functions/api?path=admin/brokers', 'POST', { name: 'Probe Broker', contact_email: 'probe@test.com' });
  console.log('create_status', createResponse.statusCode);
  console.log(createResponse.body);
  const brokerPayload = JSON.parse(createResponse.body);
  const rateResponse = await request(`/.netlify/functions/api?path=admin/brokers/${brokerPayload.broker.id}/rates`, 'POST', { service: 'MEDICAL_TRANSPORT', base_rate: 50, per_mile_rate: 2.5, notes: 'Test rate' });
  console.log('rate_status', rateResponse.statusCode);
  console.log(rateResponse.body);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
