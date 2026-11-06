import { useRef, useState } from 'react';
import { ChevronLeft, Upload, X, Send, Clock } from 'lucide-react';
import { emailApi } from '../../api/client';
import { toast } from 'react-hot-toast';

interface ComposeEmailProps {
  onBack: () => void;
  onScheduled: () => void;
  defaultFromEmail?: string;
}

export default function ComposeEmail({ onBack, onScheduled, defaultFromEmail }: ComposeEmailProps) {
  const [fromEmail] = useState(defaultFromEmail || 'oliver-brown@domain.io');
  const [toEmails, setToEmails] = useState<string[]>([]);
  const [toInput, setToInput] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [delay, setDelay] = useState(2);
  const [hourlyLimit, setHourlyLimit] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [showSendLater, setShowSendLater] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedCount, setUploadedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addEmail = (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (trimmed && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && !toEmails.includes(trimmed)) {
      setToEmails([...toEmails, trimmed]);
    }
  };

  const removeEmail = (email: string) => {
    setToEmails(toEmails.filter(e => e !== email));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addEmail(toInput);
      setToInput('');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await emailApi.parseFile(file);
      if (result.count === 0) {
        toast.error('No valid email addresses found in the file');
        return;
      }
      setUploadedFile(file);
      setUploadedCount(result.count);
      toast.success(`${result.count} email${result.count === 1 ? '' : 's'} imported`);
    } catch {
      toast.error('Failed to parse the uploaded file');
    } finally {
      e.target.value = '';
    }
  };

  const handleSubmit = async (sendAt?: string) => {
    if (!subject.trim() || !body.trim()) {
      toast.error('Subject and body are required');
      return;
    }
    if (toEmails.length === 0 && !uploadedFile) {
      toast.error('Add at least one recipient');
      return;
    }

    setSubmitting(true);
    try {
      const scheduledAt = sendAt || new Date().toISOString();
      const result = await emailApi.schedule({
        subject,
        body,
        scheduledAt,
        delayMs: delay * 1000,
        hourlyLimit,
        emails: toEmails,
        from: fromEmail,
      }, uploadedFile || undefined);
      toast.success(result.message);
      onScheduled();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to schedule');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendLater = (time: string) => {
    setShowSendLater(false);
    handleSubmit(time);
  };

  const tomorrowTimes = [
    { label: 'Tomorrow, 7:00 AM', value: getNextDay(7, 0) },
    { label: 'Tomorrow, 12:00 PM', value: getNextDay(12, 0) },
    { label: 'Tomorrow, 3:00 PM', value: getNextDay(15, 0) },
  ];

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronLeft className="h-5 w-5 text-gray-500" />
          </button>
          <h1 className="text-lg font-semibold text-gray-800">Compose New Email</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSubmit()}
            disabled={submitting}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#22c55e] hover:bg-[#1aab50] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Send
          </button>
          <div className="relative">
            <button
              onClick={() => setShowSendLater(!showSendLater)}
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Clock className="h-4 w-4" />
              Send Later
            </button>

            {showSendLater && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-4">
                <p className="text-sm font-medium text-gray-700 mb-3">Pick day & time</p>
                <p className="text-xs text-gray-400 mb-2">Tomorrow</p>
                {tomorrowTimes.map((t) => (
                  <button
                    key={t.label}
                    onClick={() => handleSendLater(t.value)}
                    className="w-full text-left px-3 py-2.5 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    {t.label}
                  </button>
                ))}
                <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => setShowSendLater(false)}
                    className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="max-w-3xl space-y-4">
          {/* From */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-500 w-12">From</label>
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="h-6 w-6 rounded-full bg-gray-300 flex items-center justify-center text-xs font-semibold text-gray-600">
                {fromEmail.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-gray-700">{fromEmail}</span>
            </div>
          </div>

          {/* To */}
          <div className="flex items-start gap-3">
            <label className="text-sm font-medium text-gray-500 w-12 pt-2">To</label>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded-lg min-h-[42px]">
                {toEmails.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#f0fdf4] text-[#166534] text-xs font-medium rounded-full border border-[#dcfce7]"
                  >
                    {email}
                    <button onClick={() => removeEmail(email)} className="hover:text-red-600">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-sm text-gray-700 placeholder-gray-400"
                  placeholder={toEmails.length === 0 ? 'recipient@example.com' : ''}
                  value={toInput}
                  onChange={(e) => setToInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={() => { if (toInput) addEmail(toInput); setToInput(''); }}
                />
              </div>
              <div className="flex items-center justify-end gap-2 mt-1">
                {uploadedFile && (
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    {uploadedFile.name} ({uploadedCount} emails)
                    <button
                      onClick={() => { setUploadedFile(null); setUploadedCount(0); }}
                      className="hover:text-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                >
                  <Upload className="h-3 w-3" />
                  Upload List
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
            </div>
          </div>

          {/* Subject */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-500 w-12">Subject</label>
            <input
              className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          {/* Delay & Limit */}
          <div className="flex items-center gap-6 pl-12">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400">Delay between 2 emails</label>
              <input
                type="number"
                min={1}
                className="w-16 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-center"
                value={delay}
                onChange={(e) => setDelay(Number(e.target.value))}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400">Hourly Limit</label>
              <input
                type="number"
                min={1}
                className="w-16 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-center"
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Rich Text Editor */}
          <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 bg-gray-50">
              {['B', 'I', 'U', 'S'].map((btn) => (
                <button
                  key={btn}
                  className="w-7 h-7 flex items-center justify-center text-xs font-semibold text-gray-500 hover:bg-gray-200 rounded transition-colors"
                  style={{ textDecoration: btn === 'S' ? 'line-through' : btn === 'U' ? 'underline' : 'none', fontStyle: btn === 'I' ? 'italic' : 'normal' }}
                >
                  {btn}
                </button>
              ))}
              <div className="w-px h-5 bg-gray-200 mx-1" />
              {['≡', '•', '1.'].map((btn, i) => (
                <button key={i} className="w-7 h-7 flex items-center justify-center text-xs text-gray-500 hover:bg-gray-200 rounded transition-colors">
                  {btn}
                </button>
              ))}
              <div className="w-px h-5 bg-gray-200 mx-1" />
              {['🔗', '📷', '</>'].map((btn, i) => (
                <button key={i} className="w-7 h-7 flex items-center justify-center text-xs text-gray-500 hover:bg-gray-200 rounded transition-colors">
                  {btn}
                </button>
              ))}
            </div>
            <textarea
              className="w-full px-4 py-3 min-h-[300px] text-sm text-gray-700 placeholder-gray-400 border-none outline-none resize-none bg-white"
              placeholder="Type Your Reply..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function getNextDay(hour: number, minute: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
