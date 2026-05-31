import rateLimit from 'express-rate-limit';

// Standard limiter: 100 req/min per IP. Applied globally or per-router.
export const standardLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' } },
});

// Autosave limiter: 120 req/min (allows 2 req/sec sustained).
// Applied to POST /projects/:id/autosave.
export const autosaveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Autosave rate limit exceeded.' } },
});

// Search limiter: 30 req/min for search endpoints to prevent scraping.
// Applied to GET /library/objects/search and GET /materials/search.
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Search rate limit exceeded.' } },
});
