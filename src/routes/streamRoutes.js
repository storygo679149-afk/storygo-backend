const express = require('express');
const router = express.Router();
const https = require('https');
const { URL } = require('url');
const { query } = require('../config/database');
const { verifyStreamToken } = require('../utils/streaming');
const { getSignedHlsUrl } = require('../config/cloudinary');

// Shared proxy logic: fetch a Cloudinary URL server-side and pipe it to
// the client, forwarding Range headers (needed for .ts segment fetches
// and any seeking within them).
function proxyFromCloudinary(cloudinaryUrl, req, res, extraHeaders = {}) {
  const target = new URL(cloudinaryUrl);
  const upstreamHeaders = {};
  if (req.headers.range) upstreamHeaders.Range = req.headers.range;

  const upstreamReq = https.request(
    { hostname: target.hostname, path: target.pathname + target.search, method: 'GET', headers: upstreamHeaders },
    (upstreamRes) => {
      res.status(upstreamRes.statusCode);
      ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach((h) => {
        if (upstreamRes.headers[h]) res.setHeader(h, upstreamRes.headers[h]);
      });
      Object.entries(extraHeaders).forEach(([k, v]) => res.setHeader(k, v));
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cache-Control', 'private, no-store');
      upstreamRes.pipe(res);
    }
  );

  upstreamReq.on('error', (err) => {
    console.error('Stream proxy error:', err);
    if (!res.headersSent) res.status(502).json({ status: 'error', message: 'Failed to stream audio' });
  });

  upstreamReq.end();
}

// GET /api/stream/:episodeId/master.m3u8?token=...
//
// Serves the HLS manifest -- the playlist of small audio segments.
// hls.js on the frontend loads this URL, then requests each segment
// referenced inside it (which Cloudinary serves as its own signed
// sub-URLs for authenticated assets).
router.get('/:episodeId/master.m3u8', async (req, res) => {
  const { episodeId } = req.params;
  const { token } = req.query;

  if (!token) return res.status(401).json({ status: 'error', message: 'Missing stream token' });

  let decoded;
  try {
    decoded = verifyStreamToken(token);
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Invalid or expired stream link' });
  }
  if (decoded.episodeId !== episodeId) {
    return res.status(403).json({ status: 'error', message: 'Token does not match this episode' });
  }

  try {
    const result = await query(
      'SELECT audio_public_id FROM episodes WHERE id = $1 AND is_active = true',
      [episodeId]
    );
    if (result.rows.length === 0 || !result.rows[0].audio_public_id) {
      return res.status(404).json({ status: 'error', message: 'Episode not found' });
    }

    const manifestUrl = getSignedHlsUrl(result.rows[0].audio_public_id, 300);
    proxyFromCloudinary(manifestUrl, req, res, { 'Content-Type': 'application/vnd.apple.mpegurl' });
  } catch (error) {
    console.error('HLS manifest route error:', error);
    return res.status(500).json({ status: 'error', message: 'Error streaming episode' });
  }
});

// GET /api/stream/:episodeId?token=...  (legacy fallback: plain MP3)
// Kept for any part of the app not yet updated to use HLS.
router.get('/:episodeId', async (req, res) => {
  const { episodeId } = req.params;
  const { token } = req.query;

  if (!token) return res.status(401).json({ status: 'error', message: 'Missing stream token' });

  let decoded;
  try {
    decoded = verifyStreamToken(token);
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Invalid or expired stream link' });
  }
  if (decoded.episodeId !== episodeId) {
    return res.status(403).json({ status: 'error', message: 'Token does not match this episode' });
  }

  try {
    const { getSignedAudioUrl } = require('../config/cloudinary');
    const result = await query(
      'SELECT audio_public_id FROM episodes WHERE id = $1 AND is_active = true',
      [episodeId]
    );
    if (result.rows.length === 0 || !result.rows[0].audio_public_id) {
      return res.status(404).json({ status: 'error', message: 'Episode not found' });
    }
    const audioUrl = getSignedAudioUrl(result.rows[0].audio_public_id, 300);
    proxyFromCloudinary(audioUrl, req, res);
  } catch (error) {
    console.error('Stream route error:', error);
    return res.status(500).json({ status: 'error', message: 'Error streaming episode' });
  }
});

module.exports = router;
