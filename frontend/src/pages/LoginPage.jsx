import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiLock, FiUser, FiBriefcase } from 'react-icons/fi';
import axios from 'axios';

export default function LoginPage() {
  const [formData, setFormData] = useState({
    companyId: '',
    employeeId: '',
    password: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    // 1. Log what we are sending
    console.log("[FRONTEND LOG] 🚀 Starting Login request...");
    const payload = {
      company_id: formData.companyId.trim(),
      employee_id: formData.employeeId.trim(),
      password: formData.password.trim()
    };
    console.log("[FRONTEND LOG] 📦 Payload:", { ...payload, password: "***HIDDEN***" });

    try {
      console.log(`[FRONTEND LOG] 🌐 Sending POST to http://localhost:8000/api/auth/login`);
      const response = await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/auth/login`, payload);

      console.log("[FRONTEND LOG] ✅ Backend Response received:", response.status, response.data);

      if (response.data && response.data.access_token) {
        localStorage.setItem('auth_token', response.data.access_token);
        localStorage.setItem('user_info', JSON.stringify(response.data));
        toast.success('Login successful!');
        navigate('/dashboard');
      } else {
        console.error("[FRONTEND ERROR] ❌ Unexpected response format (no access_token):", response.data);
        toast.error('Unexpected response format.');
      }
    } catch (error) {
      console.error("[FRONTEND ERROR] 🔥 Login attempt failed:", error);
      if (error.response) {
        // The request was made and the server responded with a status code outside 2xx
        console.error("[FRONTEND ERROR] ⚠️ Server Responded with Error Status:", error.response.status);
        console.error("[FRONTEND ERROR] ⚠️ Response Data:", error.response.data);
        if (error.response.data && error.response.data.detail) {
          toast.error(error.response.data.detail);
        } else {
          toast.error(`Server Error: ${error.response.status}`);
        }
      } else if (error.request) {
        // The request was made but no response was received (e.g. CORS/Network error)
        console.error("[FRONTEND ERROR] 🔌 Network/No-Response Error:", error.request);
        toast.error('Could not reach the backend. Check if the server is running on port 8000.');
      } else {
        // Something happened in setting up the request that triggered an Error
        console.error("[FRONTEND ERROR] ⚙️ Setup Error:", error.message);
        toast.error(error.message || 'Invalid credentials or server error. Please try again.');
      }
    } finally {
      setIsLoading(false);
      console.log("[FRONTEND LOG] 🏁 Login process finished.");
    }
  };

  return (
    <div className="auth-layout fade-in">
      <div className="auth-wrapper">
        <div className="auth-card">
          <h1>Botivate HR</h1>
          <p className="subtitle">Secure access to your company workspace</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Company ID</label>
              <div style={{ position: 'relative' }}>
                <FiBriefcase style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  className="input-field"
                  style={{ paddingLeft: '2.5rem' }}
                  placeholder="Enter your company ID"
                  value={formData.companyId}
                  onChange={(e) => setFormData({ ...formData, companyId: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Employee ID</label>
              <div style={{ position: 'relative' }}>
                <FiUser style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  className="input-field"
                  style={{ paddingLeft: '2.5rem' }}
                  placeholder="e.g. EMP001"
                  value={formData.employeeId}
                  onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Password</label>
              <div style={{ position: 'relative' }}>
                <FiLock style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
                <input
                  type="password"
                  className="input-field"
                  style={{ paddingLeft: '2.5rem' }}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary btn-full" disabled={isLoading}>
                {isLoading ? 'Authenticating...' : 'Sign In'}
              </button>
            </div>
          </form>

          <div className="auth-footer">
            <p>Don't have a company account? <span
              onClick={() => {
                localStorage.removeItem('botivate_onboarding_company');
                localStorage.removeItem('botivate_google_connected');
                localStorage.removeItem('botivate_onboarding_form');
                navigate('/onboarding');
              }}
              style={{ color: 'var(--brand-primary)', cursor: 'pointer', textDecoration: 'underline' }}
            >Register here</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}
