/**
 * Botivate HR Support – Onboarding / Admin Page
 * Company Registration · Policies · Database · Provisioning
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { companyAPI } from '../api';
import toast from 'react-hot-toast';

export default function OnboardingPage({ isPublic }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(isPublic ? 0 : 1); // 0=register, 1=policies, 2=database, 3=provision
  const [companyId, setCompanyId] = useState(user?.company_id || '');
  const [loading, setLoading] = useState(false);

  // Step 0: Registration
  const [regForm, setRegForm] = useState({
    name: '', industry: '', hr_name: '', hr_email: '', hr_email_password: '',
    support_email: '', support_phone: '', support_whatsapp: '', support_message: '',
    login_link: window.location.origin + '/login',
  });

  // Step 1: Policies
  const [policies, setPolicies] = useState([]);
  const [policyForm, setPolicyForm] = useState({ title: '', description: '', content: '' });
  const [policyFile, setPolicyFile] = useState(null);
  const [policyType, setPolicyType] = useState('text'); // text | document

  // Step 2: Database
  const [databases, setDatabases] = useState([]);
  const [dbForm, setDbForm] = useState({
    title: '', description: '', db_type: 'google_sheets', spreadsheet_id: '',
  });

  // Step 3: Provision
  const [provisionResult, setProvisionResult] = useState(null);

  // Load existing data
  useEffect(() => {
    if (companyId) {
      companyAPI.getPolicies(companyId).then(r => setPolicies(r.data)).catch(() => {});
      companyAPI.getDatabases(companyId).then(r => setDatabases(r.data)).catch(() => {});
    }
  }, [companyId]);

  const registerCompany = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await companyAPI.register(regForm);
      setCompanyId(res.data.id);
      toast.success(`Company registered! ID: ${res.data.id}`);
      setStep(1);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Registration failed');
    } finally { setLoading(false); }
  };

  const addPolicy = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (policyType === 'text') {
        await companyAPI.addTextPolicy(companyId, policyForm);
      } else {
        const fd = new FormData();
        fd.append('title', policyForm.title);
        fd.append('description', policyForm.description);
        fd.append('file', policyFile);
        await companyAPI.uploadDocPolicy(companyId, fd);
      }
      toast.success('Policy added!');
      setPolicyForm({ title: '', description: '', content: '' });
      setPolicyFile(null);
      const r = await companyAPI.getPolicies(companyId);
      setPolicies(r.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add policy');
    } finally { setLoading(false); }
  };

  const deletePolicy = async (id) => {
    try {
      await companyAPI.deletePolicy(companyId, id);
      setPolicies(p => p.filter(x => x.id !== id));
      toast.success('Policy deleted');
    } catch { toast.error('Failed'); }
  };

  const addDatabase = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await companyAPI.addDatabase(companyId, {
        title: dbForm.title,
        description: dbForm.description,
        db_type: dbForm.db_type,
        connection_config: { spreadsheet_id: dbForm.spreadsheet_id },
      });
      toast.success('Database connected & schema analyzed!');
      const r = await companyAPI.getDatabases(companyId);
      setDatabases(r.data);
      setDbForm({ ...dbForm, title: '', description: '', spreadsheet_id: '' });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed');
    } finally { setLoading(false); }
  };

  const provisionEmployees = async (dbId) => {
    setLoading(true);
    try {
      const res = await companyAPI.provisionEmployees(companyId, dbId);
      setProvisionResult(res.data);
      toast.success('Credentials sent to all employees!');
      setStep(3);
    } catch (err) {
      toast.error(err.response?.data?.detail || err.response?.data?.error || 'Provisioning failed');
    } finally { setLoading(false); }
  };

  const steps = [
    { label: 'Register', icon: '🏢' },
    { label: 'Policies', icon: '📜' },
    { label: 'Database', icon: '🗄️' },
    { label: 'Provision', icon: '🔑' },
  ];

  return (
    <div className="min-h-screen p-6" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {isPublic ? 'Company Registration' : 'Company Setup'}
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {companyId ? `ID: ${companyId}` : 'Register your company to get started'}
            </p>
          </div>
          {user && (
            <button onClick={() => navigate('/chat')} className="text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-all"
                    style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
              ← Back to Chat
            </button>
          )}
        </div>

        {/* Step Indicators */}
        <div className="flex gap-1 mb-8">
          {steps.map((s, i) => (
            <button key={i} onClick={() => (i === 0 || companyId) && setStep(i)}
                    className="flex-1 py-2 rounded-xl text-[11px] font-medium transition-all cursor-pointer"
                    style={{
                      background: step === i ? 'var(--accent-subtle)' : 'var(--bg-card)',
                      color: step === i ? 'var(--accent)' : 'var(--text-muted)',
                      border: `1px solid ${step === i ? 'var(--accent)' : 'var(--border)'}`,
                    }}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>

        {/* Step Content */}
        <div className="animate-fadeInUp">

          {/* Step 0: Register */}
          {step === 0 && (
            <Card title="Register Company">
              <form onSubmit={registerCompany} className="space-y-3">
                <Row><Inp label="Company Name *" value={regForm.name} onChange={e => setRegForm({...regForm, name: e.target.value})} /></Row>
                <Row><Inp label="Industry" value={regForm.industry} onChange={e => setRegForm({...regForm, industry: e.target.value})} /></Row>
                <Row>
                  <Inp label="HR Name *" value={regForm.hr_name} onChange={e => setRegForm({...regForm, hr_name: e.target.value})} />
                  <Inp label="HR Email *" type="email" value={regForm.hr_email} onChange={e => setRegForm({...regForm, hr_email: e.target.value})} />
                </Row>
                <Row><Inp label="HR Email Password (SMTP)" type="password" value={regForm.hr_email_password} onChange={e => setRegForm({...regForm, hr_email_password: e.target.value})} /></Row>
                <Row>
                  <Inp label="Support Email" value={regForm.support_email} onChange={e => setRegForm({...regForm, support_email: e.target.value})} />
                  <Inp label="Support Phone" value={regForm.support_phone} onChange={e => setRegForm({...regForm, support_phone: e.target.value})} />
                </Row>
                <Row><Inp label="Support WhatsApp" value={regForm.support_whatsapp} onChange={e => setRegForm({...regForm, support_whatsapp: e.target.value})} /></Row>
                <Row><Inp label="Support Message" value={regForm.support_message} onChange={e => setRegForm({...regForm, support_message: e.target.value})} /></Row>
                <Btn loading={loading}>Register Company</Btn>
              </form>
            </Card>
          )}

          {/* Step 1: Policies */}
          {step === 1 && (
            <>
              <Card title="Add Policy">
                <div className="flex gap-2 mb-4">
                  {['text', 'document'].map(t => (
                    <button key={t} onClick={() => setPolicyType(t)}
                            className="flex-1 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all"
                            style={{
                              background: policyType === t ? 'var(--accent-subtle)' : 'var(--bg-input)',
                              color: policyType === t ? 'var(--accent)' : 'var(--text-muted)',
                              border: `1px solid ${policyType === t ? 'var(--accent)' : 'var(--border)'}`,
                            }}>
                      {t === 'text' ? '📝 Text Policy' : '📄 Document Upload'}
                    </button>
                  ))}
                </div>
                <form onSubmit={addPolicy} className="space-y-3">
                  <Inp label="Title *" value={policyForm.title} onChange={e => setPolicyForm({...policyForm, title: e.target.value})} />
                  <Inp label="Description" value={policyForm.description} onChange={e => setPolicyForm({...policyForm, description: e.target.value})} />
                  {policyType === 'text' ? (
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Content *</label>
                      <textarea rows={4} value={policyForm.content}
                                onChange={e => setPolicyForm({...policyForm, content: e.target.value})}
                                className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
                                style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)' }} />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Upload PDF/DOC *</label>
                      <input type="file" accept=".pdf,.doc,.docx,.txt"
                             onChange={e => setPolicyFile(e.target.files[0])}
                             className="text-xs" style={{ color: 'var(--text-secondary)' }} />
                    </div>
                  )}
                  <Btn loading={loading}>Add Policy</Btn>
                </form>
              </Card>

              {policies.length > 0 && (
                <Card title="Existing Policies" className="mt-4">
                  <div className="space-y-2">
                    {policies.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-3 rounded-xl"
                           style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)' }}>
                        <div>
                          <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{p.title}</p>
                          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{p.policy_type} · {p.description || 'No description'}</p>
                        </div>
                        <button onClick={() => deletePolicy(p.id)}
                                className="text-xs px-2 py-1 rounded-lg cursor-pointer"
                                style={{ color: 'var(--danger)' }}>✕</button>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}

          {/* Step 2: Database */}
          {step === 2 && (
            <>
              <Card title="Connect Database">
                <form onSubmit={addDatabase} className="space-y-3">
                  <Inp label="Title *" value={dbForm.title} onChange={e => setDbForm({...dbForm, title: e.target.value})}
                       placeholder="Employee Master Data" />
                  <Inp label="Description" value={dbForm.description} onChange={e => setDbForm({...dbForm, description: e.target.value})} />
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Database Type</label>
                    <select value={dbForm.db_type} onChange={e => setDbForm({...dbForm, db_type: e.target.value})}
                            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none cursor-pointer"
                            style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                      <option value="google_sheets">Google Sheets</option>
                      <option value="postgresql">PostgreSQL</option>
                      <option value="mongodb">MongoDB</option>
                      <option value="supabase">Supabase</option>
                      <option value="excel">Excel</option>
                    </select>
                  </div>
                  <Inp label="Google Sheet Link / ID *" value={dbForm.spreadsheet_id}
                       onChange={e => setDbForm({...dbForm, spreadsheet_id: e.target.value})}
                       placeholder="https://docs.google.com/spreadsheets/d/..." />
                  <Btn loading={loading}>Connect & Analyze</Btn>
                </form>
              </Card>

              {databases.length > 0 && (
                <Card title="Connected Databases" className="mt-4">
                  <div className="space-y-2">
                    {databases.map(d => (
                      <div key={d.id} className="p-3 rounded-xl"
                           style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)' }}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{d.title}</p>
                            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{d.db_type} · {d.is_active ? '✅ Active' : '❌ Inactive'}</p>
                          </div>
                          <button onClick={() => provisionEmployees(d.id)}
                                  className="text-xs px-3 py-1.5 rounded-lg cursor-pointer font-medium transition-all"
                                  style={{ background: 'var(--success-subtle)', color: 'var(--success)' }}>
                            🔑 Provision
                          </button>
                        </div>
                        {d.schema_map && (
                          <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border-light)' }}>
                            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                              Schema: PK={d.schema_map.primary_key} · Name={d.schema_map.employee_name} · Email={d.schema_map.email || 'N/A'}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}

          {/* Step 3: Provision */}
          {step === 3 && (
            <Card title="Employee Provisioning">
              {provisionResult ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl" style={{ background: 'var(--success-subtle)', border: '1px solid var(--success)' }}>
                    <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>✅ Provisioning Complete!</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                      {provisionResult.total_employees || provisionResult.message || 'Credentials sent successfully.'}
                    </p>
                  </div>
                  <button onClick={() => navigate('/chat')}
                          className="w-full py-3 rounded-xl text-sm font-semibold cursor-pointer transition-all"
                          style={{ background: 'var(--accent)', color: '#fff' }}>
                    Go to Chat Portal →
                  </button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Connect a database first, then click "🔑 Provision" to send login credentials to all employees.
                  </p>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Reusable Components ─────────────────────── */

function Card({ title, children, className = '' }) {
  return (
    <div className={`p-5 rounded-2xl ${className}`}
         style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}>
      {title && <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{title}</h2>}
      {children}
    </div>
  );
}

function Inp({ label, ...props }) {
  return (
    <div className="flex-1 min-w-0">
      <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      <input className="w-full px-3 py-2 rounded-xl text-sm outline-none transition-all"
             style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
             onFocus={e => e.target.style.borderColor = 'var(--accent)'}
             onBlur={e => e.target.style.borderColor = 'var(--border)'}
             {...props} />
    </div>
  );
}

function Row({ children }) {
  return <div className="flex gap-3">{children}</div>;
}

function Btn({ children, loading }) {
  return (
    <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-xl text-sm font-semibold cursor-pointer transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--accent), #8b5cf6)', color: '#fff', boxShadow: 'var(--shadow-glow)' }}>
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          Processing…
        </span>
      ) : children}
    </button>
  );
}
