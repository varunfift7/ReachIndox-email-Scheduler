import { Router, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { db } from '../db/pool';
import { isGoogleAuthConfigured } from '../auth/google';

const router = Router();

/** Demo-mode bearer bypass is only enabled outside of production. */
function isDemoModeEnabled(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  const bearer = req.headers.authorization;
  if (bearer && bearer.startsWith('Bearer ')) {
    const token = bearer.slice(7);
    if (isDemoModeEnabled() && token === 'demo-mode') {
      const existing = (req as any).demoUser;
      if (existing) {
        (req as any).user = existing;
        return next();
      }
      db.query('SELECT * FROM users ORDER BY id LIMIT 1')
        .then(result => {
          if (result.rows.length > 0) {
            const user = result.rows[0];
            (req as any).demoUser = user;
            (req as any).user = user;
            return next();
          }
          res.status(401).json({ message: 'No demo user found. Please login with Google first.' });
        })
        .catch(() => {
          res.status(500).json({ message: 'Database error' });
        });
      return;
    }
  }
  res.status(401).json({ message: 'Not authenticated' });
};

router.get('/google', (req: Request, res: Response, next: NextFunction) => {
  if (!isGoogleAuthConfigured()) {
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/?error=google_not_configured`);
  }
  return passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

router.get('/google/callback', (req: Request, res: Response, next: NextFunction) => {
  if (!isGoogleAuthConfigured()) {
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/?error=google_not_configured`);
  }
  return passport.authenticate('google', { failureRedirect: '/auth/google/failure' })(req, res, next);
},
  (req: Request, res: Response) => {
    const redirectUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${redirectUrl}/dashboard`);
  }
);

router.get('/google/failure', (_req: Request, res: Response) => {
  res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/?error=login_failed`);
});

router.get('/me', (req: Request, res: Response) => {
  if (req.isAuthenticated()) {
    const user = req.user as any;
    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
    });
  }

  const bearer = req.headers.authorization;
  const token = bearer && bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
  if (isDemoModeEnabled() && token === 'demo-mode') {
    if ((req as any).demoUser) {
      const user = (req as any).demoUser;
      return res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      });
    }
    return db.query('SELECT * FROM users ORDER BY id LIMIT 1')
      .then(result => {
        if (result.rows.length > 0) {
          const user = result.rows[0];
          (req as any).demoUser = user;
          (req as any).user = user;
          return res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
          });
        }
        return res.status(401).json({ message: 'No demo user found. Please login with Google first.' });
      })
      .catch(() => res.status(500).json({ message: 'Database error' }));
  }

  res.status(401).json({ message: 'Not authenticated' });
});

router.post('/logout', (req: Request, res: Response) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ message: 'Logout failed' });
    }
    req.session.destroy((sessionErr) => {
      if (sessionErr) {
        return res.status(500).json({ message: 'Logout failed' });
      }
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  });
});

export default router;
