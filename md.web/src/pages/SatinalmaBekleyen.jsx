import { useEffect, useState, useMemo } from 'react';
import DataTable from '../components/DataTable';
import PageHeader from '../components/PageHeader';
import Loader from '../components/Loader';
import { getPurchaseOrdersFromAPI, getSuppliersFromAPI } from '../services/dataService';

const formatNumber = (value) => new Intl.NumberFormat('tr-TR').format(value || 0);

const SatinalmaBekleyen = () => {
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [ordersData, suppliersData] = await Promise.all([
        getPurchaseOrdersFromAPI(),
        getSuppliersFromAPI(),
      ]);
      setOrders(ordersData);
      setSuppliers(suppliersData);
    } catch (err) {
      setError(err.message || 'Veriler alınamadı');
    } finally {
      setLoading(false);
    }
  };

  // Bekleyen kalemleri çıkar
  const pendingItems = useMemo(() => {
    const items = [];

    orders
      .filter((o) => ['sent', 'partial'].includes(o.status))
      .forEach((order) => {
        order.items?.forEach((item) => {
          const remaining = item.quantity - (item.receivedQty || 0);
          if (remaining > 0) {
            items.push({
              id: `${order.id}-${item.productCode}-${item.colorCode}`,
              orderId: order.id,
              supplierId: order.supplierId,
              supplierName: order.supplierName,
              expectedDate: order.expectedDate,
              productCode: item.productCode,
              colorCode: item.colorCode,
              productName: item.productName,
              ordered: item.quantity,
              received: item.receivedQty || 0,
              remaining,
              unit: item.unit,
              status: order.status,
            });
          }
        });
      });

    return items;
  }, [orders]);

  const filteredItems = useMemo(() => {
    let data = [...pendingItems];

    if (search) {
      const q = search.toLowerCase();
      data = data.filter(
        (i) =>
          i.orderId.toLowerCase().includes(q) ||
          i.productCode.toLowerCase().includes(q) ||
          i.productName.toLowerCase().includes(q)
      );
    }

    if (supplierFilter !== 'all') {
      data = data.filter((i) => i.supplierId === supplierFilter);
    }

    // Beklenen tarihe göre sırala
    return data.sort((a, b) => {
      if (!a.expectedDate) return 1;
      if (!b.expectedDate) return -1;
      return new Date(a.expectedDate) - new Date(b.expectedDate);
    });
  }, [pendingItems, search, supplierFilter]);

  const summary = useMemo(() => {
    const totalItems = pendingItems.length;
    const totalRemaining = pendingItems.reduce((sum, i) => sum + i.remaining, 0);
    const overdueCount = pendingItems.filter((i) => {
      if (!i.expectedDate) return false;
      return new Date(i.expectedDate) < new Date();
    }).length;
    const uniqueOrders = new Set(pendingItems.map((i) => i.orderId)).size;
    return { totalItems, totalRemaining, overdueCount, uniqueOrders };
  }, [pendingItems]);

  const isOverdue = (date) => {
    if (!date) return false;
    return new Date(date) < new Date();
  };

  const getDaysOverdue = (date) => {
    if (!date) return null;
    const target = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today - target) / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div>
      <PageHeader
        title="Bekleyen Teslimatlar"
        subtitle="Gönderilmiş siparişlerdeki teslim alınmamış ürünler"
      />

      {/* Özet Kartları */}
      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="metric-row">
            <div className="metric-icon">📦</div>
            <div>
              <div className="metric-label">Bekleyen Kalem</div>
              <div className="metric-value">{summary.totalItems}</div>
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="metric-row">
            <div className="metric-icon">📋</div>
            <div>
              <div className="metric-label">Açık Sipariş</div>
              <div className="metric-value">{summary.uniqueOrders}</div>
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="metric-row">
            <div className="metric-icon">📊</div>
            <div>
              <div className="metric-label">Toplam Bekleyen</div>
              <div className="metric-value">{formatNumber(summary.totalRemaining)}</div>
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: 16, background: summary.overdueCount > 0 ? 'var(--color-danger-bg)' : undefined }}>
          <div className="metric-row">
            <div className="metric-icon">⚠️</div>
            <div>
              <div className="metric-label">Gecikmiş</div>
              <div className="metric-value" style={{ color: summary.overdueCount > 0 ? 'var(--color-danger)' : undefined }}>
                {summary.overdueCount}
              </div>
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
            placeholder="Sipariş no, ürün..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <Loader text="Bekleyen teslimatlar yükleniyor..." />
      ) : error ? (
        <div className="card error-card">
          <div className="error-title">Hata</div>
          <div className="error-message">{error}</div>
        </div>
      ) : pendingItems.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h3>Tüm Teslimatlar Tamamlandı</h3>
          <p className="text-muted">Bekleyen ürün bulunmuyor.</p>
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Bekleyen Ürünler</h3>
            <span className="badge badge-warning">{filteredItems.length} kalem</span>
          </div>
          <DataTable
            columns={[
              {
                label: 'Sipariş',
                accessor: 'orderId',
                render: (val) => <strong>{val}</strong>,
              },
              {
                label: 'Tedarikçi',
                accessor: 'supplierName',
              },
              {
                label: 'Ürün',
                accessor: 'productName',
                render: (_, row) => (
                  <div>
                    <strong>{row.productCode}</strong>-{row.colorCode}
                    <div className="text-muted">{row.productName}</div>
                  </div>
                ),
              },
              {
                label: 'Sipariş',
                accessor: 'ordered',
                render: (val, row) => `${formatNumber(val)} ${row.unit}`,
              },
              {
                label: 'Teslim Alınan',
                accessor: 'received',
                render: (val) => (
                  <span style={{ color: 'var(--color-success)' }}>{formatNumber(val)}</span>
                ),
              },
              {
                label: 'Kalan',
                accessor: 'remaining',
                render: (val, row) => (
                  <strong style={{ color: 'var(--color-warning)' }}>
                    {formatNumber(val)} {row.unit}
                  </strong>
                ),
              },
              {
                label: 'Beklenen Tarih',
                accessor: 'expectedDate',
                render: (val) => {
                  if (!val) return '-';
                  const daysOver = getDaysOverdue(val);
                  const overdue = daysOver > 0;
                  const today = daysOver === 0;
                  return (
                    <div>
                      <span
                        className={`badge badge-${overdue ? 'danger' : today ? 'warning' : 'secondary'}`}
                      >
                        {val}
                      </span>
                      {overdue && (
                        <div style={{ fontSize: 11, color: 'var(--color-danger)', fontWeight: 600, marginTop: 2 }}>
                          ⚠️ {daysOver} gün geçti!
                        </div>
                      )}
                      {daysOver < 0 && (
                        <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2 }}>
                          {Math.abs(daysOver)} gün kaldı
                        </div>
                      )}
                      {today && (
                        <div style={{ fontSize: 11, color: 'var(--color-warning)', fontWeight: 600, marginTop: 2 }}>
                          📅 Bugün!
                        </div>
                      )}
                    </div>
                  );
                },
              },
              {
                label: 'Durum',
                accessor: 'status',
                render: (val) => (
                  <span className={`badge badge-${val === 'partial' ? 'warning' : 'primary'}`}>
                    {val === 'partial' ? 'Kısmi' : 'Bekliyor'}
                  </span>
                ),
              },
            ]}
            rows={filteredItems}
          />
        </div>
      )}
    </div>
  );
};

export default SatinalmaBekleyen;


