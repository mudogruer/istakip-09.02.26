import { useState, useEffect } from 'react';
import Modal from './Modal';
import { getPersonnel, getSettingsAll } from '../services/dataService';
import { UIIcon } from '../utils/muiIcons';

/**
 * Gecikme Nedeni Modal
 * Tarih ileri alındığında zorunlu olarak gösterilir
 * 
 * Props:
 * - isOpen: Modal açık mı
 * - onClose: Kapatma callback
 * - onConfirm: Onaylama callback ({ reason, responsiblePersonId, note })
 * - originalDate: Orijinal tarih
 * - newDate: Yeni tarih
 * - delayDays: Gecikme gün sayısı (hesaplanmış)
 * - title: Modal başlığı (opsiyonel)
 */
const DelayReasonModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  originalDate, 
  newDate, 
  delayDays,
  title = 'Gecikme Nedeni Gerekli'
}) => {
  const [delayReasons, setDelayReasons] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  const [form, setForm] = useState({
    reason: '',
    responsiblePersonId: '',
    note: ''
  });
  const [errors, setErrors] = useState({});

  // Verileri yükle
  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [settingsData, personnelData] = await Promise.all([
        getSettingsAll(),
        getPersonnel()
      ]);
      
      setDelayReasons(settingsData?.delayReasons || []);
      setPersonnel(personnelData || []);
    } catch (err) {
      console.error('Veri yüklenemedi:', err);
    } finally {
      setLoading(false);
    }
  };

  // Formu sıfırla
  useEffect(() => {
    if (isOpen) {
      setForm({ reason: '', responsiblePersonId: '', note: '' });
      setErrors({});
    }
  }, [isOpen]);

  const validate = () => {
    const newErrors = {};
    
    if (!form.reason) {
      newErrors.reason = 'Gecikme nedeni zorunludur';
    }
    if (!form.responsiblePersonId) {
      newErrors.responsiblePersonId = 'Sorumlu kişi zorunludur';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    
    setSubmitting(true);
    try {
      await onConfirm({
        reason: form.reason,
        responsiblePersonId: form.responsiblePersonId,
        note: form.note || null
      });
    } catch (err) {
      console.error('Gecikme kaydedilemedi:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('tr-TR');
    } catch {
      return dateStr;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="small">
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          Yükleniyor...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Gecikme Özeti */}
          <div 
            style={{ 
              background: 'var(--color-warning-light, #FEF3C7)', 
              border: '1px solid var(--color-warning, #F59E0B)',
              borderRadius: 8,
              padding: 16
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <UIIcon name="warning" sx={{ fontSize: 20 }} />
              <span style={{ fontWeight: 600, color: 'var(--color-warning-dark, #B45309)' }}>
                Tarih {delayDays} gün ertelendi
              </span>
            </div>
            <div style={{ display: 'flex', gap: 20, fontSize: 14, color: '#666' }}>
              <div>
                <span style={{ fontWeight: 500 }}>Eski:</span> {formatDate(originalDate)}
              </div>
              <div>
                <span style={{ fontWeight: 500 }}>Yeni:</span> {formatDate(newDate)}
              </div>
            </div>
          </div>

          {/* Gecikme Nedeni */}
          <div className="form-group">
            <label className="form-label">
              Gecikme Nedeni <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <select
              className={`form-input ${errors.reason ? 'input-error' : ''}`}
              value={form.reason}
              onChange={(e) => setForm(p => ({ ...p, reason: e.target.value }))}
            >
              <option value="">Seçiniz...</option>
              {delayReasons
                .filter(r => r.active !== false)
                .map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))
              }
            </select>
            {errors.reason && <div className="form-error">{errors.reason}</div>}
          </div>

          {/* Sorumlu Kişi */}
          <div className="form-group">
            <label className="form-label">
              Sorumlu Kişi <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <select
              className={`form-input ${errors.responsiblePersonId ? 'input-error' : ''}`}
              value={form.responsiblePersonId}
              onChange={(e) => setForm(p => ({ ...p, responsiblePersonId: e.target.value }))}
            >
              <option value="">Seçiniz...</option>
              {personnel.map(p => (
                <option key={p.id} value={p.id}>{p.ad} {p.soyad || ''}</option>
              ))}
            </select>
            {errors.responsiblePersonId && (
              <div className="form-error">{errors.responsiblePersonId}</div>
            )}
          </div>

          {/* Açıklama */}
          <div className="form-group">
            <label className="form-label">Açıklama (Opsiyonel)</label>
            <textarea
              className="form-input"
              rows={3}
              value={form.note}
              onChange={(e) => setForm(p => ({ ...p, note: e.target.value }))}
              placeholder="Gecikme hakkında ek bilgi..."
            />
          </div>

          {/* Butonlar */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
            <button 
              className="btn btn-secondary" 
              onClick={onClose}
              disabled={submitting}
            >
              İptal
            </button>
            <button 
              className="btn btn-primary" 
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Kaydediliyor...' : 'Kaydet ve Devam Et'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default DelayReasonModal;
