export interface User {
  id: number;
  name: string;
  email: string;
  avatar: string | null;
}

export interface ScheduledEmail {
  id: number;
  to_email: string;
  subject: string;
  body: string;
  from_email: string;
  scheduled_at: string;
  status: 'scheduled' | 'processing';
  created_at: string;
}

export interface SentEmail {
  id: number;
  to_email: string;
  subject: string;
  body: string;
  from_email: string;
  scheduled_at: string;
  sent_at: string | null;
  status: 'sent' | 'failed';
  error: string | null;
}

export interface RateLimitInfo {
  senders: Array<{
    sender_email: string;
    hourly_limit: number;
    delay_between_emails_ms: number;
  }>;
  remaining: {
    globalRemaining: number;
    senderRemaining: number;
  };
  globalLimit: number;
  perSenderLimit: number;
}

export interface SlackStatus {
  connected: boolean;
  teamName: string | null;
}

export interface QueueStats {
  queue: string;
  counts: Record<string, number>;
}

export interface ScheduleResponse {
  total: number;
  scheduled: number;
  emails: string[];
  scheduledAt: string;
  delayMs: number;
  hourlyLimit: number;
  message: string;
}

export interface SearchResult {
  id: string;
  to_email: string;
  subject: string;
  body: string;
  from_email: string;
  status: string;
  scheduled_at: string;
  sent_at?: string;
}
