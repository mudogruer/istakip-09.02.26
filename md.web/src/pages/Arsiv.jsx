import { useEffect, useState, useMemo } from 'react';
import DateInput from '../components/DateInput';
import Loader from '../components/Loader';
import Modal from '../components/Modal';
import PageHeader from '../components/PageHeader';
import { ArchiveIcon } from '../utils/muiIcons';
import {
  Select,
  MenuItem,
  ListItemIcon,
  FormControl,
  InputLabel,
} from '@mui/material';
import { 
  getDocuments, 
  getJobs, 
  getSuppliersFromAPI,
  deleteDocument, 
  getDocumentDownloadUrl,
  getFolders,
  createFolder,
  deleteFolder,
  getFolderDocuments,
  uploadDocument
} from '../services/dataService';

// Belge kategorileri (Material icon adları)
const DOCUMENT_TYPES = {
  olcu: { label: 'Ölçü Taslağı', icon: 'rule', color: '#3b82f6' },
  teknik: { label: 'Teknik Çizim', icon: 'straighten', color: '#8b5cf6' },
  sozlesme: { label: 'Sözleşme', icon: 'assignment', color: '#10b981' },
  teklif: { label: 'Teklif', icon: 'attach_money', color: '#f59e0b' },
  montaj: { label: 'Montaj', icon: 'apartment', color: '#ec4899' },
  irsaliye: { label: 'İrsaliye', icon: 'inventory_2', color: '#14b8a6' },
  servis_oncesi: { label: 'Servis Öncesi', icon: 'build', color: '#f97316' },
  servis_sonrasi: { label: 'Servis Sonrası', icon: 'check_circle', color: '#10b981' },
  arac: { label: 'Araç Belgesi', icon: 'drive_eta', color: '#f59e0b' },
  makine: { label: 'Makine Belgesi', icon: 'precision_manufacturing', color: '#8b5cf6' },
  ofis: { label: 'Ofis Belgesi', icon: 'store', color: '#ec4899' },
  genel: { label: 'Genel Belge', icon: 'folder', color: '#6b7280' },
  fiyat_listesi: { label: 'Fiyat Listesi', icon: 'attach_money', color: '#10b981' },
  kalite: { label: 'Kalite Belgesi', icon: 'check_circle', color: '#3b82f6' },
  tedarikci_sozlesme: { label: 'Tedarikçi Sözleşme', icon: 'assignment', color: '#f97316' },
  diger: { label: 'Diğer', icon: 'description', color: '#6b7280' },
};

// Belge tipini kategoriye eşle (measure_ROLE-01 -> olcu, technical_ROLE-01 -> teknik)
const getDocumentCategory = (type) => {
  if (!type) return 'diger';
  if (type.startsWith('measure_')) return 'olcu';
  if (type.startsWith('technical_')) return 'teknik';
  if (type.startsWith('servis')) return type; // servis_oncesi, servis_sonrasi
  return DOCUMENT_TYPES[type] ? type : 'diger';
};

// Tab yapısı (Material icon adları)
const TABS = [
  { id: 'jobs', label: 'İş Belgeleri', icon: 'assignment', color: '#3b82f6' },
  { id: 'company', label: 'Şirket Belgeleri', icon: 'business', color: '#10b981' },
  { id: 'suppliers', label: 'Tedarikçi Belgeleri', icon: 'groups', color: '#f97316' },
];

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const formatFileSize = (bytes) => {
  if (!bytes) return '-';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

const Arsiv = () => {
  // Data states
  const [documents, setDocuments] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // UI states
  const [activeTab, setActiveTab] = useState('jobs');
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all'); // İş belgeleri kategori filtresi

  // Modals
  const [previewDoc, setPreviewDoc] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Upload form
  const [uploadForm, setUploadForm] = useState({
    file: null,
    docType: 'genel',
    description: '',
    jobId: '',
    supplierId: '',
    folderId: ''
  });

  // New folder form (icon: Material icon adı)
  const [folderForm, setFolderForm] = useState({
    name: '',
    icon: 'folder',
    color: '#6b7280'
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [docsPayload, jobsPayload, suppliersPayload, foldersPayload] = await Promise.all([
        getDocuments().catch(() => []),
        getJobs().catch(() => []),
        getSuppliersFromAPI().catch(() => []),
        getFolders().catch(() => []),
      ]);
      setDocuments(docsPayload);
      setJobs(jobsPayload);
      setSuppliers(suppliersPayload);
      setFolders(foldersPayload);
    } catch (err) {
      setError(err.message || 'Arşiv alınamadı');
    } finally {
      setLoading(false);
    }
  };

  // Get job info by ID
  const getJobInfo = (jobId) => {
    const job = jobs.find((j) => j.id === jobId);
    return job ? { title: job.title, customer: job.customer?.name || job.customerName } : null;
  };

  // Get supplier info by ID
  const getSupplierInfo = (supplierId) => {
    const supplier = suppliers.find((s) => s.id === supplierId);
    return supplier ? supplier.name : null;
  };

  // Filtered documents based on active tab
  const filteredDocs = useMemo(() => {
    let docs = documents;

    // Tab'a göre filtrele
    if (activeTab === 'jobs') {
      docs = docs.filter(d => d.jobId && !d.supplierId && !d.folderId);
      // Kategori filtresi (sadece jobs tab'ında)
      if (categoryFilter !== 'all') {
        docs = docs.filter(d => getDocumentCategory(d.type) === categoryFilter);
      }
    } else if (activeTab === 'company') {
      docs = docs.filter(d => d.folderId && !d.jobId && !d.supplierId);
      if (selectedFolder) {
        docs = docs.filter(d => d.folderId === selectedFolder);
      }
    } else if (activeTab === 'suppliers') {
      docs = docs.filter(d => d.supplierId);
    }

    // Arama filtresi
    if (search) {
      const searchLower = search.toLowerCase();
      docs = docs.filter(doc => {
        const jobInfo = getJobInfo(doc.jobId);
        const supplierName = getSupplierInfo(doc.supplierId);
        return (
          doc.originalName?.toLowerCase().includes(searchLower) ||
          doc.description?.toLowerCase().includes(searchLower) ||
          jobInfo?.title?.toLowerCase().includes(searchLower) ||
          jobInfo?.customer?.toLowerCase().includes(searchLower) ||
          supplierName?.toLowerCase().includes(searchLower)
        );
      });
    }

    return docs;
  }, [documents, activeTab, selectedFolder, search, jobs, suppliers, categoryFilter]);

  // Şirket alt klasörleri
  const companySubfolders = useMemo(() => {
    const companyFolder = folders.find(f => f.id === 'FOLDER-SIRKET');
    return companyFolder?.subfolders || [];
  }, [folders]);

  // Stats
  const stats = useMemo(() => {
    const jobDocs = documents.filter(d => d.jobId && !d.supplierId && !d.folderId).length;
    const companyDocs = documents.filter(d => d.folderId && !d.jobId && !d.supplierId).length;
    const supplierDocs = documents.filter(d => d.supplierId).length;
    return { total: documents.length, jobDocs, companyDocs, supplierDocs };
  }, [documents]);

  const handleDelete = async (docId) => {
    if (!window.confirm('Bu dökümanı silmek istediğinize emin misiniz?')) return;
    try {
      setDeleting(true);
      await deleteDocument(docId);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      setPreviewDoc(null);
    } catch (err) {
      alert(err.message || 'Silinemedi');
    } finally {
      setDeleting(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadForm.file) {
      alert('Lütfen bir dosya seçin');
      return;
    }

    // En az bir referans gerekli
    if (!uploadForm.jobId && !uploadForm.folderId && !uploadForm.supplierId) {
      alert('Lütfen bir iş, klasör veya tedarikçi seçin');
      return;
    }

    try {
      setUploading(true);
      const newDoc = await uploadDocument(
        uploadForm.file,
        uploadForm.jobId || null,
        uploadForm.docType,
        uploadForm.description,
        uploadForm.folderId || null,
        uploadForm.supplierId || null
      );
      setDocuments(prev => [newDoc, ...prev]);
      setShowUploadModal(false);
      setUploadForm({
        file: null,
        docType: 'genel',
        description: '',
        jobId: '',
        supplierId: '',
        folderId: ''
      });
    } catch (err) {
      alert(err.message || 'Yükleme başarısız');
    } finally {
      setUploading(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!folderForm.name.trim()) {
      alert('Lütfen klasör adı girin');
      return;
    }

    try {
      const newFolder = await createFolder({
        name: folderForm.name,
        icon: folderForm.icon,
        color: folderForm.color,
        category: 'company',
        parentId: 'FOLDER-SIRKET'
      });
      
      // Klasörleri yenile
      const foldersPayload = await getFolders();
      setFolders(foldersPayload);
      
      setShowFolderModal(false);
      setFolderForm({ name: '', icon: 'folder', color: '#6b7280' });
    } catch (err) {
      alert(err.message || 'Klasör oluşturulamadı');
    }
  };

  const isImage = (mimeType) => mimeType?.startsWith('image/');
  const isPdf = (mimeType) => mimeType === 'application/pdf';

  // Belge tipi seçenekleri - aktif tab'a göre
  const docTypeOptions = useMemo(() => {
    if (activeTab === 'jobs') {
      return ['olcu', 'teknik', 'sozlesme', 'teklif', 'montaj', 'irsaliye', 'servis_oncesi', 'servis_sonrasi', 'diger'];
    } else if (activeTab === 'company') {
      return ['arac', 'makine', 'ofis', 'genel'];
    } else {
      return ['fiyat_listesi', 'kalite', 'tedarikci_sozlesme', 'diger'];
    }
  }, [activeTab]);

  return (
    <div className="container">
      <PageHeader
        title="Dijital Arşiv"
        subtitle="Tüm şirket belgelerini tek yerden yönetin"
        actions={
          <button 
            className="btn btn-primary"
            onClick={() => {
              // Tab'a göre varsayılan değerler
              setUploadForm({
                file: null,
                docType: activeTab === 'jobs' ? 'genel' : activeTab === 'company' ? 'genel' : 'fiyat_listesi',
                description: '',
                jobId: '',
                supplierId: '',
                folderId: activeTab === 'company' && selectedFolder ? selectedFolder : ''
              });
              setShowUploadModal(true);
            }}
          >
            <ArchiveIcon icon="upload_file" sx={{ mr: 0.5, verticalAlign: 'middle', fontSize: 18 }} />
            Belge Yükle
          </button>
        }
      />

      {/* Tabs */}
      <div className="card" style={{ marginBottom: 16, padding: 0 }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedFolder(null);
                setSearch('');
              }}
              style={{
                flex: 1,
                padding: '16px 20px',
                background: activeTab === tab.id ? `${tab.color}10` : 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id ? `3px solid ${tab.color}` : '3px solid transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontWeight: activeTab === tab.id ? 600 : 400,
                color: activeTab === tab.id ? tab.color : 'var(--color-text-secondary)',
                transition: 'all 0.2s'
              }}
            >
              <ArchiveIcon icon={tab.icon} sx={{ fontSize: 20 }} />
              <span>{tab.label}</span>
              <span 
                className="badge" 
                style={{ 
                  background: activeTab === tab.id ? tab.color : 'var(--color-bg-secondary)',
                  color: activeTab === tab.id ? 'white' : 'var(--color-text-muted)',
                  fontSize: 11
                }}
              >
                {tab.id === 'jobs' ? stats.jobDocs : tab.id === 'company' ? stats.companyDocs : stats.supplierDocs}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        {/* Sol Panel - Klasörler (Sadece Şirket Belgeleri için) */}
        {activeTab === 'company' && (
          <div style={{ width: 250, flexShrink: 0 }}>
            <div className="card" style={{ padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ margin: 0, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ArchiveIcon icon="folder" sx={{ fontSize: 18 }} />
                  Klasörler
                </h4>
                <button 
                  className="btn btn-sm btn-secondary"
                  onClick={() => setShowFolderModal(true)}
                  title="Yeni Klasör"
                  style={{ padding: '4px 8px', fontSize: 12 }}
                >
                  + Ekle
                </button>
              </div>
              
              {/* Tüm Belgeler */}
              <div
                onClick={() => setSelectedFolder(null)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: !selectedFolder ? 'var(--color-primary-light)' : 'transparent',
                  marginBottom: 4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'background 0.2s'
                }}
              >
                <ArchiveIcon icon="folder_open" sx={{ fontSize: 18 }} />
                <span style={{ fontWeight: !selectedFolder ? 600 : 400 }}>Tüm Belgeler</span>
              </div>

              {/* Alt Klasörler */}
              {companySubfolders.map(folder => (
                <div
                  key={folder.id}
                  onClick={() => setSelectedFolder(folder.id)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: selectedFolder === folder.id ? `${folder.color}15` : 'transparent',
                    marginBottom: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    borderLeft: selectedFolder === folder.id ? `3px solid ${folder.color}` : '3px solid transparent',
                    transition: 'all 0.2s'
                  }}
                >
                  <ArchiveIcon icon={folder.icon || 'folder'} sx={{ fontSize: 18 }} />
                  <span style={{ fontWeight: selectedFolder === folder.id ? 600 : 400 }}>{folder.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ana İçerik */}
        <div style={{ flex: 1 }}>
          {/* Arama ve Filtreler */}
          <div className="card" style={{ marginBottom: 16, padding: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, margin: 0, minWidth: 200 }}>
                <input
                  className="form-input"
                  type="text"
                  placeholder="Dosya adı, müşteri, tedarikçi ara..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              
              {/* Kategori Filtresi - Sadece İş Belgeleri tab'ında */}
              {activeTab === 'jobs' && (
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>Kategori</InputLabel>
                  <Select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    label="Kategori"
                    sx={{ height: 40 }}
                  >
                    <MenuItem value="all">
                      <ListItemIcon><ArchiveIcon icon="folder" sx={{ fontSize: 20 }} /></ListItemIcon>
                      Tüm Kategoriler
                    </MenuItem>
                    <MenuItem value="olcu">
                      <ListItemIcon><ArchiveIcon icon="rule" sx={{ fontSize: 20 }} /></ListItemIcon>
                      Ölçü Taslağı
                    </MenuItem>
                    <MenuItem value="teknik">
                      <ListItemIcon><ArchiveIcon icon="straighten" sx={{ fontSize: 20 }} /></ListItemIcon>
                      Teknik Çizim
                    </MenuItem>
                    <MenuItem value="sozlesme">
                      <ListItemIcon><ArchiveIcon icon="assignment" sx={{ fontSize: 20 }} /></ListItemIcon>
                      Sözleşme
                    </MenuItem>
                    <MenuItem value="teklif">
                      <ListItemIcon><ArchiveIcon icon="attach_money" sx={{ fontSize: 20 }} /></ListItemIcon>
                      Teklif
                    </MenuItem>
                    <MenuItem value="montaj">
                      <ListItemIcon><ArchiveIcon icon="apartment" sx={{ fontSize: 20 }} /></ListItemIcon>
                      Montaj
                    </MenuItem>
                    <MenuItem value="irsaliye">
                      <ListItemIcon><ArchiveIcon icon="inventory_2" sx={{ fontSize: 20 }} /></ListItemIcon>
                      İrsaliye
                    </MenuItem>
                    <MenuItem value="servis_oncesi">
                      <ListItemIcon><ArchiveIcon icon="build" sx={{ fontSize: 20 }} /></ListItemIcon>
                      Servis Öncesi
                    </MenuItem>
                    <MenuItem value="servis_sonrasi">
                      <ListItemIcon><ArchiveIcon icon="check_circle" sx={{ fontSize: 20 }} /></ListItemIcon>
                      Servis Sonrası
                    </MenuItem>
                    <MenuItem value="diger">
                      <ListItemIcon><ArchiveIcon icon="description" sx={{ fontSize: 20 }} /></ListItemIcon>
                      Diğer
                    </MenuItem>
                  </Select>
                </FormControl>
              )}
              
              {(search || categoryFilter !== 'all') && (
                <button 
                  className="btn btn-secondary btn-small"
                  onClick={() => { setSearch(''); setCategoryFilter('all'); }}
                >
                  <ArchiveIcon icon="close" sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'middle' }} />
                  Temizle
                </button>
              )}
            </div>
          </div>

          {/* Belgeler Listesi */}
          {loading ? (
            <Loader text="Belgeler yükleniyor..." />
          ) : error ? (
            <div className="card error-card">
              <div className="error-title">Hata</div>
              <div className="error-message">{error}</div>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="card">
              <div className="card-body" style={{ textAlign: 'center', padding: 48 }}>
                <ArchiveIcon icon="mail_outline" sx={{ fontSize: 48, marginBottom: 16, display: 'block', color: 'var(--color-text-muted)' }} />
                <h3 style={{ margin: '0 0 8px 0' }}>Belge Bulunamadı</h3>
                <p className="text-muted">
                  {activeTab === 'jobs' && 'Henüz iş belgesi yüklenmemiş.'}
                  {activeTab === 'company' && 'Bu klasörde belge yok.'}
                  {activeTab === 'suppliers' && 'Henüz tedarikçi belgesi yüklenmemiş.'}
                </p>
                <button 
                  className="btn btn-primary"
                  style={{ marginTop: 16 }}
                  onClick={() => setShowUploadModal(true)}
                >
                  <ArchiveIcon icon="upload_file" sx={{ fontSize: 18, mr: 0.5, verticalAlign: 'middle' }} />
                  İlk Belgeyi Yükle
                </button>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}></th>
                      <th>Dosya Adı</th>
                      <th>Kategori</th>
                      {activeTab === 'jobs' && <th>İş / Müşteri</th>}
                      {activeTab === 'suppliers' && <th>Tedarikçi</th>}
                      {activeTab === 'company' && <th>Klasör</th>}
                      <th>Boyut</th>
                      <th>Tarih</th>
                      <th style={{ width: 120 }}>İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocs.map((doc) => {
                      const docCategory = getDocumentCategory(doc.type);
                      const docType = DOCUMENT_TYPES[docCategory] || DOCUMENT_TYPES.diger;
                      const jobInfo = getJobInfo(doc.jobId);
                      const supplierName = getSupplierInfo(doc.supplierId);
                      const folderInfo = companySubfolders.find(f => f.id === doc.folderId);
                      
                      return (
                        <tr key={doc.id} style={{ cursor: 'pointer' }} onClick={() => setPreviewDoc(doc)}>
                          <td>
                            <ArchiveIcon icon={docType.icon} sx={{ fontSize: 20 }} />
                          </td>
                          <td>
                            <strong>{doc.originalName}</strong>
                            {doc.description && (
                              <div className="text-muted" style={{ fontSize: 12 }}>{doc.description}</div>
                            )}
                          </td>
                          <td>
                            <span className="badge" style={{ background: `${docType.color}20`, color: docType.color }}>
                              {docType.label}
                            </span>
                          </td>
                          {activeTab === 'jobs' && (
                            <td>
                              {jobInfo ? (
                                <>
                                  <div style={{ fontWeight: 500 }}>{jobInfo.title}</div>
                                  <div className="text-muted" style={{ fontSize: 12 }}>{jobInfo.customer}</div>
                                </>
                              ) : '-'}
                            </td>
                          )}
                          {activeTab === 'suppliers' && (
                            <td>{supplierName || '-'}</td>
                          )}
                          {activeTab === 'company' && (
                            <td>
                              {folderInfo ? (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <ArchiveIcon icon={folderInfo.icon || 'folder'} sx={{ fontSize: 18 }} />
                                  {folderInfo.name}
                                </span>
                              ) : '-'}
                            </td>
                          )}
                          <td className="text-muted">{formatFileSize(doc.size)}</td>
                          <td>{formatDate(doc.uploadedAt)}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <a
                                href={getDocumentDownloadUrl(doc.id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-primary btn-small"
                                title="İndir"
                              >
                                <ArchiveIcon icon="download" sx={{ fontSize: 18 }} />
                              </a>
                              <button
                                className="btn btn-secondary btn-small"
                                onClick={() => setPreviewDoc(doc)}
                                title="Önizle"
                              >
                                <ArchiveIcon icon="visibility" sx={{ fontSize: 18 }} />
                              </button>
                              <button
                                className="btn btn-danger btn-small"
                                onClick={() => handleDelete(doc.id)}
                                title="Sil"
                              >
                                <ArchiveIcon icon="delete" sx={{ fontSize: 18 }} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Alt bilgi */}
          {!loading && filteredDocs.length > 0 && (
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <span className="text-muted" style={{ fontSize: 12 }}>
                {filteredDocs.length} belge gösteriliyor
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Önizleme Modal */}
      <Modal
        isOpen={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        title={previewDoc?.originalName || 'Belge Önizleme'}
        size="lg"
      >
        {previewDoc && (
          <div>
            {/* Document Info */}
            <div className="grid grid-4" style={{ gap: 16, marginBottom: 16 }}>
              <div>
                <div className="text-muted" style={{ fontSize: 12 }}>Kategori</div>
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {(() => {
                    const cat = getDocumentCategory(previewDoc.type);
                    const typeInfo = DOCUMENT_TYPES[cat] || DOCUMENT_TYPES.diger;
                    return (
                      <>
                        <ArchiveIcon icon={typeInfo.icon} sx={{ fontSize: 20 }} />
                        {typeInfo.label}
                      </>
                    );
                  })()}
                </div>
              </div>
              <div>
                <div className="text-muted" style={{ fontSize: 12 }}>Boyut</div>
                <div style={{ fontWeight: 600 }}>{formatFileSize(previewDoc.size)}</div>
              </div>
              <div>
                <div className="text-muted" style={{ fontSize: 12 }}>Yüklenme Tarihi</div>
                <div style={{ fontWeight: 600 }}>{formatDate(previewDoc.uploadedAt)}</div>
              </div>
              <div>
                <div className="text-muted" style={{ fontSize: 12 }}>Referans</div>
                <div style={{ fontWeight: 600 }}>
                  {previewDoc.jobId && getJobInfo(previewDoc.jobId)?.title}
                  {previewDoc.supplierId && getSupplierInfo(previewDoc.supplierId)}
                  {previewDoc.folderId && companySubfolders.find(f => f.id === previewDoc.folderId)?.name}
                </div>
              </div>
            </div>

            {previewDoc.description && (
              <div style={{ marginBottom: 16, padding: 12, background: 'var(--color-bg-secondary)', borderRadius: 8 }}>
                <div className="text-muted" style={{ fontSize: 12, marginBottom: 4 }}>Açıklama</div>
                <div>{previewDoc.description}</div>
              </div>
            )}

            {/* Preview Area */}
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', minHeight: 300 }}>
              {isImage(previewDoc.mimeType) ? (
                <img
                  src={getDocumentDownloadUrl(previewDoc.id)}
                  alt={previewDoc.originalName}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              ) : isPdf(previewDoc.mimeType) ? (
                <iframe
                  src={getDocumentDownloadUrl(previewDoc.id)}
                  title={previewDoc.originalName}
                  style={{ width: '100%', height: 500, border: 'none' }}
                />
              ) : (
                <div style={{ padding: 48, textAlign: 'center' }}>
                  <ArchiveIcon icon="description" sx={{ fontSize: 64, marginBottom: 16, display: 'block', margin: '0 auto', color: 'var(--color-text-muted)' }} />
                  <h3 style={{ margin: '0 0 8px 0' }}>Önizleme Mevcut Değil</h3>
                  <p className="text-muted">Bu dosya türü için önizleme desteklenmiyor.</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
              <button className="btn btn-secondary" onClick={() => setPreviewDoc(null)}>
                Kapat
              </button>
              <a
                href={getDocumentDownloadUrl(previewDoc.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
              >
                <ArchiveIcon icon="download" sx={{ fontSize: 18, mr: 0.5, verticalAlign: 'middle' }} />
                İndir
              </a>
              <button
                className="btn btn-danger"
                onClick={() => handleDelete(previewDoc.id)}
                disabled={deleting}
              >
                <ArchiveIcon icon="delete" sx={{ fontSize: 18, mr: 0.5, verticalAlign: 'middle' }} />
                Sil
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Belge Yükleme Modal */}
      <Modal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ArchiveIcon icon="upload_file" sx={{ fontSize: 24 }} />
            Belge Yükle
          </span>
        }
        size="md"
      >
        <div style={{ padding: 8 }}>
          {/* Dosya Seçimi */}
          <div className="form-group">
            <label className="form-label">Dosya *</label>
            <input
              type="file"
              className="form-input"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.dwg,.dxf,.zip,.rar"
              onChange={(e) => setUploadForm(prev => ({ ...prev, file: e.target.files?.[0] || null }))}
            />
            {uploadForm.file && (
              <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                {uploadForm.file.name} ({formatFileSize(uploadForm.file.size)})
              </div>
            )}
          </div>

          {/* Belge Türü */}
          <div className="form-group">
            <label className="form-label">Belge Türü *</label>
            <FormControl fullWidth size="small">
              <InputLabel>Belge Türü</InputLabel>
              <Select
                value={uploadForm.docType}
                onChange={(e) => setUploadForm(prev => ({ ...prev, docType: e.target.value }))}
                label="Belge Türü"
              >
                {docTypeOptions.map(key => {
                  const dt = DOCUMENT_TYPES[key] || DOCUMENT_TYPES.diger;
                  return (
                    <MenuItem key={key} value={key}>
                      <ListItemIcon><ArchiveIcon icon={dt.icon} sx={{ fontSize: 20 }} /></ListItemIcon>
                      {dt.label}
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>
          </div>

          {/* Referans Seçimi - Tab'a göre */}
          {activeTab === 'jobs' && (
            <div className="form-group">
              <label className="form-label">İş *</label>
              <select
                className="form-select"
                value={uploadForm.jobId}
                onChange={(e) => setUploadForm(prev => ({ ...prev, jobId: e.target.value }))}
              >
                <option value="">-- İş Seçin --</option>
                {jobs.map(job => (
                  <option key={job.id} value={job.id}>
                    {job.title} - {job.customer?.name || job.customerName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {activeTab === 'company' && (
            <div className="form-group">
              <label className="form-label">Klasör *</label>
              <FormControl fullWidth size="small">
                <InputLabel>Klasör</InputLabel>
                <Select
                  value={uploadForm.folderId}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, folderId: e.target.value }))}
                  label="Klasör"
                >
                  <MenuItem value="">-- Klasör Seçin --</MenuItem>
                  {companySubfolders.map(folder => (
                    <MenuItem key={folder.id} value={folder.id}>
                      <ListItemIcon><ArchiveIcon icon={folder.icon || 'folder'} sx={{ fontSize: 20 }} /></ListItemIcon>
                      {folder.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </div>
          )}

          {activeTab === 'suppliers' && (
            <div className="form-group">
              <label className="form-label">Tedarikçi *</label>
              <select
                className="form-select"
                value={uploadForm.supplierId}
                onChange={(e) => setUploadForm(prev => ({ ...prev, supplierId: e.target.value }))}
              >
                <option value="">-- Tedarikçi Seçin --</option>
                {suppliers.map(supplier => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Açıklama */}
          <div className="form-group">
            <label className="form-label">Açıklama (Opsiyonel)</label>
            <textarea
              className="form-input"
              placeholder="Belge hakkında kısa açıklama..."
              value={uploadForm.description}
              onChange={(e) => setUploadForm(prev => ({ ...prev, description: e.target.value }))}
              rows={2}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
            <button 
              className="btn btn-secondary"
              onClick={() => setShowUploadModal(false)}
              disabled={uploading}
            >
              İptal
            </button>
            <button 
              className="btn btn-primary"
              onClick={handleUpload}
              disabled={uploading || !uploadForm.file}
            >
              {uploading ? 'Yükleniyor...' : (
                <>
                  <ArchiveIcon icon="upload_file" sx={{ fontSize: 18, mr: 0.5, verticalAlign: 'middle' }} />
                  Yükle
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Yeni Klasör Modal */}
      <Modal
        isOpen={showFolderModal}
        onClose={() => setShowFolderModal(false)}
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ArchiveIcon icon="folder" sx={{ fontSize: 24 }} />
            Yeni Klasör Oluştur
          </span>
        }
        size="sm"
      >
        <div style={{ padding: 8 }}>
          <div className="form-group">
            <label className="form-label">Klasör Adı *</label>
            <input
              type="text"
              className="form-input"
              placeholder="Örn: Sözleşmeler"
              value={folderForm.name}
              onChange={(e) => setFolderForm(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">İkon</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['folder', 'folder_open', 'folder_special', 'assignment', 'description', 'drive_eta', 'precision_manufacturing', 'store', 'receipt', 'bar_chart'].map(iconKey => (
                <button
                  key={iconKey}
                  type="button"
                  onClick={() => setFolderForm(prev => ({ ...prev, icon: iconKey }))}
                  style={{
                    padding: '8px 12px',
                    border: folderForm.icon === iconKey ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    borderRadius: 8,
                    background: folderForm.icon === iconKey ? 'var(--color-primary-light)' : 'transparent',
                    cursor: 'pointer'
                  }}
                >
                  <ArchiveIcon icon={iconKey} sx={{ fontSize: 20 }} />
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Renk</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#f97316', '#6b7280'].map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFolderForm(prev => ({ ...prev, color }))}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: color,
                    border: folderForm.color === color ? '3px solid #1f2937' : 'none',
                    cursor: 'pointer'
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
            <button 
              className="btn btn-secondary"
              onClick={() => setShowFolderModal(false)}
            >
              İptal
            </button>
            <button 
              className="btn btn-primary"
              onClick={handleCreateFolder}
              disabled={!folderForm.name.trim()}
            >
              <ArchiveIcon icon="check_circle" sx={{ fontSize: 18, mr: 0.5, verticalAlign: 'middle' }} />
              Oluştur
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Arsiv;
