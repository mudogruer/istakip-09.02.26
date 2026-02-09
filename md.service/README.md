# MD Service (Python FastAPI)

Basit, modüler bir mikroservis yapısı. Veri kaynağı `md.data` klasöründeki JSON dosyalarıdır; gerçek DB geldiğinde `DATA_DIR` veya loader katmanı güncellenerek uyarlanabilir.

## Çalıştırma
```bash
cd md.service
python -m venv .venv
. .venv/Scripts/activate  # Windows
# veya: source .venv/bin/activate
pip install -r requirements.txt

# Servisi başlat
uvicorn app.main:app --reload --port 8000
```

`DATA_DIR` ortam değişkeni ile veri dizinini özelleştirebilirsiniz (varsayılan: `../md.data`).

## Modüller / Endpointler
- `/health` — durum
- `/dashboard/summary`
- `/jobs`, `/jobs/{id}`
- `/tasks`
- `/customers`
- `/planning/events`
- `/stock/items`, `/stock/movements`, `/stock/reservations`
- `/purchase/orders`, `/purchase/suppliers`, `/purchase/requests`
- `/finance/invoices`, `/finance/payments`
- `/archive/files`
- `/reports`
- `/settings`

## Veri Katmanı
- Varsayılan JSON dosyaları `md.data` altında tutulur. Bu klasörü gerçek veritabanı seed’i gibi düşünün.
- İleride DB eklendiğinde tek yapmanız gereken `data_loader.py` içinde veri okuma implementasyonunu güncellemek veya servis fonksiyonlarına repository/DB client enjekte etmektir.

