import { ChevronLeft, Star, Archive, Trash2, Reply } from 'lucide-react';

interface EmailDetailProps {
  email: {
    to_email: string;
    subject: string;
    body?: string;
    from_email: string;
    status: string;
    scheduled_at: string;
    sent_at?: string | null;
  };
  onBack: () => void;
}

export default function EmailDetail({ email, onBack }: EmailDetailProps) {
  const formatDate = (d: string | null) => {
    if (!d) return '-';
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
      date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronLeft className="h-5 w-5 text-gray-500" />
          </button>
          <h1 className="text-lg font-semibold text-gray-800 truncate max-w-xl">
            {email.subject}
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-yellow-500">
            <Star className="h-4 w-4" />
          </button>
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600">
            <Archive className="h-4 w-4" />
          </button>
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-red-500">
            <Trash2 className="h-4 w-4" />
          </button>
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600">
            <Reply className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Email Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-3xl">
          {/* Sender */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-600">
              {email.from_email.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">{email.from_email}</p>
              <p className="text-xs text-gray-400">{formatDate(email.sent_at || email.scheduled_at)}</p>
            </div>
          </div>

          {/* Body */}
          <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
            {email.body ? (
              email.body.split('\n').map((line, i) => (
                <p key={i} className="mb-3">{line}</p>
              ))
            ) : (
              <p className="text-gray-400 italic">No content available</p>
            )}
          </div>

          {/* Status */}
          <div className="mt-8 pt-6 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                email.status === 'sent'
                  ? 'bg-orange-50 text-orange-600 border border-orange-200'
                  : email.status === 'failed'
                  ? 'bg-red-50 text-red-600 border border-red-200'
                  : 'bg-[#f0fdf4] text-[#22c55e] border border-[#dcfce7]'
              }`}>
                {email.status}
              </span>
              <span className="text-xs text-gray-400">
                To: {email.to_email}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
