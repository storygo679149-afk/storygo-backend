const sanitizeHtml = require('sanitize-html');

const defaultOptions = {
  allowedTags: [],           // koi bhi HTML tag allowed nahi hai
  allowedAttributes: {},    // koi bhi attribute allowed nahi
};

function clean(str) {
  if (typeof str !== 'string') return '';   // agar string nahi hai to khaali return karo
  return sanitizeHtml(str.trim(), defaultOptions);
}

module.exports = { clean };