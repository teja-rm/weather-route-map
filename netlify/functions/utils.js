// Shared utilities for Netlify Functions
const rateLimit = new Map();

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // requests per minute

function checkRateLimit(clientId) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  if (!rateLimit.has(clientId)) {
    rateLimit.set(clientId, []);
  }
  
  const requests = rateLimit.get(clientId);
  // Remove old requests outside the window
  const recentRequests = requests.filter(time => time > windowStart);
  
  if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false; // Rate limit exceeded
  }
  
  recentRequests.push(now);
  rateLimit.set(clientId, recentRequests);
  
  return true; // Request allowed
}

function getClientId(event) {
  // Use IP address as client identifier
  return event.headers['x-forwarded-for'] || 
         event.headers['x-real-ip'] || 
         event.connection?.remoteAddress || 
         'unknown';
}

function validateRequest(body, requiredFields) {
  const errors = [];
  
  for (const field of requiredFields) {
    if (!body[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  return errors;
}

module.exports = {
  checkRateLimit,
  getClientId,
  validateRequest
};
