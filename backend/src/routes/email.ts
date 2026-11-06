import { Router, Request, Response } from 'express';
import multer from 'multer';
import { scheduleBatch } from '../services/scheduler';
import { db } from '../db/pool';
import { isAuthenticated } from './auth';
import { getRemaining } from '../services/rateLimiter';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function extractEmails(content: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = content.match(emailRegex) || [];
  return [...new Set(matches.map((m) => m.toLowerCase()))];
}

router.post('/schedule', isAuthenticated, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const userId = user.id;

    const { subject, body, scheduledAt, delayMs, hourlyLimit, from, emails: rawEmails } = req.body;

    const subjectText = String(subject ?? '').trim();
    const bodyText = String(body ?? '');
    if (!subjectText || !bodyText.trim()) {
      return res.status(400).json({ message: 'Subject and body are required' });
    }

    let emailList: string[] = [];

    // Extract from uploaded file if present
    if (req.file) {
      const content = req.file.buffer.toString('utf-8');
      emailList = extractEmails(content);
    }

    // Also accept emails array or comma/line-separated string from JSON body
    if (rawEmails) {
      let parsed: string[];
      if (typeof rawEmails === 'string') {
        // Try JSON parse first (frontend sends JSON.stringify(array))
        try {
          const jsonParsed = JSON.parse(rawEmails);
          parsed = Array.isArray(jsonParsed) ? jsonParsed : [rawEmails];
        } catch {
          parsed = rawEmails.split(/[,\n;]/).map((e: string) => e.trim()).filter(Boolean);
        }
      } else if (Array.isArray(rawEmails)) {
        parsed = rawEmails;
      } else {
        parsed = [];
      }
      const extracted = extractEmails(parsed.join('\n'));
      emailList = [...new Set([...emailList, ...extracted])];
    }

    if (emailList.length === 0) {
      return res.status(400).json({ message: 'No valid email addresses provided' });
    }

    // Validate scheduledAt before using it.
    const scheduleTime = new Date(scheduledAt || Date.now());
    if (isNaN(scheduleTime.getTime())) {
      return res.status(400).json({ message: 'Invalid scheduledAt date provided' });
    }

    let delay = delayMs === undefined || delayMs === null || delayMs === '' ? 2000 : parseInt(String(delayMs), 10);
    if (isNaN(delay) || delay < 0) delay = 2000;
    let limit = parseInt(hourlyLimit || String(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER || '50'), 10);
    if (isNaN(limit) || limit < 1) limit = parseInt(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER || '50', 10);
    limit = Math.min(limit, 10000);

    // Store raw content. HTML escaping happens once, when the email is rendered
    // for sending, so subjects in the UI are not double-escaped and do not
    // exceed the VARCHAR(500) column because of entities.
    const subjectForStorage = subjectText.replace(/[\r\n]+/g, ' ').slice(0, 500);
    const bodyForStorage = bodyText;
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const requestedFrom = typeof from === 'string' ? from.trim() : '';
    const senderEmail = (emailPattern.test(requestedFrom) ? requestedFrom : user.email || 'sender@reachinbox.local').slice(0, 255);
    await db.query(
      `INSERT INTO sender_configs (user_id, sender_email, hourly_limit, delay_between_emails_ms)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, sender_email)
       DO UPDATE SET hourly_limit = $3, delay_between_emails_ms = $4`,
      [userId, senderEmail, limit, delay]
    );

    const emailsPayload = emailList.map((email) => ({ to: email, subject: subjectForStorage, body: bodyForStorage }));

    const result = await scheduleBatch(userId, emailsPayload, {
      scheduledAt: scheduleTime,
      delayMs: delay,
      hourlyLimit: limit,
      from: senderEmail,
    });

    res.status(201).json({
      total: result.total,
      scheduled: result.scheduled,
      emails: emailList,
      scheduledAt: scheduleTime.toISOString(),
      delayMs: delay,
      hourlyLimit: limit,
      message: `${result.scheduled} emails scheduled successfully`,
    });
  } catch (err: any) {
    console.error('Schedule error:', err);
    res.status(500).json({ message: 'Failed to schedule emails', error: err.message });
  }
});

// List scheduled emails (status = scheduled or processing)
router.get('/scheduled', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const result = await db.query(
      `SELECT id, to_email, subject, body, from_email, scheduled_at, status, created_at
       FROM email_jobs
       WHERE user_id = $1 AND status IN ('scheduled', 'processing')
       ORDER BY scheduled_at ASC
       LIMIT 500`,
      [user.id]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to fetch scheduled emails', error: err.message });
  }
});

// List sent emails
router.get('/sent', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const result = await db.query(
      `SELECT id, to_email, subject, body, from_email, scheduled_at, sent_at, status, error
       FROM email_jobs
       WHERE user_id = $1 AND status IN ('sent', 'failed')
       ORDER BY COALESCE(sent_at, scheduled_at) DESC
       LIMIT 500`,
      [user.id]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to fetch sent emails', error: err.message });
  }
});

// Rate limit status for sending
router.get('/rate-limit', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const result = await db.query(
      `SELECT sender_email, hourly_limit, delay_between_emails_ms FROM sender_configs WHERE user_id = $1`,
      [user.id]
    );
    const sender = result.rows[0];
    const remaining = await getRemaining(
      sender?.sender_email || '',
      sender?.hourly_limit || undefined
    );
    res.json({
      senders: result.rows,
      remaining,
      globalLimit: parseInt(process.env.MAX_EMAILS_PER_HOUR || '200'),
      perSenderLimit: parseInt(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER || '50'),
    });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to fetch rate limit', error: err.message });
  }
});

// Parse uploaded CSV/text for email count (preview before scheduling)
router.post('/parse', isAuthenticated, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    const content = req.file.buffer.toString('utf-8');
    const emails = extractEmails(content);
    res.json({ count: emails.length, emails: emails.slice(0, 100) });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to parse file', error: err.message });
  }
});

export default router;
