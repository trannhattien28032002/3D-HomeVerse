// Augment Express's Request interface to carry the authenticated user payload.
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        plan: string;
      };
    }
  }
}

export {};
