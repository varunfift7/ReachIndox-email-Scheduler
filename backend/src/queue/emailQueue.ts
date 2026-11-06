import { Queue } from 'bullmq';
import { connection } from '../redis/client';

export const emailQueue = new Queue('email-sends', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 24 * 3600,
      count: 5000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600,
    },
  },
});

export interface EmailJobData {
  jobId: number;
  idempotencyKey: string;
  to: string;
  subject: string;
  body: string;
  from: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}
