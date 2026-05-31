import type { ShareContext } from './shareContext';

// Augment Express's Request interface to carry the authenticated user payload
// and optional share context for token-based shared access.
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        plan: string;
      };
      shareContext?: ShareContext;
    }
  }
}

export {};
