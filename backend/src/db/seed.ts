import 'dotenv/config';

import { db } from './pool';

async function seedSenders() {
  try {
    const users = await db.query('SELECT id FROM users');
    if (users.rows.length === 0) {
      console.log('No users found; sender seeding requires a user. Create one via Google login first.');
      return;
    }
    const userId = users.rows[0].id;

    const senders = [
      { email: 'sender1@example.com', hourly_limit: 50, delay_between_emails_ms: 2000 },
      { email: 'sender2@example.com', hourly_limit: 50, delay_between_emails_ms: 2000 },
    ];

    for (const s of senders) {
      await db.query(
        `INSERT INTO sender_configs (user_id, sender_email, hourly_limit, delay_between_emails_ms)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, sender_email) DO NOTHING`,
        [userId, s.email, s.hourly_limit, s.delay_between_emails_ms]
      );
    }
    console.log('Sender configs seeded');
  } catch (err) {
    console.error('Seeding failed:', err);
  } finally {
    await db.end();
  }
}

seedSenders();
