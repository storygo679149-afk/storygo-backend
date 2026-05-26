// Known malicious bots – extend this list as needed
const BAD_BOTS = [
  'AhrefsBot',
  'SemrushBot',
  'MJ12bot',
  'DotBot',
  'Baiduspider',
  'YandexBot',
  'Screaming Frog',
  'PetalBot',
  'ZoominfoBot'
];

/**
 * Returns true if the User‑Agent is a known bad bot.
 */
function isBadBot(userAgent) {
  if (!userAgent) return false;
  const lowerUA = userAgent.toLowerCase();
  return BAD_BOTS.some(bot => lowerUA.includes(bot.toLowerCase()));
}

module.exports = { isBadBot };