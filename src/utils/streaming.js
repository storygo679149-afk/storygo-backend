const jwt = require('jsonwebtoken');
const environment = require('../config/environment');

// How long a stream link stays valid after it's issued.
// Kept generous (1 hour) so playback of a long episode doesn't get cut off
// mid-way if the user seeks near the end — but it still expires, unlike a
// permanent Cloudinary URL.
const STREAM_TOKEN_TTL = '1h';

/**
 * Build a short-lived, single-purpose streaming URL for an episode.
 * The token is tied to the episodeId (and userId, if logged in) so it
 * can't be reused for a different episode, and it expires automatically.
 */
exports.generateStreamUrl = (req, episodeId, userId) => {
  const token = jwt.sign(
    { episodeId, userId: userId || null, purpose: 'stream' },
    environment.JWT_SECRET,
    { expiresIn: STREAM_TOKEN_TTL }
  );

  const base = `${req.protocol}://${req.get('host')}`;
  return `${base}/api/stream/${episodeId}?token=${token}`;
};

exports.verifyStreamToken = (token) => {
  const decoded = jwt.verify(token, environment.JWT_SECRET);
  if (decoded.purpose !== 'stream') {
    throw new Error('Invalid token purpose');
  }
  return decoded;
};
