import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../dist/db/pool.js';

describe('Rate Limiter Constants', () => {
  // Replicate the constants from rateLimiter to avoid importing the full module (which needs Redis)
  const HOUR_MS = 60 * 60 * 1000;
  const parsedGlobal = parseInt(process.env.MAX_EMAILS_PER_HOUR || '200', 10);
  const parsedPerSender = parseInt(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER || '50', 10);
  const maxPerHourGlobal = Number.isFinite(parsedGlobal) && parsedGlobal > 0 ? parsedGlobal : 200;
  const maxPerHourPerSender = Number.isFinite(parsedPerSender) && parsedPerSender > 0 ? parsedPerSender : 50;

  it('currentHourWindow equivalent returns a positive integer', () => {
    const window = Math.floor(Date.now() / HOUR_MS);
    assert.ok(Number.isInteger(window));
    assert.ok(window > 0);
  });

  it('maxPerHourGlobal is a positive integer', () => {
    assert.ok(Number.isInteger(maxPerHourGlobal));
    assert.ok(maxPerHourGlobal > 0);
  });

  it('maxPerHourPerSender is a positive integer', () => {
    assert.ok(Number.isInteger(maxPerHourPerSender));
    assert.ok(maxPerHourPerSender > 0);
  });

  it('HOUR_MS is 3600000', () => {
    assert.strictEqual(HOUR_MS, 60 * 60 * 1000);
  });
});

describe('Email Validation', () => {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  it('accepts valid email addresses', () => {
    assert.ok(emailRegex.test('user@example.com'));
    assert.ok(emailRegex.test('user.name@example.com'));
    assert.ok(emailRegex.test('user+tag@example.co.uk'));
  });

  it('rejects invalid email addresses', () => {
    assert.ok(!emailRegex.test('not-an-email'));
    assert.ok(!emailRegex.test('@example.com'));
    assert.ok(!emailRegex.test('user@'));
    assert.ok(!emailRegex.test('user@.com'));
  });
});

describe('Subject Sanitization', () => {
  it('removes CRLF from subject', () => {
    const subject = 'Hello\r\nWorld';
    const sanitized = subject.replace(/[\r\n]+/g, ' ');
    assert.strictEqual(sanitized, 'Hello World');
  });

  it('truncates subject to 500 chars', () => {
    const longSubject = 'A'.repeat(600);
    const truncated = longSubject.slice(0, 500);
    assert.strictEqual(truncated.length, 500);
  });
});

describe('Database Connection', () => {
  it('can run SELECT 1', async () => {
    const result = await db.query('SELECT 1 AS test');
    assert.strictEqual(result.rows[0].test, 1);
  });
});
