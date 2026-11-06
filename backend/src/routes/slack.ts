import { Router, Request, Response } from 'express';
import { isAuthenticated } from './auth';
import { exchangeSlackCode, saveSlackToken } from '../services/slack';
import { db } from '../db/pool';
import crypto from 'crypto';

const router = Router();

router.get('/connect', isAuthenticated, (req: Request, res: Response) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.redirect(`${frontendUrl}/dashboard?slack=not_configured`);
  }

  const state = crypto.randomBytes(16).toString('hex');
  const user = req.user as any;
  const userId = user.id;
  if (req.session) {
    req.session.slackState = `${state}:${userId}`;
  }
  const redirectUri = process.env.SLACK_REDIRECT_URI || 'http://localhost:4000/api/slack/callback';
  const url = `https://slack.com/oauth/v2/authorize?client_id=${encodeURIComponent(clientId)}&scope=chat:write&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  res.redirect(url);
});

router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, error } = req.query as Record<string, string>;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    if (error) {
      return res.redirect(`${frontendUrl}/dashboard?slack=error`);
    }

    const sessionState = req.session?.slackState || '';
    const [statePart, userIdPart] = sessionState.split(':');

    if (!statePart || state !== statePart) {
      return res.redirect(`${frontendUrl}/dashboard?slack=invalid_state`);
    }

    const tokenRes = await exchangeSlackCode(code);
    if (!tokenRes.ok || !tokenRes.access_token) {
      return res.redirect(`${frontendUrl}/dashboard?slack=token_error`);
    }

    const userId = Number.parseInt(userIdPart, 10);
    if (!Number.isFinite(userId)) {
      return res.redirect(`${frontendUrl}/dashboard?slack=invalid_state`);
    }
    await saveSlackToken(userId, tokenRes.access_token, tokenRes.team_name || '', tokenRes.team_id || '');

    res.redirect(`${frontendUrl}/dashboard?slack=connected`);
  } catch (err: any) {
    console.error('Slack callback error:', err);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/dashboard?slack=error`);
  }
});

router.get('/status', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const result = await db.query('SELECT slack_access_token, slack_team_name FROM users WHERE id = $1', [user.id]);
    const connected = result.rows[0]?.slack_access_token ? true : false;
    res.json({ connected, teamName: result.rows[0]?.slack_team_name || null });
  } catch (err: any) {
    console.error('Slack status error:', err);
    res.status(500).json({ message: 'Failed to fetch Slack status', error: err.message });
  }
});

router.post('/disconnect', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    await db.query(
      'UPDATE users SET slack_access_token = NULL, slack_team_name = NULL, slack_team_id = NULL WHERE id = $1',
      [user.id]
    );
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Slack disconnect error:', err);
    res.status(500).json({ message: 'Failed to disconnect Slack', error: err.message });
  }
});

export default router;
