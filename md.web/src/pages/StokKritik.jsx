import { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import PageHeader from '../components/PageHeader';
import { getStockItems } from '../services/dataService';

const StokKritik = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const payload = await getStockItems();
        setItems(payload);
      } catch (err) {
        setError(err.message || 'Kritik stoklar alınamadı');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const critical = useMemo(
    () => items.filter((item) => item.onHand - item.reserved <= item.critical),
    [items]
  );

  return (
    <div>
      <PageHeader title="Kritik Stok" subtitle="Kritik seviyenin altındaki kalemler" />

      {loading ? (
        <div className="card subtle-card">Kritik stoklar yükleniyor...</div>
      ) : error ? (
        <div className="card error-card">
          <div className="error-title">Kritik stoklar alınamadı</div>
          <div className="error-message">{error}</div>
        </div>
      ) : (
        <DataTable
          columns={[
            { label: 'Kalem', accessor: 'name' },
            { label: 'SKU', accessor: 'sku' },
            { label: 'Mevcut', accessor: 'onHand' },
            { label: 'Rezerve', accessor: 'reserved' },
            { label: 'Kritik Limit', accessor: 'critical' },
            { label: 'Tedarikçi', accessor: 'supplier' },
          ]}
          rows={critical}
        />
      )}
    </div>
  );
};

export default StokKritik;

