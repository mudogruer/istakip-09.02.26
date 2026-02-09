import { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import PageHeader from '../components/PageHeader';
import { createJobRole, deleteJobRole, getJobRoles, updateJobRole } from '../services/dataService';

const defaultForm = { name: '', description: '' };

const IsKollari = () => {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(defaultForm);
  const [formErrors, setFormErrors] = useState({});
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await getJobRoles();
        setRoles(data);
      } catch (err) {
        setError(err.message || 'İş kolları alınamadı');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((r) => r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q));
  }, [roles, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm);
    setFormErrors({});
    setFormOpen(true);
  };

  const openEdit = (role) => {
    setEditing(role);
    setForm({ name: role.name, description: role.description || '' });
    setFormErrors({});
    setFormOpen(true);
  };

  const validate = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = 'İş kolu adı gerekli';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const saveForm = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      if (editing) {
        const updated = await updateJobRole(editing.id, form);
        setRoles((prev) => prev.map((r) => (r.id === editing.id ? updated : r)));
      } else {
        const created = await createJobRole(form);
        setRoles((prev) => [created, ...prev]);
      }
      setFormOpen(false);
      setEditing(null);
    } catch (err) {
      setError(err.message || 'Kayıt yapılamadı');
    }
  };

  const remove = async (role) => {
    try {
      await deleteJobRole(role.id);
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
    } catch (err) {
      setError(err.message || 'Silinemedi');
    }
  };

  return (
    <div>
      <PageHeader
        title="İş Kolları"
        subtitle="İş akışında kullanılacak iş kolu etiketlerini yönetin"
        actions={
          <button className="btn btn-primary" type="button" onClick={openCreate}>
            + Yeni İş Kolu
          </button>
        }
      />

      <div className="filter-bar">
        <div className="filter-group">
          <label className="filter-label" htmlFor="role-search">
            Arama
          </label>
          <input
            id="role-search"
            className="filter-input"
            placeholder="İş kolu veya açıklama"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="card subtle-card">Yükleniyor...</div>
      ) : error ? (
        <div className="card error-card">
          <div className="error-title">Hata</div>
          <div className="error-message">{error}</div>
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">İş Kolları</h3>
            <span className="badge badge-secondary">{filtered.length} kayıt</span>
          </div>
          <DataTable
            columns={[
              { label: 'Ad', accessor: 'name' },
              {
                label: 'Açıklama',
                accessor: 'description',
                render: (value) => <span className="text-muted">{value || '-'}</span>,
              },
              {
                label: 'Aksiyon',
                accessor: 'actions',
                render: (_, row) => (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-icon" type="button" onClick={() => openEdit(row)} aria-label="Düzenle">
                      ✏️
                    </button>
                    <button className="btn btn-danger btn-icon" type="button" onClick={() => remove(row)} aria-label="Sil">
                      🗑️
                    </button>
                  </div>
                ),
              },
            ]}
            rows={filtered}
          />
        </div>
      )}

      <Modal
        open={formOpen}
        title={editing ? 'İş Kolunu Düzenle' : 'Yeni İş Kolu'}
        onClose={() => setFormOpen(false)}
        actions={
          <>
            <button className="btn btn-secondary" type="button" onClick={() => setFormOpen(false)}>
              İptal
            </button>
            <button className="btn btn-primary" type="submit" form="role-form">
              Kaydet
            </button>
          </>
        }
      >
        <form id="role-form" className="grid grid-1" style={{ gap: 12 }} onSubmit={saveForm}>
          <div className="form-group">
            <label className="form-label" htmlFor="role-name">
              Ad
            </label>
            <input
              id="role-name"
              className="form-input"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
            {formErrors.name ? <div className="error-text">{formErrors.name}</div> : null}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="role-desc">
              Açıklama
            </label>
            <textarea
              id="role-desc"
              className="form-textarea"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Opsiyonel"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default IsKollari;


