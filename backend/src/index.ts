import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import passport from 'passport';
import { setupGoogleAuth } from './auth/google';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import authRouter, { isAuthenticated } from './routes/auth';
import emailRouter from './routes/email';
import slackRouter from './routes/slack';
import searchRouter from './routes/search';
import { emailQueue } from './queue/emailQueue';
import { connection, rateLimitRedis } from './redis/client';
import { db } from './db/pool';
import { migrate } from './db/migrate';
import { initElasticsearch, esClient } from './services/elasticsearch';

const app = express();
const PORT = process.env.PORT || 4000;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'dev-secret')) {
  console.error('FATAL: SESSION_SECRET must be set to a strong value in production.');
  process.exit(1);
}

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
  },
}));

app.use(passport.initialize());
app.use(passport.session());
setupGoogleAuth();

app.use('/auth', authRouter);
app.use('/api/emails', emailRouter);
app.use('/api/slack', slackRouter);
app.use('/api/search', searchRouter);

// The BullMQ admin dashboard is a development tool. Only expose it outside production.
if (!isProduction) {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');
  createBullBoard({
    queues: [new BullMQAdapter(emailQueue)],
    serverAdapter,
  });
  app.use('/admin/queues', serverAdapter.getRouter());
}

// Queue stats API (with auth)
app.get('/admin/stats', isAuthenticated, async (_req: any, res: any) => {
  try {
    const counts = await emailQueue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed', 'paused');
    res.json({ queue: 'email-sends', counts });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to fetch queue stats', error: err.message });
  }
});

app.get('/health', async (_req, res) => {
  const checks: Record<string, { status: string; error?: string }> = {};

  // Database check
  try {
    await db.query('SELECT 1');
    checks.database = { status: 'ok' };
  } catch (err: any) {
    checks.database = { status: 'fail', error: err.message };
  }

  // Redis check (BullMQ connection)
  try {
    await connection.ping();
    checks.redis = { status: 'ok' };
  } catch (err: any) {
    checks.redis = { status: 'fail', error: err.message };
  }

  // Elasticsearch check
  try {
    await esClient.ping();
    checks.elasticsearch = { status: 'ok' };
  } catch (err: any) {
    checks.elasticsearch = { status: 'fail', error: err.message };
  }

  const allOk = Object.values(checks).every((c) => c.status === 'ok');
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
  });
});

async function start() {
  try {
    await db.query('SELECT 1');
    console.log('Connected to PostgreSQL');
  } catch (err) {
    console.error('PostgreSQL connection failed:', err);
    process.exit(1);
  }

  try {
    await migrate();
    console.log('Database migration completed');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }

  try {
    await initElasticsearch();
    console.log('Elasticsearch initialized');
  } catch (err) {
    console.warn('Elasticsearch init failed (continuing without search):', err);
  }

  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (!isProduction) {
      console.log(`BullMQ Board: http://localhost:${PORT}/admin/queues`);
    }
  });

  const shutdown = async () => {
    console.log('Shutting down server...');
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      await emailQueue.close();
      rateLimitRedis.quit();
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

start();
