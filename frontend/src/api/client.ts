import axios from 'axios';
import type {
  QueueStats,
  RateLimitInfo,
  ScheduledEmail,
  ScheduleResponse,
  SearchResult,
  SentEmail,
  SlackStatus,
  User,
} from '../types';

const api = axios.create({
  baseURL: '',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const demoUser = localStorage.getItem('demoUser');
  if (demoUser) {
    config.headers.Authorization = 'Bearer demo-mode';
    config.withCredentials = false;
  }
  return config;
});

export const authApi = {
  fetchMe: async (): Promise<User | null> => {
    try {
      const res = await api.get<User>('/auth/me');
      return res.data;
    } catch {
      return null;
    }
  },
  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
  },
  googleLogin: (): void => {
    window.location.href = '/auth/google';
  },
  demoLogin: async (): Promise<User> => {
    const res = await api.get<User>('/auth/me', {
      headers: { Authorization: 'Bearer demo-mode' },
      withCredentials: false,
    });
    window.localStorage.setItem('demoUser', JSON.stringify(res.data));
    return res.data;
  },
};

export const emailApi = {
  schedule: async (
    data: {
      subject: string;
      body: string;
      scheduledAt: string;
      delayMs: number;
      hourlyLimit: number;
      emails: string[];
      from?: string;
    },
    file?: File
  ): Promise<ScheduleResponse> => {
    const form = new FormData();
    form.append('subject', data.subject);
    form.append('body', data.body);
    form.append('scheduledAt', data.scheduledAt);
    form.append('delayMs', String(data.delayMs));
    form.append('hourlyLimit', String(data.hourlyLimit));
    form.append('emails', JSON.stringify(data.emails));
    if (data.from) form.append('from', data.from);
    if (file) form.append('file', file);

    const res = await api.post<ScheduleResponse>('/api/emails/schedule', form);
    return res.data;
  },
  fetchScheduled: async (): Promise<ScheduledEmail[]> => {
    const res = await api.get<ScheduledEmail[]>('/api/emails/scheduled');
    return res.data;
  },
  fetchSent: async (): Promise<SentEmail[]> => {
    const res = await api.get<SentEmail[]>('/api/emails/sent');
    return res.data;
  },
  fetchRateLimit: async (): Promise<RateLimitInfo> => {
    const res = await api.get<RateLimitInfo>('/api/emails/rate-limit');
    return res.data;
  },
  parseFile: async (file: File): Promise<{ count: number; emails: string[] }> => {
    const form = new FormData();
    form.append('file', file);
    const res = await api.post('/api/emails/parse', form);
    return res.data;
  },
  fetchQueueStats: async (): Promise<QueueStats> => {
    const res = await api.get<QueueStats>('/admin/stats');
    return res.data;
  },
};

export const slackApi = {
  fetchStatus: async (): Promise<SlackStatus> => {
    const res = await api.get<SlackStatus>('/api/slack/status');
    return res.data;
  },
  connect: (): void => {
    window.location.href = '/api/slack/connect';
  },
  disconnect: async (): Promise<void> => {
    await api.post('/api/slack/disconnect');
  },
};

export const searchApi = {
  search: async (query: string, status?: string): Promise<SearchResult[]> => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (status) params.set('status', status);
    const res = await api.get<{ hits: SearchResult[] }>(`/api/search?${params.toString()}`);
    return res.data.hits;
  },
};

export default api;
