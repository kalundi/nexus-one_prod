const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('route markers display pickup and destination addresses', () => {
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'booking-app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'booking-app.html'), 'utf8');

  assert.match(source, /text: `Pickup: \$\{pickupLabel\}`/);
  assert.match(source, /text: `Destination: \$\{destinationLabel\}`/);
  assert.doesNotMatch(source, /label: \{ text: '[PD]'/);
  assert.match(html, /\.routeAddressMarkerLabel\{/);
});
