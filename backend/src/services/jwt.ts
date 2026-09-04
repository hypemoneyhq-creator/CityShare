import jwt from 'jsonwebtoken';

const envSecret = process.env.JWT_SECRET;
if (!envSecret) {
  throw new Error('JWT_SECRET must be set');
}
const SECRET: string = envSecret;

export interface SessionClaims {
  userId: string;
}

export function issueSessionToken(claims: SessionClaims): string {
  return jwt.sign(claims, SECRET, { expiresIn: '30d' });
}

export function verifySessionToken(token: string): SessionClaims {
  return jwt.verify(token, SECRET) as SessionClaims;
}
