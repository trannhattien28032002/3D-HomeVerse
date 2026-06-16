/**
 * ai.routes — POST /ai/chat (WP1b).
 *
 * ⚠️ AUTH TẠM THỜI (dev-only): route này CHƯA gắn requireAuth vì FE hiện chưa có
 * cơ chế lấy Supabase token. Để KHÔNG biến thành open-relay đốt quota Gemini ở
 * production, route TỪ CHỐI khi NODE_ENV === 'production'. Khi FE có auth (WP1b+),
 * thay guard này bằng requireAuth.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { env } from '../../configs/env';
import { validate } from '../../middleware/validate';
import { AppError } from '../../shared/errors/AppError';
import { ChatBodySchema } from './ai.schema';
import * as service from './ai.service';

export const aiRouter = Router();

// Cổng chặn production cho route chưa-auth.
function devOnly(_req: Request, _res: Response, next: NextFunction): void {
  if (env.NODE_ENV === 'production') {
    throw new AppError(
      'AI chat chưa khả dụng ở production (chưa gắn auth).',
      503,
      'AI_DISABLED_IN_PROD'
    );
  }
  next();
}

// POST /ai/chat — một turn Anthropic Messages API.
aiRouter.post(
  '/chat',
  devOnly,
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
