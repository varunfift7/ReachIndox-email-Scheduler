import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Frontend Email Validation', () => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  it('accepts valid email addresses', () => {
    assert.ok(emailRegex.test('user@example.com'));
    assert.ok(emailRegex.test('user.name@example.com'));
    assert.ok(emailRegex.test('user+tag@example.co.uk'));
  });

  it('rejects invalid email addresses', () => {
    assert.ok(!emailRegex.test('not-an-email'));
    assert.ok(!emailRegex.test('@example.com'));
    assert.ok(!emailRegex.test('user@'));
    assert.ok(!emailRegex.test(''));
    assert.ok(!emailRegex.test('user@.com'));
  });
});

describe('Search Filtering', () => {
  const filterEmails = (emails: Array<{ to_email: string; subject: string }>, query: string) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return emails;
    return emails.filter((e) =>
      e.to_email.toLowerCase().includes(normalizedQuery) ||
      e.subject.toLowerCase().includes(normalizedQuery)
    );
  };

  const emails = [
    { to_email: 'alice@example.com', subject: 'Meeting Reminder' },
    { to_email: 'bob@example.com', subject: 'Project Update' },
    { to_email: 'carol@test.com', subject: 'Weekly Report' },
  ];

  it('returns all emails when query is empty', () => {
    assert.strictEqual(filterEmails(emails, '').length, 3);
    assert.strictEqual(filterEmails(emails, '   ').length, 3);
  });

  it('filters by recipient email (case-insensitive)', () => {
    const result = filterEmails(emails, 'ALICE');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].to_email, 'alice@example.com');
  });

  it('filters by subject (case-insensitive)', () => {
    const result = filterEmails(emails, 'weekly');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].subject, 'Weekly Report');
  });

  it('returns empty array for no matches', () => {
    const result = filterEmails(emails, 'nonexistent');
    assert.strictEqual(result.length, 0);
  });
});

describe('Date Formatting', () => {
  const formatDate = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleString();
  };

  it('returns dash for null date', () => {
    assert.strictEqual(formatDate(null), '-');
    assert.strictEqual(formatDate(''), '-');
  });

  it('formats valid ISO date', () => {
    const result = formatDate('2024-01-15T10:30:00.000Z');
    assert.ok(result.includes('2024'));
    assert.ok(result.includes('15'));
  });
});

describe('Delay Calculation', () => {
  const calculateDelayMs = (seconds: number) => {
    const parsed = parseInt(String(seconds), 10);
    if (isNaN(parsed) || parsed < 0) return 2000;
    return parsed * 1000;
  };

  it('converts seconds to milliseconds', () => {
    assert.strictEqual(calculateDelayMs(5), 5000);
  });

  it('defaults to 2000ms for invalid input', () => {
    assert.strictEqual(calculateDelayMs(-1), 2000);
    assert.strictEqual(calculateDelayMs(NaN), 2000);
    assert.strictEqual(calculateDelayMs(0), 0);
  });
});
