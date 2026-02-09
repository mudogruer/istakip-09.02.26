import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';

const NotFound = () => (
  <div>
    <PageHeader title="Sayfa bulunamadı" subtitle="Aradığınız sayfa kaldırılmış olabilir" />
    <div className="card subtle-card">
      <div className="empty-state">
        <div className="empty-state-icon">🧭</div>
        <div className="empty-state-title">404</div>
        <div className="empty-state-description">
          Yanlış bir bağlantıya tıkladıysanız menüden doğru modülü seçebilirsiniz.
        </div>
        <Link className="btn btn-primary" to="/dashboard">
          Kontrol Paneline Dön
        </Link>
      </div>
    </div>
  </div>
);

export default NotFound;

