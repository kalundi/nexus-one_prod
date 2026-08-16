const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const shared = fs.readFileSync(path.join(root, 'nexus-shared-app.css'), 'utf8');
const platform = fs.readFileSync(path.join(root, 'platform.css'), 'utf8');

test('both application style systems animate Nexus logo placements', () => {
  assert.match(shared, /\.brandLogo[\s\S]*img\[src\$="nexus-logo\.png"\][\s\S]*animation:logoPop/);
  assert.match(shared, /prefers-reduced-motion:reduce[\s\S]*animation:none !important/);
  assert.match(platform, /\.logo,[\s\S]*\.footerLogo,[\s\S]*animation:logoPop/);
});

test('shared-app pages request the animation stylesheet cache version', () => {
  for (const file of ['booking-app.html', 'driver-app.html', 'patient.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /nexus-shared-app\.css\?v=33/);
  }
});
