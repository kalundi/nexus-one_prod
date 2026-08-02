const http = require('http');

const payload = {
  from: 'driverdeveloper@gotandt.com',
  sender_name: 'Driver Developer',
  to: 'fletcher@nexusmt.com',
  subject: 'Broker request test',
  text: 'Pickup: 123 Main St, Boston MA\nDestination: 456 Oak Ave, Quincy MA\nDate: 2026-08-15\nTime: 14:30\nService: MEDICAL_TRANSPORT\nRate Quote: $85.00'
};

const req = http.request({
  host: '127.0.0.1',
  port: 4173,
  path: '/.netlify/functions/broker-email-webhook',
  method: 'POST',
  headers: { 'content-type': 'application/json' }
}, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('status', res.statusCode);
    console.log(data);
  });
});

req.write(JSON.stringify(payload));
req.end();
