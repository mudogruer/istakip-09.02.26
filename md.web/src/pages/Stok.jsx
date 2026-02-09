import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import { getStockItems, getStockMovements } from '../services/dataService';

const Stok = () => {
  const [items, setItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [stock, movement] = await Promise.all([getStockItems(), getStockMovements()]);
        setItems(stock);
        setMovements(movement);
      } catch (err) {
        setError(err.message || 'Stok verisi alınamadı');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const summary = useMemo(() => {
    const totalItems = items.length;
    const totalOnHand = items.reduce((sum, item) => sum + (item.onHand || 0), 0);
    const criticalCount = items.filter((item) => item.onHand - item.reserved <= item.critical).length;
    const lastMovement = movements[0]?.date || '-';

    return [
      { id: 'stk1', label: 'Kalem Sayısı', value: totalItems, icon: '📦', tone: 'primary' },
      { id: 'stk2', label: 'Mevcut Stok', value: totalOnHand, icon: '📊', tone: 'success' },
      { id: 'stk3', label: 'Kritik Kalem', value: criticalCount, icon: '⚠️', tone: 'danger' },
      { id: 'stk4', label: 'Son Hareket', value: lastMovement, icon: '🕒', tone: 'secondary' },
    ];
  }, [items, movements]);

  return (
    <div>
      <PageHeader title="Stok" subtitle="Stok seviyeleri ve hareketlerinin özet görünümü" />

      {loading ? (
        <div className="card subtle-card">Stok verisi yükleniyor...</div>
      ) : error ? (
        <div className="card error-card">
          <div className="error-title">Stok verisi alınamadı</div>
          <div className="error-message">{error}</div>
        </div>
      ) : (
        <>
          <div className="stats-grid">
            {summary.map((stat) => (
              <StatCard key={stat.id} icon={stat.icon} label={stat.label} value={stat.value} tone={stat.tone} />
            ))}
          </div>

          <div className="card" style={{ marginTop: 24 }}>
            <div className="card-header">
              <h3 className="card-title">Öne Çıkan Hareketler</h3>
            </div>
            <div className="card-body">
              {movements.slice(0, 4).map((movement) => (
                <div className="metric-row" key={movement.id} style={{ marginBottom: 8 }}>
                  <span className="metric-label">
                    {movement.date} — {movement.item}
                  </span>
                  <span className={`badge badge-${movement.change >= 0 ? 'success' : 'danger'}`}>
                    {movement.change >= 0 ? '+' : ''}
                    {movement.change}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Stok;

