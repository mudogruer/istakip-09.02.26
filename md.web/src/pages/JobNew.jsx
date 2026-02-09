import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { createCustomer, createJob, getCustomers } from '../services/dataService';

const JobNew = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdJob, setCreatedJob] = useState(null);
  const [form, setForm] = useState({
    customerId: '',
    customerName: '',
    title: '',
    startType: 'OLCU',
    newCustomer: false,
    segment: 'B2B',
    location: '',
    contact: '',
  });

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await getCustomers();
        setCustomers(data.filter((c) => !c.deleted));
      } catch (err) {
        setError(err.message || 'Müşteriler alınamadı');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      setSubmitting(true);
      setError('');

      let customerId = form.customerId;
      let customerName = form.customerName;

      if (form.newCustomer) {
        const created = await createCustomer({
          name: form.customerName,
          segment: form.segment,
          location: form.location,
          contact: form.contact,
        });
        customerId = created.id;
        customerName = created.name;
        setCustomers((prev) => [created, ...prev]);
      }

      const job = await createJob({
        customerId,
        customerName,
        title: form.title,
        startType: form.startType,
      });
      setCreatedJob(job);
      setForm({
        customerId: '',
        customerName: '',
        title: '',
        startType: 'OLCU',
        newCustomer: false,
        segment: 'B2B',
        location: '',
        contact: '',
      });
    } catch (err) {
      setError(err.message || 'İş oluşturulamadı');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCustomer = customers.find((c) => c.id === form.customerId);

  return (
    <div>
      <PageHeader title="Yeni İş Başlat (Wizard)" subtitle="Müşteri seç ve başlangıç türünü belirle" />

      {error ? (
        <div className="card error-card">
          <div className="error-title">Hata</div>
          <div className="error-message">{error}</div>
        </div>
      ) : null}

      <form className="card" onSubmit={handleSubmit}>
        <div className="grid grid-2">
          <div className="form-group">
            <label className="form-label" htmlFor="job-title">
              İş Başlığı
            </label>
            <input
              id="job-title"
              className="form-input"
              placeholder="Örn: Balkon PVC Doğrama"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="start-type">
              Başlatma Türü
            </label>
            <select
              id="start-type"
              className="form-select"
              value={form.startType}
              onChange={(e) => setForm((prev) => ({ ...prev, startType: e.target.value }))}
            >
              <option value="OLCU">Ölçü ile Başlat</option>
              <option value="FIYATLANDIRMA">Fiyatlandırma ile Başlat</option>
            </select>
          </div>
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-header">
            <h3 className="card-title">Müşteri</h3>
          </div>
          <div className="card-body" style={{ display: 'flex', gap: 16, flexDirection: 'column' }}>
            <label className="form-label" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="radio"
                name="customer-mode"
                checked={!form.newCustomer}
                onChange={() => setForm((prev) => ({ ...prev, newCustomer: false }))}
              />
              Mevcut müşteriden seç
            </label>
            {!form.newCustomer ? (
              <select
                className="form-select"
                value={form.customerId}
                onChange={(e) => {
                  const id = e.target.value;
                  const found = customers.find((c) => c.id === id);
                  setForm((prev) => ({
                    ...prev,
                    customerId: id,
                    customerName: found?.name || '',
                  }));
                }}
                required
              >
                <option value="">Müşteri seçin</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.segment})
                  </option>
                ))}
              </select>
            ) : null}

            <label className="form-label" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="radio"
                name="customer-mode"
                checked={form.newCustomer}
                onChange={() =>
                  setForm((prev) => ({
                    ...prev,
                    newCustomer: true,
                    customerId: '',
                    customerName: '',
                  }))
                }
              />
              Yeni müşteri oluştur
            </label>

            {form.newCustomer ? (
              <div className="grid grid-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="new-name">
                    Ad
                  </label>
                  <input
                    id="new-name"
                    className="form-input"
                    value={form.customerName}
                    onChange={(e) => setForm((prev) => ({ ...prev, customerName: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="new-segment">
                    Segment
                  </label>
                  <select
                    id="new-segment"
                    className="form-select"
                    value={form.segment}
                    onChange={(e) => setForm((prev) => ({ ...prev, segment: e.target.value }))}
                  >
                    <option value="B2B">B2B</option>
                    <option value="B2C">B2C</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="new-location">
                    Lokasyon
                  </label>
                  <input
                    id="new-location"
                    className="form-input"
                    value={form.location}
                    onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="new-contact">
                    İletişim
                  </label>
                  <input
                    id="new-contact"
                    className="form-input"
                    value={form.contact}
                    onChange={(e) => setForm((prev) => ({ ...prev, contact: e.target.value }))}
                  />
                </div>
              </div>
            ) : selectedCustomer ? (
              <div className="card subtle-card">
                <div className="metric-row">
                  <span className="metric-label">Segment</span>
                  <span className="metric-value">{selectedCustomer.segment}</span>
                </div>
                <div className="metric-row">
                  <span className="metric-label">Lokasyon</span>
                  <span className="metric-value">{selectedCustomer.location}</span>
                </div>
                <div className="metric-row">
                  <span className="metric-label">İletişim</span>
                  <span className="metric-value">{selectedCustomer.contact}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="page-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-secondary" type="button" onClick={() => setCreatedJob(null)}>
            Temizle
          </button>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Kaydediliyor...' : 'Kaydet ve Başlat'}
          </button>
        </div>
      </form>

      {createdJob ? (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-header">
            <h3 className="card-title">İş oluşturuldu</h3>
            <span className="badge badge-primary">{createdJob.id}</span>
          </div>
          <div className="card-body">
            <div className="metric-list">
              <div className="metric-row">
                <span className="metric-label">İş Başlığı</span>
                <span className="metric-value">{createdJob.title}</span>
              </div>
              <div className="metric-row">
                <span className="metric-label">Müşteri</span>
                <span className="metric-value">{createdJob.customerName}</span>
              </div>
              <div className="metric-row">
                <span className="metric-label">Durum</span>
                <span className="metric-value">{createdJob.status}</span>
              </div>
              <div className="metric-row">
                <span className="metric-label">Başlatma</span>
                <span className="metric-value">{createdJob.startType}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default JobNew;

