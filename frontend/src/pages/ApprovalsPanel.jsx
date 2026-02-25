import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiCheckCircle, FiXCircle, FiClock, FiFileText } from 'react-icons/fi';

export default function ApprovalsPanel({ userInfo }) {
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reportModal, setReportModal] = useState({ isOpen: false, data: null, employeeName: '', type: '' });

  const fetchApprovals = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/approvals/pending`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPendingRequests(res.data);
    } catch (error) {
      console.error("[FRONTEND ERROR] Failed to fetch approvals:", error);
      toast.error("Could not load pending approvals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, []);

  const handleDecision = async (id, status) => {
    // Optimistic UI: Remove from list immediately
    const originalRequests = [...pendingRequests];
    setPendingRequests(prev => prev.filter(req => req.id !== id));

    try {
      const token = localStorage.getItem('auth_token');
      await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/approvals/${id}/decide`,
        { status: status, comments: `Automatically ${status} by ${userInfo.employee_name}` },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Request ${status} successfully!`);
      // No need to fetchApprovals() immediately because we already removed it optimistically
      // But we can do it in the background to be safe
    } catch (error) {
      console.error("[FRONTEND ERROR] Failed decision:", error);
      toast.error(`Failed to mark request as ${status}`);
      // Rollback on error
      setPendingRequests(originalRequests);
    }
  };

  return (
    <div className="approvals-panel" style={{ padding: '2rem', width: '100%', overflowY: 'auto' }}>
      <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <FiClock /> Pending Approvals
      </h2>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading approvals...</p>
      ) : pendingRequests.length === 0 ? (
        <div className="glass fade-in" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <FiCheckCircle size={48} style={{ marginBottom: '1rem', color: 'var(--success-color)', opacity: 0.5 }} />
          <h3>All caught up!</h3>
          <p>You have no pending requests to review.</p>
        </div>
      ) : (
        <div className="requests-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {pendingRequests.map(req => (
            <div key={req.id} className="request-card glass fade-in" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <span style={{ backgroundColor: 'var(--brand-primary)', color: 'white', padding: '0.25rem 0.75rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase' }}>
                    {req.request_type.replace('_', ' ')}
                  </span>
                  <small style={{ color: 'var(--text-tertiary)' }}>{new Date(req.created_at).toLocaleDateString()}</small>
                </div>

                <h4 style={{ marginBottom: '0.25rem' }}>{req.employee_name} <span style={{ color: 'var(--text-tertiary)', fontWeight: 'normal', fontSize: '0.85rem' }}>({req.employee_id})</span></h4>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem', lineHeight: '1.5' }}>
                  <FiFileText style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                  {req.context || 'No additional details provided.'}
                </div>

                {(() => {
                  const reportText = req.summary_report || (req.request_details && req.request_details.summary_report);
                  if (reportText) {
                    return (
                      <button
                        onClick={() => setReportModal({ isOpen: true, data: reportText, employeeName: req.employee_name, type: req.request_type })}
                        style={{
                          width: '100%', marginBottom: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.6rem',
                          background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%)',
                          border: '1px solid rgba(59, 130, 246, 0.3)', color: '#1d4ed8', padding: '0.75rem', borderRadius: '8px',
                          fontWeight: '600', transition: 'all 0.2s', cursor: 'pointer', boxShadow: '0 2px 4px rgba(59, 130, 246, 0.05)'
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(56, 189, 248, 0.15) 0%, rgba(59, 130, 246, 0.2) 100%)'; e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.5)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(56, 189, 248, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%)'; e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.3)'; }}
                      >
                        <FiFileText size={18} /> View Pre-Analysis Report
                      </button>
                    );
                  }
                  return null;
                })()}
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button
                  onClick={() => handleDecision(req.id, 'approved')}
                  className="btn"
                  style={{ flex: 1, backgroundColor: 'var(--success)', color: 'white', padding: '0.75rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                  <FiCheckCircle /> Approve
                </button>
                <button
                  onClick={() => handleDecision(req.id, 'rejected')}
                  className="btn"
                  style={{ flex: 1, backgroundColor: 'transparent', border: '1px solid var(--error)', color: 'var(--error)', padding: '0.75rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                  <FiXCircle /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Beautiful AI Report Modal */}
      {reportModal.isOpen && (
        <div className="modal-overlay fade-in" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', zIndex: 3000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
          <div className="modal-content fade-in-up" style={{ width: '600px', maxWidth: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>

            {/* Modal Header */}
            <div style={{ background: 'linear-gradient(135deg, var(--brand-primary) 0%, #1e3a8a 100%)', padding: '1.25rem 2rem', color: 'white', position: 'relative', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ background: 'rgba(255,255,255,0.2)', padding: '10px', borderRadius: '12px', backdropFilter: 'blur(4px)', color: 'white' }}>
                  <FiFileText size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold', color: '#ffffff' }}>AI Intelligence Report</h3>
                  <p style={{ margin: 0, color: 'rgba(255,255,255,0.9)', fontSize: '0.88rem', marginTop: '4px' }}>
                    Comprehensive analysis for {reportModal.employeeName}'s {reportModal.type.replace('_', ' ')}
                  </p>
                </div>
              </div>
              <button onClick={() => setReportModal({ isOpen: false, data: null, employeeName: '', type: '' })} style={{ position: 'absolute', top: '1.25rem', right: '1.5rem', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'} onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}>
                <FiXCircle size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', background: '#f8fafc', position: 'relative', overflowY: 'auto', flexGrow: 1 }}>
              <div style={{ position: 'absolute', top: 0, left: '1.5rem', right: '1.5rem', height: '1px', background: 'linear-gradient(90deg, transparent, #e2e8f0, transparent)' }}></div>

              <div style={{
                background: '#ffffff',
                padding: '2rem 1.5rem',
                borderRadius: '4px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03), inset 0 0 0 1px #cbd5e1',
                color: '#334155',
                fontSize: '0.90rem',
                lineHeight: '1.6',
                position: 'relative',
                borderTop: '6px solid #cbd5e1'
              }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem', borderBottom: '2px solid #f1f5f9', paddingBottom: '1rem' }}>
                  <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.2rem', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>CONFIDENTIAL REPORT</h2>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.4rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Automated Assessment by Botivate AI</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {reportModal.data.split('\n').map((line, index) => {
                    // Regex strip markdown asterisks/hashes if AI still included them
                    const trimmedLine = line.replace(/[*#]/g, '').trim();
                    if (!trimmedLine) return null;

                    const colonIndex = trimmedLine.indexOf(':');

                    if (colonIndex > 0 && colonIndex < 40 && !trimmedLine.startsWith('(')) {
                      const key = trimmedLine.substring(0, colonIndex).trim();
                      const value = trimmedLine.substring(colonIndex + 1).trim();
                      return (
                        <div key={index} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                          <div style={{ marginTop: '0.2rem', color: 'var(--brand-primary)' }}><FiCheckCircle size={18} /></div>
                          <div>
                            <strong style={{ color: '#0f172a', display: 'block', fontSize: '1.05rem', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{key}</strong>
                            <span style={{ color: '#475569', lineHeight: '1.6' }}>{value}</span>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <p key={index} style={{ margin: 0, color: '#475569', paddingLeft: '1rem', borderLeft: '3px solid #cbd5e1' }}>
                        {trimmedLine}
                      </p>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '1.25rem 2rem', background: 'white', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
              <button
                onClick={() => setReportModal({ isOpen: false, data: null, employeeName: '', type: '' })}
                className="btn"
                style={{ background: 'var(--brand-primary)', color: 'white', padding: '0.6rem 2rem', borderRadius: '10px', fontWeight: '500' }}
              >
                Close Report
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
