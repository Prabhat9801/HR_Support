import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiCheckCircle, FiXCircle, FiClock, FiFileText } from 'react-icons/fi';

export default function ApprovalsPanel({ userInfo }) {
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchApprovals = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const res = await axios.get('http://localhost:8000/api/approvals/pending', {
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
      await axios.post(`http://localhost:8000/api/approvals/${id}/decide`, 
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
                
                {req.summary_report && (
                  <div style={{ backgroundColor: 'rgba(56, 189, 248, 0.05)', borderLeft: '3px solid var(--brand-primary)', padding: '0.75rem', borderRadius: '4px', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    <strong style={{ display: 'block', color: 'var(--brand-primary)', marginBottom: '0.25rem', fontSize: '0.8rem' }}>AI Summary Report:</strong>
                    {req.summary_report}
                  </div>
                )}
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
    </div>
  );
}
