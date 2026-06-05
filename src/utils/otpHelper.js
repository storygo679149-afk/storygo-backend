const crypto = require('crypto');

/**
 * Cryptographically secure 6-digit OTP generate karta hai
 * @returns {string} 6-digit OTP string
 */
const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

/**
 * OTP expiry time — 10 minutes from now
 * @returns {Date} expiry timestamp
 */
const getOTPExpiry = () => {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + 10);
  return expiry;
};

module.exports = { generateOTP, getOTPExpiry };
