const jwt = require('jsonwebtoken');
const environment = require('../config/environment');

const STREAM_TOKEN_TTL = '1h';

exports.generateStreamUrl = (req, episodeId, userId) => {
  const token = jwt.sign(
    { episodeId, userId: userId || null, purpose: 'stream' },
    environment.JWT_SECRET,
    { expiresIn: STREAM_TOKEN_TTL }
  );
  const base = `${req.protocol}://${req.get('host')}`;
  return `${base}/api/stream/${episodeId}?token=${token}`;
};

/**
 * Same signed token, pointed at the HLS manifest endpoint instead of
 * the plain-MP3 endpoint. This is what the frontend player (via hls.js)
 * should load.
 */
exports.generateHlsStreamUrl = (req, episodeId, userId) => {
  const token = jwt.sign(
    { episodeId, userId: userId || null, purpose: 'stream' },
    environment.JWT_SECRET,
    { expiresIn: STREAM_TOKEN_TTL }
  );
  const base = `${req.protocol}://${req.get('host')}`;
  return `${base}/api/stream/${episodeId}/master.m3u8?token=${token}`;
};

exports.verifyStreamToken = (token) => {
  const decoded = jwt.verify(token, environment.JWT_SECRET);
  if (decoded.purpose !== 'stream') {
    throw new Error('Invalid token purpose');
  }
  return decoded;
};
