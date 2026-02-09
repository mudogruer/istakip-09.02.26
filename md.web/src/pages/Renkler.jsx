import { useEffect, useState, useMemo } from 'react';
import DataTable from '../components/DataTable';
import Loader from '../components/Loader';
import Modal from '../components/Modal';
import PageHeader from '../components/PageHeader';
import { getColors, createColor, deleteColor } from '../services/dataService';

const Renkler = () => {
  const [colors, setColors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', code: '' });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await getColors();
        setColors(data);
      } catch (err) {
        setError(err.message || 'Renkler yüklenemedi');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const columns = useMemo(
    () => [
      { accessor: 'name', label: 'Renk Adı' },
      { accessor: 'code', label: 'Renk Kodu' },
      {
        accessor: 'actions',
        label: 'İşlem',
        render: (_, row) => (
          <button
            className="btn btn-danger btn-small"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(row);
            }}
          >
            Sil
          </button>
        ),
      },
    ],
    []
  );

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Renk adı gerekli';
    if (!formData.code.trim()) errors.code = 'Renk kodu gerekli';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      setSubmitting(true);
      const created = await createColor({
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase(),
      });
      setColors((prev) => [created, ...prev]);
      setFormOpen(false);
      setFormData({ name: '', code: '' });
    } catch (err) {
      setFormErrors({ submit: err.message || 'Renk eklenemedi' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setSubmitting(true);
      await deleteColor(deleteTarget.id);
      setColors((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err.message || 'Silinemedi');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container">
      <PageHeader
        title="Renk Yönetimi"
        subtitle="Stok kalemlerinde kullanılacak renkleri tanımlayın"
        actions={
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setFormData({ name: '', code: '' });
              setFormErrors({});
              setFormOpen(true);
            }}
          >
            + Yeni Renk
          </button>
        }
      />

      {error && (
        <div className="card error-card">
          <div className="error-title">Hata</div>
          <div className="error-message">{error}</div>
        </div>
      )}

      <div className="card">
        <div className="card-body">
          {loading ? (
            <Loader text="Renkler yükleniyor..." />
          ) : (
            <DataTable
              columns={columns}
              rows={colors}
            />
          )}
        </div>
      </div>

      {/* Yeni Renk Modal */}
      <Modal
        open={formOpen}
        title="Yeni Renk Ekle"
        onClose={() => setFormOpen(false)}
        size="small"
        actions={
          <>
            <button className="btn btn-secondary" type="button" onClick={() => setFormOpen(false)}>
              İptal
            </button>
            <button className="btn btn-primary" type="submit" form="color-form" disabled={submitting}>
              {submitting ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </>
        }
      >
        <form id="color-form" onSubmit={handleSubmit}>
          {formErrors.submit && (
            <div className="error-text" style={{ marginBottom: 12 }}>
              {formErrors.submit}
            </div>
          )}
          <div className="form-group">
            <label className="form-label" htmlFor="color-name">
              Renk Adı
            </label>
            <input
              id="color-name"
              className={`form-input ${formErrors.name ? 'input-error' : ''}`}
              type="text"
              placeholder="Örn: Beyaz, Antrasit, Krem"
              value={formData.name}
              onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
            />
            {formErrors.name && <span className="error-text">{formErrors.name}</span>}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="color-code">
              Renk Kodu
            </label>
            <input
              id="color-code"
              className={`form-input ${formErrors.code ? 'input-error' : ''}`}
              type="text"
              placeholder="Örn: BYZ, ANT, KRM"
              value={formData.code}
              onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
            />
            {formErrors.code && <span className="error-text">{formErrors.code}</span>}
          </div>
        </form>
      </Modal>

      {/* Silme Onayı Modal */}
      <Modal
        open={Boolean(deleteTarget)}
        title="Silme Onayı"
        onClose={() => setDeleteTarget(null)}
        size="small"
        actions={
          <>
            <button className="btn btn-secondary" type="button" onClick={() => setDeleteTarget(null)}>
              İptal
            </button>
            <button className="btn btn-danger" type="button" onClick={handleDelete} disabled={submitting}>
              Sil
            </button>
          </>
        }
      >
        <p>
          <strong>{deleteTarget?.name}</strong> ({deleteTarget?.code}) rengini silmek istediğinize emin misiniz?
        </p>
      </Modal>
    </div>
  );
};

export default Renkler;

