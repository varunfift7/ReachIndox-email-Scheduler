import { db } from '../db/pool';
import { rateLimitRedis } from '../redis/client';
import https from 'https';

export interface SlackTokenResponse {
  ok: boolean;
  access_token?: string;
  team_name?: string;
  team_id?: string;
  error?: string;
}

export function exchangeSlackCode(code: string): Promise<SlackTokenResponse> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID || '',
      client_secret: process.env.SLACK_CLIENT_SECRET || '',
      code,
      redirect_uri: process.env.SLACK_REDIRECT_URI || 'http://localhost:4000/api/slack/callback',
    });

    const req = https.request(
      {
        hostname: 'slack.com',
        path: '/api/oauth.v2.access',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(params.toString()),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.setTimeout(10000, () => req.destroy(new Error('Slack OAuth request timed out')));
    req.on('error', reject);
    req.write(params.toString());
    req.end();
  });
}

export async function saveSlackToken(userId: number, accessToken: string, teamName: string, teamId: string) {
  await db.query(
    `UPDATE users SET slack_access_token = $1, slack_team_name = $2, slack_team_id = $3 WHERE id = $4`,
    [accessToken, teamName, teamId, userId]
  );
}

export function sendSlackMessage(accessToken: string, channel: string, text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      channel,
      text,
    });

    const req = https.request(
      {
        hostname: 'slack.com',
        path: '/api/chat.postMessage',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(body),
          Authorization: `Bearer ${accessToken}`,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(!!parsed.ok);
          } catch {
            resolve(false);
          }
        });
      }
    );
    req.setTimeout(10000, () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
    req.write(body);
    req.end();
  });
}

export async function notifyRateLimitHit(
  userId: number,
  senderEmail: string,
  hourlyLimit: number,
  reason: 'sender' | 'global' = 'sender'
) {
  try {
    const res = await db.query(
      `SELECT u.slack_access_token, u.name FROM users u WHERE id = $1`,
      [userId]
    );
    const user = res.rows[0];
    if (!user?.slack_access_token) {
      return { notified: false, reason: 'no-slack-connected' };
    }

    // Throttle only after confirming Slack is connected, otherwise the first
    // attempts would consume the throttle key while Slack is disconnected.
    const hourWindow = Math.floor(Date.now() / (60 * 60 * 1000));
    const throttleKey = `slack:rlimit:${senderEmail}:${hourWindow}`;
    const acquired = await rateLimitRedis.set(throttleKey, '1', 'EX', 60 * 60 * 2, 'NX');
    if (acquired !== 'OK') {
      return { notified: false, reason: 'already-notified' };
    }

    const limitText = reason === 'global'
      ? `the global hourly limit of *${hourlyLimit}* emails`
      : `its hourly limit of *${hourlyLimit}* emails`;
    const text = `🚨 *Rate Limit Reached*\nSender *${senderEmail}* has reached ${limitText}. Remaining jobs are being rescheduled to the next hour window while preserving order.`;

    const ok = await sendSlackMessage(user.slack_access_token, '#general', text);
    return { notified: ok };
  } catch (err) {
    console.error('Slack notification failed:', err);
    return { notified: false, reason: 'error' };
  }
}
