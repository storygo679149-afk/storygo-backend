const express = require('express');
const router = express.Router();
const https = require('https');
const { URL } = require('url');
const { query } = require('../config/database');
const { verifyStreamToken } = require('../utils/streaming');

// GET /api/stream/:episodeId?token=...
//
// This is the only place the real Cloudinary audio URL is ever touched
// after upload. The browser never sees it — it only sees this endpoint,
// which requires a short-lived signed token (see utils/streaming.js).
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
      'SELECT audio_url FROM episodes WHERE id = $1 AND is_active = true',
      [episodeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Episode not found' });
    }

    const cloudinaryUrl = result.rows[0].audio_url;
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
        // Forward status (200 or 206 for partial content) and relevant headers.
        res.status(upstreamRes.statusCode);
        ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach((h) => {
          if (upstreamRes.headers[h]) res.setHeader(h, upstreamRes.headers[h]);
        });

        // Prevent the browser/OS from offering a "Save As" download prompt
        // and stop intermediate caches/CDNs from storing a permanent copy.
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
