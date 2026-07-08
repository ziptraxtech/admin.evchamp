import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { loginCpo } from '../db/schema.js';

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'evchamp-dev-secret-change-in-prod';
const JWT_EXPIRES = '8h';

export interface CpoTokenPayload {
  cpoId:       string;
  userId:      string;
  companyName: string;
  orgId:       string;
}

authRouter.post('/login', async (req, res) => {
  const { userId, password } = req.body ?? {};
  if (!userId || !password) return res.status(400).json({ error: 'userId and password required' });

  const cpo = await db.query.loginCpo.findFirst({ where: eq(loginCpo.userId, userId) });
  if (!cpo) return res.status(401).json({ error: 'Invalid credentials' });

  const match = await bcrypt.compare(password, cpo.passwordHash);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });

  const payload: CpoTokenPayload = {
    cpoId: cpo.id, userId: cpo.userId, companyName: cpo.companyName, orgId: cpo.orgId,
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  res.json({ token, companyName: cpo.companyName, userId: cpo.userId });
});

// Middleware — attach to any router that needs protection
export function requireCpo(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'auth_required' });
  try {
    (req as any).cpo = jwt.verify(auth.slice(7), JWT_SECRET) as CpoTokenPayload;
    next();
  } catch {
    return res.status(401).json({ error: 'token_invalid' });
  }
}
