import 'dotenv/config';

import { db } from './pool';

const migrationSQL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  google_id VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  avatar TEXT,
  slack_access_token TEXT,
  slack_team_id VARCHAR(255),
  slack_team_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_jobs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  to_email VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body TEXT NOT NULL,
  from_email VARCHAR(255) NOT NULL,
  scheduled_at TIMESTAMP NOT NULL,
  delay_ms INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'scheduled',
  bull_job_id VARCHAR(255),
  sent_at TIMESTAMP,
  error TEXT,
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,
  processing_job_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE email_jobs ADD COLUMN IF NOT EXISTS processing_job_id VARCHAR(255);

CREATE TABLE IF NOT EXISTS sender_configs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  sender_email VARCHAR(255) NOT NULL,
  hourly_limit INTEGER DEFAULT 50,
  delay_between_emails_ms INTEGER DEFAULT 2000,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, sender_email)
);

CREATE TABLE IF NOT EXISTS rate_limit_windows (
  id SERIAL PRIMARY KEY,
  sender_email VARCHAR(255) NOT NULL,
  hour_window BIGINT NOT NULL,
  count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(sender_email, hour_window)
);
-- NOTE: rate_limit_windows is maintained for schema completeness but is
-- not used by the runtime rate limiter. Rate limiting is enforced by the
-- Lua script in services/rateLimiter.ts against Redis keys
-- (hourcount:<sender>:<window> and hourcount:global:<window>).
-- This table can be removed in a future migration if it remains unused.

CREATE INDEX IF NOT EXISTS idx_email_jobs_status ON email_jobs(status);
CREATE INDEX IF NOT EXISTS idx_email_jobs_scheduled_at ON email_jobs(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_email_jobs_user_id ON email_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_jobs_from_email ON email_jobs(from_email);
CREATE INDEX IF NOT EXISTS idx_email_jobs_idempotency_key ON email_jobs(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_rate_limit_sender_window ON rate_limit_windows(sender_email, hour_window);
`;

export async function migrate() {
  try {
    await db.query(migrationSQL);
    console.log('Database migration completed successfully');
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  }
}

if (require.main === module) {
  migrate().then(() => process.exit(0)).catch(() => process.exit(1));
}
