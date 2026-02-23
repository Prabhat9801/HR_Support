import React, { useState } from 'react';
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
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleNext = () => {
    if (step === 1 && (!formData.companyName || !formData.contactEmail)) {
      toast.error('Please fill required fields.');
      return;
    }
    setStep(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    console.log("[FRONTEND LOG] 🚀 Starting Company Onboarding/Registration Process...");
    
    try {
      // 1. Register Company
      const companyPayload = {
        name: formData.companyName,
        industry: formData.industry,
        hr_name: formData.contactName,
        hr_email: formData.contactEmail
      };
      console.log(`[FRONTEND LOG] 👉 Step 1: Registering Company with payload:`, companyPayload);
      const compRes = await axios.post('http://localhost:8000/api/companies/register', companyPayload);
      const companyId = compRes.data.id;
      console.log(`[FRONTEND LOG] ✅ Step 1 Success: Company created. ID: '${companyId}'`);

      // 2. Add Database Connection
      let dbId = null;
      if (formData.dbUrl) {
         console.log(`[FRONTEND LOG] 👉 Step 2: Attaching Google Sheet DB:`, formData.dbUrl);
         const dbRes = await axios.post(`http://localhost:8000/api/companies/${companyId}/databases`, {
           title: "Primary Employee DB",
           db_type: "google_sheets",
           connection_config: { spreadsheet_id: formData.dbUrl }
         });
         dbId = dbRes.data.id;
         console.log(`[FRONTEND LOG] ✅ Step 2 Success: DB Attached. ID: '${dbId}'`);
      } else {
         console.log(`[FRONTEND LOG] ⏭️ Step 2 Skipped: No Google Sheet URL provided.`);
      }

      // 3. Upload Policies (Text or Document)
      if (formData.policiesText.trim()) {
         console.log(`[FRONTEND LOG] 👉 Step 3a: Uploading Text Policy...`);
         await axios.post(`http://localhost:8000/api/companies/${companyId}/policies/text`, {
           title: "General HR Policies",
           policy_type: "text",
           content: formData.policiesText
         });
         console.log(`[FRONTEND LOG] ✅ Step 3a Success: Text Policies Attached.`);
      }

      if (formData.policyFile) {
        console.log(`[FRONTEND LOG] 👉 Step 3b: Uploading Document Policy:`, formData.policyFile.name);
        const policyFormData = new FormData();
        policyFormData.append('title', formData.policyFile.name);
        policyFormData.append('description', 'Uploaded during onboarding');
        policyFormData.append('file', formData.policyFile);

        await axios.post(`http://localhost:8000/api/companies/${companyId}/policies/document`, policyFormData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        console.log(`[FRONTEND LOG] ✅ Step 3b Success: Document Policy Uploaded.`);
      }

      if (!formData.policiesText.trim() && !formData.policyFile) {
         console.log(`[FRONTEND LOG] ⏭️ Step 3 Skipped: No Policies provided.`);
      }

      // 4. Provision Employees (generate passwords & send emails)
      if (dbId) {
         console.log(`[FRONTEND LOG] 👉 Step 4: Provisioning Employees into Database '${dbId}'...`);
         const provRes = await axios.post(`http://localhost:8000/api/companies/${companyId}/databases/${dbId}/provision`);
         console.log(`[FRONTEND LOG] ✅ Step 4 Success: Provisioning Complete. Stats:`, provRes.data);
      }

      console.log("[FRONTEND LOG] 🏁 Onboarding Process Finished smoothly!");
      toast.success('Company registered and workspace ready!');
      navigate('/login');
    } catch (error) {
      console.error("[FRONTEND ERROR] ❌ Onboarding Failed at some step:", error);
      console.error("[FRONTEND ERROR] Response Error Data:", error.response?.data);
      const msg = error.response?.data?.detail || 'Registration failed. Please check inputs and server logs.';
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
                      onChange={(e) => setFormData({...formData, companyName: e.target.value})}
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
                    onChange={(e) => setFormData({...formData, industry: e.target.value})}
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
                      onChange={(e) => setFormData({...formData, contactName: e.target.value})}
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
                      onChange={(e) => setFormData({...formData, contactEmail: e.target.value})}
                      required
                    />
                  </div>
                </div>

                <div className="form-actions">
                  <button type="button" onClick={handleNext} className="btn btn-primary btn-full">
                    Next Step
                  </button>
                </div>
              </div>
            ) : (
              <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div className="form-group">
                  <label>Employee Database (Google Sheets URL)</label>
                  <input
                    type="url"
                    className="input-field"
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    value={formData.dbUrl}
                    onChange={(e) => setFormData({...formData, dbUrl: e.target.value})}
                    required
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>
                    Agent will automatically analyze columns and create schemas.
                  </p>
                </div>

                <div className="form-group">
                  <label>Company Policies (Text or PDF/TXT Upload)</label>
                  <textarea
                    className="input-field"
                    rows="3"
                    placeholder="Paste basic policies here..."
                    value={formData.policiesText}
                    onChange={(e) => setFormData({...formData, policiesText: e.target.value})}
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
                    onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--brand-primary)'}
                    onMouseOut={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
                    onClick={() => document.getElementById('policy-file-input').click()}
                  >
                    <input 
                      id="policy-file-input"
                      type="file" 
                      accept=".pdf,.txt,.md"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        if (e.target.files[0]) {
                          setFormData({...formData, policyFile: e.target.files[0]});
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
                        {formData.policyFile ? formData.policyFile.name : 'Drag & drop or click to browse (PDF, TXT)'}
                      </p>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                  <button type="button" onClick={() => setStep(1)} className="btn btn-secondary" style={{ flex: 1 }}>
                    Back
                  </button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={isLoading}>
                    {isLoading ? 'Setting up Workspace...' : 'Register Company'}
                  </button>
                </div>
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
