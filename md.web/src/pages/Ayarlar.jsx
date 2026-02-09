import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import AutocompleteInput from '../components/AutocompleteInput';
import {
  getSettingsAll,
  getJobRolesConfig,
  createJobRoleConfig,
  updateJobRoleConfig,
  deleteJobRoleConfig,
  getGlassTypes,
  createGlassType,
  deleteGlassType,
  getSuppliersFromAPI,
  updateCompanyInfo,
  // Yeni konfigürasyon API'leri
  getIssueTypes,
  createIssueType,
  updateIssueType,
  deleteIssueType,
  getFaultSources,
  createFaultSource,
  updateFaultSource,
  deleteFaultSource,
  getCancelReasons,
  createCancelReason,
  updateCancelReason,
  deleteCancelReason,
  getDelayReasons,
  createDelayReason,
  updateDelayReason,
  deleteDelayReason,
} from '../services/dataService';

const TABS = [
  { id: 'company', label: 'Şirket Bilgileri', icon: '🏢' },
  { id: 'general', label: 'Genel Ayarlar', icon: '⚙️' },
  { id: 'jobRoles', label: 'İş Kolları', icon: '🏭' },
  { id: 'glassTypes', label: 'Cam Tipleri', icon: '🪟' },
  { id: 'issueTypes', label: 'Sorun Tipleri', icon: '⚠️' },
  { id: 'faultSources', label: 'Hata Kaynakları', icon: '🔍' },
  { id: 'cancelReasons', label: 'İptal Nedenleri', icon: '❌' },
  { id: 'delayReasons', label: 'Gecikme Nedenleri', icon: '⏰' },
];

const PRODUCTION_TYPES = [
  { value: 'internal', label: 'İç Üretim', color: 'var(--success)' },
  { value: 'external', label: 'Dış Sipariş', color: 'var(--warning)' },
];

const Ayarlar = () => {
  const [activeTab, setActiveTab] = useState('company');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Data
  const [settings, setSettings] = useState({});
  const [jobRoles, setJobRoles] = useState([]);
  const [glassTypes, setGlassTypes] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  
  // Şirket Bilgileri
  const [companyInfo, setCompanyInfo] = useState({
    name: '',
    logo: null,
    logoUrl: '',
    address: '',
    city: '',
    phone: '',
    phone2: '',
    email: '',
    website: '',
    taxOffice: '',
    taxNumber: '',
    iban: '',
  });
  const [companySaving, setCompanySaving] = useState(false);
  
  // Modal
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    productionType: 'internal',
    requiresGlass: false,
    defaultGlassSupplier: null,
    defaultSupplier: null,
    estimatedDays: 5,
    active: true,
    assemblyStages: [],  // Montaj aşamaları
  });
  
  const [showGlassModal, setShowGlassModal] = useState(false);
  const [glassForm, setGlassForm] = useState({ name: '', code: '' });
  
  // Yeni konfigürasyon verileri
  const [issueTypes, setIssueTypes] = useState([]);
  const [faultSources, setFaultSources] = useState([]);
  const [cancelReasons, setCancelReasons] = useState([]);
  const [delayReasons, setDelayReasons] = useState([]);
  
  // Config Item Modal (genel kullanım)
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configModalType, setConfigModalType] = useState(''); // issueTypes, faultSources, cancelReasons, delayReasons
  const [editingConfigItem, setEditingConfigItem] = useState(null);
  const [configForm, setConfigForm] = useState({ name: '', icon: '' });
  
  const [actionLoading, setActionLoading] = useState(false);

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      
      const [settingsData, rolesData, glassData, suppliersData, issueTypesData, faultSourcesData, cancelReasonsData, delayReasonsData] = await Promise.all([
        getSettingsAll(),
        getJobRolesConfig(),
        getGlassTypes(),
        getSuppliersFromAPI(),
        getIssueTypes(),
        getFaultSources(),
        getCancelReasons(),
        getDelayReasons(),
      ]);
      
      setSettings(settingsData);
      setJobRoles(rolesData || []);
      setGlassTypes(glassData || []);
      setSuppliers(suppliersData || []);
      setIssueTypes(issueTypesData || []);
      setFaultSources(faultSourcesData || []);
      setCancelReasons(cancelReasonsData || []);
      setDelayReasons(delayReasonsData || []);
      
      // Şirket bilgilerini yükle
      if (settingsData.company) {
        setCompanyInfo(prev => ({ ...prev, ...settingsData.company }));
      }
    } catch (err) {
      setError(err.message || 'Ayarlar alınamadı');
    } finally {
      setLoading(false);
    }
  };

  // Job Role CRUD
  const openRoleModal = (role = null) => {
    if (role) {
      setEditingRole(role);
      setRoleForm({
        name: role.name || '',
        description: role.description || '',
        productionType: role.productionType || 'internal',
        requiresGlass: role.requiresGlass || false,
        defaultGlassSupplier: role.defaultGlassSupplier || null,
        defaultSupplier: role.defaultSupplier || null,
        estimatedDays: role.estimatedDays || 5,
        active: role.active !== false,
        assemblyStages: role.assemblyStages || [],
      });
    } else {
      setEditingRole(null);
      setRoleForm({
        name: '',
        description: '',
        productionType: 'internal',
        requiresGlass: false,
        defaultGlassSupplier: null,
        defaultSupplier: null,
        estimatedDays: 5,
        active: true,
        assemblyStages: [],
      });
    }
    setShowRoleModal(true);
  };

  const saveRole = async () => {
    if (!roleForm.name.trim()) {
      alert('İş kolu adı gerekli');
      return;
    }
    
    try {
      setActionLoading(true);
      if (editingRole) {
        await updateJobRoleConfig(editingRole.id, roleForm);
      } else {
        await createJobRoleConfig(roleForm);
      }
      await loadData();
      setShowRoleModal(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const deleteRole = async (roleId) => {
    if (!confirm('Bu iş kolunu pasif yapmak istediğinize emin misiniz?')) return;
    
    try {
      setActionLoading(true);
      await deleteJobRoleConfig(roleId);
      await loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Glass Type CRUD
  const saveGlassType = async () => {
    if (!glassForm.name.trim() || !glassForm.code.trim()) {
      alert('Cam adı ve kodu gerekli');
      return;
    }
    
    try {
      setActionLoading(true);
      await createGlassType(glassForm);
      await loadData();
      setShowGlassModal(false);
      setGlassForm({ name: '', code: '' });
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const removeGlassType = async (glassId) => {
    if (!confirm('Bu cam tipini silmek istediğinize emin misiniz?')) return;
    
    try {
      setActionLoading(true);
      await deleteGlassType(glassId);
      await loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Config Item CRUD (Sorun Tipleri, Hata Kaynakları, İptal Nedenleri, Gecikme Nedenleri)
  const openConfigModal = (type, item = null) => {
    setConfigModalType(type);
    setEditingConfigItem(item);
    setConfigForm({
      name: item?.name || '',
      icon: item?.icon || '',
    });
    setShowConfigModal(true);
  };

  const getConfigTitle = (type) => {
    switch (type) {
      case 'issueTypes': return 'Sorun Tipi';
      case 'faultSources': return 'Hata Kaynağı';
      case 'cancelReasons': return 'İptal Nedeni';
      case 'delayReasons': return 'Gecikme Nedeni';
      default: return 'Ayar';
    }
  };

  const saveConfigItem = async () => {
    if (!configForm.name.trim()) {
      alert('İsim gerekli');
      return;
    }
    
    try {
      setActionLoading(true);
      const payload = { name: configForm.name, icon: configForm.icon || null };
      
      if (editingConfigItem) {
        // Güncelleme
        switch (configModalType) {
          case 'issueTypes': await updateIssueType(editingConfigItem.id, payload); break;
          case 'faultSources': await updateFaultSource(editingConfigItem.id, payload); break;
          case 'cancelReasons': await updateCancelReason(editingConfigItem.id, payload); break;
          case 'delayReasons': await updateDelayReason(editingConfigItem.id, payload); break;
        }
      } else {
        // Yeni oluşturma
        switch (configModalType) {
          case 'issueTypes': await createIssueType(payload); break;
          case 'faultSources': await createFaultSource(payload); break;
          case 'cancelReasons': await createCancelReason(payload); break;
          case 'delayReasons': await createDelayReason(payload); break;
        }
      }
      
      await loadData();
      setShowConfigModal(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const deleteConfigItem = async (type, itemId) => {
    if (!confirm('Bu kaydı silmek istediğinize emin misiniz?')) return;
    
    try {
      setActionLoading(true);
      switch (type) {
        case 'issueTypes': await deleteIssueType(itemId); break;
        case 'faultSources': await deleteFaultSource(itemId); break;
        case 'cancelReasons': await deleteCancelReason(itemId); break;
        case 'delayReasons': await deleteDelayReason(itemId); break;
      }
      await loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Render
  if (loading) {
    return (
      <div>
        <PageHeader title="Ayarlar" subtitle="Sistem ve iş kolu yapılandırması" />
        <div className="card subtle-card">Ayarlar yükleniyor...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Ayarlar" subtitle="Sistem ve iş kolu yapılandırması" />
        <div className="card error-card">
          <div className="error-title">Ayarlar alınamadı</div>
          <div className="error-message">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Ayarlar" subtitle="Sistem ve iş kolu yapılandırması" />

      {/* Tab Navigation */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem' }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab(tab.id)}
              style={{ flex: 1 }}
            >
              <span style={{ marginRight: '0.5rem' }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Company Info */}
      {activeTab === 'company' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 className="card-title">🏢 Şirket Bilgileri</h3>
              <p className="text-muted" style={{ margin: 0, fontSize: 12 }}>PDF ve belgelerde kullanılacak şirket bilgileri</p>
            </div>
            <button 
              className="btn btn-primary" 
              onClick={async () => {
                try {
                  setCompanySaving(true);
                  await updateCompanyInfo(companyInfo);
                  alert('Şirket bilgileri kaydedildi!');
                } catch (err) {
                  alert('Hata: ' + (err.message || 'Kaydedilemedi'));
                } finally {
                  setCompanySaving(false);
                }
              }}
              disabled={companySaving}
            >
              {companySaving ? 'Kaydediliyor...' : '💾 Kaydet'}
            </button>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              {/* Sol Kolon */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Şirket Adı *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={companyInfo.name || ''}
                    onChange={(e) => setCompanyInfo(p => ({ ...p, name: e.target.value }))}
                    placeholder="ABC PVC Sistemleri Ltd. Şti."
                  />
                </div>
                
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Adres</label>
                  <textarea
                    className="form-input"
                    value={companyInfo.address || ''}
                    onChange={(e) => setCompanyInfo(p => ({ ...p, address: e.target.value }))}
                    placeholder="Sanayi Mahallesi, 123. Sokak No:45"
                    rows={2}
                  />
                </div>
                
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Şehir / İlçe</label>
                  <input
                    type="text"
                    className="form-input"
                    value={companyInfo.city || ''}
                    onChange={(e) => setCompanyInfo(p => ({ ...p, city: e.target.value }))}
                    placeholder="İstanbul / Ümraniye"
                  />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Telefon</label>
                    <input
                      type="text"
                      className="form-input"
                      value={companyInfo.phone || ''}
                      onChange={(e) => setCompanyInfo(p => ({ ...p, phone: e.target.value }))}
                      placeholder="+90 212 555 00 00"
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Telefon 2</label>
                    <input
                      type="text"
                      className="form-input"
                      value={companyInfo.phone2 || ''}
                      onChange={(e) => setCompanyInfo(p => ({ ...p, phone2: e.target.value }))}
                      placeholder="+90 532 555 00 00"
                    />
                  </div>
                </div>
              </div>
              
              {/* Sağ Kolon */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">E-posta</label>
                  <input
                    type="email"
                    className="form-input"
                    value={companyInfo.email || ''}
                    onChange={(e) => setCompanyInfo(p => ({ ...p, email: e.target.value }))}
                    placeholder="info@abcpvc.com"
                  />
                </div>
                
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Web Sitesi</label>
                  <input
                    type="text"
                    className="form-input"
                    value={companyInfo.website || ''}
                    onChange={(e) => setCompanyInfo(p => ({ ...p, website: e.target.value }))}
                    placeholder="www.abcpvc.com"
                  />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Vergi Dairesi</label>
                    <input
                      type="text"
                      className="form-input"
                      value={companyInfo.taxOffice || ''}
                      onChange={(e) => setCompanyInfo(p => ({ ...p, taxOffice: e.target.value }))}
                      placeholder="Ümraniye"
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Vergi No</label>
                    <input
                      type="text"
                      className="form-input"
                      value={companyInfo.taxNumber || ''}
                      onChange={(e) => setCompanyInfo(p => ({ ...p, taxNumber: e.target.value }))}
                      placeholder="1234567890"
                    />
                  </div>
                </div>
                
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">IBAN</label>
                  <input
                    type="text"
                    className="form-input"
                    value={companyInfo.iban || ''}
                    onChange={(e) => setCompanyInfo(p => ({ ...p, iban: e.target.value }))}
                    placeholder="TR00 0000 0000 0000 0000 0000 00"
                  />
                </div>
                
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Logo</label>
                  <div style={{ 
                    border: '2px dashed var(--color-border)', 
                    borderRadius: 8, 
                    padding: 16,
                    textAlign: 'center',
                    background: 'var(--color-bg-secondary)'
                  }}>
                    {companyInfo.logoUrl ? (
                      <div>
                        <img 
                          src={companyInfo.logoUrl} 
                          alt="Logo" 
                          style={{ maxWidth: 150, maxHeight: 80, marginBottom: 8 }}
                        />
                        <br />
                        <button 
                          className="btn btn-danger btn-small"
                          onClick={() => setCompanyInfo(p => ({ ...p, logoUrl: '', logo: null }))}
                        >
                          Logoyu Kaldır
                        </button>
                      </div>
                    ) : (
                      <div className="text-muted">
                        <div style={{ fontSize: 32, marginBottom: 8 }}>🖼️</div>
                        <div style={{ fontSize: 12 }}>Logo yükleme (yakında)</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* General Settings */}
      {activeTab === 'general' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Genel Ayarlar</h3>
          </div>
          <div className="card-body">
            <div className="metric-list">
              {(settings.general || []).map((row) => (
                <div className="metric-row" key={row.id}>
                  <div>
                    <div className="metric-label">{row.label}</div>
                    <div className="page-subtitle">{row.description}</div>
                  </div>
                  <span className={`badge badge-${row.value ? 'success' : 'secondary'}`}>
                    {row.value ? 'Açık' : 'Kapalı'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Job Roles */}
      {activeTab === 'jobRoles' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 className="card-title">İş Kolları Yapılandırması</h3>
              <p className="page-subtitle">Her iş kolunun üretim tipini ve bağımlılıklarını belirleyin</p>
            </div>
            <button className="btn btn-primary" onClick={() => openRoleModal()}>
              + Yeni İş Kolu
            </button>
          </div>
          <div className="card-body">
            <table className="data-table">
              <thead>
                <tr>
                  <th>İş Kolu</th>
                  <th>Üretim Tipi</th>
                  <th>Cam Gerekli</th>
                  <th>Varsayılan Tedarikçi</th>
                  <th>Tahmini Süre</th>
                  <th>Durum</th>
                  <th style={{ width: '100px' }}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {jobRoles.map((role) => {
                  const prodType = PRODUCTION_TYPES.find((pt) => pt.value === role.productionType);
                  const supplier = suppliers.find((s) => s.id === (role.defaultSupplier || role.defaultGlassSupplier));
                  
                  return (
                    <tr key={role.id} style={{ opacity: role.active === false ? 0.5 : 1 }}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{role.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{role.description}</div>
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={{ background: prodType?.color || 'var(--bg-tertiary)', color: '#fff' }}
                        >
                          {prodType?.label || role.productionType}
                        </span>
                      </td>
                      <td>
                        {role.requiresGlass ? (
                          <span className="badge badge-info">🪟 Evet</span>
                        ) : (
                          <span className="badge badge-secondary">Hayır</span>
                        )}
                      </td>
                      <td>
                        {supplier ? supplier.name : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td>{role.estimatedDays} gün</td>
                      <td>
                        <span className={`badge badge-${role.active !== false ? 'success' : 'secondary'}`}>
                          {role.active !== false ? 'Aktif' : 'Pasif'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => openRoleModal(role)}
                            title="Düzenle"
                          >
                            ✏️
                          </button>
                          {role.active !== false && (
                            <button
                              className="btn btn-sm btn-ghost"
                              onClick={() => deleteRole(role.id)}
                              title="Pasif Yap"
                              style={{ color: 'var(--danger)' }}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {jobRoles.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      Henüz iş kolu tanımlanmamış
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Glass Types */}
      {activeTab === 'glassTypes' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 className="card-title">Cam Tipleri</h3>
              <p className="page-subtitle">Cam siparişlerinde kullanılacak cam tiplerini tanımlayın</p>
            </div>
            <button className="btn btn-primary" onClick={() => setShowGlassModal(true)}>
              + Yeni Cam Tipi
            </button>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
              {glassTypes.map((glass) => (
                <div
                  key={glass.id}
                  className="card"
                  style={{ margin: 0, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                >
                  <div className="card-body" style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>🪟 {glass.name}</div>
                        <div className="badge badge-secondary">{glass.code}</div>
                      </div>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => removeGlassType(glass.id)}
                        style={{ color: 'var(--danger)' }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {glassTypes.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  Henüz cam tipi tanımlanmamış
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Issue Types - Sorun Tipleri */}
      {activeTab === 'issueTypes' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 className="card-title">⚠️ Sorun Tipleri</h3>
              <p className="page-subtitle">Montaj ve üretim sorunlarını kategorize etmek için kullanılır</p>
            </div>
            <button className="btn btn-primary" onClick={() => openConfigModal('issueTypes')}>
              + Yeni Sorun Tipi
            </button>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
              {issueTypes.map((item) => (
                <div
                  key={item.id}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: 8,
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>{item.icon || '❓'}</span>
                    <span style={{ fontWeight: 500 }}>{item.name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => openConfigModal('issueTypes', item)}
                      title="Düzenle"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => deleteConfigItem('issueTypes', item.id)}
                      style={{ color: 'var(--danger)' }}
                      title="Sil"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
              {issueTypes.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  Henüz sorun tipi tanımlanmamış
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fault Sources - Hata Kaynakları */}
      {activeTab === 'faultSources' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 className="card-title">🔍 Hata Kaynakları</h3>
              <p className="page-subtitle">Sorunların kaynağını belirlemek için kullanılır (Üretim, Tedarikçi, Ekip vb.)</p>
            </div>
            <button className="btn btn-primary" onClick={() => openConfigModal('faultSources')}>
              + Yeni Hata Kaynağı
            </button>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
              {faultSources.map((item) => (
                <div
                  key={item.id}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: 8,
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{item.name}</span>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => openConfigModal('faultSources', item)}
                      title="Düzenle"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => deleteConfigItem('faultSources', item.id)}
                      style={{ color: 'var(--danger)' }}
                      title="Sil"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
              {faultSources.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  Henüz hata kaynağı tanımlanmamış
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Reasons - İptal Nedenleri */}
      {activeTab === 'cancelReasons' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 className="card-title">❌ İptal Nedenleri</h3>
              <p className="page-subtitle">İş iptal edildiğinde neden seçimi için kullanılır</p>
            </div>
            <button className="btn btn-primary" onClick={() => openConfigModal('cancelReasons')}>
              + Yeni İptal Nedeni
            </button>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
              {cancelReasons.map((item) => (
                <div
                  key={item.id}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: 8,
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{item.name}</span>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => openConfigModal('cancelReasons', item)}
                      title="Düzenle"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => deleteConfigItem('cancelReasons', item.id)}
                      style={{ color: 'var(--danger)' }}
                      title="Sil"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
              {cancelReasons.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  Henüz iptal nedeni tanımlanmamış
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delay Reasons - Gecikme Nedenleri */}
      {activeTab === 'delayReasons' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 className="card-title">⏰ Gecikme Nedenleri</h3>
              <p className="page-subtitle">Üretim veya montaj geciktiğinde neden seçimi için kullanılır</p>
            </div>
            <button className="btn btn-primary" onClick={() => openConfigModal('delayReasons')}>
              + Yeni Gecikme Nedeni
            </button>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
              {delayReasons.map((item) => (
                <div
                  key={item.id}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: 8,
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{item.name}</span>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => openConfigModal('delayReasons', item)}
                      title="Düzenle"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => deleteConfigItem('delayReasons', item.id)}
                      style={{ color: 'var(--danger)' }}
                      title="Sil"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
              {delayReasons.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  Henüz gecikme nedeni tanımlanmamış
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Job Role Modal */}
      <Modal
        isOpen={showRoleModal}
        onClose={() => setShowRoleModal(false)}
        title={editingRole ? 'İş Kolu Düzenle' : 'Yeni İş Kolu'}
        size="medium"
      >
        <div className="form-grid">
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">İş Kolu Adı *</label>
            <input
              type="text"
              className="form-input"
              value={roleForm.name}
              onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
              placeholder="Örn: PVC Doğrama"
            />
          </div>
          
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Açıklama</label>
            <input
              type="text"
              className="form-input"
              value={roleForm.description}
              onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
              placeholder="Kısa açıklama"
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Üretim Tipi *</label>
            <select
              className="form-select"
              value={roleForm.productionType}
              onChange={(e) => setRoleForm({ ...roleForm, productionType: e.target.value })}
            >
              {PRODUCTION_TYPES.map((pt) => (
                <option key={pt.value} value={pt.value}>
                  {pt.label}
                </option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label className="form-label">Tahmini Üretim Süresi (gün)</label>
            <input
              type="number"
              className="form-input"
              value={roleForm.estimatedDays}
              onChange={(e) => setRoleForm({ ...roleForm, estimatedDays: parseInt(e.target.value) || 5 })}
              min={1}
            />
          </div>
          
          {roleForm.productionType === 'internal' && (
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={roleForm.requiresGlass}
                  onChange={(e) => setRoleForm({ ...roleForm, requiresGlass: e.target.checked })}
                />
                Cam bağımlılığı var (Dışarıdan cam siparişi gerekir)
              </label>
            </div>
          )}
          
          {roleForm.productionType === 'internal' && roleForm.requiresGlass && (
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Varsayılan Cam Tedarikçisi</label>
              <AutocompleteInput
                value={roleForm.defaultGlassSupplier || ''}
                onChange={(val) => setRoleForm({ ...roleForm, defaultGlassSupplier: val })}
                options={suppliers}
                displayKey="name"
                valueKey="id"
                placeholder="Tedarikçi ara..."
                onSelect={(supplier) => setRoleForm({ ...roleForm, defaultGlassSupplier: supplier?.id || null })}
              />
            </div>
          )}
          
          {roleForm.productionType === 'external' && (
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Varsayılan Tedarikçi</label>
              <AutocompleteInput
                value={roleForm.defaultSupplier || ''}
                onChange={(val) => setRoleForm({ ...roleForm, defaultSupplier: val })}
                options={suppliers}
                displayKey="name"
                valueKey="id"
                placeholder="Tedarikçi ara..."
                onSelect={(supplier) => setRoleForm({ ...roleForm, defaultSupplier: supplier?.id || null })}
              />
            </div>
          )}
          
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={roleForm.active}
                onChange={(e) => setRoleForm({ ...roleForm, active: e.target.checked })}
              />
              Aktif (İş oluştururken seçilebilir)
            </label>
          </div>
          
          {/* Montaj Aşamaları */}
          <div className="form-group" style={{ gridColumn: '1 / -1', marginTop: '1rem' }}>
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📦 Montaj Aşamaları</span>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => setRoleForm({
                  ...roleForm,
                  assemblyStages: [
                    ...roleForm.assemblyStages,
                    { id: null, name: '', order: roleForm.assemblyStages.length + 1 }
                  ]
                })}
              >
                + Aşama Ekle
              </button>
            </label>
            
            {roleForm.assemblyStages.length === 0 ? (
              <div style={{ 
                padding: '1rem', 
                background: 'var(--bg-secondary)', 
                borderRadius: 8, 
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '0.85rem'
              }}>
                Henüz montaj aşaması eklenmedi. Montaj takibi için aşamalar ekleyin.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {roleForm.assemblyStages.map((stage, idx) => (
                  <div 
                    key={stage.id || idx} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.5rem',
                      padding: '0.5rem',
                      background: 'var(--bg-secondary)',
                      borderRadius: 6
                    }}
                  >
                    <span style={{ 
                      width: 24, 
                      height: 24, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      background: 'var(--primary)',
                      color: '#fff',
                      borderRadius: '50%',
                      fontSize: '0.75rem',
                      fontWeight: 600
                    }}>
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      className="form-input"
                      value={stage.name}
                      onChange={(e) => {
                        const updated = [...roleForm.assemblyStages];
                        updated[idx] = { ...updated[idx], name: e.target.value };
                        setRoleForm({ ...roleForm, assemblyStages: updated });
                      }}
                      placeholder="Aşama adı (örn: PVC Montaj)"
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      disabled={idx === 0}
                      onClick={() => {
                        const updated = [...roleForm.assemblyStages];
                        [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
                        updated.forEach((s, i) => s.order = i + 1);
                        setRoleForm({ ...roleForm, assemblyStages: updated });
                      }}
                      title="Yukarı Taşı"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      disabled={idx === roleForm.assemblyStages.length - 1}
                      onClick={() => {
                        const updated = [...roleForm.assemblyStages];
                        [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
                        updated.forEach((s, i) => s.order = i + 1);
                        setRoleForm({ ...roleForm, assemblyStages: updated });
                      }}
                      title="Aşağı Taşı"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      style={{ color: 'var(--danger)' }}
                      onClick={() => {
                        const updated = roleForm.assemblyStages.filter((_, i) => i !== idx);
                        updated.forEach((s, i) => s.order = i + 1);
                        setRoleForm({ ...roleForm, assemblyStages: updated });
                      }}
                      title="Sil"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              Montaj aşamaları, iş montaja geçtiğinde otomatik olarak görev olarak oluşturulur.
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button className="btn btn-ghost" onClick={() => setShowRoleModal(false)}>
            İptal
          </button>
          <button className="btn btn-primary" onClick={saveRole} disabled={actionLoading}>
            {actionLoading ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </Modal>

      {/* Glass Type Modal */}
      <Modal
        isOpen={showGlassModal}
        onClose={() => setShowGlassModal(false)}
        title="Yeni Cam Tipi"
        size="small"
      >
        <div className="form-group">
          <label className="form-label">Cam Adı *</label>
          <input
            type="text"
            className="form-input"
            value={glassForm.name}
            onChange={(e) => setGlassForm({ ...glassForm, name: e.target.value })}
            placeholder="Örn: 4+16+4 Isıcam"
          />
        </div>
        
        <div className="form-group">
          <label className="form-label">Cam Kodu *</label>
          <input
            type="text"
            className="form-input"
            value={glassForm.code}
            onChange={(e) => setGlassForm({ ...glassForm, code: e.target.value })}
            placeholder="Örn: 4-16-4"
          />
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button className="btn btn-ghost" onClick={() => setShowGlassModal(false)}>
            İptal
          </button>
          <button className="btn btn-primary" onClick={saveGlassType} disabled={actionLoading}>
            {actionLoading ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </Modal>

      {/* Config Item Modal (Sorun Tipleri, Hata Kaynakları, İptal/Gecikme Nedenleri) */}
      <Modal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        title={editingConfigItem ? `${getConfigTitle(configModalType)} Düzenle` : `Yeni ${getConfigTitle(configModalType)}`}
        size="small"
      >
        <div className="form-group">
          <label className="form-label">İsim *</label>
          <input
            type="text"
            className="form-input"
            value={configForm.name}
            onChange={(e) => setConfigForm({ ...configForm, name: e.target.value })}
            placeholder={`${getConfigTitle(configModalType)} adı`}
          />
        </div>
        
        {configModalType === 'issueTypes' && (
          <div className="form-group">
            <label className="form-label">İkon (Emoji)</label>
            <input
              type="text"
              className="form-input"
              value={configForm.icon}
              onChange={(e) => setConfigForm({ ...configForm, icon: e.target.value })}
              placeholder="Örn: ⚠️ 💔 ❓"
              style={{ fontSize: '1.25rem' }}
            />
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Sorun tipini temsil edecek bir emoji seçin
            </div>
          </div>
        )}
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button className="btn btn-ghost" onClick={() => setShowConfigModal(false)}>
            İptal
          </button>
          <button className="btn btn-primary" onClick={saveConfigItem} disabled={actionLoading}>
            {actionLoading ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default Ayarlar;
