import 'dotenv/config';

import { startWorker, rescheduleUnsentJobs } from './workers/emailWorker';
import { initElasticsearch } from './services/elasticsearch';
import { db } from './db/pool';
import { migrate } from './db/migrate';
import { getEtherealAccount } from './services/mailer';
import { connection, rateLimitRedis } from './redis/client';
import { emailQueue } from './queue/emailQueue';

async function bootstrap() {
  try {
    await db.query('SELECT 1');
    console.log('Connected to PostgreSQL');
  } catch (err) {
    console.error('PostgreSQL connection failed:', err);
    process.exit(1);
  }

  try {
    await migrate();
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }

  try {
    await initElasticsearch();
  } catch (err) {
    console.error('Elasticsearch init failed (continuing without search):', err);
  }

  try {
    await getEtherealAccount();
  } catch (err) {
    console.error('Ethereal account setup failed:', err);
  }

  // Recover any unsent jobs from the database BEFORE starting the worker,
  // so the worker does not race against recovery and process duplicates.
  await rescheduleUnsentJobs();

  const worker = startWorker();

  const shutdown = async () => {
    console.log('Shutting down worker...');
    await worker.close();
    try {
      await emailQueue.close();
      await rateLimitRedis.quit();
      connection.quit();
      await db.end();
    } catch (err) {
      console.error('Error closing connections:', err);
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap();
