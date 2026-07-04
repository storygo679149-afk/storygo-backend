const express = require('express');
const router = express.Router();
const https = require('https');
const { URL } = require('url');
const { query } = require('../config/database');
const { verifyStreamToken } = require('../utils/streaming');
const { getSignedAudioUrl } = require('../config/cloudinary');

// GET /api/stream/:episodeId?token=...
//
// This is the only place a real, working Cloudinary link is ever touched.
// The browser never sees it -- it only sees this endpoint, which requires
// a short-lived signed token (see utils/streaming.js).
//
// The audio itself lives on Cloudinary as a PRIVATE ("authenticated")
// asset, so even if someone captured a Cloudinary URL directly, it would
// be rejected without a valid, freshly-generated Cloudinary signature --
// which only this backend (with the API secret) can produce.
//
// Supports Range requests so the <audio> element can still seek normally.
router.get('/:episodeId', async (req, res) => {
  const { episodeId } = req.params;
  const { token } = req.query;

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

    const cloudinaryUrl = getSignedAudioUrl(result.rows[0].audio_public_id, 300);
    const target = new URL(cloudinaryUrl);

    const upstreamHeaders = {};
    if (req.headers.range) {
      upstreamHeaders.Range = req.headers.range;
    }

    const upstreamReq = https.request(
      {
        hostname: target.hostname,
        path: target.pathname + target.search,
        method: 'GET',
        headers: upstreamHeaders,
      },
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
      if (!res.headersSent) {
        res.status(502).json({ status: 'error', message: 'Failed to stream audio' });
      }
    });

    upstreamReq.end();
  } catch (error) {
    console.error('Stream route error:', error);
    return res.status(500).json({ status: 'error', message: 'Error streaming episode' });
  }
});

module.exports = router;
