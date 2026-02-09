import { useEffect, useMemo, useState, useCallback } from 'react';
import DataTable from '../components/DataTable';
import Loader from '../components/Loader';
import Modal from '../components/Modal';
import PageHeader from '../components/PageHeader';
import AutocompleteInput from '../components/AutocompleteInput';
import {
  getStockItems,
  createStockItem,
  updateStockItem,
  deleteStockItem,
  getColors,
  getSuppliersFromAPI,
} from '../services/dataService';

const defaultForm = {
  productCode: '',
  colorCode: '',
  name: '',
  colorName: '',
  unit: 'boy',
  supplierId: '',
  supplierName: '',
  critical: 0,
  unitCost: 0,
  notes: '',
};

const getStatus = (item) => {
  const available = Math.max(0, (item.onHand || 0) - (item.reserved || 0));
  const threshold = item.critical || 0;
  if (available <= 0) return { label: 'Tükendi', tone: 'danger' };
  if (available <= threshold) return { label: 'Kritik', tone: 'danger' };
  if (available <= threshold * 1.5) return { label: 'Düşük', tone: 'warning' };
  return { label: 'Sağlıklı', tone: 'success' };
};

const formatNumber = (value) => new Intl.NumberFormat('tr-TR').format(value || 0);
const formatCurrency = (value) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(value || 0);

const StokList = () => {
  const [items, setItems] = useState([]);
  const [colors, setColors] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState('');
  const [productCodeSearch, setProductCodeSearch] = useState('');
  const [colorCodeSearch, setColorCodeSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showIssuesOnly, setShowIssuesOnly] = useState(false);
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form states
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [stockPayload, colorsPayload, suppliersPayload] = await Promise.all([
        getStockItems(),
        getColors().catch(() => []),
        getSuppliersFromAPI().catch(() => []),
      ]);
      setItems(stockPayload);
      setColors(colorsPayload);
      setSuppliers(suppliersPayload);
    } catch (err) {
      setError(err.message || 'Stok listesi alınamadı');
    } finally {
      setLoading(false);
    }
  };

  // Tedarikçi listesi (autocomplete için)
  const supplierOptions = useMemo(() => {
    return suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      displayName: `${s.name} (${s.type === 'dealer' ? 'Bayi' : 'Üretici'})`,
    }));
  }, [suppliers]);

  // Renk listesi (autocomplete için)
  const colorOptions = useMemo(() => {
    // Mevcut ürünlerdeki renkleri de ekle
    const colorSet = new Map();
    
    colors.forEach((c) => {
      colorSet.set(c.code || c.id, { code: c.code || c.id, name: c.name });
    });
    
    items.forEach((item) => {
      if (item.colorCode && !colorSet.has(item.colorCode)) {
        colorSet.set(item.colorCode, { code: item.colorCode, name: item.colorName || item.colorCode });
      }
    });

    return Array.from(colorSet.values());
  }, [colors, items]);

  const filteredAndSorted = useMemo(() => {
    const query = search.trim().toLowerCase();
    const productQuery = productCodeSearch.trim().toLowerCase();
    const colorQuery = colorCodeSearch.trim().toLowerCase();
    let data = [...items];

    if (query) {
      data = data.filter(
        (item) =>
          (item.name || '').toLowerCase().includes(query) ||
          (item.supplierName || '').toLowerCase().includes(query)
      );
    }

    if (productQuery) {
      data = data.filter((item) => (item.productCode || '').toLowerCase().includes(productQuery));
    }

    if (colorQuery) {
      data = data.filter((item) => (item.colorCode || '').toLowerCase().includes(colorQuery));
    }

    if (supplierFilter !== 'all') {
      data = data.filter((item) => item.supplierId === supplierFilter);
    }

    if (statusFilter !== 'all') {
      data = data.filter((item) => getStatus(item).label === statusFilter);
    }

    if (showIssuesOnly) {
      data = data.filter((item) => getStatus(item).tone !== 'success');
    }

    data.sort((a, b) => {
      const aVal = sortKey === 'available' ? (a.onHand || 0) - (a.reserved || 0) : a[sortKey];
      const bVal = sortKey === 'available' ? (b.onHand || 0) - (b.reserved || 0) : b[sortKey];
      if (typeof aVal === 'string') {
        return sortDir === 'asc' ? (aVal || '').localeCompare(bVal || '') : (bVal || '').localeCompare(aVal || '');
      }
      return sortDir === 'asc' ? (aVal || 0) - (bVal || 0) : (bVal || 0) - (aVal || 0);
    });

    return data.map((item) => ({
      ...item,
      available: Math.max(0, (item.onHand || 0) - (item.reserved || 0)),
      stockValue: (item.unitCost || 0) * (item.onHand || 0),
    }));
  }, [items, search, productCodeSearch, colorCodeSearch, supplierFilter, statusFilter, sortKey, sortDir, showIssuesOnly]);

  const summary = useMemo(() => {
    const totalItems = items.length;
    const totalOnHand = items.reduce((sum, item) => sum + (item.onHand || 0), 0);
    const totalAvailable = items.reduce((sum, item) => sum + Math.max(0, (item.onHand || 0) - (item.reserved || 0)), 0);
    const criticalCount = items.filter((item) => getStatus(item).tone !== 'success').length;
    const totalValue = items.reduce((sum, item) => sum + (item.unitCost || 0) * (item.onHand || 0), 0);
    return [
      { id: 'sum1', label: 'Ürün Çeşidi', value: formatNumber(totalItems), icon: '📦' },
      { id: 'sum2', label: 'Mevcut Stok', value: formatNumber(totalOnHand), icon: '📊' },
      { id: 'sum3', label: 'Kullanılabilir', value: formatNumber(totalAvailable), icon: '🔓' },
      { id: 'sum4', label: 'Dikkat Gereken', value: formatNumber(criticalCount), icon: '⚠️' },
      { id: 'sum5', label: 'Tahmini Değer', value: formatCurrency(totalValue), icon: '💰' },
    ];
  }, [items]);

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm);
    setFormErrors({});
    setFormOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      productCode: item.productCode || '',
      colorCode: item.colorCode || '',
      name: item.name || '',
      colorName: item.colorName || '',
      unit: item.unit || 'boy',
      supplierId: item.supplierId || '',
      supplierName: item.supplierName || '',
      critical: item.critical || 0,
      unitCost: item.unitCost || 0,
      notes: item.notes || '',
    });
    setFormErrors({});
    setFormOpen(true);
  };

  const validateForm = () => {
    const errors = {};
    if (!form.productCode.trim()) errors.productCode = 'Ürün kodu gerekli';
    if (!form.colorCode.trim()) errors.colorCode = 'Renk kodu gerekli';
    if (!form.name.trim()) errors.name = 'Ürün adı gerekli';
    if (!form.unit.trim()) errors.unit = 'Birim gerekli';
    if (!form.supplierId && !form.supplierName.trim()) errors.supplierName = 'Tedarikçi gerekli';
    
    if (Number(form.critical) < 0) errors.critical = '0 veya üzeri olmalı';
    if (Number(form.unitCost) < 0) errors.unitCost = '0 veya üzeri olmalı';
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const saveForm = async (event) => {
    event.preventDefault();
    if (!validateForm()) return;

    const payload = {
      productCode: form.productCode.trim(),
      colorCode: form.colorCode.trim(),
      name: form.name.trim(),
      colorName: form.colorName.trim() || form.colorCode.trim(),
      unit: form.unit,
      supplierId: form.supplierId || `SUP-TEMP-${Date.now()}`,
      supplierName: form.supplierName.trim(),
      critical: Number(form.critical) || 0,
      unitCost: Number(form.unitCost) || 0,
      notes: form.notes || '',
    };

    try {
      setSubmitting(true);
      setError('');
      
      if (editing) {
        const updated = await updateStockItem(editing.id, payload);
        setItems((prev) => prev.map((item) => (item.id === editing.id ? updated : item)));
      } else {
        const created = await createStockItem(payload);
        setItems((prev) => [created, ...prev]);
      }
      
      setFormOpen(false);
      setEditing(null);
    } catch (err) {
      const errorMsg = err.message || 'Kayıt yapılamadı';
      // Pydantic validation error'larını daha okunabilir yap
      if (errorMsg.includes('validation error') || errorMsg.includes('field required')) {
        setError('Eksik veya hatalı alan var. Lütfen tüm zorunlu alanları doldurun.');
      } else {
        setError(errorMsg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setSubmitting(true);
      await deleteStockItem(deleteTarget.id);
      setItems((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err.message || 'Silinemedi');
    } finally {
      setSubmitting(false);
    }
  };

  const exportCsv = () => {
    const header = ['Ürün Kodu', 'Renk Kodu', 'Ürün Adı', 'Tedarikçi', 'Mevcut', 'Rezerve', 'Kullanılabilir', 'Kritik', 'Birim', 'Birim Maliyet', 'Durum'];
    const rows = items.map((item) => {
      const status = getStatus(item).label;
      const available = Math.max(0, (item.onHand || 0) - (item.reserved || 0));
      return [
        item.productCode,
        item.colorCode,
        item.name,
        item.supplierName,
        item.onHand,
        item.reserved,
        available,
        item.critical,
        item.unit,
        item.unitCost,
        status,
      ].map((val) => `"${String(val ?? '').replace(/"/g, '""')}"`).join(',');
    });
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'stok-listesi.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  // Renk seçildiğinde
  const handleColorSelect = (colorOption) => {
    if (colorOption) {
      setForm((prev) => ({
        ...prev,
        colorCode: colorOption.code || colorOption,
        colorName: colorOption.name || colorOption,
      }));
    }
  };

  // Tedarikçi seçildiğinde
  const handleSupplierSelect = (supplierOption) => {
    if (supplierOption) {
      setForm((prev) => ({
        ...prev,
        supplierId: supplierOption.id || '',
        supplierName: supplierOption.name || supplierOption,
      }));
    }
  };

  return (
    <div>
      <PageHeader
        title="Stok Listesi"
        subtitle="Ürün tanımlama ve stok durumu takibi"
        actions={
          <>
            <button className="btn btn-secondary" type="button" onClick={exportCsv}>
              📥 CSV Dışa Aktar
            </button>
            <button className="btn btn-primary" type="button" onClick={openCreate}>
              ➕ Yeni Ürün
            </button>
          </>
        }
      />

      {/* Özet Kartları */}
      <div className="stats-grid" style={{ marginBottom: 16 }}>
        {summary.map((stat) => (
          <div key={stat.id} className="card" style={{ padding: 16 }}>
            <div className="metric-row" style={{ alignItems: 'center' }}>
              <div className="metric-icon" aria-hidden="true">{stat.icon}</div>
              <div style={{ flex: 1 }}>
                <div className="metric-label">{stat.label}</div>
                <div className="metric-value">{stat.value}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtreler */}
      <div className="filter-bar">
        <div className="filter-group">
          <label className="filter-label">Ürün Ara</label>
          <input
            className="filter-input"
            type="search"
            placeholder="Ürün adı, tedarikçi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label className="filter-label">Ürün Kodu</label>
          <input
            className="filter-input"
            type="search"
            placeholder="Kod ara..."
            value={productCodeSearch}
            onChange={(e) => setProductCodeSearch(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label className="filter-label">Renk Kodu</label>
          <input
            className="filter-input"
            type="search"
            placeholder="Renk ara..."
            value={colorCodeSearch}
            onChange={(e) => setColorCodeSearch(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label className="filter-label">Tedarikçi</label>
          <select
            className="filter-input"
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
          >
            <option value="all">Tümü</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">Durum</label>
          <select
            className="filter-input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Tümü</option>
            <option value="Kritik">Kritik</option>
            <option value="Düşük">Düşük</option>
            <option value="Sağlıklı">Sağlıklı</option>
            <option value="Tükendi">Tükendi</option>
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">Sırala</label>
          <select
            className="filter-input"
            value={`${sortKey}-${sortDir}`}
            onChange={(e) => {
              const [key, dir] = e.target.value.split('-');
              setSortKey(key);
              setSortDir(dir);
            }}
          >
            <option value="name-asc">Ürün Adı (A→Z)</option>
            <option value="name-desc">Ürün Adı (Z→A)</option>
            <option value="productCode-asc">Ürün Kodu (A→Z)</option>
            <option value="available-desc">Stok (yüksek → düşük)</option>
            <option value="available-asc">Stok (düşük → yüksek)</option>
          </select>
        </div>
        <div className="filter-group" style={{ alignSelf: 'flex-end' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showIssuesOnly}
              onChange={(e) => setShowIssuesOnly(e.target.checked)}
            />
            <span className="text-muted">Sadece dikkat gereken</span>
          </label>
        </div>
      </div>

      {/* Hata mesajı */}
      {error && (
        <div className="card error-card" style={{ marginTop: 16, marginBottom: 16 }}>
          <div className="error-title">Hata</div>
          <div className="error-message">{error}</div>
        </div>
      )}

      {/* Tablo */}
      {loading ? (
        <Loader text="Stok listesi yükleniyor..." />
      ) : (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <h3 className="card-title">Ürünler</h3>
            <span className="badge badge-secondary">{filteredAndSorted.length} kayıt</span>
          </div>
          <DataTable
            columns={[
              {
                label: 'Ürün',
                accessor: 'name',
                render: (_, row) => (
                  <div>
                    <div style={{ fontWeight: 600 }}>{row.name}</div>
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      Kod: {row.productCode} · Renk: {row.colorCode}
                    </div>
                  </div>
                ),
              },
              {
                label: 'Tedarikçi',
                accessor: 'supplierName',
                render: (val) => val || '-',
              },
              {
                label: 'Stok Durumu',
                accessor: 'onHand',
                render: (_, row) => (
                  <div>
                    <strong>{formatNumber(row.onHand || 0)}</strong> {row.unit}
                    <div className="text-muted" style={{ fontSize: 11 }}>
                      Rezerve: {formatNumber(row.reserved || 0)} · Kullanılabilir: <strong>{formatNumber(row.available)}</strong>
                    </div>
                  </div>
                ),
              },
              {
                label: 'Kritik',
                accessor: 'critical',
                render: (val) => formatNumber(val || 0),
              },
              {
                label: 'Durum',
                accessor: 'status',
                render: (_, row) => {
                  const status = getStatus(row);
                  return <span className={`badge badge-${status.tone}`}>{status.label}</span>;
                },
              },
              {
                label: 'Aksiyon',
                accessor: 'actions',
                render: (_, row) => (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn btn-secondary btn-icon"
                      type="button"
                      onClick={() => openEdit(row)}
                      title="Düzenle"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn btn-danger btn-icon"
                      type="button"
                      onClick={() => setDeleteTarget(row)}
                      title="Sil"
                    >
                      🗑️
                    </button>
                  </div>
                ),
              },
            ]}
            rows={filteredAndSorted}
          />
        </div>
      )}

      {/* Ürün Ekleme/Düzenleme Modal */}
      <Modal
        open={formOpen}
        title={editing ? 'Ürün Düzenle' : 'Yeni Ürün Tanımla'}
        size="large"
        onClose={() => setFormOpen(false)}
        actions={
          <>
            <button className="btn btn-secondary" type="button" onClick={() => setFormOpen(false)}>
              İptal
            </button>
            <button className="btn btn-primary" type="submit" form="stock-form" disabled={submitting}>
              {submitting ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </>
        }
      >
        <form id="stock-form" onSubmit={saveForm}>
          <div className="grid grid-2" style={{ gap: 16 }}>
            {/* Ürün Kodu */}
            <div className="form-group">
              <label className="form-label">
                Ürün Kodu <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <input
                className={`form-input ${formErrors.productCode ? 'input-error' : ''}`}
                value={form.productCode}
                onChange={(e) => setForm((p) => ({ ...p, productCode: e.target.value }))}
                placeholder="Örn: 18300"
                autoFocus
              />
              {formErrors.productCode && <div className="form-error">{formErrors.productCode}</div>}
            </div>

            {/* Renk Kodu - Autocomplete */}
            <AutocompleteInput
              label="Renk Kodu"
              required
              value={form.colorCode}
              onChange={(val) => setForm((p) => ({ ...p, colorCode: val }))}
              onSelect={handleColorSelect}
              options={colorOptions}
              displayKey="name"
              valueKey="code"
              placeholder="Renk kodu yazın..."
              renderOption={(opt) => (
                <div className="autocomplete-option-content">
                  <span className="autocomplete-option-value">{opt.code}</span>
                  <span className="autocomplete-option-label">{opt.name}</span>
                </div>
              )}
              error={formErrors.colorCode}
            />

            {/* Ürün Adı */}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">
                Ürün Adı <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <input
                className={`form-input ${formErrors.name ? 'input-error' : ''}`}
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Örn: Carisma Kasa"
              />
              {formErrors.name && <div className="form-error">{formErrors.name}</div>}
            </div>

            {/* Birim */}
            <div className="form-group">
              <label className="form-label">
                Birim <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <select
                className="form-select"
                value={form.unit}
                onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
              >
                <option value="boy">Boy (metre)</option>
                <option value="adet">Adet</option>
                <option value="m2">m² (metrekare)</option>
                <option value="kg">Kg</option>
                <option value="paket">Paket</option>
              </select>
            </div>

            {/* Tedarikçi - Autocomplete */}
            <AutocompleteInput
              label="Tedarikçi"
              required
              value={form.supplierName}
              onChange={(val) => setForm((p) => ({ ...p, supplierName: val, supplierId: '' }))}
              onSelect={handleSupplierSelect}
              options={supplierOptions}
              displayKey="name"
              valueKey="id"
              placeholder="Tedarikçi adı yazın..."
              allowCreate
              createLabel="Yeni tedarikçi ekle"
              onCreate={(name) => {
                setForm((p) => ({ ...p, supplierName: name, supplierId: '' }));
              }}
              renderOption={(opt) => (
                <div className="autocomplete-option-content">
                  <span className="autocomplete-option-label">{opt.displayName || opt.name}</span>
                </div>
              )}
              error={formErrors.supplierName}
            />

            {/* Kritik Stok Seviyesi */}
            <div className="form-group">
              <label className="form-label">Kritik Stok Seviyesi</label>
              <input
                className={`form-input ${formErrors.critical ? 'input-error' : ''}`}
                type="number"
                min="0"
                value={form.critical}
                onChange={(e) => setForm((p) => ({ ...p, critical: e.target.value }))}
                placeholder="0"
              />
              <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                Bu seviyenin altına düşünce uyarı verilir
              </div>
              {formErrors.critical && <div className="form-error">{formErrors.critical}</div>}
            </div>

            {/* Birim Maliyet */}
            <div className="form-group">
              <label className="form-label">Birim Maliyet (₺)</label>
              <input
                className={`form-input ${formErrors.unitCost ? 'input-error' : ''}`}
                type="number"
                min="0"
                step="0.01"
                value={form.unitCost}
                onChange={(e) => setForm((p) => ({ ...p, unitCost: e.target.value }))}
                placeholder="0"
              />
              {formErrors.unitCost && <div className="form-error">{formErrors.unitCost}</div>}
            </div>

            {/* Not */}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Not (Opsiyonel)</label>
              <textarea
                className="form-textarea"
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Ek bilgiler..."
                rows={2}
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* Silme Onay Modal */}
      <Modal
        open={Boolean(deleteTarget)}
        title="Silme Onayı"
        size="small"
        onClose={() => setDeleteTarget(null)}
        actions={
          <>
            <button className="btn btn-secondary" type="button" onClick={() => setDeleteTarget(null)}>
              Vazgeç
            </button>
            <button className="btn btn-danger" type="button" onClick={confirmDelete} disabled={submitting}>
              Sil
            </button>
          </>
        }
      >
        <p>
          <strong>{deleteTarget?.name}</strong> ({deleteTarget?.productCode}-{deleteTarget?.colorCode}) ürününü silmek istediğinize emin misiniz?
        </p>
        <p className="text-muted" style={{ marginTop: 8 }}>
          Bu işlem geri alınamaz.
        </p>
      </Modal>
    </div>
  );
};

export default StokList;
