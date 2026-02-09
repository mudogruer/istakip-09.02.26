import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Arsiv from './pages/Arsiv';
import Ayarlar from './pages/Ayarlar';
import Customers from './pages/Customers';
import Dashboard from './pages/Dashboard';
import EvrakIrsaliyeFatura from './pages/EvrakIrsaliyeFatura';
import FinansOdemelerKasa from './pages/FinansOdemelerKasa';
import Gorevler from './pages/Gorevler';
import Personnel from './pages/Personnel';
import Teams from './pages/Teams';
import Roles from './pages/Roles';
import JobNew from './pages/JobNew';
import JobsList from './pages/JobsList';
import IslerTakvim from './pages/IslerTakvim';
import IslerUretimPlani from './pages/IslerUretimPlani';
import NotFound from './pages/NotFound';
import Raporlar from './pages/Raporlar';
import Satinalma from './pages/Satinalma';
import SatinalmaSiparisler from './pages/SatinalmaSiparisler';
import SatinalmaTedarikciler from './pages/SatinalmaTedarikciler';
import SatinalmaEksik from './pages/SatinalmaEksik';
import SatinalmaBekleyen from './pages/SatinalmaBekleyen';
import Stok from './pages/Stok';
import StokHareketler from './pages/StokHareketler';
import StokKritik from './pages/StokKritik';
import StokList from './pages/StokList';
import StokRezervasyonlar from './pages/StokRezervasyonlar';
import Renkler from './pages/Renkler';
import UretimSiparisler from './pages/UretimSiparisler';
import MontajPlanlanan from './pages/MontajPlanlanan';
import MontajBugun from './pages/MontajBugun';
import MontajTakvim from './pages/MontajTakvim';
import MontajSorunlar from './pages/MontajSorunlar';
import Aktiviteler from './pages/Aktiviteler';

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <Routes>
        {/* Login sayfası - auth gerektirmez */}
        <Route path="/login" element={<Login />} />
        
        {/* Korumalı rotalar */}
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="isler">
            <Route index element={<Navigate to="list" replace />} />
            <Route path="list" element={<JobsList />} />
            <Route path="yeni" element={<JobNew />} />
            <Route path="takvim" element={<IslerTakvim />} />
            <Route path="uretim-plani" element={<IslerUretimPlani />} />
            <Route path="montaj-takvimi" element={<MontajTakvim />} />
            {/* Üretim Takip - İşler altında */}
            <Route path="uretim-takip">
              <Route index element={<Navigate to="siparisler" replace />} />
              <Route path="siparisler" element={<UretimSiparisler />} />
              <Route path="ic-uretim" element={<UretimSiparisler orderType="internal" />} />
              <Route path="dis-siparis" element={<UretimSiparisler orderType="external" />} />
              <Route path="cam" element={<UretimSiparisler orderType="glass" />} />
              <Route path="sorunlar" element={<UretimSiparisler showIssues />} />
            </Route>
            {/* Montaj Takip - İşler altında */}
            <Route path="montaj-takip">
              <Route index element={<Navigate to="planlanan" replace />} />
              <Route path="planlanan" element={<MontajPlanlanan />} />
              <Route path="bugun" element={<MontajBugun />} />
              <Route path="sorunlar" element={<MontajSorunlar />} />
            </Route>
          </Route>
          <Route path="gorevler">
            <Route index element={<Navigate to="list" replace />} />
            <Route path="list" element={<Gorevler />} />
            <Route path="personel" element={<Personnel />} />
            <Route path="ekipler" element={<Teams />} />
            <Route path="roller" element={<Roles />} />
          </Route>
          <Route path="musteriler" element={<Customers />} />
          <Route path="stok">
            <Route index element={<Stok />} />
            <Route path="liste" element={<StokList />} />
            <Route path="hareketler" element={<StokHareketler />} />
            <Route path="kritik" element={<StokKritik />} />
            <Route path="rezervasyonlar" element={<StokRezervasyonlar />} />
            <Route path="renkler" element={<Renkler />} />
          </Route>
          {/* Eski /uretim yolundan redirect */}
          <Route path="uretim/*" element={<Navigate to="/isler/uretim-takip" replace />} />
          <Route path="satinalma">
            <Route index element={<Satinalma />} />
            <Route path="siparisler" element={<SatinalmaSiparisler />} />
            <Route path="eksik" element={<SatinalmaEksik />} />
            <Route path="bekleyen" element={<SatinalmaBekleyen />} />
            <Route path="tedarikciler" element={<SatinalmaTedarikciler />} />
          </Route>
          <Route path="evrak/irsaliye-fatura" element={<EvrakIrsaliyeFatura />} />
          <Route path="finans/odemeler-kasa" element={<FinansOdemelerKasa />} />
          <Route path="arsiv" element={<Arsiv />} />
          <Route path="raporlar" element={<Raporlar />} />
          <Route path="aktiviteler" element={<Aktiviteler />} />
          <Route path="ayarlar" element={<Ayarlar />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AuthProvider>
  </BrowserRouter>
);

export default App;
