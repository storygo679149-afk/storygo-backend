const express = require('express');
const router = express.Router();
const https = require('https');
const { URL } = require('url');
const { query } = require('../config/database');
const { verifyStreamToken } = require('../utils/streaming');
const { getSignedAudioUrl } = require('../config/cloudinary');
const environment = require('../config/environment');

// Blocks casual "open the stream link directly in a browser tab" access.
// A real in-page <audio> request has Sec-Fetch-Dest: audio (or the header
// is absent on older browsers/native players); a typed/pasted URL opened
// as its own page has Sec-Fetch-Dest: document. We also accept a matching
// Referer from our own frontend as a fallback signal for browsers/clients
// that don't send Sec-Fetch-Dest at all.
function isDirectNavigation(req) {
  const dest = req.headers['sec-fetch-dest'];
  if (dest === 'document' || dest === 'iframe') return true;

  // If Sec-Fetch-Dest is missing entirely (older browser), fall back to
  // checking Referer -- a real page load from our own app will have one.
  if (!dest) {
    const referer = req.headers['referer'] || '';
    const allowedOrigin = environment.CLIENT_URL;
    if (referer && !referer.startsWith(allowedOrigin)) return true;
  }
  return false;
}

// GET /api/stream/:episodeId?token=...
//
// Proxies the actual audio bytes from a private ("authenticated")
// Cloudinary asset. The token is short-lived and scoped to one episode.
// Direct browser navigation to this URL is blocked -- it only serves
// requests coming from the app's own <audio> element.
router.get('/:episodeId', async (req, res) => {
  const { episodeId } = req.params;
  const { token } = req.query;

  if (isDirectNavigation(req)) {
    return res.status(403).json({ status: 'error', message: 'Direct access to this link is not allowed' });
  }

  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Missing stream token' });
  }

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

    const audioUrl = getSignedAudioUrl(result.rows[0].audio_public_id, 300);
    const target = new URL(audioUrl);
    const upstreamHeaders = {};
    if (req.headers.range) upstreamHeaders.Range = req.headers.range;

    const upstreamReq = https.request(
      { hostname: target.hostname, path: target.pathname + target.search, method: 'GET', headers: upstreamHeaders },
      (upstreamRes) => {
        res.status(upstreamRes.statusCode);
        ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach((h) => {
          if (upstreamRes.headers[h]) res.setHeader(h, upstreamRes.headers[h]);
        });
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
  } catch (error) {
    console.error('Stream route error:', error);
    return res.status(500).json({ status: 'error', message: 'Error streaming episode' });
  }
});

module.exports = router;
