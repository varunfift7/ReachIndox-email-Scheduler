import { Pool } from 'pg';

export const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433'),
  user: process.env.DB_USER || 'email_scheduler',
  password: process.env.DB_PASSWORD || 'scheduler_password',
  database: process.env.DB_NAME || 'email_scheduler',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

db.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err.message);
});
