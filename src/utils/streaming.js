const jwt = require('jsonwebtoken');
const environment = require('../config/environment');

exports.generateSignedAudioUrl = (publicId, userId) => {
  // Generate a short-lived JWT that includes the publicId and userId
  const token = jwt.sign({ publicId, userId }, environment.JWT_SECRET, { expiresIn: '5m' });
  return `${environment.CLIENT_URL}/api/stream/${publicId}?token=${token}`;
};

exports.verifyStreamToken = (token) => {
  return jwt.verify(token, environment.JWT_SECRET);
};