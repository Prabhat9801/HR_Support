/**
 * Botivate HR Support – Chat Page
 * "Chatbot = Only Door" — Messenger-style premium UI
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { chatAPI, approvalAPI, notificationAPI, companyAPI } from '../api';
import toast from 'react-hot-toast';

export default function ChatPage() {
  const { user, logout, isAuthority } = useAuth();
  const navigate = useNavigate();
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState('chat'); // chat | requests | notifications
  const [requests, setRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [showSupport, setShowSupport] = useState(false);
  const [support, setSupport] = useState(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-greet + fetch support info
  useEffect(() => {
    send('hi');
    if (user?.company_id) {
      companyAPI.getSupport(user.company_id).then(r => setSupport(r.data)).catch(() => {});
    }
  }, []);

  // Auto-scroll
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  // Fetch requests & notifications when tab changes
  useEffect(() => {
    if (tab === 'requests') {
      approvalAPI.getMyRequests().then(r => setRequests(r.data)).catch(() => {});
      if (isAuthority()) {
        approvalAPI.getPending().then(r => setPendingApprovals(r.data)).catch(() => {});
      }
    }
    if (tab === 'notifications') {
      notificationAPI.getAll().then(r => setNotifications(r.data)).catch(() => {});
    }
  }, [tab]);

  const send = async (text) => {
    const msg = text || input.trim();
    if (!msg) return;
    setMsgs(p => [...p, { role: 'user', text: msg, time: new Date() }]);
    setInput('');
    setSending(true);
    try {
      const res = await chatAPI.send({ message: msg });
      setMsgs(p => [...p, {
        role: 'ai', text: res.data.reply, actions: res.data.actions || [], time: new Date(),
      }]);
    } catch {
      setMsgs(p => [...p, { role: 'ai', text: 'Sorry, I encountered an issue. Please try again.', time: new Date() }]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  const handleDecision = async (id, status) => {
    try {
      await approvalAPI.decide(id, { status, decision_note: `${status} via portal` });
      toast.success(`Request ${status}!`);
      setPendingApprovals(p => p.filter(r => r.id !== id));
    } catch { toast.error('Failed to process'); }
  };

  return (
    <div className="flex h-screen" style={{ background: 'var(--bg-primary)' }}>

      {/* ── Sidebar ───────────────────────────── */}
      <aside className="w-16 flex flex-col items-center py-4 gap-2 shrink-0"
             style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-4 glow"
             style={{ background: 'linear-gradient(135deg, var(--accent), #8b5cf6)' }}>
          <span className="text-white font-bold text-sm">B</span>
        </div>

        <SideBtn icon="💬" active={tab === 'chat'} onClick={() => setTab('chat')} title="Chat" />
        <SideBtn icon="📋" active={tab === 'requests'} onClick={() => setTab('requests')} title="Requests" />
        <SideBtn icon="🔔" active={tab === 'notifications'} onClick={() => setTab('notifications')} title="Notifications"
                 badge={notifications.filter(n => !n.is_read).length || null} />
        {isAuthority() && (
          <SideBtn icon="⚙️" active={false} onClick={() => navigate('/onboarding')} title="Admin" />
        )}

        <div className="flex-1" />
        <SideBtn icon="❓" active={showSupport} onClick={() => setShowSupport(!showSupport)} title="Help" />
        <SideBtn icon="🚪" onClick={() => { logout(); navigate('/login'); }} title="Logout" />
      </aside>

      {/* ── Main ──────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="flex items-center justify-between px-6 py-3 shrink-0"
                style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                 style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
              {tab === 'chat' ? '🤖' : tab === 'requests' ? '📋' : '🔔'}
            </div>
            <div>
              <h1 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {tab === 'chat' ? 'HR Assistant' : tab === 'requests' ? 'My Requests' : 'Notifications'}
              </h1>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {tab === 'chat' ? '● Online' : `${user?.employee_name} · ${user?.role?.toUpperCase()}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-full"
                  style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
              {user?.role?.toUpperCase()}
            </span>
          </div>
        </header>

        {/* Support Card */}
        {showSupport && support && (
          <div className="mx-6 mt-3 p-4 rounded-xl animate-fadeInUp"
               style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
              📞 Company Support — {support.company_name}
            </p>
            {support.support_email && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Email: {support.support_email}</p>}
            {support.support_phone && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Phone: {support.support_phone}</p>}
            {support.support_whatsapp && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>WhatsApp: {support.support_whatsapp}</p>}
            {support.support_message && <p className="text-xs mt-2 italic" style={{ color: 'var(--text-muted)' }}>{support.support_message}</p>}
          </div>
        )}

        {/* ── Tab Content ─────────────────────── */}
        {tab === 'chat' && (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {msgs.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fadeInUp`}
                     style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}>
                  <div className="max-w-[75%] px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed"
                       style={m.role === 'user' ? {
                         background: 'linear-gradient(135deg, var(--accent), #8b5cf6)',
                         color: '#fff',
                         borderBottomRightRadius: '6px',
                       } : {
                         background: 'var(--bg-card)',
                         border: '1px solid var(--border)',
                         color: 'var(--text-primary)',
                         borderBottomLeftRadius: '6px',
                       }}>
                    <div className="whitespace-pre-wrap">{m.text}</div>
                    {m.actions?.length > 0 && (
                      <div className="mt-2 pt-2 flex flex-wrap gap-1.5"
                           style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        {m.actions.map((a, j) => (
                          <span key={j} className="text-[10px] px-2 py-1 rounded-lg"
                                style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                            {a.text || a.label}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-[9px] mt-1.5 opacity-50">
                      {new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="px-4 py-3 rounded-2xl rounded-bl-md"
                       style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    <div className="flex gap-1">
                      {[0,1,2].map(i => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                             style={{ background: 'var(--text-muted)', animationDelay: `${i*150}ms` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Input */}
            <div className="px-6 py-3 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Type a message…"
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                  style={{
                    background: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
                <button
                  onClick={() => send()}
                  disabled={!input.trim() || sending}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer disabled:opacity-30"
                  style={{
                    background: 'linear-gradient(135deg, var(--accent), #8b5cf6)',
                    color: '#fff',
                  }}>
                  ↑
                </button>
              </div>
            </div>
          </>
        )}

        {tab === 'requests' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* My Requests */}
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>My Requests</h2>
            {requests.length === 0 ? (
              <EmptyState text="No requests yet. Use the chat to submit leave, grievance, or other requests." />
            ) : requests.map(r => <RequestCard key={r.id} req={r} />)}

            {/* Pending Approvals (Authority Only) */}
            {isAuthority() && pendingApprovals.length > 0 && (
              <>
                <h2 className="text-sm font-semibold mt-6" style={{ color: 'var(--warning)' }}>
                  ⚡ Pending Approvals ({pendingApprovals.length})
                </h2>
                {pendingApprovals.map(r => (
                  <RequestCard key={r.id} req={r} showActions onApprove={() => handleDecision(r.id, 'approved')}
                               onReject={() => handleDecision(r.id, 'rejected')} />
                ))}
              </>
            )}
          </div>
        )}

        {tab === 'notifications' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-2">
            {notifications.length === 0 ? (
              <EmptyState text="No notifications yet." />
            ) : notifications.map(n => (
              <div key={n.id} className="p-3 rounded-xl transition-all animate-fadeInUp"
                   style={{
                     background: n.is_read ? 'var(--bg-card)' : 'var(--accent-subtle)',
                     border: `1px solid ${n.is_read ? 'var(--border)' : 'var(--accent)'}`,
                   }}
                   onClick={() => {
                     if (!n.is_read) notificationAPI.markRead(n.id).then(() => {
                       setNotifications(p => p.map(x => x.id === n.id ? { ...x, is_read: true } : x));
                     });
                   }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{n.title}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{n.message}</p>
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  {new Date(n.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

/* ── Sub-components ──────────────────────────── */

function SideBtn({ icon, active, onClick, title, badge }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="relative w-10 h-10 rounded-xl flex items-center justify-center text-base transition-all cursor-pointer"
      style={{
        background: active ? 'var(--accent-subtle)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
      }}>
      {icon}
      {badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
              style={{ background: 'var(--danger)', color: '#fff' }}>
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

function RequestCard({ req, showActions, onApprove, onReject }) {
  const statusColor = {
    pending: 'var(--warning)',
    approved: 'var(--success)',
    rejected: 'var(--danger)',
    escalated: 'var(--accent)',
  }[req.status] || 'var(--text-muted)';

  return (
    <div className="p-4 rounded-xl animate-fadeInUp"
         style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
              {req.request_type?.replace('_', ' ').toUpperCase()}
            </p>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{ background: `${statusColor}20`, color: statusColor }}>
              {req.status?.toUpperCase()}
            </span>
          </div>
          {req.employee_name && (
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              By: {req.employee_name} ({req.employee_id})
            </p>
          )}
          {req.context && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>"{req.context}"</p>}
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {new Date(req.created_at).toLocaleString()}
          </p>
        </div>
      </div>
      {showActions && (
        <div className="flex gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onApprove}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all"
                  style={{ background: 'var(--success-subtle)', color: 'var(--success)' }}>
            ✓ Approve
          </button>
          <button onClick={onReject}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all"
                  style={{ background: 'var(--danger-subtle)', color: 'var(--danger)' }}>
            ✕ Reject
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 animate-fadeIn">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
           style={{ background: 'var(--accent-subtle)' }}>
        <span className="text-xl">📭</span>
      </div>
      <p className="text-xs text-center max-w-xs" style={{ color: 'var(--text-muted)' }}>{text}</p>
    </div>
  );
}
