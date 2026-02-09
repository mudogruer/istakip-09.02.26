import { useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import PageHeader from '../components/PageHeader';
import { getInvoices } from '../services/dataService';

const EvrakIrsaliyeFatura = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const payload = await getInvoices();
        setRows(payload);
      } catch (err) {
        setError(err.message || 'Evraklar alınamadı');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div>
      <PageHeader title="İrsaliye & Fatura" subtitle="Kesilmiş veya taslak evraklar" />

      {loading ? (
        <div className="card subtle-card">Evraklar yükleniyor...</div>
      ) : error ? (
        <div className="card error-card">
          <div className="error-title">Evraklar alınamadı</div>
          <div className="error-message">{error}</div>
        </div>
      ) : (
        <DataTable
          columns={[
            { label: 'Evrak No', accessor: 'id' },
            { label: 'Müşteri', accessor: 'customer' },
            { label: 'Tip', accessor: 'type' },
            { label: 'Tutar', accessor: 'amount' },
            { label: 'Tarih', accessor: 'date' },
            { label: 'Durum', accessor: 'status' },
          ]}
          rows={rows}
        />
      )}
    </div>
  );
};

export default EvrakIrsaliyeFatura;

