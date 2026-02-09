# İş Takip Paneli (React + Vite)

Modern ve kullanıcı dostu iş takip sistemi artık React bileşen mimarisi, React Router ve servis katmanı ile yönetilebilir bir SPA hâline getirildi.

## 🚀 Öne Çıkanlar

- ⚛️ React + Vite tabanlı SPA
- 🧭 `react-router-dom` ile çoklu sayfa yönlendirme
- 🧩 Yeniden kullanılabilir Layout, Sidebar, Topbar ve tablo bileşenleri
- 🔌 Servis katmanı (`dataService`) ve örnek JSON veri kaynağı
- 💾 `useState` + `useEffect` ile state ve veri çekme örnekleri
- 🗂 Mock veri kaynağı (public/data/mockData.json) kolayca gerçek API/DB ile değiştirilebilir

## 📁 Proje Yapısı

```
md.web/
├── public/
│   └── data/mockData.json   # Örnek veri seti (API yerine)
├── src/
│   ├── assets/styles.css    # Global stiller
│   ├── components/          # Layout + ortak bileşenler
│   ├── constants/           # Navigation tanımları
│   ├── pages/               # Route'a bağlı ekranlar
│   ├── services/dataService # JSON/ileri seviye API katmanı
│   ├── App.jsx              # Route tanımları
│   ├── main.jsx             # React giriş noktası
│   └── index.html           # Vite entry
├── package.json
├── vite.config.js
└── README.md
```

## 🧭 Aktif Route'lar

- `/dashboard` — Kontrol Paneli
- `/isler/list`, `/isler/yeni`, `/isler/takvim`, `/isler/uretim-plani`, `/isler/montaj-sevkiyat`
- `/gorevler`
- `/musteriler`
- `/planlama` (takvim)
- `/stok` + `liste`, `hareketler`, `kritik`, `rezervasyonlar`
- `/satinalma` + `siparisler`, `tedarikciler`, `talepler`
- `/evrak/irsaliye-fatura`
- `/finans/odemeler-kasa`
- `/arsiv`, `/raporlar`, `/ayarlar`

## 🛠️ Kurulum

```bash
# Bağımlılıkları yükle
npm install

# Geliştirme sunucusu
npm run dev

# Production build
npm run build
```

Tarayıcıda `http://localhost:5173` adresini açın; default yönlendirme `/dashboard` ekranına yapılır.

## 📊 Veri Kaynağı

- Örnek veri: `public/data/mockData.json`
- Servis katmanı: `src/services/dataService.js`
- Gerçek API'ya geçmek için `DATA_URL` veya ilgili fetch logic'ini düzenlemeniz yeterlidir. `useEffect + fetch` kullanımı tüm sayfalarda örneklenmiştir.

## 📝 Notlar

- Sidebar state'i (collapse + açık gruplar) `localStorage` ile korunur.
- Ekranlar mock veriye bağlı; backend/DB hazır olduğunda servis katmanını güncellemek yeterli.
- Eski statik HTML sayfaları referans amaçlı korunmuştur; SPA akışı `src/main.jsx` üzerinden çalışır.

