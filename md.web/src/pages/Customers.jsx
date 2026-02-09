import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import DataTable from '../components/DataTable';
import Loader from '../components/Loader';
import { createCustomer, getCustomers, softDeleteCustomer, updateCustomer, getJobs, getDocuments } from '../services/dataService';

// Durum badge'leri
const STATUS_BADGES = {
  'KAPALI': { label: 'Kapandı', tone: 'success', icon: '✅' },
  'URETIME_HAZIR': { label: 'Üretime Hazır', tone: 'success', icon: '✅' },
  'URETIMDE': { label: 'Üretimde', tone: 'primary', icon: '🔧' },
  'SONRA_URETILECEK': { label: 'Sonra Üretilecek', tone: 'info', icon: '📦' },
  'MONTAJA_HAZIR': { label: 'Montaja Hazır', tone: 'success', icon: '✅' },
  'MONTAJ_TERMIN': { label: 'Montaj Terminli', tone: 'primary', icon: '🚚' },
  'ANLASMA_TAMAMLANDI': { label: 'Anlaşma Tamam', tone: 'success', icon: '✅' },
  'ANLASMA_YAPILIYOR': { label: 'Anlaşma Yapılıyor', tone: 'primary', icon: '📝' },
  'FIYAT_VERILDI': { label: 'Fiyat Verildi', tone: 'warning', icon: '⏳' },
  'OLCU_ALINDI': { label: 'Ölçü Alındı', tone: 'success', icon: '📐' },
};

const renderStatus = (status) => {
  const info = STATUS_BADGES[status];
  if (info) {
    return <span className={`badge badge-${info.tone}`}>{info.icon} {info.label}</span>;
  }
  return <span className="badge badge-secondary">{status || 'Bilinmiyor'}</span>;
};

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  
  // Modal states
  const [showModal, setShowModal] = useState(false); // Müşteri ekleme/düzenleme
  const [customerDetailModal, setCustomerDetailModal] = useState(null); // Müşteri detay modal (Modal 1)
  const [jobDetailModal, setJobDetailModal] = useState(null); // İş detay modal (Modal 2)
  
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: '',
    segment: 'B2C',
    location: '',
    contact: '',
    phone: '',
    phone2: '',
    address: '',
  });

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [customersData, jobsData, docsData] = await Promise.all([
          getCustomers(),
          getJobs(),
          getDocuments(),
        ]);
        setCustomers(customersData);
        setJobs(jobsData);
        setDocuments(docsData);
      } catch (err) {
        setError(err.message || 'Veriler alınamadı');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Müşterinin işlerini al
  const getCustomerJobs = (customerId) => {
    return jobs.filter(job => job.customerId === customerId && !job.deleted);
  };

  // İşin dökümanlarını al
  const getJobDocuments = (jobId) => {
    return documents.filter(doc => doc.jobId === jobId);
  };

  // Tek bir işin tutarını al (offer.total veya approval.paymentPlan.total)
  const getJobAmount = (job) => {
    return job?.offer?.total || job?.approval?.paymentPlan?.total || 0;
  };

  // Müşteri istatistikleri
  const getCustomerStats = (customerId) => {
    const customerJobs = getCustomerJobs(customerId);
    const closedJobs = customerJobs.filter(j => j.status === 'KAPALI').length;
    const activeJobs = customerJobs.length - closedJobs;
    const totalAmount = customerJobs.reduce((sum, j) => sum + getJobAmount(j), 0);
    return { total: customerJobs.length, closed: closedJobs, active: activeJobs, totalAmount };
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      setSubmitting(true);
      setError('');
      if (editing) {
        const updated = await updateCustomer(editing.id, form);
        setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        setEditing(null);
      } else {
        const newCustomer = await createCustomer(form);
        setCustomers((prev) => [newCustomer, ...prev]);
      }
      setForm({ name: '', segment: 'B2C', location: '', contact: '', phone: '', phone2: '', address: '' });
      setShowModal(false);
    } catch (err) {
      setError(err.message || 'Müşteri kaydı başarısız');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (customer) => {
    setEditing(customer);
    setForm({
      name: customer.name || '',
      segment: customer.segment || 'B2C',
      location: customer.location || '',
      contact: customer.contact || '',
      phone: customer.phone || '',
      phone2: customer.phone2 || '',
      address: customer.address || '',
    });
    setShowModal(true);
  };

  const handleSoftDelete = async (customer) => {
    try {
      await softDeleteCustomer(customer.id);
      setCustomers((prev) => prev.map((c) => (c.id === customer.id ? { ...c, deleted: true } : c)));
      setConfirmTarget(null);
      setShowModal(false);
      setEditing(null);
    } catch (err) {
      setError(err.message || 'Silme işlemi başarısız');
    }
  };

  // Aktif müşteriler
  const activeCustomers = useMemo(() => customers.filter((c) => !c.deleted), [customers]);

  // Filtrelenmiş müşteriler
  const filteredCustomers = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return activeCustomers;
    return activeCustomers.filter(c => 
      (c.name || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.location || '').toLowerCase().includes(q) ||
      (c.accountCode || '').toLowerCase().includes(q)
    );
  }, [activeCustomers, search]);

  // Tablo kolonları
  const columns = [
    { 
      label: 'Müşteri', 
      accessor: 'name',
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.name}</div>
          {row.accountCode && <div className="text-muted" style={{ fontSize: 11 }}>🏷️ {row.accountCode}</div>}
        </div>
      )
    },
    { label: 'Segment', accessor: 'segment', render: (val) => <span className={`badge badge-${val === 'B2B' ? 'primary' : 'secondary'}`}>{val}</span> },
    { label: 'Lokasyon', accessor: 'location' },
    { 
      label: 'İletişim', 
      accessor: 'phone',
      render: (_, row) => (
        <div style={{ fontSize: 12 }}>
          {row.phone && <div>📱 {row.phone}</div>}
          {row.contact && <div>📧 {row.contact}</div>}
        </div>
      )
    },
    { 
      label: 'İşler', 
      accessor: 'jobs',
      render: (_, row) => {
        const stats = getCustomerStats(row.id);
        return (
          <div style={{ fontSize: 12 }}>
            <span style={{ fontWeight: 600 }}>{stats.total}</span> iş
            {stats.active > 0 && <span className="text-muted"> ({stats.active} aktif)</span>}
          </div>
        );
      }
    },
  ];

  return (
    <div>
      <PageHeader
        title="Müşteriler"
        subtitle="Müşteri listesi ve iş geçmişi"
        actions={
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setEditing(null);
              setForm({ name: '', segment: 'B2C', location: '', contact: '', phone: '', phone2: '', address: '' });
              setShowModal(true);
            }}
          >
            + Yeni Müşteri
          </button>
        }
      />

      {/* Arama */}
      <div className="card subtle-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 18 }}>🔍</span>
          <input
            className="form-input"
            placeholder="Müşteri adı, telefon, lokasyon veya cari kod ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, maxWidth: 400 }}
          />
          {search && (
            <button className="btn btn-secondary btn-small" onClick={() => setSearch('')}>
              Temizle
            </button>
          )}
          <span className="text-muted" style={{ fontSize: 12 }}>
            {filteredCustomers.length} müşteri
          </span>
        </div>
      </div>

      {/* Müşteri Ekleme/Düzenleme Modal */}
      <Modal
        open={showModal}
        title={editing ? 'Müşteri Güncelle' : 'Yeni Müşteri Ekle'}
        size="medium"
        onClose={() => {
          setShowModal(false);
          setEditing(null);
          setForm({ name: '', segment: 'B2C', location: '', contact: '', phone: '', phone2: '', address: '' });
        }}
        actions={
          <>
            {editing && (
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => setConfirmTarget(editing)}
                disabled={submitting}
              >
                Sil
              </button>
            )}
            <button className="btn btn-secondary" type="button" onClick={() => setShowModal(false)} disabled={submitting}>
              Vazgeç
            </button>
            <button className="btn btn-primary" type="submit" form="customer-form" disabled={submitting}>
              {submitting ? 'Kaydediliyor...' : editing ? 'Güncelle' : 'Kaydet'}
            </button>
          </>
        }
      >
        <form id="customer-form" onSubmit={handleSubmit}>
          {/* Temel Bilgiler */}
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: 14, color: 'var(--color-primary)' }}>📝 Temel Bilgiler</h4>
            <div className="grid grid-2" style={{ gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Ad Soyad / Firma Adı *</label>
                <input
                  className="form-input"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                  placeholder="Örn: Ahmet Kaya veya ABC Yapı Ltd."
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Segment</label>
                <select
                  className="form-select"
                  value={form.segment}
                  onChange={(e) => setForm((prev) => ({ ...prev, segment: e.target.value }))}
                >
                  <option value="B2C">B2C (Bireysel)</option>
                  <option value="B2B">B2B (Kurumsal)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Adres Bilgileri */}
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: 14, color: 'var(--color-primary)' }}>📍 Adres Bilgileri</h4>
            <div className="grid grid-2" style={{ gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">İl / İlçe</label>
                <input
                  className="form-input"
                  value={form.location}
                  onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                  placeholder="Örn: Nevşehir / Merkez"
                />
              </div>
              <div className="form-group" style={{ margin: 0, gridColumn: 'span 2' }}>
                <label className="form-label">Açık Adres</label>
                <textarea
                  className="form-input"
                  value={form.address}
                  onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                  placeholder="Mahalle, sokak, bina no..."
                  rows={2}
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>
          </div>

          {/* İletişim Bilgileri */}
          <div>
            <h4 style={{ margin: '0 0 12px 0', fontSize: 14, color: 'var(--color-primary)' }}>📱 İletişim</h4>
            <div className="grid grid-2" style={{ gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Telefon 1 (Birincil)</label>
                <input
                  className="form-input"
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="+90 5XX XXX XX XX"
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Telefon 2 (Yedek)</label>
                <input
                  className="form-input"
                  value={form.phone2}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone2: e.target.value }))}
                  placeholder="+90 5XX XXX XX XX"
                />
              </div>
              <div className="form-group" style={{ margin: 0, gridColumn: 'span 2' }}>
                <label className="form-label">E-posta</label>
                <input
                  className="form-input"
                  type="email"
                  value={form.contact}
                  onChange={(e) => setForm((prev) => ({ ...prev, contact: e.target.value }))}
                  placeholder="ornek@email.com"
                />
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* Silme Onay Modal */}
      <Modal
        open={Boolean(confirmTarget)}
        title="Silme Onayı"
        size="small"
        onClose={() => setConfirmTarget(null)}
        actions={
          <>
            <button className="btn btn-secondary" type="button" onClick={() => setConfirmTarget(null)}>
              Vazgeç
            </button>
            <button
              className="btn btn-danger"
              type="button"
              onClick={() => confirmTarget && handleSoftDelete(confirmTarget)}
            >
              Sil
            </button>
          </>
        }
      >
        <p>
          <strong>{confirmTarget?.name}</strong> müşterisini silmek üzeresiniz. Bu işlem geri alınabilir.
        </p>
      </Modal>

      {/* MÜŞTERİ DETAY MODAL (Modal 1) */}
      <Modal
        open={Boolean(customerDetailModal)}
        title={customerDetailModal ? `👤 ${customerDetailModal.name}` : ''}
        size="large"
        onClose={() => setCustomerDetailModal(null)}
        actions={
          <>
            <button 
              className="btn btn-secondary" 
              type="button" 
              onClick={() => handleEdit(customerDetailModal)}
            >
              ✏️ Düzenle
            </button>
            <button className="btn btn-primary" type="button" onClick={() => setCustomerDetailModal(null)}>
              Kapat
            </button>
          </>
        }
      >
        {customerDetailModal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Müşteri Bilgileri */}
            <div style={{ 
              background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)', 
              padding: 16, 
              borderRadius: 12,
              border: '1px solid var(--color-border)'
            }}>
              <div className="grid grid-3" style={{ gap: 16 }}>
                <div>
                  <div className="text-muted" style={{ fontSize: 11, marginBottom: 4 }}>Segment</div>
                  <span className={`badge badge-${customerDetailModal.segment === 'B2B' ? 'primary' : 'secondary'}`}>
                    {customerDetailModal.segment}
                  </span>
                </div>
                <div>
                  <div className="text-muted" style={{ fontSize: 11, marginBottom: 4 }}>Cari Kod</div>
                  <div style={{ fontWeight: 600 }}>🏷️ {customerDetailModal.accountCode || '-'}</div>
                </div>
                <div>
                  <div className="text-muted" style={{ fontSize: 11, marginBottom: 4 }}>Lokasyon</div>
                  <div style={{ fontWeight: 600 }}>📍 {customerDetailModal.location || '-'}</div>
                </div>
              </div>
              
              <div className="grid grid-2" style={{ gap: 16, marginTop: 16 }}>
                <div>
                  <div className="text-muted" style={{ fontSize: 11, marginBottom: 4 }}>Telefon</div>
                  <div>
                    {customerDetailModal.phone && <div>📱 {customerDetailModal.phone}</div>}
                    {customerDetailModal.phone2 && <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>📱 {customerDetailModal.phone2}</div>}
                    {!customerDetailModal.phone && !customerDetailModal.phone2 && <span className="text-muted">-</span>}
                  </div>
                </div>
                <div>
                  <div className="text-muted" style={{ fontSize: 11, marginBottom: 4 }}>E-posta</div>
                  <div>{customerDetailModal.contact ? `📧 ${customerDetailModal.contact}` : <span className="text-muted">-</span>}</div>
                </div>
              </div>

              {customerDetailModal.address && (
                <div style={{ marginTop: 16 }}>
                  <div className="text-muted" style={{ fontSize: 11, marginBottom: 4 }}>Adres</div>
                  <div style={{ fontSize: 13 }}>🏠 {customerDetailModal.address}</div>
                </div>
              )}
            </div>

            {/* İstatistikler */}
            {(() => {
              const stats = getCustomerStats(customerDetailModal.id);
              return (
                <div className="grid grid-4" style={{ gap: 12 }}>
                  <div className="card subtle-card" style={{ padding: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-primary)' }}>{stats.total}</div>
                    <div className="text-muted" style={{ fontSize: 11 }}>Toplam İş</div>
                  </div>
                  <div className="card subtle-card" style={{ padding: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-warning)' }}>{stats.active}</div>
                    <div className="text-muted" style={{ fontSize: 11 }}>Aktif</div>
                  </div>
                  <div className="card subtle-card" style={{ padding: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-success)' }}>{stats.closed}</div>
                    <div className="text-muted" style={{ fontSize: 11 }}>Tamamlanan</div>
                  </div>
                  <div className="card subtle-card" style={{ padding: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>₺{stats.totalAmount.toLocaleString('tr-TR')}</div>
                    <div className="text-muted" style={{ fontSize: 11 }}>Toplam Tutar</div>
                  </div>
                </div>
              );
            })()}

            {/* İş Listesi */}
            <div>
              <h4 style={{ margin: '0 0 12px 0', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                📂 İşler
                <span className="badge badge-secondary">{getCustomerJobs(customerDetailModal.id).length}</span>
              </h4>
              
              {getCustomerJobs(customerDetailModal.id).length === 0 ? (
                <div className="card subtle-card" style={{ padding: 30, textAlign: 'center' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Henüz iş kaydı yok</div>
                  <div className="text-muted" style={{ fontSize: 13 }}>Bu müşteriye ait iş bulunmuyor</div>
                </div>
              ) : (
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ maxHeight: 300, overflow: 'auto' }}>
                    <table className="table" style={{ fontSize: 13, marginBottom: 0 }}>
                      <thead style={{ position: 'sticky', top: 0, background: 'var(--color-bg)' }}>
                        <tr>
                          <th>İş Kodu</th>
                          <th>Başlık</th>
                          <th>Tarih</th>
                          <th>Tutar</th>
                          <th>Durum</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {getCustomerJobs(customerDetailModal.id).map(job => (
                          <tr 
                            key={job.id}
                            style={{ cursor: 'pointer' }}
                            onClick={() => setJobDetailModal(job)}
                          >
                            <td><code style={{ fontSize: 11 }}>{job.id}</code></td>
                            <td style={{ fontWeight: 600 }}>{job.title || '-'}</td>
                            <td className="text-muted" style={{ fontSize: 12 }}>
                              {job.createdAt ? new Date(job.createdAt).toLocaleDateString('tr-TR') : '-'}
                            </td>
                            <td>
                              {getJobAmount(job) > 0
                                ? `₺${getJobAmount(job).toLocaleString('tr-TR')}` 
                                : <span className="text-muted">-</span>
                              }
                            </td>
                            <td>{renderStatus(job.status)}</td>
                            <td>
                              <button 
                                className="btn btn-secondary btn-small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setJobDetailModal(job);
                                }}
                              >
                                Detay
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* İŞ DETAY MODAL (Modal 2 - İç içe) */}
      <Modal
        open={Boolean(jobDetailModal)}
        title={jobDetailModal ? `📋 ${jobDetailModal.title || jobDetailModal.id}` : ''}
        size="medium"
        onClose={() => setJobDetailModal(null)}
        actions={
          <>
            <button 
              className="btn btn-secondary" 
              type="button" 
              onClick={() => window.open(`/isler/list?job=${jobDetailModal?.id}`, '_blank')}
            >
              🔗 İşe Git (Tam Detay)
            </button>
            <button className="btn btn-primary" type="button" onClick={() => setJobDetailModal(null)}>
              Kapat
            </button>
          </>
        }
      >
        {jobDetailModal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* İş Bilgileri */}
            <div style={{ 
              background: 'var(--color-bg-secondary)', 
              padding: 16, 
              borderRadius: 12 
            }}>
              <div className="grid grid-2" style={{ gap: 12 }}>
                <div>
                  <div className="text-muted" style={{ fontSize: 11 }}>İş Kodu</div>
                  <code style={{ fontSize: 12 }}>{jobDetailModal.id}</code>
                </div>
                <div>
                  <div className="text-muted" style={{ fontSize: 11 }}>Durum</div>
                  {renderStatus(jobDetailModal.status)}
                </div>
                <div>
                  <div className="text-muted" style={{ fontSize: 11 }}>Oluşturma</div>
                  <div>{jobDetailModal.createdAt ? new Date(jobDetailModal.createdAt).toLocaleDateString('tr-TR') : '-'}</div>
                </div>
                <div>
                  <div className="text-muted" style={{ fontSize: 11 }}>Başlangıç Tipi</div>
                  <div>{jobDetailModal.startType || '-'}</div>
                </div>
              </div>
            </div>

            {/* İş Kolları */}
            {jobDetailModal.roles && jobDetailModal.roles.length > 0 && (
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: 13 }}>🔧 İş Kolları</h4>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {jobDetailModal.roles.map((role, idx) => (
                    <span key={idx} className="badge badge-primary">{role.name || role.label || role.id}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Finansal Bilgiler */}
            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: 13 }}>💰 Finansal</h4>
              <div className="grid grid-2" style={{ gap: 8 }}>
                <div className="card subtle-card" style={{ padding: 12 }}>
                  <div className="text-muted" style={{ fontSize: 11 }}>Toplam Tutar</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>
                    ₺{getJobAmount(jobDetailModal).toLocaleString('tr-TR')}
                  </div>
                </div>
                <div className="card subtle-card" style={{ padding: 12 }}>
                  <div className="text-muted" style={{ fontSize: 11 }}>Anlaşma Tarihi</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {jobDetailModal.offer?.agreedDate 
                      ? new Date(jobDetailModal.offer.agreedDate).toLocaleDateString('tr-TR')
                      : '-'}
                  </div>
                </div>
              </div>
            </div>

            {/* Dökümanlar */}
            {(() => {
              const jobDocs = getJobDocuments(jobDetailModal.id);
              if (jobDocs.length === 0) return null;
              
              return (
                <div>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: 13 }}>📎 Dökümanlar ({jobDocs.length})</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {jobDocs.map(doc => (
                      <div 
                        key={doc.id}
                        className="card subtle-card"
                        style={{ 
                          padding: '10px 14px', 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center' 
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>
                            {doc.type === 'olcu' && '📐 '} 
                            {doc.type === 'teknik' && '📄 '}
                            {doc.type === 'sozlesme' && '📝 '}
                            {doc.description || doc.originalName}
                          </div>
                          <div className="text-muted" style={{ fontSize: 11 }}>
                            {new Date(doc.uploadedAt).toLocaleDateString('tr-TR')}
                          </div>
                        </div>
                        <a 
                          href={`http://localhost:8000/documents/file/${doc.filename}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary btn-small"
                        >
                          Görüntüle
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Not */}
            {jobDetailModal.notes && (
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: 13 }}>📝 Not</h4>
                <div className="card subtle-card" style={{ padding: 12, fontSize: 13 }}>
                  {jobDetailModal.notes}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Müşteri Listesi */}
      {loading ? (
        <Loader text="Müşteriler yükleniyor..." />
      ) : error ? (
        <div className="card error-card">
          <div className="error-title">Liste yüklenemedi</div>
          <div className="error-message">{error}</div>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="card subtle-card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            {search ? 'Sonuç bulunamadı' : 'Henüz müşteri yok'}
          </div>
          <div className="text-muted">
            {search ? 'Farklı bir arama kriteri deneyin' : 'Yeni müşteri eklemek için butona tıklayın'}
          </div>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filteredCustomers}
          getKey={(row) => row.id}
          onRowClick={(row) => setCustomerDetailModal(row)}
        />
      )}
    </div>
  );
};

export default Customers;
