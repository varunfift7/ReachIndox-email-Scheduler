import { v4 as uuidv4 } from 'uuid';
import { Job } from 'bullmq';
import { db } from '../db/pool';
import { emailQueue, EmailJobData } from '../queue/emailQueue';
import { indexEmail } from '../services/elasticsearch';

export interface ScheduleEmailInput {
  userId: number;
  to: string;
  subject: string;
  body: string;
  from?: string;
  scheduledAt: string | Date;
  delayMs?: number;
}

export async function scheduleEmail(input: ScheduleEmailInput): Promise<{ id: number; bullJobId: string }> {
  const idempotencyKey = uuidv4();
  const scheduledAt = new Date(input.scheduledAt);

  if (isNaN(scheduledAt.getTime())) {
    throw new Error('Invalid scheduled date');
  }

  const delayMs = Math.max(0, Number(input.delayMs) || 0);
  const now = Date.now();
  const targetMs = scheduledAt.getTime();
  // Calculate how long until we should enqueue this for processing
  const enqueueDelay = Math.max(0, targetMs - now);

  const from = input.from || 'sender@reachinbox.ai';

  // Insert into DB first for persistence
  const result = await db.query(
    `INSERT INTO email_jobs
      (user_id, to_email, subject, body, from_email, scheduled_at, delay_ms, status, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled', $8)
     RETURNING *`,
    [input.userId, input.to, input.subject, input.body, from, scheduledAt, delayMs, idempotencyKey]
  );

  const jobRow = result.rows[0];

  // Create the BullMQ delayed job
  const jobData: EmailJobData = {
    jobId: jobRow.id,
    idempotencyKey,
    to: input.to,
    subject: input.subject,
    body: input.body,
    from,
  };

  let bullJob: Job<EmailJobData>;
  try {
    bullJob = await emailQueue.add('schedule-email', jobData, {
      delay: enqueueDelay,
      jobId: idempotencyKey,
      removeOnComplete: { age: 24 * 3600, count: 5000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    });
  } catch (err: any) {
    await db.query(
      `UPDATE email_jobs SET status = 'failed', error = $1, updated_at = NOW() WHERE id = $2`,
      [`Failed to enqueue job: ${err.message || 'unknown error'}`, jobRow.id]
    );
    throw err;
  }

  // Persist the bull job id for traceability
  await db.query(
    `UPDATE email_jobs SET bull_job_id = $1 WHERE id = $2`,
    [bullJob.id, jobRow.id]
  );

  // Index in Elasticsearch for searchability. Search is best-effort and must
  // never block or fail scheduling when Elasticsearch is unavailable.
  void indexEmail({
    id: jobRow.id,
    user_id: input.userId,
    to_email: input.to,
    subject: input.subject,
    body: input.body,
    from_email: from,
    status: 'scheduled',
    scheduled_at: scheduledAt.toISOString(),
  });

  return { id: jobRow.id, bullJobId: bullJob.id as string };
}

export async function scheduleBatch(
  userId: number,
  emails: Array<{ to: string; subject: string; body: string }>,
  opts: { scheduledAt: string | Date; delayMs: number; hourlyLimit: number; from?: string }
): Promise<{ total: number; scheduled: number }> {
  let scheduled = 0;
  let index = 0;

  for (const email of emails) {
    // Stagger based on the delay between emails so they don't all fire at once
    const staggerMs = index * (opts.delayMs || 0);
    const baseSchedule = new Date(opts.scheduledAt).getTime();
    const effectiveSchedule = new Date(baseSchedule + staggerMs);

    await scheduleEmail({
      userId,
      to: email.to,
      subject: email.subject,
      body: email.body,
      from: opts.from,
      scheduledAt: effectiveSchedule,
      delayMs: opts.delayMs,
    });
    scheduled++;
    index++;
  }

  return { total: emails.length, scheduled };
}
