// --------------------------------------------------------------
// Web Application Firewall Pattern Rules
// Each rule has a case‑insensitive regex and a message.
// --------------------------------------------------------------

module.exports = {
  sqlInjection: {
    regex: /(\bUNION\b|\bSELECT\b|\bDROP\b|\bALTER\b|\bINSERT\b|\bDELETE\b|\bUPDATE\b|\bCREATE\b)/i,
    message: 'Potential SQL injection detected.'
  },
  xss: {
    regex: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>|<[^>]*on\w+=["'][^"']*["'][^>]*>/i,
    message: 'Cross‑site scripting attempt blocked.'
  },
  commandInjection: {
    regex: /[;|&`](\bping\b|\bnslookup\b|\bwget\b|\bcurl\b|\bnet\suser\b)/i,
    message: 'Command injection attempt blocked.'
  },
  pathTraversal: {
    regex: /\.\.\/|\.\.\\/,
    message: 'Path traversal attempt blocked.'
  },
  suspiciousHeaders: {
    regex: /(\bX-HTTP-Method-Override\b|\bX-Forwarded-For\b.*local)/i,
    message: 'Suspicious header detected.'
  }
};