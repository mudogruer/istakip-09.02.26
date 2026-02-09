# Test Komutları Rehberi

Bu dokümanda tüm test komutları, Windows (PowerShell/CMD) uyumlu sözdizimi ve olası hataların çözümü yer alır.

## Ön Gereksinimler

| Bileşen | Gereksinim |
|---------|------------|
| Python | 3.10+ |
| Node.js | 18+ |
| Backend bağımlılıkları | `pip install -r md.service/requirements.txt` |
| Frontend bağımlılıkları | `cd md.web` → `npm install` |
| Playwright (E2E için) | `npx playwright install chromium` |

---

## Test Komutları

### 1. Backend Testleri (pytest)

**PowerShell:**
```powershell
cd md.service; python -m pytest tests -q --tb=short
```

**CMD:**
```cmd
cd md.service
python -m pytest tests -q --tb=short
```

**Proje kökünden:**
```powershell
python -m pytest md.service/tests -q --tb=short
```

**Batch dosyası ile:**
```cmd
scripts\test.bat backend
```

---

### 2. Frontend E2E (Playwright)

> **Önemli:** Backend'in `http://localhost:8000` üzerinde çalışıyor olması gerekir.

**PowerShell:**
```powershell
cd md.web
npm install
npx playwright install chromium
npm run test:e2e
```

**Batch dosyası ile:**
```cmd
scripts\test.bat e2e
```

---

### 3. Smoke Runner

> **Önemli:** Backend çalışıyor olmalı (port 8000). Frontend opsiyonel (skipped).

**PowerShell / CMD:**
```cmd
python scripts/smoke.py
```

**Batch dosyası ile:**
```cmd
scripts\test.bat smoke
```

---

### 4. Tüm Testler (Backend + Smoke)

**Batch dosyası ile:**
```cmd
scripts\test.bat all
```

(E2E ayrı çalıştırılmalı; backend önce başlatılmalı)

---

## Batch Dosyası Kullanımı

```cmd
scripts\test.bat [backend|e2e|smoke|all]
```

| Parametre | Açıklama |
|-----------|----------|
| `backend` | Backend pytest testleri |
| `e2e` | Frontend Playwright E2E (backend ayakta olmalı) |
| `smoke` | Smoke runner (backend ayakta olmalı) |
| `all` | Backend + smoke (e2e hariç) |
| (boş) | Yardım gösterir |

---

## Hata Çözümleri

### PowerShell: `&&` geçersiz

PowerShell 5.x'te `&&` desteklenmez. Bunun yerine `;` kullanın:

```powershell
# Yanlış
cd md.service && python -m pytest tests -q

# Doğru
cd md.service; python -m pytest tests -q
```

Veya her komutu ayrı satırda çalıştırın.

---

### `make` komutu bulunamadı

Windows'ta varsayılan olarak `make` yoktur. Bunun yerine:

- **Batch:** `scripts\test.bat backend`
- **PowerShell:** `cd md.service; python -m pytest tests -q`

Make kullanmak isterseniz: `choco install make` (Chocolatey) veya WSL.

---

### Smoke: HTTP Error 307 (Temporary Redirect)

Bu hata genelde `/tasks` yerine `/tasks/` (trailing slash) kullanılmadığında oluşur. `scripts/smoke.py` güncel sürümde `/tasks/` kullanır. Hâlâ 307 alıyorsanız backend sürümünü kontrol edin.

---

### E2E: Backend bağlantı hatası

Backend çalışmıyorsa frontend API çağrıları başarısız olur. Önce backend'i başlatın:

```cmd
cd md.service
uvicorn app.main:app --reload --port 8000
```

Ardından başka bir terminalde E2E'yi çalıştırın.

---

### Port çakışması (8000 / 5173)

Başka bir uygulama bu portları kullanıyorsa:

- Portu kullanan işlemi kapatın
- Backend için farklı port: `uvicorn app.main:app --port 8001`
- Ortam değişkenleri: `SMOKE_API_URL=http://localhost:8001`

---

### Playwright tarayıcıları yüklenmedi

```cmd
cd md.web
npx playwright install chromium
```

Tüm tarayıcılar için: `npx playwright install`

---

### pytest / ModuleNotFoundError

`md.service` dizininde değilseniz:

```powershell
cd md.service
python -m pytest tests -q
```

Veya proje kökünden:

```powershell
$env:PYTHONPATH = "md.service"
python -m pytest md.service/tests -q
```

---

## Ortam Değişkenleri

| Değişken | Varsayılan | Açıklama |
|----------|------------|----------|
| `DATA_DIR` | md.data | Backend veri dizini |
| `SMOKE_API_URL` | http://localhost:8000 | Smoke test backend URL |
| `SMOKE_FRONTEND_URL` | http://localhost:5173 | Smoke test frontend URL |
| `VITE_API_URL` | http://localhost:8000 | Frontend API base URL |

---

## Özet Komutlar (kopyala-yapıştır)

```powershell
# 1. Backend testleri
cd md.service; python -m pytest tests -q --tb=short

# 2. Smoke (backend ayakta olmalı)
python scripts/smoke.py

# 3. E2E (backend ayakta olmalı, ayrı terminalde)
cd md.web; npm run test:e2e
```

```cmd
# Batch ile
scripts\test.bat backend
scripts\test.bat smoke
scripts\test.bat e2e
```
