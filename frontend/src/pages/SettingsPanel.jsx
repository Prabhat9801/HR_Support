import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiUploadCloud, FiFileText, FiDatabase, FiPlus, FiTrash2, FiRefreshCw, FiSettings, FiEdit, FiUser, FiX, FiCheck } from 'react-icons/fi';

export default function SettingsPanel({ userInfo }) {
  const [policies, setPolicies] = useState([]);
  const [databases, setDatabases] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [editFormData, setEditFormData] = useState({});

  // Add Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addFormData, setAddFormData] = useState({});

  // Policy Form
  const [newPolicyTitle, setNewPolicyTitle] = useState('');
  const [newPolicyContent, setNewPolicyContent] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  // New DB Form
  const [newDbUrl, setNewDbUrl] = useState('');

  const companyId = userInfo.company_id;
  const token = localStorage.getItem('auth_token');

  const fetchData = async () => {
    try {
      const [polRes, dbRes] = await Promise.all([
        axios.get(`http://localhost:8000/api/companies/${companyId}/policies`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`http://localhost:8000/api/companies/${companyId}/databases`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      setPolicies(polRes.data);
      setDatabases(dbRes.data);
      fetchEmployeeData();
    } catch (error) {
      console.error("[FRONTEND ERROR] Failed to fetch settings data:", error);
      toast.error("Could not load company settings details");
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployeeData = async () => {
    setTableLoading(true);
    try {
      const res = await axios.get(`http://localhost:8000/api/companies/${companyId}/employee-data`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEmployees(res.data);
    } catch (error) {
      console.error("[FRONTEND ERROR] Failed to fetch employee data:", error);
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUploadDocument = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
        toast.error("No file selected!");
        return;
    }
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("title", selectedFile.name);
    formData.append("description", `Uploaded by HR Admin (${userInfo.employee_name})`);

    try {
      toast.loading("Uploading document...", { id: "docPol" });
      await axios.post(`http://localhost:8000/api/companies/${companyId}/policies/document`, formData, {
        headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
        }
      });
      
      toast.success("Document Policy Uploaded Successfully", { id: "docPol" });
      setSelectedFile(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to upload document", { id: "docPol" });
    }
  };

  const handleDeletePolicy = async (policyId) => {
    if(!window.confirm("Are you sure you want to delete this policy?")) return;
    try {
        toast.loading("Deleting...", { id: "delPol" });
        await axios.delete(`http://localhost:8000/api/companies/${companyId}/policies/${policyId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        toast.success("Policy deleted", { id: "delPol" });
        fetchData();
    } catch(err) {
        toast.error("Delete failed.", { id: "delPol" });
    }
  };

  const openEditModal = (emp) => {
    setEditingEmployee(emp);
    setEditFormData({ ...emp });
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    const primaryKeyCol = databases[0]?.schema_map?.primary_key || 'Employee ID';
    const empId = editingEmployee[primaryKeyCol];

    try {
      toast.loading("Updating records...", { id: 'editEmp' });
      await axios.post(`http://localhost:8000/api/companies/${companyId}/employee-data/update`, {
          employee_id: empId,
          updates: editFormData
      }, {
          headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Employee data updated in Google Sheet!", { id: 'editEmp' });
      setIsEditModalOpen(false);
      fetchEmployeeData();
    } catch (error) {
      toast.error("Failed to update record", { id: 'editEmp' });
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    try {
      toast.loading("Adding new employee...", { id: 'addEmp' });
      await axios.post(`http://localhost:8000/api/companies/${companyId}/employee-data/create`, addFormData, {
          headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("New employee added to Google Sheet!", { id: 'addEmp' });
      setIsAddModalOpen(false);
      setAddFormData({});
      fetchEmployeeData();
    } catch (error) {
      toast.error("Failed to add employee", { id: 'addEmp' });
    }
  };

  const openAddModal = () => {
    const headers = getAllHeaders();
    const initialData = {};
    headers.forEach(h => initialData[h] = "");
    
    // Auto ID generation helper logic for placeholder
    const primaryKeyCol = databases[0]?.schema_map?.primary_key || 'Employee ID';
    if (employees.length > 0) {
      let maxNum = 0;
      employees.forEach(emp => {
        const match = String(emp[primaryKeyCol]).match(/\d+/);
        if (match) maxNum = Math.max(maxNum, parseInt(match[0]));
      });
      initialData[primaryKeyCol] = `EMP${String(maxNum + 1).padStart(3, '0')}`;
    } else {
      initialData[primaryKeyCol] = "EMP001";
    }

    setAddFormData(initialData);
    setIsAddModalOpen(true);
  };

  const dropdownOptions = {
    'Employee Status': ['Active', 'Pending', 'Inactive', 'Closed'],
    'Employment Type': ['Full-time', 'Part-time', 'Contract', 'Intern'],
    'Role': ['Employee', 'Manager', 'HR', 'CEO', 'Admin'],
    'Department': ['IT', 'HR', 'Finance', 'Operations', 'Sales', 'Marketing', 'Customer Support'],
    'Performance Rating (1-5)': ['1', '2', '3', '4', '5'],
    'User Role': ['EMPLOYEE', 'MANAGER', 'HR', 'CEO', 'ADMIN']
  };

  const renderField = (key, value, setter, disabled = false) => {
    const options = dropdownOptions[key];
    if (options) {
      return (
        <select 
          value={value || ''} 
          onChange={e => setter(e.target.value)}
          className="input-field"
          style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '10px', fontSize: '0.9rem', width: '100%' }}
        >
          <option value="">Select {key}</option>
          {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      );
    }
    return (
      <input 
        type="text" 
        value={value || ''} 
        onChange={e => setter(e.target.value)}
        className="input-field"
        style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '10px', fontSize: '0.9rem' }}
        disabled={disabled}
      />
    );
  };

  // Get all columns from the sheet dynamically
  const getAllHeaders = () => {
    if (employees.length === 0) return [];
    return Object.keys(employees[0]);
  };

  return (
    <div className="settings-panel" style={{ padding: '2rem', width: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.8rem', fontSize: '1.75rem' }}>
          <FiSettings style={{ color: 'var(--accent-color)' }} /> Admin Workspace
        </h2>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={openAddModal} className="btn" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--success)', borderColor: 'var(--success)' }}>
            <FiPlus /> New Employee
          </button>
          <button onClick={fetchEmployeeData} className="btn-secondary" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <FiRefreshCw className={tableLoading ? 'spin' : ''} /> Sync Data
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '4rem', textAlign: 'center' }}>
          <div className="dot-typing" style={{ margin: '0 auto' }}></div>
          <p style={{ marginTop: '1rem', color: 'var(--text-tertiary)' }}>Syncing with Google Sheets...</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Employee Master Data Table */}
          <section className="glass fade-in" style={{ padding: '1.5rem', borderRadius: '16px' }}>
            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-primary)' }}>
              <FiUser style={{ color: 'var(--brand-primary)' }} /> Employee Master Data (Live from Sheet)
            </h3>
            
            <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead style={{ background: 'linear-gradient(90deg, #f8fafc 0%, #f1f5f9 100%)', color: 'var(--text-secondary)', borderBottom: '2px solid var(--border-color)' }}>
                  <tr>
                    <th style={{ padding: '1.25rem 1rem', textAlign: 'center', whiteSpace: 'nowrap', fontWeight: '700', color: 'var(--accent-color)' }}>Action</th>
                    {getAllHeaders().map(h => <th key={h} style={{ padding: '1.25rem 1rem', textAlign: 'left', fontWeight: '700', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.5px' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {tableLoading ? (
                    <tr><td colSpan={50} style={{ padding: '3rem', textAlign: 'center' }}>Refreshing live data...</td></tr>
                  ) : employees.length === 0 ? (
                    <tr><td colSpan={50} style={{ padding: '3rem', textAlign: 'center' }}>No data found in connected sheet.</td></tr>
                  ) : employees.map((emp, idx) => (
                    <tr key={idx} style={{ borderTop: '1px solid var(--border-color)', transition: 'background 0.2s' }} className="table-row-hover">
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <button onClick={() => openEditModal(emp)} className="btn-icon" style={{ color: 'var(--accent-color)', background: 'var(--accent-light)', padding: '6px', borderRadius: '8px' }}>
                          <FiEdit size={16} />
                        </button>
                      </td>
                      {getAllHeaders().map(h => (
                        <td key={h} style={{ padding: '1rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                          {h.toLowerCase().includes('status') ? (
                            <span style={{ 
                              padding: '2px 8px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 'bold',
                              background: String(emp[h]).toLowerCase() === 'active' ? 'var(--accent-light)' : 'rgba(0,0,0,0.05)',
                              color: String(emp[h]).toLowerCase() === 'active' ? 'var(--accent-color)' : 'var(--text-tertiary)'
                            }}>
                              {emp[h]}
                            </span>
                          ) : emp[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            {/* Column 1: Policies Management */}
            <div className="section glass" style={{ padding: '1.5rem', borderRadius: '16px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: 'var(--text-primary)' }}>
                  <FiFileText style={{ color: 'var(--warning)' }} /> Policies & Documents
              </h3>
              
              <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                {policies.length === 0 ? <p style={{ color: 'var(--text-tertiary)' }}>No policies added.</p> : 
                  policies.map(pol => (
                      <div key={pol.id} className="policy-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderRadius: '10px', background: 'white', border: '1px solid var(--border-color)'}}>
                          <div>
                              <strong style={{ display: 'block', fontSize: '0.95rem' }}>{pol.title}</strong>
                              <small style={{ color: 'var(--text-tertiary)' }}>{pol.policy_type.toUpperCase()}</small>
                          </div>
                          <button onClick={() => handleDeletePolicy(pol.id)} className="btn-icon-danger">
                              <FiTrash2 size={16} />
                          </button>
                      </div>
                  ))
                }
              </div>

              {/* Upload Form */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ padding: '1rem', borderRadius: '12px', border: '2px dashed var(--border-color)', textAlign: 'center' }}>
                  <input type="file" id="file-upload" onChange={e => setSelectedFile(e.target.files[0])} style={{ display: 'none' }} />
                  <label htmlFor="file-upload" style={{ cursor: 'pointer', display: 'block' }}>
                    <FiUploadCloud size={32} style={{ color: 'var(--accent-color)', marginBottom: '0.5rem' }} />
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{selectedFile ? selectedFile.name : 'Click to upload PDF Policy'}</p>
                  </label>
                  {selectedFile && <button onClick={handleUploadDocument} className="btn" style={{ marginTop: '0.5rem', width: '100%' }}>Send Document</button>}
                </div>
              </div>
            </div>

            {/* Column 2: DB Settings */}
            <div className="section glass" style={{ padding: '1.5rem', borderRadius: '16px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: 'var(--text-primary)' }}>
                  <FiDatabase style={{ color: 'var(--success)' }} /> Sheet Connections
              </h3>
              
              {databases.map(db => (
                  <div key={db.id} style={{ padding: '1rem', borderRadius: '12px', background: 'white', border: '1px solid var(--border-color)', marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <strong>{db.title}</strong>
                        <span className="badge-active">ACTIVE</span>
                      </div>
                      <code style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', wordBreak: 'break-all' }}>ID: {db.connection_config?.spreadsheet_id}</code>
                  </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {isEditModalOpen && (
        <div className="modal-overlay fade-in" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(5px)', zIndex: 2000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="modal-content glass fade-in-up" style={{ width: '850px', maxHeight: '90vh', background: 'white', borderRadius: '24px', padding: '0', boxShadow: 'var(--shadow-2xl)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ background: 'var(--accent-light)', padding: '10px', borderRadius: '12px' }}>
                  <FiUser color="var(--accent-color)" size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Edit Employee Profile</h3>
                  <small style={{ color: 'var(--text-tertiary)' }}>Updates will be pushed instantly to Google Sheet</small>
                </div>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FiX size={20} /></button>
            </div>
            
            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <div style={{ padding: '2rem', overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', background: '#fcfcfc' }}>
                {getAllHeaders().map(key => (
                  <div key={key}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{key}</label>
                    {renderField(key, editFormData[key], (val) => setEditFormData({...editFormData, [key]: val}), key === (databases[0]?.schema_map?.primary_key || 'Employee ID'))}
                  </div>
                ))}
              </div>
              
              <div style={{ padding: '1.5rem 2rem', borderTop: '1px solid var(--border-color)', background: '#f8fafc', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="btn-secondary" style={{ 
                  padding: '0.75rem 2rem', 
                  borderRadius: '12px',
                  fontWeight: '600',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-color)',
                  background: 'white'
                }}>Discard</button>
                <button type="submit" className="btn" style={{ 
                  padding: '0.75rem 2.5rem', 
                  display: 'flex', 
                  justifyContent: 'center', 
                  gap: '0.75rem', 
                  alignItems: 'center', 
                  fontWeight: '600',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, var(--accent-color) 0%, #1d4ed8 100%)',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)',
                  border: 'none',
                  color: 'white'
                }}>
                  <FiCheck size={18} /> Save Changes to Sheet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      {isAddModalOpen && (
        <div className="modal-overlay fade-in" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(5px)', zIndex: 2000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="modal-content glass fade-in-up" style={{ width: '850px', maxHeight: '90vh', background: 'white', borderRadius: '24px', padding: '0', boxShadow: 'var(--shadow-2xl)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ background: 'rgba(34, 197, 94, 0.1)', padding: '10px', borderRadius: '12px' }}>
                  <FiPlus color="var(--success)" size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Add New Employee</h3>
                  <small style={{ color: 'var(--text-tertiary)' }}>This will add a new row to your Google Sheet</small>
                </div>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FiX size={20} /></button>
            </div>
            
            <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <div style={{ padding: '2rem', overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', background: '#fcfcfc' }}>
                {getAllHeaders().map(key => (
                  <div key={key}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{key}</label>
                    {renderField(key, addFormData[key], (val) => setAddFormData({...addFormData, [key]: val}), key === (databases[0]?.schema_map?.primary_key || 'Employee ID'))}
                  </div>
                ))}
              </div>
              
              <div style={{ padding: '1.5rem 2rem', borderTop: '1px solid var(--border-color)', background: '#f8fafc', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="btn-secondary" style={{ 
                  padding: '0.75rem 2rem', 
                  borderRadius: '12px',
                  fontWeight: '600',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-color)',
                  background: 'white'
                }}>Cancel</button>
                <button type="submit" className="btn" style={{ 
                  padding: '0.75rem 2.5rem', 
                  display: 'flex', 
                  justifyContent: 'center', 
                  gap: '0.75rem', 
                  alignItems: 'center', 
                  fontWeight: '600',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, var(--success) 0%, #15803d 100%)',
                  boxShadow: '0 4px 12px rgba(34, 197, 94, 0.2)',
                  border: 'none',
                  color: 'white'
                }}>
                  <FiCheck size={18} /> Add to Sheet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .table-row-hover:hover { background-color: rgba(37, 99, 235, 0.02); }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .badge-active { background: var(--success); color: white; padding: 2px 8px; borderRadius: 20px; fontSize: 0.7rem; fontWeight: bold; }
        .btn-icon-danger:hover { color: var(--error); transform: scale(1.1); transition: all 0.2s; }
      `}</style>
    </div>
  );
}

