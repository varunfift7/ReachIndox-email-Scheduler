import { useEffect, useState, useRef } from 'react';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ComposeEmail from '../components/dashboard/ComposeEmail';
import EmailDetail from '../components/dashboard/EmailDetail';
import { authApi, emailApi, slackApi } from '../api/client';
import type { ScheduledEmail, SentEmail, SlackStatus, User } from '../types';
import { toast } from 'react-hot-toast';
import { Mail, Search } from 'lucide-react';

type Tab = 'scheduled' | 'sent';
type View = 'list' | 'compose' | 'detail';

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>('scheduled');
  const [view, setView] = useState<View>('list');
  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmail[]>([]);
  const [sentEmails, setSentEmails] = useState<SentEmail[]>([]);
  const [loadingScheduled, setLoadingScheduled] = useState(true);
  const [loadingSent, setLoadingSent] = useState(true);
  const [slack, setSlack] = useState<SlackStatus | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmail, setSelectedEmail] = useState<ScheduledEmail | SentEmail | null>(null);

  const mountedRef = useRef(true);

  const reloadData = async () => {
    try {
      const stored = localStorage.getItem('demoUser');
      const me = stored ? JSON.parse(stored) : await authApi.fetchMe();
      if (!mountedRef.current) return;
      setUser(me);
      if (!me) return;

      const [sched, sent, slackStatus] = await Promise.all([
        emailApi.fetchScheduled(),
        emailApi.fetchSent(),
        slackApi.fetchStatus().catch(() => null),
      ]);
      if (!mountedRef.current) return;
      setScheduledEmails(sched);
      setSentEmails(sent);
      setSlack(slackStatus);
    } catch {
      // not logged in
    } finally {
      if (mountedRef.current) {
        setLoadingScheduled(false);
        setLoadingSent(false);
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    // eslint-disable-next-line react/set-state-in-effect
    reloadData();
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slackStatus = params.get('slack');
    if (slackStatus) {
      if (slackStatus === 'connected') {
        toast.success('Slack connected');
      } else if (slackStatus === 'not_configured') {
        toast.error('Slack is not configured on the server');
      } else {
        toast.error('Slack connection failed');
      }
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const handleLogout = async () => {
    localStorage.removeItem('demoUser');
    try {
      await authApi.logout();
    } catch {
      // The local session is already cleared; proceed with logout.
    }
    setUser(null);
    window.location.href = '/';
  };

  const handleSlackDisconnect = async () => {
    try {
      await slackApi.disconnect();
      setSlack({ connected: false, teamName: null });
      toast.success('Slack disconnected');
    } catch {
      toast.error('Failed to disconnect Slack');
    }
  };

  const handleDemoLogin = async () => {
    try {
      const u = await authApi.demoLogin();
      setUser(u);
      toast.success(`Signed in as ${u.name}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Login failed');
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleString();
  };

  const currentEmails = tab === 'scheduled' ? scheduledEmails : sentEmails;
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredEmails = currentEmails.filter(e =>
    !normalizedQuery ||
    e.to_email.toLowerCase().includes(normalizedQuery) ||
    e.subject.toLowerCase().includes(normalizedQuery)
  );

  const handleEmailClick = (email: ScheduledEmail | SentEmail) => {
    setSelectedEmail(email);
    setView('detail');
  };

  const handleBack = () => {
    setView('list');
    setSelectedEmail(null);
  };

  if (!user) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Login</h1>
          <button className="google-btn" onClick={() => authApi.googleLogin()}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Login with Google
          </button>
          <div className="divider">or sign up through email</div>
          <div className="field">
            <input type="email" placeholder="Email ID" />
          </div>
          <div className="field">
            <input type="password" placeholder="Password" />
          </div>
          <button className="login-btn" onClick={handleDemoLogin}>Login</button>
          <span className="demo-link" onClick={handleDemoLogin}>or continue as demo user</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#fafbfc]">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-100 flex flex-col shrink-0">
        <div className="px-4 pt-5 pb-3">
          <div className="text-lg font-bold text-gray-800 mb-6">ON<span className="text-[#22c55e]">8</span></div>

          <button
            onClick={() => { setView('compose'); }}
            className="w-full py-2 px-4 bg-[#22c55e] hover:bg-[#1aab50] text-white text-sm font-medium rounded-lg transition-colors"
          >
            Compose
          </button>
        </div>

        <nav className="px-3 mt-1 flex-1">
          <button
            onClick={() => { setTab('scheduled'); setView('list'); }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'scheduled' && view === 'list'
                ? 'bg-[#f0fdf4] text-[#16a34a]'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            <Mail className="h-4 w-4" />
            Scheduled
            <span className="ml-auto text-xs text-gray-400">{scheduledEmails.length}</span>
          </button>
          <button
            onClick={() => { setTab('sent'); setView('list'); }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'sent' && view === 'list'
                ? 'bg-[#f0fdf4] text-[#16a34a]'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            <Mail className="h-4 w-4" />
            Sent
            <span className="ml-auto text-xs text-gray-400">{sentEmails.length}</span>
          </button>
        </nav>

        <div className="px-4 py-3 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Slack</span>
            {slack?.connected ? (
              <button
                onClick={handleSlackDisconnect}
                className="text-xs text-red-500 hover:text-red-600"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => slackApi.connect()}
                className="text-xs text-[#16a34a] hover:underline"
              >
                Connect
              </button>
            )}
          </div>
          <p className="text-[11px] text-gray-400 truncate mt-1">
            {slack?.connected ? slack.teamName || 'Connected' : 'Not connected'}
          </p>
        </div>

        <div className="px-4 py-3 flex items-center gap-2 border-t border-gray-100">
          {user.avatar ? (
            <img src={user.avatar} alt={user.name} className="h-7 w-7 rounded-full object-cover" />
          ) : (
            <div className="h-7 w-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-700 truncate">{user.name}</p>
          </div>
          <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-gray-600" title="Logout">
            ⏻
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {view === 'compose' ? (
          <ComposeEmail
            onBack={handleBack}
            onScheduled={() => { reloadData(); handleBack(); }}
            defaultFromEmail={user?.email || undefined}
          />
        ) : view === 'detail' && selectedEmail ? (
          <EmailDetail email={selectedEmail} onBack={handleBack} />
        ) : (
          <>
            {/* Email List */}
            <div className="flex-1 overflow-y-auto bg-white">
              <div className="px-6 pt-4 pb-2">
                <div className="relative max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    className="pl-9 pr-3 py-1.5 w-full bg-gray-50 border border-transparent focus:border-gray-200 rounded-lg text-sm outline-none"
                    placeholder="Search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="px-2 pb-4">
              {tab === 'scheduled' ? (
                loadingScheduled ? (
                  <div className="p-6 space-y-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-16 bg-gray-50 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : filteredEmails.length === 0 ? (
                  <EmptyState
                    icon={<Mail className="h-8 w-8" />}
                    title="No scheduled emails"
                    description="Schedule your first email campaign to see it here."
                    action={<Button onClick={() => setView('compose')}>Compose</Button>}
                  />
                ) : (
                  filteredEmails.map((email) => (
                    <div
                      key={email.id}
                      onClick={() => handleEmailClick(email)}
                      className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-50"
                    >
                      <span className="text-sm font-medium text-gray-800 flex-1 truncate">
                        {email.to_email}
                      </span>
                      <span className="text-xs text-gray-500 truncate flex-1">{email.subject}</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#f0fdf4] text-[#16a34a]">
                        Scheduled
                      </span>
                      <span className="text-xs text-gray-400 w-32 text-right shrink-0">
                        {formatDate(email.scheduled_at)}
                      </span>
                    </div>
                  ))
                )
              ) : (
                loadingSent ? (
                  <div className="p-6 space-y-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-16 bg-gray-50 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : filteredEmails.length === 0 ? (
                  <EmptyState
                    icon={<Mail className="h-8 w-8" />}
                    title="No sent emails yet"
                    description="Emails you send will appear here with their delivery status."
                  />
                ) : (
                  filteredEmails.map((email) => (
                    <div
                      key={email.id}
                      onClick={() => handleEmailClick(email)}
                      className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-50"
                    >
                      <span className="text-sm font-medium text-gray-800 flex-1 truncate">
                        {email.to_email}
                      </span>
                      <span className="text-xs text-gray-500 truncate flex-1">{email.subject}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        email.status === 'sent'
                          ? 'bg-orange-50 text-orange-600'
                          : 'bg-red-50 text-red-600'
                      }`}>
                        {email.status === 'sent' ? 'Sent' : 'Failed'}
                      </span>
                      <span className="text-xs text-gray-400 w-32 text-right shrink-0">
                        {'sent_at' in email && email.sent_at ? formatDate(email.sent_at) : formatDate(email.scheduled_at)}
                      </span>
                    </div>
                  ))
                )
              )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
