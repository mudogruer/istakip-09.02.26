import { useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import PageHeader from '../components/PageHeader';
import { getRequests } from '../services/dataService';

const SatinalmaTalepler = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const payload = await getRequests();
        setRows(payload);
      } catch (err) {
        setError(err.message || 'Talepler alınamadı');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div>
      <PageHeader title="Malzeme Talepleri" subtitle="Departmanlardan gelen talepler" />

      {loading ? (
        <div className="card subtle-card">Talepler yükleniyor...</div>
      ) : error ? (
        <div className="card error-card">
          <div className="error-title">Talepler alınamadı</div>
          <div className="error-message">{error}</div>
        </div>
      ) : (
        <DataTable
          columns={[
            { label: 'Talep No', accessor: 'id' },
            { label: 'Talep Eden', accessor: 'requester' },
            { label: 'Kalem', accessor: 'item' },
            { label: 'Miktar', accessor: 'qty' },
            { label: 'Durum', accessor: 'status' },
            { label: 'İhtiyaç Tarihi', accessor: 'neededDate' },
          ]}
          rows={rows}
        />
      )}
    </div>
  );
};

export default SatinalmaTalepler;

