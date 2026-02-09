import { useEffect, useState, useMemo, useRef } from 'react';
import DataTable from '../components/DataTable';
import DateInput from '../components/DateInput';
import NumberInput from '../components/NumberInput';
import Modal from '../components/Modal';
import PageHeader from '../components/PageHeader';
import Loader from '../components/Loader';
import AutocompleteInput from '../components/AutocompleteInput';
import {
  getStockMovements,
  getStockItems,
  createStockMovement,
} from '../services/dataService';

const formatNumber = (value) => new Intl.NumberFormat('tr-TR').format(value || 0);

const MOVEMENT_TYPES = {
  stockIn: { label: 'Stok Girişi', icon: '📥', color: 'success' },
  stockOut: { label: 'Stok Çıkışı', icon: '📤', color: 'danger' },
  reserve: { label: 'Rezervasyon', icon: '🔒', color: 'warning' },
  release: { label: 'Rezerv İptal', icon: '🔓', color: 'info' },
  consume: { label: 'Üretime Alındı', icon: '🏭', color: 'primary' },
};

const ENTRY_REASONS = [
  { value: 'sayim', label: 'Sayım Düzeltme' },
  { value: 'siparis', label: 'Sipariş Teslimi' },
  { value: 'bayi', label: "Bayi'den Alım" },
  { value: 'iade', label: 'İade' },
  { value: 'diger', label: 'Diğer' },
];

const EXIT_REASONS = [
  { value: 'fire', label: 'Fire / Kayıp' },
  { value: 'sayim', label: 'Sayım Düzeltme' },
  { value: 'bayi', label: "Bayi'ye Verildi" },
  { value: 'hurda', label: 'Hurda' },
  { value: 'diger', label: 'Diğer' },
];

const defaultEntryLine = {
  itemId: '',
  productCode: '',
  colorCode: '',
  name: '',
  qty: 1,
  unit: 'boy',
};

const StokHareketler = () => {
  const [movements, setMovements] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  
  // Modal içi arama state'leri
  const [entrySearch, setEntrySearch] = useState('');
  const [exitSearch, setExitSearch] = useState('');

  // Entry modal (Stok Girişi)
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryLines, setEntryLines] = useState([{ ...defaultEntryLine }]);
  const [entryReason, setEntryReason] = useState('sayim');
  const [entryNote, setEntryNote] = useState('');
  const [entryOperator, setEntryOperator] = useState('');

  // Exit modal (Stok Çıkışı)
  const [exitOpen, setExitOpen] = useState(false);
  const [exitLines, setExitLines] = useState([{ ...defaultEntryLine }]);
  const [exitReason, setExitReason] = useState('fire');
  const [exitNote, setExitNote] = useState('');
  const [exitOperator, setExitOperator] = useState('');

  const [submitting, setSubmitting] = useState(false);

  // Focus refs for keyboard navigation
  const productInputRefs = useRef([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
      try {
        setLoading(true);
        setError('');
      const [movementsData, stockData] = await Promise.all([
        getStockMovements(),
        getStockItems(),
      ]);
      setMovements(movementsData);
      setStockItems(stockData);
      } catch (err) {
      setError(err.message || 'Veriler alınamadı');
      } finally {
        setLoading(false);
      }
    };

  // Stok kalemleri autocomplete için
  const stockOptions = useMemo(() => {
    return stockItems.map((item) => ({
      id: item.id,
      productCode: item.productCode,
      colorCode: item.colorCode,
      name: item.name,
      colorName: item.colorName,
      unit: item.unit,
      available: Math.max(0, (item.onHand || 0) - (item.reserved || 0)),
      onHand: item.onHand || 0,
      displayText: `${item.productCode}-${item.colorCode} ${item.name} ${item.colorName || ''}`,
    }));
  }, [stockItems]);

  const filteredMovements = useMemo(() => {
    let data = [...movements];

    if (search) {
      const q = search.toLowerCase();
      data = data.filter(
        (m) =>
          (m.item || '').toLowerCase().includes(q) ||
          (m.productCode || '').toLowerCase().includes(q) ||
          (m.reason || '').toLowerCase().includes(q)
      );
    }

    if (typeFilter !== 'all') {
      data = data.filter((m) => m.type === typeFilter);
    }

    if (dateFilter) {
      data = data.filter((m) => m.date === dateFilter);
    }

    return data.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [movements, search, typeFilter, dateFilter]);

  const summary = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayMovements = movements.filter((m) => m.date === today);
    const todayIn = todayMovements.filter((m) => m.type === 'stockIn').reduce((sum, m) => sum + Math.abs(m.change || 0), 0);
    const todayOut = todayMovements.filter((m) => m.type === 'stockOut' || m.type === 'consume').reduce((sum, m) => sum + Math.abs(m.change || 0), 0);
    return {
      total: movements.length,
      todayCount: todayMovements.length,
      todayIn,
      todayOut,
    };
  }, [movements]);

  // Ürün seçildiğinde (Entry)
  const handleEntryProductSelect = (index, product) => {
    if (product) {
      setEntryLines((prev) =>
        prev.map((line, i) =>
          i === index
            ? {
                ...line,
                itemId: product.id,
                productCode: product.productCode,
                colorCode: product.colorCode,
                name: product.name,
                unit: product.unit || 'boy',
              }
            : line
        )
      );
    }
  };

  // Ürün seçildiğinde (Exit)
  const handleExitProductSelect = (index, product) => {
    if (product) {
      setExitLines((prev) =>
        prev.map((line, i) =>
          i === index
            ? {
                ...line,
                itemId: product.id,
                productCode: product.productCode,
                colorCode: product.colorCode,
                name: product.name,
                unit: product.unit || 'boy',
                maxQty: product.available,
              }
            : line
        )
      );
    }
  };

  // Yeni satır ekle
  const addEntryLine = () => {
    setEntryLines((prev) => [...prev, { ...defaultEntryLine }]);
    // Focus on new input after render
    setTimeout(() => {
      const inputs = document.querySelectorAll('#entry-form .autocomplete-container input');
      if (inputs.length > 0) {
        inputs[inputs.length - 1]?.focus();
      }
    }, 100);
  };

  const addExitLine = () => {
    setExitLines((prev) => [...prev, { ...defaultEntryLine }]);
    setTimeout(() => {
      const inputs = document.querySelectorAll('#exit-form .autocomplete-container input');
      if (inputs.length > 0) {
        inputs[inputs.length - 1]?.focus();
      }
    }, 100);
  };

  // Satır kaldır
  const removeEntryLine = (index) => {
    setEntryLines((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExitLine = (index) => {
    setExitLines((prev) => prev.filter((_, i) => i !== index));
  };

  // Miktar değiştir
  const updateEntryQty = (index, qty) => {
    setEntryLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, qty: Number(qty) || 0 } : line))
    );
  };

  const updateExitQty = (index, qty) => {
    setExitLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, qty: Number(qty) || 0 } : line))
    );
  };

  // Stok Girişi Kaydet
  const saveEntry = async (e) => {
    e.preventDefault();

    const validLines = entryLines.filter((l) => l.itemId && l.qty > 0);
    if (validLines.length === 0) {
      setError('En az bir ürün ekleyin');
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      const reasonLabel = ENTRY_REASONS.find((r) => r.value === entryReason)?.label || entryReason;

      for (const line of validLines) {
        await createStockMovement({
          itemId: line.itemId,
          qty: line.qty,
          type: 'stockIn',
          reason: `${reasonLabel}${entryNote ? ` - ${entryNote}` : ''}`,
          operator: entryOperator || 'Sistem',
          reference: null,
        });
      }

      // Reload data
      await loadData();

      // Reset form
      setEntryLines([{ ...defaultEntryLine }]);
      setEntryReason('sayim');
      setEntryNote('');
      setEntryOperator('');
      setEntryOpen(false);
    } catch (err) {
      setError(err.message || 'Stok girişi yapılamadı');
    } finally {
      setSubmitting(false);
    }
  };

  // Stok Çıkışı Kaydet
  const saveExit = async (e) => {
    e.preventDefault();

    const validLines = exitLines.filter((l) => l.itemId && l.qty > 0);
    if (validLines.length === 0) {
      setError('En az bir ürün ekleyin');
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      const reasonLabel = EXIT_REASONS.find((r) => r.value === exitReason)?.label || exitReason;

      for (const line of validLines) {
        await createStockMovement({
          itemId: line.itemId,
          qty: line.qty,
          type: 'stockOut',
          reason: `${reasonLabel}${exitNote ? ` - ${exitNote}` : ''}`,
          operator: exitOperator || 'Sistem',
          reference: null,
        });
      }

      // Reload data
      await loadData();

      // Reset form
      setExitLines([{ ...defaultEntryLine }]);
      setExitReason('fire');
      setExitNote('');
      setExitOperator('');
      setExitOpen(false);
    } catch (err) {
      setError(err.message || 'Stok çıkışı yapılamadı');
    } finally {
      setSubmitting(false);
    }
  };

  // Klavye ile satır ekleme (Enter)
  const handleEntryKeyDown = (e, index) => {
    if (e.key === 'Enter' && entryLines[index].itemId && entryLines[index].qty > 0) {
      e.preventDefault();
      addEntryLine();
    }
  };

  const handleExitKeyDown = (e, index) => {
    if (e.key === 'Enter' && exitLines[index].itemId && exitLines[index].qty > 0) {
      e.preventDefault();
      addExitLine();
    }
  };

  // Modal açma
  const openEntryModal = () => {
    setEntryLines([{ ...defaultEntryLine }]);
    setEntryReason('sayim');
    setEntryNote('');
    setEntryOperator('');
    setEntrySearch('');
    setError('');
    setEntryOpen(true);
  };

  const openExitModal = () => {
    setExitLines([{ ...defaultEntryLine }]);
    setExitReason('fire');
    setExitNote('');
    setExitOperator('');
    setExitSearch('');
    setError('');
    setExitOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Stok Hareketleri"
        subtitle="Stok giriş, çıkış ve hareket kayıtları"
        actions={
          <>
            <button className="btn btn-success" type="button" onClick={openEntryModal}>
              📥 Stok Girişi
            </button>
            <button className="btn btn-danger" type="button" onClick={openExitModal}>
              📤 Stok Çıkışı
            </button>
          </>
        }
      />

      {/* Özet Kartları */}
      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="metric-row">
            <div className="metric-icon">📋</div>
            <div>
              <div className="metric-label">Toplam Hareket</div>
              <div className="metric-value">{formatNumber(summary.total)}</div>
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="metric-row">
            <div className="metric-icon">📅</div>
            <div>
              <div className="metric-label">Bugün</div>
              <div className="metric-value">{formatNumber(summary.todayCount)}</div>
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="metric-row">
            <div className="metric-icon">📥</div>
            <div>
              <div className="metric-label">Bugün Giriş</div>
              <div className="metric-value" style={{ color: 'var(--color-success)' }}>+{formatNumber(summary.todayIn)}</div>
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="metric-row">
            <div className="metric-icon">📤</div>
            <div>
              <div className="metric-label">Bugün Çıkış</div>
              <div className="metric-value" style={{ color: 'var(--color-danger)' }}>-{formatNumber(summary.todayOut)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filtreler */}
      <div className="filter-bar" style={{ marginBottom: 16 }}>
        <div className="filter-group">
          <label className="filter-label">Ara</label>
          <input
            className="filter-input"
            type="search"
            placeholder="Ürün, neden..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label className="filter-label">Hareket Tipi</label>
          <select
            className="filter-input"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">Tümü</option>
            <option value="stockIn">Giriş</option>
            <option value="stockOut">Çıkış</option>
            <option value="reserve">Rezervasyon</option>
            <option value="consume">Üretim</option>
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">Tarih</label>
          <DateInput
            className="filter-input"
            value={dateFilter}
            onChange={(val) => setDateFilter(val)}
          />
        </div>
      </div>

      {/* Hata mesajı */}
      {error && (
        <div className="card error-card" style={{ marginBottom: 16 }}>
          <div className="error-title">Hata</div>
          <div className="error-message">{error}</div>
        </div>
      )}

      {/* Hareket Listesi */}
      {loading ? (
        <Loader text="Hareketler yükleniyor..." />
      ) : (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Hareket Geçmişi</h3>
            <span className="badge badge-secondary">{filteredMovements.length} kayıt</span>
          </div>
        <DataTable
          columns={[
            { label: 'Tarih', accessor: 'date' },
              {
                label: 'Ürün',
                accessor: 'item',
                render: (_, row) => (
                  <div>
                    <strong>{row.productCode || '-'}</strong>-{row.colorCode || '-'}
                    <div className="text-muted" style={{ fontSize: 12 }}>{row.item}</div>
                  </div>
                ),
              },
              {
                label: 'Tip',
                accessor: 'type',
                render: (val) => {
                  const typeInfo = MOVEMENT_TYPES[val] || { label: val, color: 'secondary' };
                  return (
                    <span className={`badge badge-${typeInfo.color}`}>
                      {typeInfo.icon} {typeInfo.label}
                    </span>
                  );
                },
              },
            {
              label: 'Miktar',
              accessor: 'change',
                render: (value) => (
                  <strong style={{ color: value >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {value >= 0 ? '+' : ''}{formatNumber(value)}
                  </strong>
                ),
            },
            { label: 'Neden', accessor: 'reason' },
            { label: 'Operatör', accessor: 'operator' },
            {
              label: 'Referans',
              accessor: 'reference',
                render: (val) => val || '-',
              },
            ]}
            rows={filteredMovements}
          />
        </div>
      )}

      {/* Stok Girişi Modal */}
      <Modal
        open={entryOpen}
        title="📥 Stok Girişi"
        size="xxlarge"
        onClose={() => setEntryOpen(false)}
        actions={
          <>
            <div style={{ flex: 1, textAlign: 'left', fontSize: 13, color: 'var(--text-muted)' }}>
              {entryLines.filter((l) => l.itemId && l.qty > 0).length > 0 && 
                `✅ ${entryLines.filter((l) => l.itemId && l.qty > 0).length} ürün seçildi`
              }
            </div>
            <button className="btn btn-secondary" type="button" onClick={() => setEntryOpen(false)}>
              İptal
            </button>
            <button
              className="btn btn-success"
              type="submit"
              form="entry-form"
              disabled={submitting || !entryLines.some((l) => l.itemId && l.qty > 0)}
            >
              {submitting ? 'Kaydediliyor...' : `📥 Stok Girişi Yap`}
            </button>
          </>
        }
      >
        <form id="entry-form" onSubmit={saveEntry}>
          {/* Üst: Giriş Ayarları */}
          <div style={{ 
            background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)', 
            padding: 16, 
            borderRadius: 12, 
            marginBottom: 16 
          }}>
            <div className="grid grid-3" style={{ gap: 16 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 600 }}>📋 Giriş Türü</label>
                <select
                  className="form-select"
                  value={entryReason}
                  onChange={(e) => setEntryReason(e.target.value)}
                  style={{ background: 'white' }}
                >
                  {ENTRY_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 600 }}>👤 İşlemi Yapan</label>
                <input
                  className="form-input"
                  value={entryOperator}
                  onChange={(e) => setEntryOperator(e.target.value)}
                  placeholder="İsim..."
                  style={{ background: 'white' }}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 600 }}>📝 Not</label>
                <input
                  className="form-input"
                  value={entryNote}
                  onChange={(e) => setEntryNote(e.target.value)}
                  placeholder="Açıklama..."
                  style={{ background: 'white' }}
                />
              </div>
            </div>
          </div>

          {/* Ana İçerik: İki Sütun */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, minHeight: 400 }}>
            
            {/* Sol: Ürün Arama */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ 
                background: 'var(--color-bg-secondary)', 
                padding: 12, 
                borderRadius: '12px 12px 0 0',
                borderBottom: '2px solid var(--color-primary)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}>🔍</span>
                  <span style={{ fontWeight: 600 }}>Ürün Ara</span>
                </div>
                <input
                  id="entry-search-input"
                  className="form-input"
                  type="search"
                  placeholder="Ürün kodu veya adı yazın..."
                  value={entrySearch}
                  onChange={(e) => setEntrySearch(e.target.value)}
                  autoFocus
                  style={{ fontSize: 15 }}
                />
              </div>
              
              {/* Ürün Listesi */}
              <div style={{ 
                flex: 1, 
                border: '1px solid var(--color-border)', 
                borderTop: 0,
                borderRadius: '0 0 12px 12px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <div style={{ flex: 1, overflow: 'auto', maxHeight: 340 }}>
                  {stockOptions
                    .filter(opt => {
                      if (!entrySearch.trim()) return true;
                      const q = entrySearch.toLowerCase();
                      return (
                        (opt.productCode || '').toLowerCase().includes(q) ||
                        (opt.colorCode || '').toLowerCase().includes(q) ||
                        (opt.name || '').toLowerCase().includes(q) ||
                        (opt.colorName || '').toLowerCase().includes(q)
                      );
                    })
                    .slice(0, 50)
                    .map((opt) => {
                      const isSelected = entryLines.some(l => l.itemId === opt.id);
                      return (
                        <div
                          key={opt.id}
                          onClick={() => {
                            if (!isSelected) {
                              // Boş satır varsa onu doldur, yoksa yeni ekle
                              const emptyIndex = entryLines.findIndex(l => !l.itemId);
                              if (emptyIndex >= 0) {
                                handleEntryProductSelect(emptyIndex, opt);
                              } else {
                                setEntryLines(prev => [...prev, {
                                  ...defaultEntryLine,
                                  itemId: opt.id,
                                  productCode: opt.productCode,
                                  colorCode: opt.colorCode,
                                  name: opt.name,
                                  unit: opt.unit || 'boy',
                                }]);
                              }
                            }
                          }}
                          style={{
                            padding: '10px 14px',
                            borderBottom: '1px solid var(--color-border)',
                            cursor: isSelected ? 'not-allowed' : 'pointer',
                            background: isSelected ? 'var(--color-bg-secondary)' : 'white',
                            opacity: isSelected ? 0.5 : 1,
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={(e) => !isSelected && (e.currentTarget.style.background = '#f0fdf4')}
                          onMouseLeave={(e) => !isSelected && (e.currentTarget.style.background = 'white')}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>
                                <span style={{ color: 'var(--color-primary)' }}>{opt.productCode}</span>
                                <span style={{ color: 'var(--color-text-secondary)' }}>-{opt.colorCode}</span>
                              </div>
                              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                                {opt.name} {opt.colorName && `(${opt.colorName})`}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{opt.onHand} {opt.unit}</div>
                              {isSelected && <span className="badge badge-success" style={{ fontSize: 10 }}>✓ Seçildi</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  {stockOptions.filter(opt => {
                    if (!entrySearch.trim()) return true;
                    const q = entrySearch.toLowerCase();
                    return (
                      (opt.productCode || '').toLowerCase().includes(q) ||
                      (opt.colorCode || '').toLowerCase().includes(q) ||
                      (opt.name || '').toLowerCase().includes(q)
                    );
                  }).length === 0 && (
                    <div style={{ padding: 30, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                      <div>Ürün bulunamadı</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sağ: Seçilen Ürünler (Sepet) */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ 
                background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)', 
                padding: 12, 
                borderRadius: '12px 12px 0 0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>🛒</span>
                  <span style={{ fontWeight: 600 }}>Seçilen Ürünler</span>
                </div>
                <span className="badge badge-primary">
                  {entryLines.filter(l => l.itemId).length} ürün
                </span>
              </div>

              <div style={{ 
                flex: 1, 
                border: '1px solid var(--color-border)', 
                borderTop: 0,
                borderRadius: '0 0 12px 12px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <div style={{ flex: 1, overflow: 'auto', maxHeight: 340 }}>
                  {entryLines.filter(l => l.itemId).length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Henüz ürün seçilmedi</div>
                      <div style={{ fontSize: 13 }}>Soldan ürün seçerek başlayın</div>
                    </div>
                  ) : (
                    entryLines.map((line, index) => line.itemId && (
                      <div
                        key={index}
                        style={{
                          padding: '12px 14px',
                          borderBottom: '1px solid var(--color-border)',
                          background: 'white',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>
                              <span style={{ color: 'var(--color-primary)' }}>{line.productCode}</span>
                              <span style={{ color: 'var(--color-text-secondary)' }}>-{line.colorCode}</span>
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{line.name}</div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-danger btn-small btn-icon"
                            onClick={() => removeEntryLine(index)}
                            style={{ padding: '4px 8px' }}
                            title="Kalemi Kaldır"
                          >
                            ✕
                          </button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Miktar:</label>
                          <NumberInput
                            className="form-input"
                            min={1}
                            value={line.qty}
                            onChange={(val) => updateEntryQty(index, val)}
                            onKeyDown={(e) => handleEntryKeyDown(e, index)}
                            style={{ width: 80, padding: '6px 10px' }}
                          />
                          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{line.unit}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                
                {/* Toplam */}
                {entryLines.filter(l => l.itemId && l.qty > 0).length > 0 && (
                  <div style={{ 
                    padding: 12, 
                    background: 'var(--color-bg-secondary)', 
                    borderTop: '1px solid var(--color-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span style={{ fontWeight: 600 }}>Toplam Giriş:</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-success)' }}>
                      +{formatNumber(entryLines.filter(l => l.itemId).reduce((sum, l) => sum + (l.qty || 0), 0))}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* Stok Çıkışı Modal */}
      <Modal
        open={exitOpen}
        title="📤 Stok Çıkışı"
        size="xxlarge"
        onClose={() => setExitOpen(false)}
        actions={
          <>
            <div style={{ flex: 1, textAlign: 'left', fontSize: 13, color: 'var(--text-muted)' }}>
              {exitLines.filter((l) => l.itemId && l.qty > 0).length > 0 && 
                `⚠️ ${exitLines.filter((l) => l.itemId && l.qty > 0).length} ürün çıkartılacak`
              }
            </div>
            <button className="btn btn-secondary" type="button" onClick={() => setExitOpen(false)}>
              İptal
            </button>
            <button
              className="btn btn-danger"
              type="submit"
              form="exit-form"
              disabled={submitting || !exitLines.some((l) => l.itemId && l.qty > 0)}
            >
              {submitting ? 'Kaydediliyor...' : `📤 Stok Çıkışı Yap`}
            </button>
          </>
        }
      >
        <form id="exit-form" onSubmit={saveExit}>
          {/* Üst: Çıkış Ayarları */}
          <div style={{ 
            background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)', 
            padding: 16, 
            borderRadius: 12, 
            marginBottom: 16 
          }}>
            <div className="grid grid-3" style={{ gap: 16 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 600 }}>📋 Çıkış Türü</label>
                <select
                  className="form-select"
                  value={exitReason}
                  onChange={(e) => setExitReason(e.target.value)}
                  style={{ background: 'white' }}
                >
                  {EXIT_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 600 }}>👤 İşlemi Yapan</label>
                <input
                  className="form-input"
                  value={exitOperator}
                  onChange={(e) => setExitOperator(e.target.value)}
                  placeholder="İsim..."
                  style={{ background: 'white' }}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 600 }}>📝 Not</label>
                <input
                  className="form-input"
                  value={exitNote}
                  onChange={(e) => setExitNote(e.target.value)}
                  placeholder="Açıklama..."
                  style={{ background: 'white' }}
                />
              </div>
            </div>
          </div>

          {/* Ana İçerik: İki Sütun */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, minHeight: 400 }}>
            
            {/* Sol: Ürün Arama */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ 
                background: 'var(--color-bg-secondary)', 
                padding: 12, 
                borderRadius: '12px 12px 0 0',
                borderBottom: '2px solid var(--color-danger)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}>🔍</span>
                  <span style={{ fontWeight: 600 }}>Ürün Ara</span>
                  <span className="text-muted" style={{ fontSize: 11, marginLeft: 'auto' }}>
                    ⚠️ Sadece stokta olanlar
                  </span>
                </div>
                <input
                  id="exit-search-input"
                  className="form-input"
                  type="search"
                  placeholder="Ürün kodu veya adı yazın..."
                  value={exitSearch}
                  onChange={(e) => setExitSearch(e.target.value)}
                  autoFocus
                  style={{ fontSize: 15 }}
                />
              </div>
              
              {/* Ürün Listesi - Sadece stokta olanlar */}
              <div style={{ 
                flex: 1, 
                border: '1px solid var(--color-border)', 
                borderTop: 0,
                borderRadius: '0 0 12px 12px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <div style={{ flex: 1, overflow: 'auto', maxHeight: 340 }}>
                  {stockOptions
                    .filter(opt => opt.available > 0) // Sadece stokta olanlar
                    .filter(opt => {
                      if (!exitSearch.trim()) return true;
                      const q = exitSearch.toLowerCase();
                      return (
                        (opt.productCode || '').toLowerCase().includes(q) ||
                        (opt.colorCode || '').toLowerCase().includes(q) ||
                        (opt.name || '').toLowerCase().includes(q) ||
                        (opt.colorName || '').toLowerCase().includes(q)
                      );
                    })
                    .slice(0, 50)
                    .map((opt) => {
                      const isSelected = exitLines.some(l => l.itemId === opt.id);
                      return (
                        <div
                          key={opt.id}
                          onClick={() => {
                            if (!isSelected) {
                              const emptyIndex = exitLines.findIndex(l => !l.itemId);
                              if (emptyIndex >= 0) {
                                handleExitProductSelect(emptyIndex, opt);
                              } else {
                                setExitLines(prev => [...prev, {
                                  ...defaultEntryLine,
                                  itemId: opt.id,
                                  productCode: opt.productCode,
                                  colorCode: opt.colorCode,
                                  name: opt.name,
                                  unit: opt.unit || 'boy',
                                  maxQty: opt.available,
                                }]);
                              }
                            }
                          }}
                          style={{
                            padding: '10px 14px',
                            borderBottom: '1px solid var(--color-border)',
                            cursor: isSelected ? 'not-allowed' : 'pointer',
                            background: isSelected ? 'var(--color-bg-secondary)' : 'white',
                            opacity: isSelected ? 0.5 : 1,
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={(e) => !isSelected && (e.currentTarget.style.background = '#fef2f2')}
                          onMouseLeave={(e) => !isSelected && (e.currentTarget.style.background = 'white')}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>
                                <span style={{ color: 'var(--color-primary)' }}>{opt.productCode}</span>
                                <span style={{ color: 'var(--color-text-secondary)' }}>-{opt.colorCode}</span>
                              </div>
                              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                                {opt.name} {opt.colorName && `(${opt.colorName})`}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-success)' }}>
                                {opt.available} {opt.unit}
                              </div>
                              {isSelected && <span className="badge badge-danger" style={{ fontSize: 10 }}>✓ Seçildi</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  {stockOptions
                    .filter(opt => opt.available > 0)
                    .filter(opt => {
                      if (!exitSearch.trim()) return true;
                      const q = exitSearch.toLowerCase();
                      return (
                        (opt.productCode || '').toLowerCase().includes(q) ||
                        (opt.colorCode || '').toLowerCase().includes(q) ||
                        (opt.name || '').toLowerCase().includes(q)
                      );
                    }).length === 0 && (
                    <div style={{ padding: 30, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                      <div>Stokta ürün bulunamadı</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sağ: Seçilen Ürünler (Çıkış Listesi) */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ 
                background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', 
                padding: 12, 
                borderRadius: '12px 12px 0 0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>📤</span>
                  <span style={{ fontWeight: 600 }}>Çıkış Yapılacaklar</span>
                </div>
                <span className="badge badge-warning">
                  {exitLines.filter(l => l.itemId).length} ürün
                </span>
              </div>

              <div style={{ 
                flex: 1, 
                border: '1px solid var(--color-border)', 
                borderTop: 0,
                borderRadius: '0 0 12px 12px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <div style={{ flex: 1, overflow: 'auto', maxHeight: 340 }}>
                  {exitLines.filter(l => l.itemId).length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>📤</div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Henüz ürün seçilmedi</div>
                      <div style={{ fontSize: 13 }}>Soldan çıkış yapılacak ürünleri seçin</div>
                    </div>
                  ) : (
                    exitLines.map((line, index) => line.itemId && (
                      <div
                        key={index}
                        style={{
                          padding: '12px 14px',
                          borderBottom: '1px solid var(--color-border)',
                          background: line.qty > (line.maxQty || 0) ? '#fef2f2' : 'white',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>
                              <span style={{ color: 'var(--color-primary)' }}>{line.productCode}</span>
                              <span style={{ color: 'var(--color-text-secondary)' }}>-{line.colorCode}</span>
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{line.name}</div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-danger btn-small btn-icon"
                            onClick={() => removeExitLine(index)}
                            style={{ padding: '4px 8px' }}
                            title="Kalemi Kaldır"
                          >
                            ✕
                          </button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Miktar:</label>
                          <NumberInput
                            className="form-input"
                            min={1}
                            max={line.maxQty || 999999}
                            value={line.qty}
                            onChange={(val) => updateExitQty(index, val)}
                            onKeyDown={(e) => handleExitKeyDown(e, index)}
                            style={{ 
                              width: 80, 
                              padding: '6px 10px',
                              borderColor: line.qty > (line.maxQty || 0) ? 'var(--color-danger)' : undefined
                            }}
                          />
                          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>/ {line.maxQty || 0} {line.unit}</span>
                          {line.qty > (line.maxQty || 0) && (
                            <span style={{ fontSize: 11, color: 'var(--color-danger)' }}>⚠️ Stok yetersiz!</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                
                {/* Toplam */}
                {exitLines.filter(l => l.itemId && l.qty > 0).length > 0 && (
                  <div style={{ 
                    padding: 12, 
                    background: 'var(--color-bg-secondary)', 
                    borderTop: '1px solid var(--color-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span style={{ fontWeight: 600 }}>Toplam Çıkış:</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-danger)' }}>
                      -{formatNumber(exitLines.filter(l => l.itemId).reduce((sum, l) => sum + (l.qty || 0), 0))}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default StokHareketler;
