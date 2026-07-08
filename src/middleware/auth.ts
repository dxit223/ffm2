import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fly_messenger_jwt_secret_key_123';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: typeof users.$inferSelect;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  
  // Try custom JWT first (cheaper and faster)
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number; email: string; uid: string };
    const dbUser = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, decoded.id),
    });

    if (dbUser) {
      if (dbUser.isBanned) {
        return res.status(403).json({ error: 'Your account has been banned or suspended by administration.' });
      }
      req.dbUser = dbUser;
      req.user = {
        uid: dbUser.uid,
        email: dbUser.email,
        name: dbUser.displayName || dbUser.username || '',
        picture: dbUser.photoURL || null,
      } as any;
      return next();
    }
  } catch (jwtErr) {
    // If it was meant to be JWT but failed verification (expired, bad signature), handle or fallback to Firebase
  }

  // Fallback to Firebase Authentication
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;

    // Sync / Get user in our Postgres Database
    const uid = decodedToken.uid;
    const email = decodedToken.email || '';
    const displayName = decodedToken.name || email.split('@')[0];
    const photoURL = decodedToken.picture || null;

    try {
      const result = await db.insert(users)
        .values({
          uid,
          email,
          displayName,
          photoURL,
          status: 'online',
        })
        .onConflictDoUpdate({
          target: users.uid,
          set: {
            email,
            displayName,
            photoURL,
          },
        })
        .returning();

      req.dbUser = result[0];
    } catch (dbErr) {
      console.error('Failed to sync user with Postgres:', dbErr);
      // Fallback: search for existing user
      const existing = await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.uid, uid),
      });
      if (existing) {
        req.dbUser = existing;
      } else {
        throw new Error('Could not find or create database user profile', { cause: dbErr });
      }
    }

    if (req.dbUser && req.dbUser.isBanned) {
      return res.status(403).json({ error: 'Your account has been banned or suspended by administration.' });
    }

    next();
  } catch (error: any) {
    console.error('Authentication check failed:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token', details: error.message });
  }
};
