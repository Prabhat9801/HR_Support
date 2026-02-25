import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiBriefcase, FiMail, FiUser, FiUploadCloud } from 'react-icons/fi';
import axios from 'axios';

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    companyName: '',
    industry: '',
    contactName: '',
    contactEmail: '',
    policiesText: '',
    dbUrl: '',
    policyFile: null,
  });

  const [globalCompanyId, setGlobalCompanyId] = useState(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Restore state if returning from Google OAuth
  useEffect(() => {
    const returningCompanyId = localStorage.getItem('botivate_onboarding_company');
    const isGoogle = localStorage.getItem('botivate_google_connected') === 'true';
    const savedFormStr = localStorage.getItem('botivate_onboarding_form');

    if (returningCompanyId && isGoogle) {
      setGlobalCompanyId(returningCompanyId);
      setGoogleConnected(true);

      if (savedFormStr) {
        try {
          const parsedForm = JSON.parse(savedFormStr);
          setFormData(parsedForm);
        } catch (e) { }
      }
      setStep(2); // Jump instantly to step 2
    }
  }, []);

  const handleNext = async () => {
    if (step === 1 && (!formData.companyName || !formData.contactEmail)) {
      toast.error('Please fill required fields.');
      return;
    }

    if (!globalCompanyId) {
      setIsLoading(true);
      console.log("[FRONTEND LOG] 👉 Step 1: Registering Company API...");
      try {
        const companyPayload = {
          name: formData.companyName,
          industry: formData.industry,
          hr_name: formData.contactName,
          hr_email: formData.contactEmail
        };
        const compRes = await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/companies/register`, companyPayload);
        const newCompanyId = compRes.data.id;

        setGlobalCompanyId(newCompanyId);
        localStorage.setItem('botivate_onboarding_company', newCompanyId);
        localStorage.setItem('botivate_onboarding_form', JSON.stringify(formData));

        console.log(`[FRONTEND LOG] ✅ Step 1 Success: Company ID: '${newCompanyId}'`);
        setStep(2);
      } catch (error) {
        console.error("[FRONTEND ERROR]", error);
        toast.error(error.response?.data?.detail || "Registration failed. Check if email/company already exists.");
      } finally {
        setIsLoading(false);
      }
    } else {
      setStep(2);
    }
  };

  const handleGoogleOAuth = () => {
    // Start Google Auth flow
    if (!globalCompanyId) return;
    const clientId = "561628688869-uhibvk67hslomtphrq8hp4ha1ktviefl.apps.googleusercontent.com";
    const scopes = "https://mail.google.com/ https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive";
    const redirect = "http://localhost:5173/oauth/callback"; // Make sure to match exact URL set in Google Console

    // Temporarily save exact current form fields so we don't lose dbUrl/texts typed
    localStorage.setItem('botivate_onboarding_form', JSON.stringify(formData));

    const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirect}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent`;

    window.location.href = oauthUrl;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!googleConnected) {
      toast.error("Please grant Google Workspace access before proceeding.");
      return;
    }

    setIsLoading(true);
    console.log("[FRONTEND LOG] 🚀 Finalizing Company Onboarding...");

    try {
      // 2. Add Database Connection
      let dbId = null;
      if (formData.dbUrl) {
        console.log(`[FRONTEND LOG] 👉 Step 2: Attaching Google Sheet DB:`, formData.dbUrl);
        const dbRes = await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/companies/${globalCompanyId}/databases`, {
          title: "Primary Employee DB",
          db_type: "google_sheets",
          connection_config: { spreadsheet_id: formData.dbUrl }
        });
        dbId = dbRes.data.id;
        console.log(`[FRONTEND LOG] ✅ Step 2 Success: DB Attached. ID: '${dbId}'`);
      }

      // 3. Upload Policies (Text or Document)
      if (formData.policiesText.trim()) {
        console.log(`[FRONTEND LOG] 👉 Step 3a: Uploading Text Policy...`);
        await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/companies/${globalCompanyId}/policies/text`, {
          title: "General HR Policies",
          policy_type: "text",
          content: formData.policiesText
        });
        console.log(`[FRONTEND LOG] ✅ Step 3a Success: Text Policies Attached.`);
      }

      if (formData.policyFile) {
        console.log(`[FRONTEND LOG] 👉 Step 3b: Uploading Document Policy...`);
        const policyFormData = new FormData();
        policyFormData.append('title', formData.policyFile.name);
        policyFormData.append('description', 'Uploaded during onboarding');
        policyFormData.append('file', formData.policyFile);

        await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/companies/${globalCompanyId}/policies/document`, policyFormData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        console.log(`[FRONTEND LOG] ✅ Step 3b Success: Document Policy Uploaded.`);
      }

      // 4. Provision Employees (generate passwords & send emails)
      if (dbId) {
        console.log(`[FRONTEND LOG] 👉 Step 4: Provisioning Employees into Database '${dbId}'...`);
        // Notice it reads the new tokens now internally
        const provRes = await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/companies/${globalCompanyId}/databases/${dbId}/provision`);
        console.log(`[FRONTEND LOG] ✅ Step 4 Success: Provisioning Complete. Stats:`, provRes.data);
      }

      // Clear localstorage auth cache so next visitor starts fresh
      localStorage.removeItem('botivate_onboarding_company');
      localStorage.removeItem('botivate_google_connected');
      localStorage.removeItem('botivate_onboarding_form');

      console.log("[FRONTEND LOG] 🏁 Onboarding Process Finished smoothly!");
      toast.success('Company registered and workspace ready!');
      navigate('/login');
    } catch (error) {
      console.error("[FRONTEND ERROR]", error);
      const msg = error.response?.data?.detail || 'Configuration failed. Check backend logs.';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-layout fade-in">
      <div className="auth-wrapper" style={{ maxWidth: '500px' }}>
        <div className="auth-card">
          <h1>Company Onboarding</h1>
          <p className="subtitle">
            {step === 1 ? 'Step 1: Basic Information' : 'Step 2: Connect Resources'}
          </p>

          <form className="auth-form" onSubmit={step === 2 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }}>
            {step === 1 ? (
              <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div className="form-group">
                  <label>Company Name</label>
                  <div style={{ position: 'relative' }}>
                    <FiBriefcase style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
                    <input
                      type="text"
                      className="input-field"
                      style={{ paddingLeft: '2.5rem' }}
                      placeholder="e.g. Acme Corp"
                      value={formData.companyName}
                      onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Industry (Optional)</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. Technology"
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>HR Admin Name</label>
                  <div style={{ position: 'relative' }}>
                    <FiUser style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
                    <input
                      type="text"
                      className="input-field"
                      style={{ paddingLeft: '2.5rem' }}
                      placeholder="Jane Doe"
                      value={formData.contactName}
                      onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>HR Admin Email</label>
                  <div style={{ position: 'relative' }}>
                    <FiMail style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
                    <input
                      type="email"
                      className="input-field"
                      style={{ paddingLeft: '2.5rem' }}
                      placeholder="admin@company.com"
                      value={formData.contactEmail}
                      onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-actions">
                  <button type="button" onClick={handleNext} className="btn btn-primary btn-full" disabled={isLoading}>
                    {isLoading ? "Configurando..." : "Next Step"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                {/* ── THE GOOGLE IDENTITY SECTION ── */}
                <div className="form-group" style={{
                  background: googleConnected ? 'rgba(34, 197, 94, 0.05)' : 'var(--bg-secondary)',
                  padding: '1.5rem',
                  borderRadius: '12px',
                  border: googleConnected ? '1px solid var(--success)' : '1px dashed var(--border-color)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center'
                }}>
                  {!googleConnected ? (
                    <>
                      <h3 style={{ margin: '0 0 0.5rem 0' }}>Step 2A: Grant Data Access</h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                        Botivate needs secure permission to read/write your company's Database (Google Sheets) and send emails on your behalf.
                      </p>

                      <button type="button" onClick={handleGoogleOAuth} style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        padding: '10px 20px', borderRadius: '8px', border: '1px solid #ddd',
                        background: 'white', color: '#444', fontWeight: 'bold', cursor: 'pointer',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                      }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        Sign in with Google
                      </button>
                    </>
                  ) : (
                    <>
                      <div style={{ background: '#dcfce7', color: '#166534', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', marginBottom: '10px' }}>✓</div>
                      <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--success)' }}>Workspace Connected</h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>Google integration was successful. Proceed below.</p>
                    </>
                  )}
                </div>

                {googleConnected && (
                  <div className="fade-in-up">
                    <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                      <label>Step 2B: Employee Database (Google Sheets URL)</label>
                      <input
                        type="url"
                        className="input-field"
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        value={formData.dbUrl}
                        onChange={(e) => setFormData({ ...formData, dbUrl: e.target.value })}
                        required
                      />
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>
                        Agent will securely access this sheet automatically.
                      </p>
                    </div>

                    <div className="form-group">
                      <label>Company Policies (Text or PDF/TXT Upload)</label>
                      <textarea
                        className="input-field"
                        rows="3"
                        placeholder="Paste basic policies here..."
                        value={formData.policiesText}
                        onChange={(e) => setFormData({ ...formData, policiesText: e.target.value })}
                        style={{ marginBottom: '0.75rem' }}
                      ></textarea>

                      <div
                        className="file-upload-zone"
                        style={{
                          border: '2px dashed #e2e8f0',
                          borderRadius: '12px',
                          padding: '1.5rem 1rem',
                          textAlign: 'center',
                          cursor: 'pointer',
                          background: formData.policyFile ? '#f0f9ff' : '#f8fafc',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}
                        onClick={() => document.getElementById('policy-file-input').click()}
                      >
                        <input
                          id="policy-file-input"
                          type="file"
                          accept=".pdf,.txt,.md"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            if (e.target.files[0]) {
                              setFormData({ ...formData, policyFile: e.target.files[0] });
                            }
                          }}
                        />
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          background: formData.policyFile ? '#0ea5e9' : '#e2e8f0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          marginBottom: '0.25rem'
                        }}>
                          <FiUploadCloud size={20} />
                        </div>
                        <div>
                          <p style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>
                            {formData.policyFile ? 'File Selected' : 'Upload Policy File'}
                          </p>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
                            {formData.policyFile ? formData.policyFile.name : 'PDF or TXT file allowed'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                      <button type="button" onClick={() => {
                        localStorage.removeItem('botivate_onboarding_company');
                        localStorage.removeItem('botivate_google_connected');
                        localStorage.removeItem('botivate_onboarding_form');
                        setGlobalCompanyId(null);
                        setGoogleConnected(false);
                        setStep(1);
                        setFormData({
                          companyName: '', industry: '', contactName: '',
                          contactEmail: '', policiesText: '', dbUrl: '', policyFile: null
                        });
                      }} className="btn btn-secondary" style={{ flex: 1, backgroundColor: '#fef2f2', color: '#dc2626', borderColor: '#fca5a5' }}>
                        Restart (Cancel)
                      </button>
                      <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={isLoading}>
                        {isLoading ? 'Setting up Workspace...' : 'Finalize Integration'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </form>

          <div className="auth-footer text-center">
            <p>Already have an account? <Link to="/login">Sign in</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
}
