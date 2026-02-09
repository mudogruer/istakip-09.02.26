import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import { getPurchaseOrders, getSuppliersFromAPI } from '../services/dataService';

const Satinalma = () => {
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [po, supplierList] = await Promise.all([getPurchaseOrders(), getSuppliersFromAPI()]);
        setOrders(po);
        setSuppliers(supplierList);
      } catch (err) {
        setError(err.message || 'Satınalma verisi alınamadı');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const summary = useMemo(() => {
    const waiting = orders.filter((po) => po.status.toLowerCase().includes('onay')).length;
    const inTransit = orders.filter((po) => po.status.toLowerCase().includes('yolda')).length;
    const supplierCount = suppliers.length;

    return [
      { id: 'po1', label: 'Toplam PO', value: orders.length, icon: '🛒', tone: 'primary' },
      { id: 'po2', label: 'Onay Bekleyen', value: waiting, icon: '⏳', tone: 'warning' },
      { id: 'po3', label: 'Yolda', value: inTransit, icon: '🚚', tone: 'secondary' },
      { id: 'po4', label: 'Tedarikçi', value: supplierCount, icon: '🏢', tone: 'success' },
    ];
  }, [orders, suppliers]);

  return (
    <div>
      <PageHeader title="Satınalma" subtitle="PO, tedarikçi ve talepler için özet" />

      {loading ? (
        <div className="card subtle-card">Satınalma verisi yükleniyor...</div>
      ) : error ? (
        <div className="card error-card">
          <div className="error-title">Veri alınamadı</div>
          <div className="error-message">{error}</div>
        </div>
      ) : (
        <div className="stats-grid">
          {summary.map((stat) => (
            <StatCard key={stat.id} icon={stat.icon} label={stat.label} value={stat.value} tone={stat.tone} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Satinalma;

