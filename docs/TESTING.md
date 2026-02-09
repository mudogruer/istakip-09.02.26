# Test Altyapısı

**Windows için ayrıntılı komutlar ve hata çözümleri:** [TEST-README.md](TEST-README.md)

**Batch dosyası ile:** `scripts\test.bat [backend|e2e|smoke|all]`

---

## Ön Gereksinimler

- **Backend:** Python 3.10+, `pip install -r md.service/requirements.txt`
- **Frontend:** Node 18+, `npm install` (md.web)
- **E2E:** `npx playwright install chromium` (Playwright tarayıcıları)

## Lokal Çalıştırma

### Backend Unit / Integration Testleri

```bash
cd md.service
pip install -r requirements.txt
python -m pytest tests -q
```

Veya proje kökünden:

```bash
pip install -r md.service/requirements.txt
python -m pytest md.service/tests -q
```

### Frontend E2E (Playwright)

**Önce backend çalışıyor olmalı** (port 8000). Ardından:

```bash
cd md.web
npm install
npx playwright install chromium
npm run test:e2e
```

Playwright `webServer` ile Vite dev server'ı otomatik başlatır. Backend'in `http://localhost:8000` üzerinde çalıştığından emin olun.

### Smoke Runner (tek komut)

Backend ve frontend'in çalıştığından emin olun, ardından:

```bash
python scripts/smoke.py
```

Ortam değişkenleri (opsiyonel):

- `SMOKE_API_URL` – Backend URL (varsayılan: http://localhost:8000)
- `SMOKE_FRONTEND_URL` – Frontend URL (varsayılan: http://localhost:5173)

## CI Notları

GitHub Actions workflow (`.github/workflows/tests.yml`):

1. **Backend job:** `pytest` çalıştırır
2. **Frontend E2E job:** Backend başlatır, Playwright ile E2E testlerini çalıştırır
3. Hata durumunda Playwright raporu artifact olarak yüklenir

## Sorun Giderme

### Flaky testler

- Playwright `trace: 'on-first-retry'` ile trace alır; `npx playwright show-report` ile inceleyin
- `waitForTimeout` yerine `waitForSelector` / `expect().toBeVisible()` kullanın

### Port çakışması

- Backend: 8000
- Frontend (Vite): 5173
- Başka bir uygulama bu portları kullanıyorsa kapatın veya ortam değişkenleriyle değiştirin

### Ortam değişkenleri

| Değişken | Kullanım |
|----------|----------|
| `DATA_DIR` | Backend JSON veri dizini (varsayılan: md.data) |
| `VITE_API_URL` | Frontend API base URL (varsayılan: http://localhost:8000) |
| `PLAYWRIGHT_BASE_URL` | E2E base URL (varsayılan: http://localhost:5173) |

### Test verisi

- Backend testleri `conftest.py` içinde geçici `DATA_DIR` kullanır; `md.data` kopyalanır
- Testler birbirini kirletmez; her test oturumu izole veri ile çalışır
