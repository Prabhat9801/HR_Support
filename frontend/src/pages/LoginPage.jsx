/**
 * Botivate HR Support – Login Page
 * Minimal · Professional · Role auto-detected by AI
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ company_id: '', employee_id: '', password: '' });

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.company_id || !form.employee_id || !form.password) {
      toast.error('Please fill all fields');
      return;
    }
    setLoading(true);
    try {
      const user = await login(form);
      toast.success(`Welcome, ${user.employee_name}!`);
      if (['hr', 'admin'].includes(user.role)) navigate('/onboarding');
      else navigate('/chat');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
         style={{ background: 'var(--bg-primary)' }}>

      {/* Ambient Glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-30 blur-[100px]"
             style={{ background: 'var(--accent)' }} />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full opacity-20 blur-[80px]"
             style={{ background: '#8b5cf6' }} />
      </div>

      <div className="w-full max-w-sm relative z-10 animate-fadeInUp">

        {/* Brand */}
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 glow"
               style={{ background: 'linear-gradient(135deg, var(--accent), #8b5cf6)' }}>
            <span className="text-white font-bold text-xl">B</span>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Botivate <span className="text-gradient">HR</span>
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            AI-Powered HR Support Portal
          </p>
        </div>

        {/* Card */}
        <form onSubmit={submit}
              className="p-6 rounded-2xl space-y-4"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-lg)',
              }}>

          <Field label="Company ID" value={form.company_id} onChange={set('company_id')}
                 placeholder="e.g. 7a84ad60-101e-..." />
          <Field label="Employee ID" value={form.employee_id} onChange={set('employee_id')}
                 placeholder="e.g. EMP0002" />
          <Field label="Password" type="password" value={form.password} onChange={set('password')}
                 placeholder="••••••••" />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, var(--accent), #8b5cf6)',
              color: '#fff',
              boxShadow: loading ? 'none' : 'var(--shadow-glow)',
            }}>
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Signing in…
              </span>
            ) : 'Sign In'}
          </button>
        </form>

        {/* Register */}
        <div className="text-center mt-6 animate-fadeInUp" style={{ animationDelay: '150ms' }}>
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>New company?</p>
          <button onClick={() => navigate('/register')}
                  className="text-xs font-medium transition-colors cursor-pointer"
                  style={{ color: 'var(--accent)' }}>
            Register Your Company →
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Reusable Input Field ──────────────────── */
function Field({ label, type = 'text', ...props }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5"
             style={{ color: 'var(--text-secondary)' }}>{label}</label>
      <input
        type={type}
        required
        className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-all duration-200"
        style={{
          background: 'var(--bg-input)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
        }}
        onFocus={(e) => {
          e.target.style.borderColor = 'var(--accent)';
          e.target.style.boxShadow = '0 0 0 3px var(--accent-subtle)';
        }}
        onBlur={(e) => {
          e.target.style.borderColor = 'var(--border)';
          e.target.style.boxShadow = 'none';
        }}
        {...props}
      />
    </div>
  );
}
