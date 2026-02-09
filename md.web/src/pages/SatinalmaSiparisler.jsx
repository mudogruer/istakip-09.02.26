import { useEffect, useState, useMemo } from 'react';
import DataTable from '../components/DataTable';
import DateInput from '../components/DateInput';
import NumberInput from '../components/NumberInput';
import Modal from '../components/Modal';
import PageHeader from '../components/PageHeader';
import Loader from '../components/Loader';
import {
  getPurchaseOrdersFromAPI,
  getPurchaseOrder,
  createPurchaseOrder,
  addItemsToPurchaseOrder,
  sendPurchaseOrder,
  receivePurchaseDelivery,
  deletePurchaseOrder,
  getSuppliersFromAPI,
  getMissingItems,
  searchStockItems,
  uploadDocument,
  getPersonnel,
} from '../services/dataService';

const formatNumber = (value) => new Intl.NumberFormat('tr-TR').format(value || 0);
const formatCurrency = (value) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(value || 0);

const STATUS_LABELS = {
  draft: { label: 'Taslak', tone: 'secondary', icon: '📝' },
  sent: { label: 'Gönderildi', tone: 'primary', icon: '📤' },
  partial: { label: 'Kısmi Teslim', tone: 'warning', icon: '📦' },
  delivered: { label: 'Tamamlandı', tone: 'success', icon: '✅' },
};

const defaultOrderForm = {
  supplierId: '',
  supplierName: '',
  notes: '',
  expectedDate: '',
  items: [],
};

const defaultItemForm = {
  productCode: '',
  colorCode: '',
  productName: '',
  quantity: 1,
  unit: 'boy',
  unitCost: 0,
};

const defaultDeliveryForm = {
  items: [],
  note: '',
  receivedBy: '',
  waybillFile: null,
};

const SatinalmaSiparisler = () => {
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [missingItems, setMissingItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('all');

  // Order form
  const [formOpen, setFormOpen] = useState(false);
  const [orderForm, setOrderForm] = useState(defaultOrderForm);
  const [itemForm, setItemForm] = useState(defaultItemForm);
  const [submitting, setSubmitting] = useState(false);

  // Order detail
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Delivery form
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState(defaultDeliveryForm);

  // Product search
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState([]);

  // Missing items modal
  const [missingOpen, setMissingOpen] = useState(false);
  const [selectedMissing, setSelectedMissing] = useState([]);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
      try {
        setLoading(true);
        setError('');
      const [ordersData, suppliersData, missingData, personnelData] = await Promise.all([
        getPurchaseOrdersFromAPI(),
        getSuppliersFromAPI(),
        getMissingItems().catch(() => []),
        getPersonnel().catch(() => []),
      ]);
      setOrders(ordersData);
      setSuppliers(suppliersData);
      setMissingItems(missingData);
      setPersonnel(personnelData.filter(p => !p.deleted && p.aktifMi));
      } catch (err) {
      setError(err.message || 'Veriler alınamadı');
      } finally {
        setLoading(false);
      }
    };

  // Product search
  useEffect(() => {
    if (!productSearch || productSearch.length < 2) {
      setProductResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const results = await searchStockItems(productSearch, '');
        setProductResults(results.slice(0, 10));
      } catch (err) {
        console.error('Product search error:', err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [productSearch]);

  const filteredOrders = useMemo(() => {
    let data = [...orders];

    if (search) {
      const q = search.toLowerCase();
      data = data.filter(
        (o) =>
          o.id.toLowerCase().includes(q) ||
          (o.supplierName || '').toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'all') {
      data = data.filter((o) => o.status === statusFilter);
    }

    if (supplierFilter !== 'all') {
      data = data.filter((o) => o.supplierId === supplierFilter);
    }

    return data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [orders, search, statusFilter, supplierFilter]);

  const summary = useMemo(() => {
    const total = orders.length;
    const draft = orders.filter((o) => o.status === 'draft').length;
    const pending = orders.filter((o) => ['sent', 'partial'].includes(o.status)).length;
    const totalAmount = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    return { total, draft, pending, totalAmount };
  }, [orders]);

  const openCreate = () => {
    setOrderForm(defaultOrderForm);
    setItemForm(defaultItemForm);
    setProductSearch('');
    setProductResults([]);
    setFormOpen(true);
  };

  const openFromMissing = () => {
    setSelectedMissing([]);
    setMissingOpen(true);
  };

  const selectProduct = (product) => {
    setItemForm({
      productCode: product.productCode,
      colorCode: product.colorCode,
      productName: `${product.name} ${product.colorName || ''}`.trim(),
      quantity: 1,
      unit: product.unit || 'boy',
      unitCost: product.unitCost || 0,
    });
    setProductSearch('');
    setProductResults([]);
  };

  const addItemToOrder = () => {
    if (!itemForm.productCode || itemForm.quantity <= 0) return;

    setOrderForm((prev) => {
      const existing = prev.items.find(
        (i) => i.productCode === itemForm.productCode && i.colorCode === itemForm.colorCode
      );
      if (existing) {
        return {
          ...prev,
          items: prev.items.map((i) =>
            i.productCode === itemForm.productCode && i.colorCode === itemForm.colorCode
              ? { ...i, quantity: i.quantity + itemForm.quantity }
              : i
          ),
        };
      }
      return { ...prev, items: [...prev.items, { ...itemForm }] };
    });

    setItemForm(defaultItemForm);
  };

  const removeItemFromOrder = (productCode, colorCode) => {
    setOrderForm((prev) => ({
      ...prev,
      items: prev.items.filter((i) => !(i.productCode === productCode && i.colorCode === colorCode)),
    }));
  };

  // PDF Export fonksiyonu
  const exportOrderToPDF = (order) => {
    const supplier = suppliers.find(s => s.id === order.supplierId) || {};
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Pop-up engellendi. Lütfen pop-up izni verin.');
      return;
    }
    
    const itemsHtml = (order.items || []).map((item, idx) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${idx + 1}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.productName || item.productCode}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.productCode}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.colorCode || '-'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity} ${item.unit || 'adet'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${formatCurrency(item.unitCost || 0)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${formatCurrency((item.quantity || 0) * (item.unitCost || 0))}</td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html lang="tr">
      <head>
        <meta charset="UTF-8">
        <title>Tedarik Siparişi - ${order.id}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
          .header { display: flex; justify-content: space-between; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
          .company { font-size: 20px; font-weight: bold; }
          .order-info { text-align: right; }
          .order-number { font-size: 18px; font-weight: bold; color: #0066cc; }
          .section { margin-bottom: 20px; }
          .section-title { font-weight: bold; margin-bottom: 10px; font-size: 14px; color: #666; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background: #f5f5f5; padding: 10px 8px; text-align: left; font-weight: 600; border-bottom: 2px solid #ddd; }
          .total-row { font-weight: bold; background: #f9f9f9; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; font-size: 12px; color: #666; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company">TEDARİK SİPARİŞİ</div>
          <div class="order-info">
            <div class="order-number">${order.id}</div>
            <div>Tarih: ${new Date(order.createdAt).toLocaleDateString('tr-TR')}</div>
            <div>Durum: ${STATUS_LABELS[order.status]?.label || order.status}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">📦 TEDARİKÇİ BİLGİLERİ</div>
          <div><strong>${supplier.name || 'Belirtilmemiş'}</strong></div>
          ${supplier.phone ? `<div>Tel: ${supplier.phone}</div>` : ''}
          ${supplier.email ? `<div>E-posta: ${supplier.email}</div>` : ''}
          ${supplier.address ? `<div>Adres: ${supplier.address}</div>` : ''}
        </div>

        <div class="section">
          <div class="section-title">📋 SİPARİŞ KALEMLERİ</div>
          <table>
            <thead>
              <tr>
                <th style="width: 40px">#</th>
                <th>Ürün Adı</th>
                <th>Ürün Kodu</th>
                <th>Renk</th>
                <th style="text-align: center;">Miktar</th>
                <th style="text-align: right;">Birim Fiyat</th>
                <th style="text-align: right;">Toplam</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
              <tr class="total-row">
                <td colspan="6" style="padding: 10px 8px; text-align: right;">GENEL TOPLAM:</td>
                <td style="padding: 10px 8px; text-align: right;">${formatCurrency(order.totalAmount || 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        ${order.notes ? `
          <div class="section">
            <div class="section-title">📝 NOTLAR</div>
            <div>${order.notes}</div>
          </div>
        ` : ''}

        <div class="footer">
          Bu belge ${new Date().toLocaleString('tr-TR')} tarihinde oluşturulmuştur.
        </div>

        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const saveOrder = async (e) => {
    e.preventDefault();
    if (!orderForm.supplierId || orderForm.items.length === 0) return;

    try {
      setSubmitting(true);
      const supplier = suppliers.find((s) => s.id === orderForm.supplierId);
      const payload = {
        supplierId: orderForm.supplierId,
        supplierName: supplier?.name || orderForm.supplierName,
        items: orderForm.items,
        notes: orderForm.notes,
        expectedDate: orderForm.expectedDate,
        relatedJobs: [],
      };

      const created = await createPurchaseOrder(payload);
      setOrders((prev) => [created, ...prev]);
      setFormOpen(false);
    } catch (err) {
      setError(err.message || 'Sipariş oluşturulamadı');
    } finally {
      setSubmitting(false);
    }
  };

  const createFromMissing = async () => {
    if (selectedMissing.length === 0) return;

    // Tedarikçiye göre grupla
    const bySupplier = {};
    selectedMissing.forEach((item) => {
      const key = item.supplierId;
      if (!bySupplier[key]) {
        bySupplier[key] = {
          supplierId: item.supplierId,
          supplierName: item.supplierName,
          items: [],
        };
      }
      bySupplier[key].items.push({
        productCode: item.productCode,
        colorCode: item.colorCode,
        productName: `${item.name} ${item.colorName || ''}`.trim(),
        quantity: item.suggestedQty,
        unit: item.unit,
        unitCost: 0,
      });
    });

    try {
      setSubmitting(true);
      const created = [];
      for (const data of Object.values(bySupplier)) {
        const order = await createPurchaseOrder({
          supplierId: data.supplierId,
          supplierName: data.supplierName,
          items: data.items,
          notes: 'Kritik stok siparişi',
          expectedDate: '',
          relatedJobs: [],
        });
        created.push(order);
      }
      setOrders((prev) => [...created, ...prev]);
      setMissingOpen(false);
      await loadData(); // Refresh missing items
    } catch (err) {
      setError(err.message || 'Sipariş oluşturulamadı');
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (order) => {
    setSelectedOrder(order);
    setDetailOpen(true);
  };

  const sendOrder = async (orderId) => {
    try {
      setSubmitting(true);
      const updated = await sendPurchaseOrder(orderId);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(updated);
      }
    } catch (err) {
      setError(err.message || 'Sipariş gönderilemedi');
    } finally {
      setSubmitting(false);
    }
  };

  const openDelivery = () => {
    if (!selectedOrder) return;
    setDeliveryForm({
      items: selectedOrder.items.map((i) => ({
        productCode: i.productCode,
        colorCode: i.colorCode,
        productName: i.productName,
        ordered: i.quantity,
        received: i.receivedQty || 0,
        remaining: i.quantity - (i.receivedQty || 0),
        quantity: 0, // Yeni teslim miktarı
      })),
      note: '',
      receivedBy: '',
    });
    setDeliveryOpen(true);
  };

  const saveDelivery = async (e) => {
    e.preventDefault();
    if (!selectedOrder) return;

    const deliveryItems = deliveryForm.items
      .filter((i) => i.quantity > 0)
      .map((i) => ({
        productCode: i.productCode,
        colorCode: i.colorCode,
        quantity: i.quantity,
      }));

    if (deliveryItems.length === 0) return;

    try {
      setSubmitting(true);
      const updated = await receivePurchaseDelivery(selectedOrder.id, {
        items: deliveryItems,
        note: deliveryForm.note,
        receivedBy: deliveryForm.receivedBy,
      });
      
      // İrsaliye dosyası varsa yükle
      if (deliveryForm.waybillFile) {
        try {
          await uploadDocument(
            deliveryForm.waybillFile, 
            selectedOrder.jobId || `PO-${selectedOrder.id}`, 
            'irsaliye', 
            `Teslimat İrsaliyesi - ${selectedOrder.id} - ${new Date().toLocaleDateString('tr-TR')}`
          );
        } catch (uploadErr) {
          console.warn('İrsaliye yüklenemedi:', uploadErr);
        }
      }
      
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? updated : o)));
      setSelectedOrder(updated);
      setDeliveryOpen(false);
      await loadData(); // Refresh stock
    } catch (err) {
      setError(err.message || 'Teslimat kaydedilemedi');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setSubmitting(true);
      await deletePurchaseOrder(deleteTarget.id);
      setOrders((prev) => prev.filter((o) => o.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err.message || 'Silinemedi');
    } finally {
      setSubmitting(false);
    }
  };

  const exportToCSV = () => {
    const header = ['Sipariş No', 'Tedarikçi', 'Durum', 'Toplam Tutar', 'Beklenen Tarih', 'Oluşturulma'];
    const rows = filteredOrders.map((o) => [
      o.id,
      o.supplierName,
      STATUS_LABELS[o.status]?.label || o.status,
      o.totalAmount || 0,
      o.expectedDate || '-',
      o.createdAt?.slice(0, 10) || '-',
    ]);

    const csv = [header.join(','), ...rows.map((r) => r.map((v) => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `siparisler-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Satınalma Siparişleri"
        subtitle="Sipariş oluşturma, takip ve teslimat yönetimi"
        actions={
          <>
            {missingItems.length > 0 && (
              <button className="btn btn-warning" type="button" onClick={openFromMissing}>
                ⚠️ Eksik Ürünler ({missingItems.length})
              </button>
            )}
            <button className="btn btn-secondary" type="button" onClick={exportToCSV}>
              📥 CSV
            </button>
            <button className="btn btn-primary" type="button" onClick={openCreate}>
              ➕ Yeni Sipariş
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
              <div className="metric-label">Toplam</div>
              <div className="metric-value">{summary.total}</div>
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="metric-row">
            <div className="metric-icon">📝</div>
            <div>
              <div className="metric-label">Taslak</div>
              <div className="metric-value">{summary.draft}</div>
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="metric-row">
            <div className="metric-icon">📦</div>
            <div>
              <div className="metric-label">Bekleyen</div>
              <div className="metric-value">{summary.pending}</div>
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="metric-row">
            <div className="metric-icon">💰</div>
            <div>
              <div className="metric-label">Toplam Tutar</div>
              <div className="metric-value">{formatCurrency(summary.totalAmount)}</div>
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
            placeholder="Sipariş no, tedarikçi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label className="filter-label">Durum</label>
          <select className="filter-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Tümü</option>
            <option value="draft">Taslak</option>
            <option value="sent">Gönderildi</option>
            <option value="partial">Kısmi Teslim</option>
            <option value="delivered">Tamamlandı</option>
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">Tedarikçi</label>
          <select className="filter-input" value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
            <option value="all">Tümü</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <Loader text="Siparişler yükleniyor..." />
      ) : error ? (
        <div className="card error-card">
          <div className="error-title">Hata</div>
          <div className="error-message">{error}</div>
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Sipariş Listesi</h3>
            <span className="badge badge-secondary">{filteredOrders.length} kayıt</span>
          </div>
        <DataTable
          columns={[
              {
                label: 'Sipariş No',
                accessor: 'id',
                render: (val) => <strong>{val}</strong>,
              },
              {
                label: 'Tedarikçi',
                accessor: 'supplierName',
              },
              {
                label: 'Kalem',
                accessor: 'items',
                render: (items) => `${items?.length || 0} kalem`,
              },
              {
                label: 'Tutar',
                accessor: 'totalAmount',
                render: (val) => formatCurrency(val),
              },
              {
                label: 'Durum',
                accessor: 'status',
                render: (val) => {
                  const status = STATUS_LABELS[val] || { label: val, tone: 'secondary' };
                  return (
                    <span className={`badge badge-${status.tone}`}>
                      {status.icon} {status.label}
                    </span>
                  );
                },
              },
              {
                label: 'Beklenen',
                accessor: 'expectedDate',
                render: (val) => val || '-',
              },
              {
                label: 'Aksiyon',
                accessor: 'actions',
                render: (_, row) => (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-small" type="button" onClick={() => openDetail(row)} title="Detayları Görüntüle">
                      👁️
                    </button>
                    {row.status === 'draft' && (
                      <>
                        <button className="btn btn-success btn-small" type="button" onClick={() => sendOrder(row.id)} title="Siparişi Gönder">
                          📤
                        </button>
                        <button className="btn btn-danger btn-small" type="button" onClick={() => setDeleteTarget(row)} title="Siparişi Sil">
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                ),
              },
            ]}
            rows={filteredOrders}
          />
        </div>
      )}

      {/* Yeni Sipariş Modal */}
      <Modal
        open={formOpen}
        title="Yeni Sipariş Oluştur"
        size="xlarge"
        onClose={() => setFormOpen(false)}
        actions={
          <>
            <button className="btn btn-secondary" type="button" onClick={() => setFormOpen(false)}>
              İptal
            </button>
            <button
              className="btn btn-primary"
              type="submit"
              form="order-form"
              disabled={submitting || !orderForm.supplierId || orderForm.items.length === 0}
            >
              {submitting ? 'Kaydediliyor...' : 'Sipariş Oluştur'}
            </button>
          </>
        }
      >
        <form id="order-form" onSubmit={saveOrder}>
          <div className="grid grid-2" style={{ gap: 16, marginBottom: 16 }}>
            <div className="form-group">
              <label className="form-label">Tedarikçi *</label>
              <select
                className="form-select"
                value={orderForm.supplierId}
                onChange={(e) => {
                  const supplier = suppliers.find((s) => s.id === e.target.value);
                  setOrderForm((p) => ({
                    ...p,
                    supplierId: e.target.value,
                    supplierName: supplier?.name || '',
                  }));
                }}
                required
              >
                <option value="">Seçin</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.type === 'dealer' ? 'Bayi' : 'Üretici'})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Beklenen Tarih</label>
              <DateInput
                value={orderForm.expectedDate}
                onChange={(val) => setOrderForm((p) => ({ ...p, expectedDate: val }))}
              />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Not</label>
              <input
                className="form-input"
                value={orderForm.notes}
                onChange={(e) => setOrderForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Sipariş notu..."
              />
            </div>
          </div>

          {/* Ürün Ekleme */}
          <div className="card subtle-card" style={{ padding: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: 14 }}>➕ Ürün Ekle</h4>
            <div className="form-group">
              <label className="form-label">Ürün Ara</label>
              <input
                className="form-input"
                placeholder="Ürün kodu veya adı..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
              {productResults.length > 0 && (
                <div style={{ marginTop: 8, border: '1px solid var(--color-border)', borderRadius: 6, maxHeight: 150, overflow: 'auto' }}>
                  {productResults.map((p) => (
                    <div
                      key={p.id}
                      style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--color-border)' }}
                      onClick={() => selectProduct(p)}
                      onKeyDown={(e) => e.key === 'Enter' && selectProduct(p)}
                      tabIndex={0}
                      role="button"
                    >
                      <strong>{p.productCode}</strong>-{p.colorCode} · {p.name} {p.colorName || ''}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-4" style={{ gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: 11 }}>Ürün Kodu</label>
                <input
                  className="form-input"
                  value={itemForm.productCode}
                  onChange={(e) => setItemForm((p) => ({ ...p, productCode: e.target.value }))}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: 11 }}>Renk Kodu</label>
                <input
                  className="form-input"
                  value={itemForm.colorCode}
                  onChange={(e) => setItemForm((p) => ({ ...p, colorCode: e.target.value }))}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: 11 }}>Miktar</label>
                <NumberInput
                  className="form-input"
                  min={1}
                  value={itemForm.quantity}
                  onChange={(val) => setItemForm((p) => ({ ...p, quantity: val }))}
                />
              </div>
              <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={addItemToOrder}
                  disabled={!itemForm.productCode}
                >
                  + Ekle
                </button>
              </div>
            </div>
          </div>

          {/* Eklenen Kalemler */}
          <div className="card subtle-card" style={{ padding: 16 }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: 14 }}>📦 Sipariş Kalemleri ({orderForm.items.length})</h4>
            {orderForm.items.length === 0 ? (
              <div className="text-muted">Henüz kalem eklenmedi</div>
            ) : (
              <div className="table-container" style={{ maxHeight: 200 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Ürün</th>
                      <th>Miktar</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderForm.items.map((item) => (
                      <tr key={`${item.productCode}-${item.colorCode}`}>
                        <td>
                          <strong>{item.productCode}</strong>-{item.colorCode}
                          <div className="text-muted">{item.productName}</div>
                        </td>
                        <td>
                          {item.quantity} {item.unit}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-danger btn-small btn-icon"
                            onClick={() => removeItemFromOrder(item.productCode, item.colorCode)}
                            title="Kalemi Kaldır"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </form>
      </Modal>

      {/* Sipariş Detay Modal */}
      <Modal
        open={detailOpen}
        title={`Sipariş Detayı - ${selectedOrder?.id || ''}`}
        size="xlarge"
        onClose={() => {
          setDetailOpen(false);
          setSelectedOrder(null);
        }}
        actions={
          <>
            <button className="btn btn-secondary" type="button" onClick={() => exportOrderToPDF(selectedOrder)} title="Siparişi PDF olarak yazdır">
              📄 PDF Yazdır
            </button>
            {['sent', 'partial'].includes(selectedOrder?.status) && (
              <button className="btn btn-success" type="button" onClick={openDelivery}>
                📦 Teslimat Kaydet
              </button>
            )}
            {selectedOrder?.status === 'draft' && (
              <button className="btn btn-primary" type="button" onClick={() => sendOrder(selectedOrder.id)}>
                📤 Siparişi Gönder
              </button>
            )}
          </>
        }
      >
        {selectedOrder && (
          <div>
            {/* Sipariş Bilgileri */}
            <div className="card subtle-card" style={{ marginBottom: 16 }}>
              <div className="grid grid-4" style={{ gap: 16 }}>
                <div>
                  <div className="metric-label">Tedarikçi</div>
                  <div style={{ fontWeight: 600 }}>{selectedOrder.supplierName}</div>
                </div>
                <div>
                  <div className="metric-label">Durum</div>
                  <span className={`badge badge-${STATUS_LABELS[selectedOrder.status]?.tone || 'secondary'}`}>
                    {STATUS_LABELS[selectedOrder.status]?.icon} {STATUS_LABELS[selectedOrder.status]?.label || selectedOrder.status}
                  </span>
                </div>
                <div>
                  <div className="metric-label">Beklenen Tarih</div>
                  <div style={{ fontWeight: 600 }}>{selectedOrder.expectedDate || '-'}</div>
                </div>
                <div>
                  <div className="metric-label">Toplam</div>
                  <div style={{ fontWeight: 600, fontSize: 18, color: 'var(--color-primary)' }}>
                    {formatCurrency(selectedOrder.totalAmount)}
                  </div>
                </div>
              </div>
            </div>

            {/* Kalemler */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <h4 className="card-title">Sipariş Kalemleri</h4>
              </div>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Ürün</th>
                      <th>Miktar</th>
                      <th>Teslim Alınan</th>
                      <th>Kalan</th>
                      <th>Durum</th>
                      <th>Birim Fiyat</th>
                      <th>Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items?.map((item, idx) => {
                      const remaining = item.quantity - (item.receivedQty || 0);
                      const statusBadge = remaining === 0 
                        ? { label: 'Tamam', tone: 'success', icon: '✅' }
                        : remaining === item.quantity
                        ? { label: 'Bekliyor', tone: 'secondary', icon: '⏳' }
                        : { label: 'Eksik', tone: 'warning', icon: '⚠️' };
                      return (
                        <tr key={`${item.productCode}-${idx}`} style={{ background: remaining > 0 && remaining < item.quantity ? 'rgba(245, 158, 11, 0.05)' : undefined }}>
                          <td>
                            <strong>{item.productCode}</strong>-{item.colorCode}
                            <div className="text-muted">{item.productName}</div>
                          </td>
                          <td>
                            {item.quantity} {item.unit}
                          </td>
                          <td style={{ color: 'var(--color-success)', fontWeight: (item.receivedQty || 0) > 0 ? 600 : 400 }}>{item.receivedQty || 0}</td>
                          <td style={{ 
                            color: remaining > 0 ? 'var(--color-warning)' : 'var(--color-success)',
                            fontWeight: remaining > 0 ? 700 : 400
                          }}>
                            {remaining > 0 ? `-${remaining}` : '✓'}
                          </td>
                          <td>
                            <span className={`badge badge-${statusBadge.tone}`} style={{ fontSize: 10 }}>
                              {statusBadge.icon} {statusBadge.label}
                            </span>
                          </td>
                          <td>{formatCurrency(item.unitCost || 0)}</td>
                          <td style={{ fontWeight: 600 }}>{formatCurrency(item.totalCost || 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Teslimatlar */}
            {selectedOrder.deliveries?.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <h4 className="card-title">Teslimat Geçmişi</h4>
                </div>
                <div className="timeline">
                  {selectedOrder.deliveries.map((d) => (
                    <div key={d.id} className="timeline-item">
                      <div className="timeline-point" />
                      <div>
                        <div className="timeline-title">{d.date}</div>
                        <div className="timeline-subtitle">
                          {d.items?.map((i) => `${i.productCode}: ${i.quantity}`).join(', ')}
                        </div>
                        <div className="text-muted">
                          {d.receivedBy && `Teslim alan: ${d.receivedBy}`} {d.note && `· ${d.note}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Teslimat Kayıt Modal */}
      <Modal
        open={deliveryOpen}
        title="📦 Teslimat Kaydet"
        size="xlarge"
        onClose={() => setDeliveryOpen(false)}
        actions={
          <>
            <button className="btn btn-secondary" type="button" onClick={() => setDeliveryOpen(false)}>
              İptal
            </button>
            <button
              className="btn btn-warning"
              type="button"
              onClick={() => {
                // Tümünü doldur
                setDeliveryForm((p) => ({
                  ...p,
                  items: p.items.map((i) => ({ ...i, quantity: i.remaining })),
                }));
              }}
            >
              Tümünü Doldur
            </button>
            <button
              className="btn btn-success"
              type="submit"
              form="delivery-form"
              disabled={submitting || !deliveryForm.items.some((i) => i.quantity > 0)}
            >
              {submitting ? 'Kaydediliyor...' : `✅ ${deliveryForm.items.filter((i) => i.quantity > 0).length} Kalem Kaydet`}
            </button>
          </>
        }
      >
        <form id="delivery-form" onSubmit={saveDelivery}>
          {/* Özet bilgi */}
          <div className="card subtle-card" style={{ padding: 12, marginBottom: 16 }}>
            <div className="grid grid-4" style={{ gap: 16 }}>
              <div>
                <div className="metric-label" style={{ fontSize: 11 }}>Sipariş No</div>
                <strong>{selectedOrder?.id}</strong>
              </div>
              <div>
                <div className="metric-label" style={{ fontSize: 11 }}>Tedarikçi</div>
                <strong>{selectedOrder?.supplierName}</strong>
              </div>
              <div>
                <div className="metric-label" style={{ fontSize: 11 }}>Toplam Kalem</div>
                <strong>{deliveryForm.items.length}</strong>
              </div>
              <div>
                <div className="metric-label" style={{ fontSize: 11 }}>Bu Teslimatta</div>
                <strong style={{ color: 'var(--color-success)' }}>
                  {deliveryForm.items.filter((i) => i.quantity > 0).length} kalem
                </strong>
              </div>
            </div>
          </div>

          <div className="text-muted" style={{ marginBottom: 12, fontSize: 13 }}>
            💡 Her kalem için teslim alınan miktarı girin. <strong>Tab</strong> ile sonraki kaleme geçebilirsiniz.
          </div>

          <div className="table-container" style={{ marginBottom: 16, maxHeight: 350, overflow: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '35%' }}>Ürün</th>
                  <th style={{ width: '15%' }}>Sipariş</th>
                  <th style={{ width: '15%' }}>Önceki Alım</th>
                  <th style={{ width: '15%' }}>Kalan</th>
                  <th style={{ width: '20%' }}>Bu Teslimat</th>
                </tr>
              </thead>
              <tbody>
                {deliveryForm.items.map((item, idx) => (
                  <tr
                    key={`${item.productCode}-${idx}`}
                    style={{
                      background: item.quantity > 0 ? 'var(--color-success-bg)' : item.remaining === 0 ? 'var(--color-bg-secondary)' : 'transparent',
                    }}
                  >
                    <td>
                      <strong>{item.productCode}</strong>-{item.colorCode}
                      <div className="text-muted" style={{ fontSize: 12 }}>{item.productName}</div>
                    </td>
                    <td>{formatNumber(item.ordered)}</td>
                    <td style={{ color: item.received > 0 ? 'var(--color-success)' : 'var(--text-muted)' }}>
                      {formatNumber(item.received)}
                    </td>
                    <td>
                      {item.remaining > 0 ? (
                        <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>{formatNumber(item.remaining)}</span>
                      ) : (
                        <span className="badge badge-success">Tamam</span>
                      )}
                    </td>
                    <td>
                      {item.remaining > 0 ? (
                        <NumberInput
                          className="form-input"
                          min={0}
                          max={item.remaining}
                          value={item.quantity}
                          onChange={(val) => {
                            setDeliveryForm((p) => ({
                              ...p,
                              items: p.items.map((i, iIdx) => (iIdx === idx ? { ...i, quantity: val } : i)),
                            }));
                          }}
                          style={{ width: 90 }}
                          allowEmpty
                        />
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-2" style={{ gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Teslim Alan *</label>
              <select
                className="form-select"
                value={deliveryForm.receivedBy}
                onChange={(e) => setDeliveryForm((p) => ({ ...p, receivedBy: e.target.value }))}
                required
              >
                <option value="">-- Personel Seçin --</option>
                {personnel.map((p) => (
                  <option key={p.id} value={`${p.ad} ${p.soyad || ''}`.trim()}>
                    {p.ad} {p.soyad || ''} {p.unvan ? `(${p.unvan})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Not (opsiyonel)</label>
              <input
                className="form-input"
                value={deliveryForm.note}
                onChange={(e) => setDeliveryForm((p) => ({ ...p, note: e.target.value }))}
                placeholder="Teslimat notu, irsaliye no vb..."
              />
            </div>
          </div>

          {/* İrsaliye Yükleme */}
          <div className="form-group" style={{ marginTop: 16 }}>
            <label className="form-label">📎 İrsaliye / Belge Yükle (opsiyonel)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label 
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  background: 'var(--color-bg-secondary)',
                  border: '2px dashed var(--color-border)',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                  color: 'var(--color-text-secondary)',
                  transition: 'all 0.2s'
                }}
              >
                <span>📁</span>
                <span>Dosya Seç</span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setDeliveryForm((p) => ({ ...p, waybillFile: file }));
                    }
                    e.target.value = '';
                  }}
                />
              </label>
              {deliveryForm.waybillFile && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13 }}>📄 {deliveryForm.waybillFile.name}</span>
                  <button
                    type="button"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-danger)',
                      cursor: 'pointer',
                      padding: '2px 6px',
                      fontSize: 12
                    }}
                    onClick={() => setDeliveryForm((p) => ({ ...p, waybillFile: null }))}
                    title="Dosyayı Kaldır"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
            <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
              Tedarikçiden gelen irsaliye veya teslim belgesi (PDF, PNG, JPG)
            </div>
          </div>
        </form>
      </Modal>

      {/* Eksik Ürünler Modal */}
      <Modal
        open={missingOpen}
        title="⚠️ Eksik Ürünler - Toplu Sipariş"
        size="xlarge"
        onClose={() => setMissingOpen(false)}
        actions={
          <>
            <button className="btn btn-secondary" type="button" onClick={() => setMissingOpen(false)}>
              Kapat
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={submitting || selectedMissing.length === 0}
              onClick={createFromMissing}
            >
              {submitting ? 'Oluşturuluyor...' : `📦 ${selectedMissing.length} Ürün İçin Sipariş Oluştur`}
            </button>
          </>
        }
      >
        <div className="text-muted" style={{ marginBottom: 16 }}>
          Aşağıdaki ürünler kritik stok seviyesinin altında. Sipariş vermek istediklerinizi seçin:
        </div>

        <div className="table-container" style={{ maxHeight: 400 }}>
          <table className="table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={selectedMissing.length === missingItems.length && missingItems.length > 0}
                    onChange={(e) => setSelectedMissing(e.target.checked ? [...missingItems] : [])}
                  />
                </th>
                <th>Ürün</th>
                <th>Tedarikçi</th>
                <th>Mevcut</th>
                <th>Kritik</th>
                <th>Önerilen</th>
              </tr>
            </thead>
            <tbody>
              {missingItems.map((item) => (
                <tr key={item.itemId}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedMissing.some((m) => m.itemId === item.itemId)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedMissing((p) => [...p, item]);
                        } else {
                          setSelectedMissing((p) => p.filter((m) => m.itemId !== item.itemId));
                        }
                      }}
                    />
                  </td>
                  <td>
                    <strong>{item.productCode}</strong>-{item.colorCode}
                    <div className="text-muted">{item.name}</div>
                  </td>
                  <td>{item.supplierName}</td>
                  <td style={{ color: 'var(--color-danger)' }}>{formatNumber(item.available)}</td>
                  <td>{formatNumber(item.critical)}</td>
                  <td style={{ fontWeight: 600 }}>{formatNumber(item.suggestedQty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
          <strong>{deleteTarget?.id}</strong> siparişini silmek istediğinize emin misiniz?
        </p>
      </Modal>
    </div>
  );
};

export default SatinalmaSiparisler;
