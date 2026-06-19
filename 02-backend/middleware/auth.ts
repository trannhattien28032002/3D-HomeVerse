import { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import jwt from 'jsonwebtoken';
import { env } from '../configs/env';
import { AppError } from '../shared/errors/AppError';
import { pool } from '../shared/db/client';
import { typedQuery } from '../shared/db/queryHelper';
import type { ShareContext } from '../shared/types/shareContext';

interface SupabaseJwtPayload {
  sub: string;
  email?: string;
  app_metadata?: { plan?: string };
  user_metadata?: { plan?: string };
}

interface ShareRow {
  projectId: string;
  permission: 'viewer' | 'commenter' | 'editor';
  expiresAt: Date | null;
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7).trim() || null;
}

// Supabase phát access token ký BẤT ĐỐI XỨNG (ES256) bằng signing key xoay vòng,
// public key đọc từ endpoint JWKS. createRemoteJWKSet cache key trong nền và tự
// fetch lại khi gặp `kid` mới → an toàn với key rotation, không cần shared secret.
const JWKS = createRemoteJWKSet(new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`));

async function verifyToken(token: string): Promise<SupabaseJwtPayload> {
  // Chỉ trong test: chấp nhận token HS256 ký bằng SUPABASE_JWT_SECRET, để integration
  // test mint token cục bộ chạy được mà không cần private signing key của Supabase.
  // Production KHÔNG đi nhánh này → luôn verify ES256/JWKS bất đối xứng (không hạ bảo mật).
  if (env.NODE_ENV === 'test') {
    try {
      return jwt.verify(token, env.SUPABASE_JWT_SECRET, { algorithms: ['HS256'] }) as unknown as SupabaseJwtPayload;
    } catch {
      throw new AppError('Invalid or expired token', 401, 'UNAUTHORIZED');
    }
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, { algorithms: ['ES256'] });
    return payload as unknown as SupabaseJwtPayload;
  } catch {
    throw new AppError('Invalid or expired token', 401, 'UNAUTHORIZED');
  }
}

// Requires a valid Bearer token. Attaches req.user or throws 401.
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    throw new AppError('Authorization header missing or malformed', 401, 'UNAUTHORIZED');
  }

  const payload = await verifyToken(token);
  req.user = {
    id: payload.sub,
    email: payload.email ?? '',
    plan: payload.app_metadata?.plan ?? payload.user_metadata?.plan ?? 'free',
  };
  next();
}

// Optionally attaches req.user if a valid token is present; does not reject
// the request when the token is absent or invalid.
export async function attachUserIfPresent(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractToken(req);
  if (token) {
    try {
      const payload = await verifyToken(token);
      req.user = {
        id: payload.sub,
        email: payload.email ?? '',
        plan: payload.app_metadata?.plan ?? payload.user_metadata?.plan ?? 'free',
      };
    } catch {
      // Silently ignore invalid tokens for optional-auth routes.
    }
  }
  next();
}

// Reads ?shareToken query param, looks it up in the DB, checks expiry,
// and attaches req.shareContext when valid. Does NOT reject the request.
// To avoid circular imports, the DB query is done inline here.
export async function attachShareContext(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const shareToken = req.query.shareToken as string | undefined;
  if (!shareToken) {
    next();
    return;
  }

  try {
    const { rows } = await typedQuery<ShareRow>(
      pool,
      `SELECT project_id, permission, expires_at
       FROM public.project_shares
       WHERE token = $1`,
      [shareToken]
    );

    const share = rows[0];
    if (share && (!share.expiresAt || new Date(share.expiresAt) > new Date())) {
      req.shareContext = {
        projectId: share.projectId,
        permission: share.permission,
      };
    }
  } catch {
    // Silently ignore errors; share context simply won't be attached.
  }

  next();
}

// Allows the request if either req.user (JWT) or req.shareContext is set.
// Use on routes accessible by both authenticated users and share-token holders.
export function requireAuthOrShare(req: Request, _res: Response, next: NextFunction): void {
  if (req.user || req.shareContext) {
    next();
    return;
  }
  throw new AppError('Authentication or share token required', 401, 'UNAUTHORIZED');
}
