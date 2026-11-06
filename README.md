# 🚀 ReachInbox Email Scheduler — Full-stack Assignment

A production-grade **email scheduling service + dashboard** built for the ReachInbox hiring assignment.

It accepts email send requests via APIs, schedules them via **BullMQ delayed jobs backed by Redis** (no cron), sends them through **Ethereal Email (fake SMTP)**, survives server restarts without losing or duplicating jobs, and exposes a **React + Tailwind dashboard** for scheduling, viewing, and searching emails.

---

## ✨ Features Implemented

### Backend
| Feature | Implementation |
|---------|----------------|
| **Scheduling** | BullMQ delayed jobs (no cron). Jobs are persisted first in Postgres, then enqueued with the computed delay. |
| **Persistence on restart** | BullMQ jobs live in Redis (append-only). On restart the worker re-attaches to the same queue and delivers remaining future jobs at their scheduled time. DB stores full state + idempotency key. |
| **Idempotency / no duplicates** | Atomic PostgreSQL claim via `processing_job_id` (`UPDATE ... WHERE status='scheduled' AND processing_job_id IS NULL`) so a job is never processed twice even across worker instances/restarts. |
| **Worker concurrency** | Configurable `WORKER_CONCURRENCY` (default 5), safe under parallel execution (Redis locks, DB guards). |
| **Delay between each email** | `MIN_DELAY_BETWEEN_EMAILS_MS` (default 2000ms) enforced in worker + BullMQ `limiter` ({max, duration}). |
| **Emails-per-hour rate limiting** | Redis-backed counters keyed by `hour_window + sender`, limits configurable via env. **Global** and **per-sender** limits. |
| **Rate-limit behavior** | Atomic Lua script checks global + per-sender limits before incrementing. When the hourly limit is hit, jobs are **not dropped or failed** — they are **rescheduled (delayed) into the next hour window**, preserving order. |
| **Slack notification** | Real OAuth flow to connect Slack. On the **moment** a sender's hourly limit is reached, a live Slack message is sent. If not connected, it silently no-ops (no crash); reconnecting later enables notifications without redeploy. |
| **Searchability** | Elasticsearch index of email jobs, queried via `/api/search`. |
| **Live queue dashboard** | `/admin/queues` returns BullMQ live counts. |

### Frontend
| Feature | Implementation |
|---------|----------------|
| **Google Login** | Real OAuth (`passport-google-oauth20`) → redirects to dashboard; shows name, email, avatar in header; logout. |
| **Dashboard** | Top header, stats cards, **Scheduled Emails** & **Sent Emails** tabs, search bar, **Compose New Email** button. |
| **Compose New Email** | Subject, body, CSV/text upload with live email count, start time, delay, hourly limit. |
| **Scheduled Emails** | Table with loading + empty states. |
| **Sent Emails** | Table (`sent`/`failed`) with loading + empty states. |
| **Slack Connect** | One-click OAuth connect/disconnect button in the header. |
| **Code quality** | Clean folder structure, reusable UI components (Button, Input, Modal, Table, Badge, EmptyState, Spinner), typed APIs/props. |

---

## 🏗 Architecture Overview

```
                ┌──────────────────────────────────────────────┐
                │                 Frontend (Vite/React)        │
                │      http://localhost:3000                   │
                └───────────────┬──────────────────────────────┘
                                │  REST (JSON / multipart)
                                ▼
        ┌───────────────────────────────────────────────┐
        │              Express.js Backend (4000)        │
        │  /auth (Google OAuth) /api/emails /api/slack   │
        │  /api/search /admin/queues (BullMQ stats)      │
        └───────┬─────────────┬─────────────┬────────────┘
                │             │             │
                ▼             ▼             ▼
         ┌──────────┐   ┌──────────┐  ┌─────────────────┐
         │PostgreSQL│   │ BullMQ   │  │  Elasticsearch  │
         │ (state,  │   │  Queue   │  │  (search index) │
         │ job rows)│   │  (Redis) │  └─────────────────┘
         └──────────┘   └──────────┘
                          │ (delayed jobs)        ┌──────────────────┐
                          ▼                       │  Ethereal Email   │
                   ┌───────────────┐              │  (fake SMTP)      │
                   │ Worker(s)     │─────────────▶│  Preview URLs     │
                   │ (concurrency) │              └──────────────────┘
                   └───────────────┘
                          │
                          ▼ (on rate-limit)
                  ┌────────────────┐
                  │ Slack notify    │
                  │ (real OAuth msg)│
                  └────────────────┘
```

### How scheduling works
1. `POST /api/emails/schedule` receives subject, body, recipient list (JSON or uploaded CSV/text), start time, delay, and hourly limit.
2. A row is inserted into `email_jobs` (status `scheduled`) and indexed in Elasticsearch for searchability.
3. A **BullMQ delayed job** is added with `delay = scheduledAt - now` (plus stagger via delay between emails).
4. The worker picks the job when it becomes due and:
   - Acquires a Redis idempotency lock,
   - Checks DB status (skip if already `sent`/`processing`),
   - Checks the per-sender hourly rate limit,
   - Sends via Ethereal SMTP,
   - Marks the row `sent` (+ Elasticsearch) with a preview URL.

### How persistence on restart works
- All agreed state (`email_jobs`) is in Postgres.
- Pending/delayed jobs are enqueued as **BullMQ delayed jobs in Redis**, which is append-only and survives restarts.
- On startup the worker simply re-connects to the same `email-sends` queue; Redis replays delayed jobs at their due times.
- **Idempotency** (atomic DB `processing_job_id` claim + `sent`/`processing` guard) guarantees a job is sent **exactly once** even if it becomes active again after a restart.

### How rate limiting & concurrency are implemented
- **Counters**: Redis keys `hourcount:{sender}:{hourWindow}` incremented atomically (INCR + expire) — safe across multiple workers/instances.
- **Global** `MAX_EMAILS_PER_HOUR` and **per-sender** `MAX_EMAILS_PER_HOUR_PER_SENDER` (env-configurable). The worker also honors per-sender `hourly_limit` from `sender_configs`.
- **On limit hit**: an atomic Lua script rejects the increment, a **Slack notification fires (once per hour window per sender)**, and the job is re-enqueued with a delay to the next hour window — jobs are **never dropped/failed**, and order is preserved as much as possible (same next-window target + small jitter).
- **Concurrency**: `WORKER_CONCURRENCY` controls how many jobs a worker processes in parallel. Under 1000+ emails scheduled for the same time, BullMQ queues them as delayed jobs; the worker drains them at the configured concurrency while the per-sender rate limit and min-delay throttle actual SMTP sends — this is exactly how the system behaves, no code changes needed to handle scale.

---

## 📦 Tech Stack
- **Backend**: TypeScript, Express.js, BullMQ, ioredis, PostgreSQL (`pg`), `@elastic/elasticsearch`, nodemailer (Ethereal), passport (Google OAuth), Slack OAuth.
- **Frontend**: React + TypeScript, Vite, Tailwind CSS v4, React Router, axios, react-hot-toast, lucide-react.

---

## 🐳 Setup & Running

### 0) Prerequisites
- Node.js 18+
- Docker Desktop (for Redis, Postgres, Elasticsearch)

### 1) Start infrastructure (Redis, Postgres, Elasticsearch)
```bash
docker compose up -d
```
Verify all three containers report `healthy`, then create a demo user and seed sender configs:
```bash
docker exec sdeassignment-postgres-1 psql -U email_scheduler -d email_scheduler -c "INSERT INTO users (google_id, email, name) VALUES ('demo-user', 'demo@reachinbox.ai', 'Demo User');"
cd backend && npm run seed
```
```bash
docker compose ps
```

### 2) Backend

```bash
cd backend
npm install
npm run build          # compiles TypeScript -> dist/
```

Create `backend/.env` (copy from `backend/.env.example`). Then run:

```bash
# Terminal A — API server
npm start              # or: npm run dev

# Terminal B — BullMQ worker
npm run worker         # or: npm run dev:worker
```

- Server: http://localhost:4000
- Health: http://localhost:4000/health
- BullMQ live dashboard stats: http://localhost:4000/admin/queues

#### Demo mode (no Google OAuth credentials required)
If you haven't configured Google OAuth, you can still exercise the APIs by:
1. Creating a test user directly in Postgres:
   ```bash
   docker exec -it sdeassignment-postgres-1 psql -U email_scheduler -d email_scheduler \
     -c "INSERT INTO users (google_id,email,name) VALUES ('demo-user','demo@reachinbox.ai','Demo User');"
   ```
2. Sending the header `Authorization: Bearer demo-mode` on any authenticated request (it resolves to the first user in the DB).

### 3) Frontend

```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:3000 . The Vite dev server proxies `/auth` and `/api` to the backend on :4000.

---

## 🔐 Environment Variables

### Backend (`backend/.env`)
```env
# Server
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Database (PostgreSQL)
DB_HOST=localhost
DB_PORT=5433
DB_USER=email_scheduler
DB_PASSWORD=scheduler_password
DB_NAME=email_scheduler

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Elasticsearch
ELASTICSEARCH_URL=http://localhost:9200

# Google OAuth (create at https://console.cloud.google.com)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback

# Session
SESSION_SECRET=change_me

# Ethereal Email — leave blank to auto-generate a test account on startup
ETHEREAL_USER=
ETHEREAL_PASS=

# Rate Limiting (configurable — no hardcoding)
MAX_EMAILS_PER_HOUR=200            # global
MAX_EMAILS_PER_HOUR_PER_SENDER=50  # per sender
MIN_DELAY_BETWEEN_EMAILS_MS=2000   # min delay between sends

# Worker
WORKER_CONCURRENCY=5

# Slack OAuth (create at https://api.slack.com/apps)
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_REDIRECT_URI=http://localhost:4000/api/slack/callback
```

### Frontend
No env required — the Vite proxy handles routing to the backend.

---

## 🔗 API Overview

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/emails/schedule` | ✅ | Schedule one or many emails (multipart or JSON `emails`). |
| GET | `/api/emails/scheduled` | ✅ | List scheduled/processing emails. |
| GET | `/api/emails/sent` | ✅ | List sent/failed emails. |
| GET | `/api/emails/rate-limit` | ✅ | Rate-limit status + remaining quotas. |
| POST | `/api/emails/parse` | ✅ | Parse uploaded file → email count + preview. |
| GET | `/api/search?q=&status=` | ✅ | Elasticsearch full-text search. |
| GET/POST | `/auth/*` | – | Google OAuth login, `/me`, `/logout`. |
| GET | `/api/slack/connect` | ✅ | Start Slack OAuth flow. |
| GET | `/api/slack/callback` | – | Slack OAuth callback. |
| GET/POST | `/api/slack/status`, `/api/slack/disconnect` | ✅ | Slack connection status / disconnect. |
| GET | `/admin/queues` | – | BullMQ live queue counts. |
| GET | `/health` | – | Liveness probe. |

---

## 🧪 Behavior Under Load (1000+ emails)
- Scheduling 1000+ emails for the same time enqueues that many **delayed BullMQ jobs** in Redis (no cron, fully persistent).
- The worker drains them at `WORKER_CONCURRENCY`; the **min-delay** (`MIN_DELAY_BETWEEN_EMAILS_MS`) and the **per-sender hourly limit** throttle real SMTP sends.
- When the per-sender hourly limit is reached, the **Slack notification** fires (once/window/sender) and the remaining jobs are **rescheduled to the next hour window** rather than dropped — order is preserved as much as possible.
- Because counters are Redis-backed, multiple worker instances cooperate correctly (no in-memory double counting).

---

## ⚠️ Assumptions, Shortcuts & Trade-offs
- **Google OAuth**: A `Bearer demo-mode` bypass resolves to the first user in the DB for zero-config demo. In production, real OAuth is enforced via session (implemented, needs real credentials). A `users` table row must exist for demo mode (seed via `npm run seed` after inserting a user, or create one directly in Postgres).
- **Ethereal**: If `ETHEREAL_USER/PASS` are blank, a fresh Ethereal test account is created on startup (accounts rotate on restart — acceptable for testing). Set them to keep one preview inbox.
- **Slack**: Uses `chat.postMessage` to `#general` with the connected user's token; requires the Slack app to have `chat:write` scope and be installed in a workspace with `#general`. Notifications are rate-limit-throttled to one per hour window per sender.
- **Elasticsearch** is fully wired, but if it's unreachable the app degrades gracefully (search disabled, sends still work).
- **Single-node** Postgres/Redis/ES via Docker (fine for the assignment; production would cluster them).
- Email **body personalization** (`{name}`) is extracted per recipient by name in the UI template, but mapping a recipient name to an address is left as a follow-up (would require a CSV name column).

---

## 🎥 Demo
See the included demo video for:
1. Scheduling emails (frontend + API).
2. Dashboard with Scheduled & Sent tabs.
3. **Restart scenario**: stop server → start again → future emails still send exactly once.
4. Rate-limit / delay behavior under load.

---

## 📁 Project Structure
```
├── docker-compose.yml          # Redis, Postgres, Elasticsearch
├── backend/
│   ├── src/
│   │   ├── index.ts            # Express server
│   │   ├── worker.ts           # BullMQ worker bootstrap
│   │   ├── auth/               # Google OAuth (passport)
│   │   ├── db/                 # pool, migrations, seed
│   │   ├── queue/              # BullMQ queue + job types
│   │   ├── redis/              # Redis connections
│   │   ├── routes/             # auth, email, slack, search, bullboard
│   │   ├── services/           # mailer, elasticsearch, rateLimiter, scheduler, slack
│   │   └── workers/            # emailWorker (send + rate-limit + idempotency)
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── api/client.ts       # typed API client
    │   ├── components/         # reusable UI + layout + dashboard components
    │   ├── data/templates.ts   # email templates
    │   ├── pages/Dashboard.tsx # main dashboard
    │   └── types/              # shared TS types
    └── vite.config.ts          # dev proxy -> :4000
```
