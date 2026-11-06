import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { db } from '../db/pool';
import { User } from './setup';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    slackState?: string;
  }
}

export function isGoogleAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function setupGoogleAuth() {
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const res = await db.query('SELECT * FROM users WHERE id = $1', [id]);
      done(null, res.rows[0] || null);
    } catch (err) {
      done(err, null);
    }
  });

  if (!isGoogleAuthConfigured()) {
    console.warn('Google OAuth is not configured; set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable it.');
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/auth/google/callback',
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const googleId = profile.id;
          const email = profile.emails?.[0]?.value || '';
          const name = profile.displayName || email.split('@')[0];
          const avatar = profile.photos?.[0]?.value || null;

          let userRes = await db.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
          if (userRes.rows.length === 0) {
            const insert = await db.query(
              `INSERT INTO users (google_id, email, name, avatar)
               VALUES ($1, $2, $3, $4)
               RETURNING *`,
              [googleId, email, name, avatar]
            );
            userRes = insert;
          } else {
            const update = await db.query(
              `UPDATE users SET name = $1, avatar = $2, updated_at = NOW() WHERE google_id = $3 RETURNING *`,
              [name, avatar, googleId]
            );
            userRes = update;
          }
          done(null, userRes.rows[0]);
        } catch (err) {
          done(err as Error);
        }
      }
    )
  );
}
