import PageHeader from '../components/PageHeader';

const Placeholder = ({ title }) => (
  <div>
    <PageHeader title={title} subtitle="Bu ekran için API ve bileşen entegrasyonu bekleniyor" />
    <div className="card subtle-card">
      <div className="empty-state">
        <div className="empty-state-icon">🚧</div>
        <div className="empty-state-title">Çalışma devam ediyor</div>
        <div className="empty-state-description">
          Bu modül, veri servisi hazır olduğunda kolayca bağlanacak şekilde yapılandırıldı.
        </div>
      </div>
    </div>
  </div>
);

export default Placeholder;

