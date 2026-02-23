import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSend, FiLogOut, FiMenu, FiCommand, FiSend as FiSendIcon, FiCommand as FiBot, FiUser, FiBell, FiCheck, FiCheckSquare, FiMessageSquare, FiSliders, FiSettings, FiX, FiRefreshCw, FiPlus, FiEdit, FiCheck as FiCheckIcon } from 'react-icons/fi';
import toast from 'react-hot-toast';
import axios from 'axios';
import ApprovalsPanel from './ApprovalsPanel';
import SettingsPanel from './SettingsPanel';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState('chat');
  const [userInfo, setUserInfo] = useState(null);
  const [supportInfo, setSupportInfo] = useState(null);
  const [myRequests, setMyRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'ai',
      text: 'Hello, Jane! I am your Botivate HR Agent. I can help you with leave balances, policies, payroll questions, or approvals. How can I assist you today?',
      timestamp: new Date().toISOString()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const notificationRef = useRef(null);
  const navigate = useNavigate();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchNotifications = async (token) => {
    try {
      const res = await axios.get('http://localhost:8000/api/notifications/', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(res.data);
    } catch (err) {
      console.error("[FRONTEND ERROR] Failed to fetch notifications:", err);
    }
  };

  const markAsRead = async (id) => {
    try {
      const token = localStorage.getItem('auth_token');
      await axios.post(`http://localhost:8000/api/notifications/${id}/read`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchNotifications(token);
    } catch (err) {
      console.error("[FRONTEND ERROR] Failed to mark notification read:", err);
    }
  };

  const fetchMyRequests = async (token) => {
    try {
      const res = await axios.get('http://localhost:8000/api/approvals/my-requests', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMyRequests(res.data);
    } catch (err) {
      console.error("[FRONTEND ERROR] Failed to fetch my requests:", err);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    const storedInfo = localStorage.getItem('user_info');
    if (!storedInfo) {
      navigate('/login');
      return;
    }
    const parsed = JSON.parse(storedInfo);
    setUserInfo(parsed);

    // Initial Greeting setup
    setMessages([
      {
        id: 1,
        type: 'ai',
        text: `Hello, ${parsed.employee_name.split(' ')[0]}! I am your Botivate HR Agent. I can help you with leave balances, policies, payroll questions, or approvals. How can I assist you today?`,
        timestamp: new Date().toISOString()
      }
    ]);

    // Fetch support card info
    axios.get(`http://localhost:8000/api/companies/${parsed.company_id}/support`, {
      headers: { Authorization: `Bearer ${parsed.access_token}` }
    }).then(res => setSupportInfo(res.data)).catch(err => console.error(err));

    fetchNotifications(parsed.access_token);
    fetchMyRequests(parsed.access_token);
    
    // Poll for updates every 15 seconds
    const interval = setInterval(() => {
        fetchNotifications(parsed.access_token);
        fetchMyRequests(parsed.access_token);
    }, 15000);
    
    return () => clearInterval(interval);
  }, [navigate]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    }
    if (showNotifications) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showNotifications]);

  const handleSend = async () => {
    if (!inputText.trim()) return;

    const newMsg = {
      id: Date.now(),
      type: 'human',
      text: inputText,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, newMsg]);
    setInputText('');
    setIsTyping(true);

    // Send to backend agent
    try {
      const token = localStorage.getItem('auth_token');
      console.log(`[FRONTEND LOG] 👉 Sending Chat Message to Agent: "${inputText}"`);
      const response = await axios.post('http://localhost:8000/api/chat/send', 
        { message: inputText },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      console.log(`[FRONTEND LOG] ✅ Received Chat Reply:`, response.data);
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          type: 'ai',
          text: response.data.reply,
          timestamp: new Date().toISOString()
        }
      ]);
    } catch (error) {
      console.error("[FRONTEND ERROR] ❌ Chat Message Failed to send/receive:", error);
      console.error("[FRONTEND ERROR] Response Details:", error.response?.data);
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          type: 'ai',
          text: "I'm sorry, I'm having trouble connecting to the system right now. Please try again.",
          timestamp: new Date().toISOString()
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user_info');
    localStorage.removeItem('auth_token');
    toast('Logged out successfully', { icon: '👋' });
    navigate('/login');
  };

  return (
    <div className="dashboard-layout fade-in">
      {/* Global Notification Bell (Top Right Corner) */}
      <div ref={notificationRef} style={{ position: 'fixed', top: '0.875rem', right: '1rem', zIndex: 1100 }}>
        <button 
          onClick={() => setShowNotifications(!showNotifications)}
          style={{ 
            background: 'var(--bg-primary)', 
            border: '1px solid var(--border-color)', 
            color: 'var(--text-primary)', 
            cursor: 'pointer', 
            padding: '0.5rem', 
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            position: 'relative',
            transition: 'all 0.2s ease'
          }}
          title="Notifications"
          className="hover-scale"
        >
          <FiBell size={20} />
          {notifications.filter(n => !n.is_read).length > 0 && (
            <span style={{
              position: 'absolute', top: '-5px', right: '-5px', 
              backgroundColor: 'var(--error)', color: 'white', 
              borderRadius: '50%', fontSize: '0.65rem', padding: '2px 6px',
              fontWeight: 'bold', border: '2px solid white',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              {notifications.filter(n => !n.is_read).length}
            </span>
          )}
        </button>

        {showNotifications && (
          <div className="notifications-dropdown glass fade-in" style={{
            position: 'absolute', top: '100%', right: '0', width: '320px', 
            marginTop: '0.75rem',
            backgroundColor: 'rgba(255, 255, 255, 0.95)', 
            boxShadow: 'var(--shadow-xl)',
            borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--border-color)',
            backdropFilter: 'blur(20px)'
          }}>
            <div style={{ padding: '1.25rem 1rem', borderBottom: '1px solid var(--border-color)', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              Notifications
              <span style={{ fontSize: '0.75rem', color: 'var(--accent-color)', background: 'var(--accent-light)', padding: '2px 8px', borderRadius: '10px' }}>
                {notifications.filter(n => !n.is_read).length} Unread
              </span>
            </div>
            <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
              {notifications.length === 0 ? (
                <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                  <FiBell size={32} style={{ opacity: 0.1, marginBottom: '0.75rem' }} />
                  <p style={{ fontSize: '0.9rem' }}>All caught up!</p>
                </div>
              ) : notifications.map(notif => (
                <div key={notif.id} style={{ 
                  padding: '1rem', 
                  borderBottom: '1px solid var(--border-color)',
                  backgroundColor: notif.is_read ? 'transparent' : 'rgba(37, 99, 235, 0.03)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  cursor: 'pointer'
                }} onClick={() => !notif.is_read && markAsRead(notif.id)}>
                  <div style={{ flex: 1, paddingRight: '0.5rem' }}>
                    <p style={{ margin: '0 0 0.35rem 0', fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: '1.5', fontWeight: notif.is_read ? 400 : 500 }}>{notif.message}</p>
                    <small style={{ color: 'var(--text-tertiary)', fontSize: '0.7rem' }}>{new Date(notif.created_at).toLocaleString()}</small>
                  </div>
                  {!notif.is_read && (
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-color)', marginTop: '5px' }}></div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <FiCommand style={{ marginRight: '0.75rem', color: 'var(--accent-color)', fontSize: '1.25rem' }} />
          <span>Botivate HR</span>
        </div>
        
        <div className="sidebar-content" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="nav-menu glass" style={{ marginBottom: '1rem', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <button 
              onClick={() => setActiveTab('chat')}
              className="btn btn-icon" 
              style={{ width: '100%', justifyContent: 'flex-start', padding: '0.75rem', gap: '0.75rem', fontSize: '0.9rem', backgroundColor: activeTab === 'chat' ? 'var(--brand-primary)' : 'transparent', color: activeTab === 'chat' ? 'white' : 'var(--text-primary)', border: 'none', textAlign: 'left' }}
            >
              <FiMessageSquare /> AI HR Agent
            </button>

            {['manager', 'admin', 'hr', 'ceo'].includes(userInfo?.role) && (
              <button 
                onClick={() => setActiveTab('approvals')}
                className="btn btn-icon" 
                style={{ width: '100%', justifyContent: 'flex-start', padding: '0.75rem', gap: '0.75rem', fontSize: '0.9rem', backgroundColor: activeTab === 'approvals' ? 'var(--brand-primary)' : 'transparent', color: activeTab === 'approvals' ? 'white' : 'var(--text-primary)', border: 'none', textAlign: 'left' }}
              >
                <FiCheckSquare /> Approvals
              </button>
            )}

            {['admin', 'hr', 'ceo', 'manager'].includes(userInfo?.role) && (
              <button 
                onClick={() => setActiveTab('settings')}
                className="btn btn-icon" 
                style={{ width: '100%', justifyContent: 'flex-start', padding: '0.75rem', gap: '0.75rem', fontSize: '0.9rem', backgroundColor: activeTab === 'settings' ? 'var(--brand-primary)' : 'transparent', color: activeTab === 'settings' ? 'white' : 'var(--text-primary)', border: 'none', textAlign: 'left' }}
              >
                <FiSliders /> {userInfo?.role === 'manager' ? 'Management Console' : 'Admin Settings'}
              </button>
            )}
          </div>

          <div className="support-card glass" style={{ marginBottom: '1rem', padding: '1rem' }}>
            <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', marginBottom: '0.75rem' }}>HR Support</h4>
            {supportInfo ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>{supportInfo.support_email}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{supportInfo.support_phone}</div>
              </div>
            ) : (
              <span style={{ fontSize: '0.8rem', fontStyle: 'italic' }}>Loading info...</span>
            )}
          </div>

          <div className="recent-requests-container" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FiCheckSquare size={12} /> My Recent Requests
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {myRequests.length === 0 ? (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-tertiary)', background: 'rgba(0,0,0,0.02)', borderRadius: '10px' }}>
                  No requests yet
                </div>
              ) : (
                myRequests.map(req => (
                  <div key={req.id} className="glass" style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'white' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                        {req.request_type.replace(/_/g, ' ')}
                      </span>
                      <span style={{ 
                        fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase',
                        backgroundColor: req.status === 'approved' ? 'var(--accent-light)' : req.status === 'rejected' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                        color: req.status === 'approved' ? 'var(--accent-color)' : req.status === 'rejected' ? 'var(--error)' : 'var(--warning)'
                      }}>
                        {req.status}
                      </span>
                    </div>
                    {req.context && (
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '0.5rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '1.4' }}>
                        {req.context}
                      </p>
                    )}
                    {req.summary_report && (
                      <div style={{ padding: '0.5rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '6px', fontSize: '0.7rem', color: 'var(--text-secondary)', fontStyle: 'italic', borderLeft: '2px solid var(--accent-color)' }}>
                         AI: {req.summary_report.length > 60 ? req.summary_report.substring(0, 60) + '...' : req.summary_report}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="avatar" style={{ background: 'var(--accent-color)' }}>{userInfo?.employee_name?.charAt(0) || 'U'}</div>
          <div className="user-info">
            <div className="user-name">{userInfo?.employee_name || 'User'}</div>
            <div className="user-role">{userInfo?.employee_id}</div>
          </div>
          <button onClick={handleLogout} className="btn btn-icon" title="Logout" style={{ color: 'var(--text-tertiary)' }}>
            <FiLogOut size={18} />
          </button>
        </div>
      </div>

      {/* Main Content Area base on Active Tab */}
      {activeTab === 'approvals' ? (
        <ApprovalsPanel userInfo={userInfo} />
      ) : activeTab === 'settings' ? (
        <SettingsPanel userInfo={userInfo} />
      ) : (
        <div className="chat-area">
          <div className="chat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="chat-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              HR Agent Assistant
            </div>
            
            <div className="header-actions" style={{ paddingRight: '3.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--success)' }}></div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 500 }}>Botivate Live Agent</span>
              </div>
            </div>
          </div>

          <div className="chat-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`message ${msg.type}`}>
                {msg.type === 'ai' && (
                  <div className="message-avatar" style={{ background: 'var(--brand-primary)', color: 'white' }}>
                    <FiCommand size={14} />
                  </div>
                )}
                <div className="message-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                </div>
                {msg.type === 'human' && (
                  <div className="message-avatar" style={{ background: 'var(--accent-color)', color: 'white' }}>
                    <FiUser size={14} />
                  </div>
                )}
              </div>
            ))}
            {isTyping && (
              <div className="message ai">
                <div className="message-avatar" style={{ background: 'var(--brand-primary)', color: 'white' }}>
                  <FiCommand size={14} />
                </div>
                <div className="message-content" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div className="dot-typing"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-area">
            <div className="chat-input-wrapper glass">
              <textarea
                className="chat-textarea"
                placeholder="Ask me anything about policies, leave, or payroll..."
                rows={1}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <button
                className="send-btn"
                onClick={handleSend}
                disabled={!inputText.trim()}
                style={{ background: inputText.trim() ? 'var(--accent-color)' : 'var(--text-tertiary)' }}
              >
                <FiSend size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .hover-scale:hover { transform: scale(1.05); }
        .message-content p { margin: 0 0 0.5rem 0; }
        .message-content p:last-child { margin-bottom: 0; }
        .message-content ul, .message-content ol { margin: 0.5rem 0; padding-left: 1.5rem; }
        .message-content li { margin-bottom: 0.25rem; }
        .message-content strong { color: inherit; font-weight: 700; }
        .message-content h1, .message-content h2, .message-content h3 { margin: 1rem 0 0.5rem 0; font-size: 1.1rem; }
        .dot-typing {
          width: 4px; height: 4px; border-radius: 50%;
          background-color: var(--text-tertiary);
          box-shadow: 10px 0 0 0 var(--text-tertiary), 20px 0 0 0 var(--text-tertiary);
          animation: dot-typing 1s infinite alternate;
        }
        @keyframes dot-typing {
          0% { opacity: 0.2; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
