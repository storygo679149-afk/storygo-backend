const bcrypt = require('bcrypt');

// ---------- Password strength policy ----------
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REQUIREMENTS = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/;

async function hashPassword(password) {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function validatePasswordStrength(password) {
  if (password.length < PASSWORD_MIN_LENGTH)
    return { isValid: false, message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
  if (!PASSWORD_REQUIREMENTS.test(password))
    return { isValid: false, message: 'Password must contain uppercase, lowercase, number, and special character.' };
  return { isValid: true };
}

// ---------- Suspicious Activity Logger ----------
function logSuspiciousActivity(message, data = {}) {
  console.warn(`[SECURITY] ${message}`, data);
  // In production, send to a file or SIEM
}

module.exports = {
  hashPassword,
  comparePassword,
  validatePasswordStrength,
  logSuspiciousActivity,
};