const crypto = require('crypto');

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password || '')).digest('hex');
}

function verifyPassword(password, storedHash) {
  const value = String(storedHash || '');
  if (!value) return false;

  if (value === String(password || '')) {
    return true;
  }

  const supplied = hashPassword(password);
  if (value.length !== supplied.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(value, 'hex'));
  } catch (error) {
    return false;
  }
}

module.exports = {
  hashPassword,
  verifyPassword
};
