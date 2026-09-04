import { NextFunction, Request, Response } from 'express';
import { verifySessionToken } from '../services/jwt';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing_token' });
  }

  try {
    const claims = verifySessionToken(header.slice('Bearer '.length));
    req.userId = claims.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}
