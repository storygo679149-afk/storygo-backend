// Simple in‑memory IP blacklist with automatic expiry.
// In production, replace with Redis for persistence and cluster support.

const blockedIPs = new Map();

/**
 * Block an IP address for a given duration (seconds).
 */
function blockIP(ip, durationSec = 3600) {
  const expires = Date.now() + durationSec * 1000;
  blockedIPs.set(ip, expires);
}

/**
 * Remove an IP from the blocklist.
 */
function unblockIP(ip) {
  blockedIPs.delete(ip);
}

/**
 * Check if an IP is currently blocked.
 * Automatically cleans expired entries.
 */
function isIPBlocked(ip) {
  const expiry = blockedIPs.get(ip);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    blockedIPs.delete(ip);
    return false;
  }
  return true;
}

module.exports = { blockIP, unblockIP, isIPBlocked };