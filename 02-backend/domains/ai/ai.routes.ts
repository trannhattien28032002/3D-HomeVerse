/**
 * ai.routes — POST /ai/chat (WP1b).
 *
 * Auth: route gắn requireAuth (Track A / RQ-0 đã xong — FE đã lấy được Supabase
 * token và gắn Authorization: Bearer vào mọi request). Kèm aiLimiter (20 req/phút
 * mỗi user) để chống đốt quota Gemini/Anthropic. Limiter phải chạy SAU requireAuth
 * để req.user (key) đã có sẵn.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth';
import { aiLimiter } from '../../middleware/rateLimiter';
import { validate } from '../../middleware/validate';
import { ChatBodySchema } from './ai.schema';
import * as service from './ai.service';

export const aiRouter = Router();

// POST /ai/chat — một turn Anthropic Messages API.
aiRouter.post(
  '/chat',
  requireAuth,
  aiLimiter,
  validate(ChatBodySchema, 'body'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await service.runChat(req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);
