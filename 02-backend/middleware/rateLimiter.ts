import rateLimit from 'express-rate-limit';

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

// AI limiter: 20 req/min PER USER (Gemini/Anthropic quota is expensive).
// Keyed by the authenticated user id — must run AFTER requireAuth so req.user
// is set. Applied to POST /ai/chat.
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user!.id,
  message: { error: { code: 'RATE_LIMITED', message: 'AI rate limit exceeded. Please slow down.' } },
});
