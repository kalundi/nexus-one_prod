const test = require('node:test');
const assert = require('node:assert/strict');
const {ensureDefaultUserForEmail} = require('../netlify/functions/_shared/default-users.cjs');

test('restores a known default user when the login email matches a seeded account', async () => {
  const rows = [];
  const fakeQuery = async (sql, params = []) => {
    if (sql.includes('SELECT id FROM users')) {
      const email = String(params[0] || '').toLowerCase();
      return { rows: rows.filter((row) => String(row.email || '').toLowerCase() === email) };
    }

    if (sql.includes('INSERT INTO users')) {
      const email = String(params[1] || '');
      const role = String(params[3] || '');
      const id = `user-${rows.length + 1}`;
      rows.push({ id, email, role });
      return { rowCount: 1 };
    }

    if (sql.includes('UPDATE users')) {
      const id = params[0];
      const row = rows.find((entry) => entry.id === id);
      if (row) {
        row.role = params[2];
      }
      return { rowCount: 1 };
    }

    return { rows: [] };
  };

  const result = await ensureDefaultUserForEmail(fakeQuery, 'admin@nexusmt.com');

  assert.equal(result.created, true);
  assert.equal(result.email, 'admin@nexusmt.com');
  assert.equal(rows.some((row) => row.email === 'admin@nexusmt.com' && row.role === 'ADMIN'), true);
});
