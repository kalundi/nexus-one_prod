const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('trip route maps consistently show full pickup, intermediate stop, and destination addresses', () => {
  const booking = read('booking-app.js');
  const livecare = read('js/app.js');
  const driver = read('driver-app.js');
  const sharedStyles = read('platform.css');

  assert.match(booking, /text: `Pickup: \$\{pickupLabel\}`/);
  assert.match(booking, /text: `Stop \$\{index \+ 1\}: \$\{address\}`/);
  assert.match(booking, /legs\.slice\(0, -1\)/);
  assert.match(booking, /renderCustomerRoute\(result, pickup, destinations\)/);
  assert.match(booking, /text: `Destination: \$\{destinationLabel\}`/);
  assert.match(livecare, /label\.textContent=`\$\{kind\}: \$\{address\}`/);
  assert.match(driver, /`Pickup: \$\{t\.pickup\}`/);
  assert.match(driver, /`Destination: \$\{t\.destination\}`/);
  assert.match(sharedStyles, /\.mapPoint \.mapAddressLabel/);
});
