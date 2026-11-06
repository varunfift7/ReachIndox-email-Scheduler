import { Worker, Job } from 'bullmq';
import { connection } from '../redis/client';
import { emailQueue, EmailJobData } from '../queue/emailQueue';
import { sendEmail, logEmailToEthereal, getEtherealAccount } from '../services/mailer';
import { db } from '../db/pool';
import { notifyRateLimitHit } from '../services/slack';
import { updateEmailStatus } from '../services/elasticsearch';
import {
  consumeSendSlot,
  currentHourWindow,
  maxPerHourGlobal,
  maxPerHourPerSender,
  HOUR_MS,
} from '../services/rateLimiter';

const CONCURRENCY = Math.max(1, parseInt(process.env.WORKER_CONCURRENCY || '5', 10) || 5);
const parsedMinDelay = parseInt(process.env.MIN_DELAY_BETWEEN_EMAILS_MS || '2000', 10);
const MIN_DELAY_MS = Number.isFinite(parsedMinDelay) && parsedMinDelay > 0 ? parsedMinDelay : 2000;

const STALE_PROCESSING_MS = 10 * 60 * 1000;

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderBody(body: string): string {
  return `<div style="font-family:Arial,sans-serif;padding:20px;line-height:1.6">${escapeHtml(body).replace(/\r?\n/g, '<br/>')}</div>`;
}

async function claimJob(jobId: number, bullJobId: string): Promise<boolean> {
  const result = await db.query(
    `UPDATE email_jobs
     SET status = 'processing', processing_job_id = $2, updated_at = NOW()
     WHERE id = $1
       AND (
         status IN ('scheduled', 'failed')
         OR (status = 'processing' AND (processing_job_id = $2 OR updated_at < NOW() - ($3::int * INTERVAL '1 millisecond')))
       )
     RETURNING id`,
    [jobId, bullJobId, STALE_PROCESSING_MS]
  );
  return (result.rowCount ?? 0) > 0;
}

async function processEmail(job: Job<EmailJobData>) {
  const data = job.data;
  const { jobId, idempotencyKey, to, subject, body, from } = data;
  const bullJobId = String(job.id ?? idempotencyKey);

  const claimed = await claimJob(jobId, bullJobId);
  if (!claimed) {
    const existing = await db.query('SELECT status, processing_job_id FROM email_jobs WHERE id = $1', [jobId]);
    const row = existing.rows[0];
    if (!row) {
      console.error(`Job ${jobId} not found in DB; dropping queued job ${bullJobId}`);
    } else {
      console.log(`Skipping job ${jobId}: already ${row.status} (bull job ${bullJobId})`);
    }
    return;
  }

  try {
    const configRes = await db.query(
      `SELECT j.user_id, COALESCE(sc.hourly_limit, $2) AS hourly_limit
       FROM email_jobs j
       LEFT JOIN sender_configs sc ON sc.user_id = j.user_id AND sc.sender_email = j.from_email
       WHERE j.id = $1`,
      [jobId, maxPerHourPerSender]
    );
    const config = configRes.rows[0];
    const userId: number | undefined = config?.user_id ?? undefined;
    const hourlyLimit = Math.max(1, Number(config?.hourly_limit) || maxPerHourPerSender);

    const slot = await consumeSendSlot(from, hourlyLimit);

    if (!slot.allowed) {
      const nextWindow = currentHourWindow() + 1;
      const delay = Math.max(0, nextWindow * HOUR_MS - Date.now()) + Math.floor(Math.random() * 1000);

      console.log(
        `Rate limit hit (${slot.reason}) for sender ${from} (${slot.senderCount}/${hourlyLimit} sender, ${slot.globalCount} global); rescheduling ${jobId}`
      );

      await db.query(
        `UPDATE email_jobs
         SET status = 'scheduled', processing_job_id = NULL, updated_at = NOW()
         WHERE id = $1 AND processing_job_id = $2`,
        [jobId, bullJobId]
      );

      if (userId) {
        const limitForMessage = slot.reason === 'global' ? maxPerHourGlobal : hourlyLimit;
        await notifyRateLimitHit(userId, from, limitForMessage, slot.reason || 'sender');
      }

      const rescheduledJobId = `isrl-${idempotencyKey}-${nextWindow}-${Math.random().toString(36).slice(2, 10)}`;
      try {
        await emailQueue.add(
          'schedule-email',
          { ...data, rescheduled: true },
          {
            delay,
            jobId: rescheduledJobId,
            removeOnComplete: { age: 24 * 3600, count: 5000 },
            removeOnFail: { age: 7 * 24 * 3600 },
          }
        );
      } catch (err: any) {
        console.error(`Failed to requeue rate-limited job ${jobId}:`, err.message);
      }
      return;
    }

    // Spread out sends a little so the worker does not burst on a full batch.
    await new Promise((resolve) => setTimeout(resolve, MIN_DELAY_MS + Math.floor(Math.random() * 500)));

    const fromAccount = await getEtherealAccount();
    const fromAddress = from || fromAccount.user;

    const info = await sendEmail({
      from: fromAddress,
      to,
      subject,
      html: renderBody(body),
    });

    const previewUrl = await logEmailToEthereal(info);

    await db.query(
      `UPDATE email_jobs
       SET status = 'sent', sent_at = NOW(), processing_job_id = NULL, updated_at = NOW()
       WHERE id = $1 AND processing_job_id = $2`,
      [jobId, bullJobId]
    );

    void updateEmailStatus(jobId, 'sent', { sent_at: new Date().toISOString() });

    console.log(`[SENT] ${jobId} → ${to} (${from}) preview: ${previewUrl || '(no preview)'}`);

    return { sent: true, previewUrl };
  } catch (err: any) {
    console.error(`Email send failed for job ${jobId}:`, err.message);
    await db.query(
      `UPDATE email_jobs
       SET status = 'failed', error = $1, processing_job_id = NULL, updated_at = NOW()
       WHERE id = $2 AND processing_job_id = $3`,
      [err.message || 'unknown error', jobId, bullJobId]
    );
    void updateEmailStatus(jobId, 'failed');
    throw err;
  }
}

export function startWorker() {
  const worker = new Worker<EmailJobData>('email-sends', async (job) => {
    return processEmail(job);
  }, {
    connection,
    concurrency: CONCURRENCY,
    limiter: {
      max: Math.max(1, Math.floor(60000 / MIN_DELAY_MS)),
      duration: 60000,
    },
    lockDuration: 30000,
    maxStalledCount: 3,
  });

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('Worker error:', err);
  });

  console.log(`Email worker started with concurrency=${CONCURRENCY}, minDelay=${MIN_DELAY_MS}ms, maxPerHourPerSender=${maxPerHourPerSender}`);
  return worker;
}

export async function rescheduleUnsentJobs() {
  try {
    const pendingJobs = await emailQueue.getJobs(['active', 'waiting', 'delayed', 'paused'], 0, -1, true);
    const queuedKeys = new Set<string>();
    for (const job of pendingJobs) {
      const key = (job.data as EmailJobData | undefined)?.idempotencyKey;
      if (key) queuedKeys.add(key);
    }

    const res = await db.query(
      `SELECT id, user_id, to_email, subject, body, from_email, scheduled_at, idempotency_key, status
       FROM email_jobs
       WHERE status IN ('scheduled', 'processing')`
    );

    let count = 0;
    for (const row of res.rows) {
      if (queuedKeys.has(row.idempotency_key)) {
        continue;
      }

      // No pending BullMQ job references this DB row. Clear the stale in-flight
      // marker before re-adding, otherwise the worker would refuse to claim it.
      if (row.status === 'processing') {
        await db.query(
          `UPDATE email_jobs SET status = 'scheduled', processing_job_id = NULL, updated_at = NOW() WHERE id = $1`,
          [row.id]
        );
      }

      // A completed/failed job with the same id would silently swallow the re-add.
      const stale = await emailQueue.getJob(row.idempotency_key).catch(() => null);
      if (stale) {
        await stale.remove().catch((err: any) => {
          console.error(`Failed to remove stale job ${row.idempotency_key}:`, err.message);
        });
      }

      const scheduledTime = new Date(row.scheduled_at).getTime();
      const delay = Math.max(0, scheduledTime - Date.now());

      await emailQueue.add(
        'schedule-email',
        {
          jobId: row.id,
          from: row.from_email,
          to: row.to_email,
          subject: row.subject,
          body: row.body,
          scheduledAt: new Date(row.scheduled_at).toISOString(),
          idempotencyKey: row.idempotency_key,
          rescheduled: true,
        },
        {
          delay,
          jobId: row.idempotency_key,
          removeOnComplete: { age: 24 * 3600, count: 5000 },
          removeOnFail: { age: 7 * 24 * 3600 },
        }
      );

      count++;
    }
    if (count > 0) {
      console.log(`[RECOVERY] Re-scheduled ${count} unsent jobs from database`);
    }
  } catch (err) {
    console.error('Failed to reschedule unsent jobs on boot:', err);
  }
}
