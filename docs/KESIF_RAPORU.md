# Mevcut Akış Özeti – Keşif Raporu

## 1) Backend Klasör Yapısı

```
md.service/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI app, CORS, router mounting
│   ├── auth.py          # X-User-Id header auth, UserContext, RBAC (require_permission)
│   ├── data_loader.py   # JSON load/save, DATA_DIR env
│   ├── activity_logger.py
│   └── routers/
│       ├── auth.py      # POST /auth/login, logout, me, check
│       ├── tasks.py     # CRUD + assign, soft-delete
│       ├── users.py     # token-based auth
│       └── ... (20+ routers)
├── requirements.txt
└── README.md
```

## 2) Backend Çalıştırma

- **Çalıştırma:** `uvicorn app.main:app --reload --port 8000`
- **Bağımlılıklar:** `requirements.txt` (fastapi, uvicorn, python-multipart, email-validator)
- **start-dev.bat:** Backend + frontend’i ayrı terminallerde başlatır

## 3) Auth / RBAC

| Özellik | Durum |
|---------|-------|
| Login | POST /auth/login (username, password) → token |
| Token | Bearer token, Authorization header |
| Session | In-memory `active_sessions` (routers/auth.py) |
| X-User-Id | app/auth.py – AUTH_MODE prod/dev, UserContext |
| RBAC | `require_permission`, `require_any_permission` |
| Tasks | Auth zorunlu değil; `authorization` opsiyonel (activity log için) |

**Test kullanıcısı:** `admin` / `admin` (SHA256 hash: 8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918)

## 4) Veri Katmanı

- **DB:** Yok; JSON dosyaları kullanılıyor
- **Veri dizini:** `DATA_DIR` env veya `md.data` (md.service’e göre parent)
- **Dosyalar:** tasks.json, task_assignments.json, users.json, personnel.json, teams.json, roles.json, vb.
- **API:** `load_json()`, `save_json()` – atomic write (temp + rename)

## 5) Frontend Çalıştırma

- **Komut:** `npm run dev` (Vite)
- **Port:** 5173
- **Yapı:** React SPA, `root: 'src'`
- **API base:** `VITE_API_URL` veya `http://localhost:8000`

## 6) Endpoint Yolları (Tasks)

| Method | Path | Açıklama |
|--------|------|----------|
| GET | /tasks/ | Liste (durum, oncelik, assigneeType, assigneeId filter) |
| GET | /tasks/{id} | Detay |
| POST | /tasks/ | Oluştur |
| PUT | /tasks/{id} | Güncelle |
| PATCH | /tasks/{id}/durum?durum=X | Durum değiştir |
| DELETE | /tasks/{id} | Soft-delete |
| POST | /tasks/{id}/assign | Kişi/ekip ata |
| DELETE | /tasks/{id}/assign | Atamayı kaldır |

## 7) Frontend Route’lar

- `/login` – Giriş
- `/dashboard` – Ana sayfa
- `/gorevler` – Görevler (redirect: /gorevler/list)
- `/gorevler/list` – Görev listesi (Gorevler.jsx)
