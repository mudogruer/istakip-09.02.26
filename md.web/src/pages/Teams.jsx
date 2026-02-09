import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import DataTable from '../components/DataTable';
import Loader from '../components/Loader';
import { StatusIcon } from '../utils/muiIcons';
import {
  getTeams,
  createTeam,
  updateTeam,
  softDeleteTeam,
  getTeamMembers,
  addTeamMember,
  removeTeamMember,
  getPersonnel,
} from '../services/dataService';

const defaultForm = {
  ad: '',
  aciklama: '',
  aktifMi: true,
};

const Teams = () => {
  const [teams, setTeams] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [aktifFilter, setAktifFilter] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [newMemberId, setNewMemberId] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [teamsData, personnelData] = await Promise.all([
          getTeams(),
          getPersonnel(true),
        ]);
        setTeams(teamsData);
        setPersonnel(personnelData);
      } catch (err) {
        setError(err.message || 'Ekip verileri alınamadı');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    let result = teams.filter((t) => !t.deleted);
    if (aktifFilter !== null) {
      result = result.filter((t) => t.aktifMi === aktifFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (t) =>
          (t.ad || '').toLowerCase().includes(q) ||
          (t.aciklama || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [teams, search, aktifFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm);
    setFormErrors({});
    setFormOpen(true);
  };

  const openEdit = (team) => {
    setEditing(team);
    setForm({
      ad: team.ad || '',
      aciklama: team.aciklama || '',
      aktifMi: team.aktifMi !== false,
    });
    setFormErrors({});
    setFormOpen(true);
  };

  const openMembers = async (team) => {
    setSelectedTeam(team);
    try {
      const members = await getTeamMembers(team.id);
      setTeamMembers(members);
      setMemberModalOpen(true);
    } catch (err) {
      setError(err.message || 'Üyeler yüklenemedi');
    }
  };

  const validate = () => {
    const errors = {};
    if (!form.ad.trim()) errors.ad = 'Ekip adı gerekli';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const saveForm = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setSubmitting(true);
      setError('');
      if (editing) {
        const updated = await updateTeam(editing.id, form);
        setTeams((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        setEditing(null);
      } else {
        const newTeam = await createTeam(form);
        setTeams((prev) => [newTeam, ...prev]);
      }
      setForm(defaultForm);
      setFormOpen(false);
    } catch (err) {
      setError(err.message || 'Kayıt başarısız');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await softDeleteTeam(deleteTarget.id);
      setTeams((prev) =>
        prev.map((t) => (t.id === deleteTarget.id ? { ...t, deleted: true, aktifMi: false } : t))
      );
      setDeleteTarget(null);
    } catch (err) {
      setError(err.message || 'Silme işlemi başarısız');
    }
  };

  const handleAddMember = async () => {
    if (!selectedTeam || !newMemberId) return;
    try {
      await addTeamMember(selectedTeam.id, newMemberId);
      const members = await getTeamMembers(selectedTeam.id);
      setTeamMembers(members);
      setNewMemberId('');
    } catch (err) {
      setError(err.message || 'Üye ekleme başarısız');
    }
  };

  const handleRemoveMember = async (personnelId) => {
    if (!selectedTeam) return;
    try {
      await removeTeamMember(selectedTeam.id, personnelId);
      const members = await getTeamMembers(selectedTeam.id);
      setTeamMembers(members);
    } catch (err) {
      setError(err.message || 'Üye çıkarma başarısız');
    }
  };

  const getPersonnelName = (personnelId) => {
    const person = personnel.find((p) => p.id === personnelId);
    return person ? `${person.ad} ${person.soyad}` : 'Bilinmiyor';
  };

  const columns = useMemo(
    () => [
      { accessor: 'ad', label: 'Ekip Adı' },
      { accessor: 'aciklama', label: 'Açıklama' },
      {
        accessor: 'aktifMi',
        label: 'Durum',
        render: (aktifMi) => (
          <span className={`badge ${aktifMi ? 'badge-success' : 'badge-secondary'}`}>
            {aktifMi ? 'Aktif' : 'Pasif'}
          </span>
        ),
      },
      {
        accessor: 'actions',
        label: 'İşlem',
        render: (_, row) => (
          <div className="action-buttons">
            <button
              className="btn btn-sm btn-secondary"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openMembers(row);
              }}
            >
              Üyeler
            </button>
            <button
              className="btn btn-sm btn-secondary"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openEdit(row);
              }}
            >
              Düzenle
            </button>
            <button
              className="btn btn-sm btn-danger"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget(row);
              }}
            >
              Sil
            </button>
          </div>
        ),
      },
    ],
    [personnel]
  );

  if (loading) return <Loader />;

  return (
    <div>
      <PageHeader
        title="Ekip Yönetimi"
        subtitle="Ekipleri görüntüleyin ve yönetin"
        actions={
          <button className="btn btn-primary" type="button" onClick={openCreate}>
            + Yeni Ekip
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
        <div className="card-header">
          <div className="filters">
            <input
              type="text"
              className="input"
              placeholder="Ara (ad, açıklama)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="select"
              value={aktifFilter === null ? 'all' : aktifFilter ? 'aktif' : 'pasif'}
              onChange={(e) => {
                const val = e.target.value;
                setAktifFilter(val === 'all' ? null : val === 'aktif');
              }}
            >
              <option value="all">Tümü</option>
              <option value="aktif">Aktif</option>
              <option value="pasif">Pasif</option>
            </select>
          </div>
        </div>
        <DataTable columns={columns} rows={filtered} />
      </div>

      {/* Form Modal */}
      <Modal
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
          setForm(defaultForm);
          setFormErrors({});
        }}
        title={editing ? <><StatusIcon icon="✏️" sx={{ mr: 0.5, verticalAlign: 'middle' }} /> Ekip Düzenle</> : <><StatusIcon icon="✨" sx={{ mr: 0.5, verticalAlign: 'middle' }} /> Yeni Ekip</>}
      >
        <form onSubmit={saveForm}>
          {/* Ekip Adı */}
          <div className="form-group">
            <label className="form-label">
              <StatusIcon icon="👥" sx={{ mr: 0.5, verticalAlign: 'middle' }} /> Ekip Adı <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <input
              type="text"
              className={`form-input ${formErrors.ad ? 'input-error' : ''}`}
              value={form.ad}
              onChange={(e) => setForm({ ...form, ad: e.target.value })}
              placeholder="Örn: Üretim Ekibi"
            />
            {formErrors.ad && (
              <div className="form-error" style={{ marginTop: 6, fontSize: 13, color: 'var(--color-danger)' }}>
                <StatusIcon icon="⚠️" sx={{ mr: 0.5, verticalAlign: 'middle' }} /> {formErrors.ad}
              </div>
            )}
          </div>

          {/* Açıklama */}
          <div className="form-group">
            <label className="form-label"><StatusIcon icon="📝" sx={{ mr: 0.5, verticalAlign: 'middle' }} /> Açıklama</label>
            <textarea
              className="form-textarea"
              rows="4"
              value={form.aciklama}
              onChange={(e) => setForm({ ...form, aciklama: e.target.value })}
              placeholder="Ekip hakkında açıklama yazabilirsiniz..."
              style={{ minHeight: 100 }}
            />
          </div>

          {/* Aktif */}
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.aktifMi}
                onChange={(e) => setForm({ ...form, aktifMi: e.target.checked })}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <StatusIcon icon="✅" sx={{ mr: 0.5, verticalAlign: 'middle' }} /> Aktif
            </label>
          </div>

          {/* Actions */}
          <div className="modal-actions" style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--color-border)' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setFormOpen(false)}>
              <StatusIcon icon="❌" sx={{ mr: 0.5, verticalAlign: 'middle' }} /> İptal
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <><StatusIcon icon="⏳" sx={{ mr: 0.5, verticalAlign: 'middle' }} /> Kaydediliyor...</> : editing ? <><StatusIcon icon="💾" sx={{ mr: 0.5, verticalAlign: 'middle' }} /> Güncelle</> : <><StatusIcon icon="✨" sx={{ mr: 0.5, verticalAlign: 'middle' }} /> Oluştur</>}
            </button>
          </div>
        </form>
      </Modal>

      {/* Members Modal */}
      <Modal
        isOpen={memberModalOpen}
        onClose={() => {
          setMemberModalOpen(false);
          setSelectedTeam(null);
          setTeamMembers([]);
          setNewMemberId('');
        }}
        title={selectedTeam ? <><StatusIcon icon="👥" sx={{ mr: 0.5, verticalAlign: 'middle' }} /> {selectedTeam.ad} - Üyeler</> : <><StatusIcon icon="👥" sx={{ mr: 0.5, verticalAlign: 'middle' }} /> Ekip Üyeleri</>}
      >
        {/* Yeni Üye Ekle */}
        <div className="form-group" style={{ marginBottom: 24 }}>
          <label className="form-label"><StatusIcon icon="➕" sx={{ mr: 0.5, verticalAlign: 'middle' }} /> Yeni Üye Ekle</label>
          <div style={{ display: 'flex', gap: 12 }}>
            <select
              className="form-select"
              style={{ flex: 1 }}
              value={newMemberId}
              onChange={(e) => setNewMemberId(e.target.value)}
            >
              <option value="">Personel seçin...</option>
              {personnel
                .filter((p) => p.aktifMi && !p.deleted && !teamMembers.some((tm) => tm.personnelId === p.id))
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.ad} {person.soyad} {person.email ? `(${person.email})` : ''}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleAddMember}
              disabled={!newMemberId}
            >
              <StatusIcon icon="✅" sx={{ mr: 0.5, verticalAlign: 'middle' }} /> Ekle
            </button>
          </div>
        </div>

        {/* Üye Listesi */}
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
          <h4 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--color-text)' }}>
            <StatusIcon icon="📋" sx={{ mr: 0.5, verticalAlign: 'middle' }} /> Mevcut Üyeler
          </h4>
          {teamMembers.length === 0 ? (
            <div style={{ 
              padding: 32, 
              textAlign: 'center', 
              background: 'var(--color-bg)', 
              borderRadius: 8,
              border: '1px dashed var(--color-border)',
              color: 'var(--color-text-light)'
            }}>
              <StatusIcon icon="📭" sx={{ mr: 0.5, verticalAlign: 'middle' }} /> Henüz üye eklenmemiş
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {teamMembers.map((member) => (
                <div
                  key={member.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 12,
                    background: 'var(--color-bg)',
                    borderRadius: 8,
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StatusIcon icon="👤" sx={{ fontSize: 18 }} />
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{getPersonnelName(member.personnelId)}</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => handleRemoveMember(member.personnelId)}
                  >
                    <StatusIcon icon="🗑️" sx={{ mr: 0.5, verticalAlign: 'middle' }} /> Çıkar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={<><StatusIcon icon="🗑️" sx={{ mr: 0.5, verticalAlign: 'middle' }} /> Ekip Sil</>}
      >
        <div style={{ padding: '8px 0' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            marginBottom: 24,
            fontSize: 48
          }}>
            <StatusIcon icon="⚠️" sx={{ fontSize: 48 }} />
          </div>
          <p style={{ 
            fontSize: 16, 
            textAlign: 'center', 
            marginBottom: 8,
            color: 'var(--color-text)',
            lineHeight: 1.6
          }}>
            <strong style={{ fontSize: 18, color: 'var(--color-danger)' }}>
              {deleteTarget && deleteTarget.ad}
            </strong>
            {' '}ekibini silmek istediğinize emin misiniz?
          </p>
          <p style={{ 
            fontSize: 13, 
            textAlign: 'center', 
            color: 'var(--color-text-light)',
            marginBottom: 0
          }}>
            Bu işlem geri alınamaz ve ekip listeden kaldırılacaktır.
          </p>
        </div>
        <div 
          className="modal-actions" 
          style={{ 
            marginTop: 32, 
            paddingTop: 20, 
            borderTop: '1px solid var(--color-border)'
          }}
        >
          <button type="button" className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>
            <StatusIcon icon="❌" sx={{ mr: 0.5, verticalAlign: 'middle' }} /> İptal
          </button>
          <button type="button" className="btn btn-danger" onClick={handleDelete}>
            <StatusIcon icon="🗑️" sx={{ mr: 0.5, verticalAlign: 'middle' }} /> Sil
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default Teams;
