import { useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import PageHeader from '../components/PageHeader';
import { getReservations } from '../services/dataService';

const StokRezervasyonlar = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const payload = await getReservations();
        setRows(payload);
      } catch (err) {
        setError(err.message || 'Rezervasyonlar alınamadı');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div>
      <PageHeader title="Rezervasyonlar" subtitle="İşlere ayrılmış stok kalemleri" />

      {loading ? (
        <div className="card subtle-card">Rezervasyonlar yükleniyor...</div>
      ) : error ? (
        <div className="card error-card">
          <div className="error-title">Rezervasyonlar alınamadı</div>
          <div className="error-message">{error}</div>
        </div>
      ) : (
        <DataTable
          columns={[
            { label: 'İş Kodu', accessor: 'job' },
            { label: 'Kalem', accessor: 'item' },
            { label: 'Miktar', accessor: 'qty' },
            { label: 'Termin', accessor: 'dueDate' },
            { label: 'Durum', accessor: 'status' },
          ]}
          rows={rows}
        />
      )}
    </div>
  );
};

export default StokRezervasyonlar;

