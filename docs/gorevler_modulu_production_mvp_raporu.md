# Görevler Modülü Production MVP Raporu

**Tarih:** 2025-01-26  
**Versiyon:** 1.0 (Production Ready - Kısmi)  
**Durum:** P0 auth tamamlandı, P1 tasks.py RBAC devam ediyor

---

## 📋 ÖZET

Görevler Modülü üretime çıkacak MVP standardına yükseltilmektedir. Öncelik sırası:
- ✅ **P0 (Auth & Güvenlik)**: AUTH_MODE eklendi, prod'da 401, soft-delete kontrolü
- ⚠️ **P0 (RBAC & Own Task)**: tasks.py RBAC güncellemesi devam ediyor
- ⏳ **P1 (Frontend MVP)**: Auth context, CRUD modalları, KPI kartları eksik

---

## 🔒 1. AUTH STANDARDI (P0 - TAMAMLANDI)

### 1.1 AUTH_MODE Ortam Değişkeni

**Değişiklik:** `md.service/app/auth.py`
- `AUTH_MODE` env eklendi: `"prod"` (varsayılan) veya `"dev"`
- `get_current_user()`: Prod'da header yoksa 401, dev'de None döner

**Kod:**
```python
import os
AUTH_MODE = os.getenv("AUTH_MODE", "prod").lower()

def get_current_user(x_user_id: Optional[str] = Header(None, alias="X-User-Id")) -> Optional[UserContext]:
  if not x_user_id:
    if AUTH_MODE == "prod":
      raise HTTPException(status_code=401, detail="Kullanıcı kimlik doğrulaması gerekli. X-User-Id header'ı eksik.")
    return None  # Dev modu
  # ... personnel resolve
  if not personnel.get("aktifMi", True):
    raise HTTPException(status_code=403, detail="Kullanıcı hesabı pasif durumda")
```

### 1.2 Auth Davranış Tablosu

| İşlem | AUTH_MODE="prod" | AUTH_MODE="dev" |
|-------|------------------|-----------------|
| Header yok | 401 Unauthorized | None (okuma izin verilir) |
| Header var ama user bulunamadı | 401 Unauthorized | 401 Unauthorized |
| Header var ama aktifMi=false | 403 Forbidden | 403 Forbidden |
| `/me` header yok | 401 Unauthorized | `{authenticated: false}` |

### 1.3 Soft-Delete Kontrolü

**Değişiklik:** `md.service/app/auth.py`
- `aktifMi=false` kontrolü eklendi → 403 Forbidden
- `deleted=true` kontrolü zaten var (personnel resolve'da)

---

## 🔐 2. RBAC STANDARDI (P0 - DEVAM EDİYOR)

### 2.1 Own Task Tanımı (Üretim Standardı)

**Kurallar:**
1. **Personnel Assignment**: `currentAssignment.assigneeType="personnel"` ve `assigneeId==user.id` → own task
2. **Team Assignment**: `currentAssignment.assigneeType="team"` ve `user` ekip üyesi (`team_members.json`) → own task
3. **CreatedBy**: `createdBy==user.id` → own task (view için; update için karar: sadece status update mi, full update mi? → **karar: full update izni ver**)

**Uygulama:** `md.service/app/routers/tasks.py` (devam ediyor)
- `filter_tasks_by_permission()`: Own task filtreleme (personnel/team/createdBy)
- `check_task_permission()`: Own task yetki kontrolü (personnel/team/createdBy)

### 2.2 RBAC Matrisi

| İşlem | Admin | Manager | User | Not |
|-------|-------|---------|------|-----|
| Görev listele (tümü) | ✅ | ✅ | ❌ | `tasks.view` veya `tasks.*` |
| Görev listele (own) | ✅ | ✅ | ✅ | `tasks.view.own` + `filter_tasks_by_permission()` |
| Görev detay (tümü) | ✅ | ✅ | ❌ | `tasks.view` veya `tasks.*` |
| Görev detay (own) | ✅ | ✅ | ✅ | `tasks.view.own` + `check_task_permission()` |
| Görev oluştur | ✅ | ✅ | ✅ | `tasks.create` |
| Görev güncelle (tümü) | ✅ | ✅ | ❌ | `tasks.update` veya `tasks.*` |
| Görev güncelle (own) | ✅ | ✅ | ✅ | `tasks.update.own` + `check_task_permission()` (full update) |
| Görev sil | ✅ | ✅ | ❌ | `tasks.delete` (own kontrolü yok) |
| Görev ata (tümü) | ✅ | ✅ | ❌ | `tasks.update` veya `tasks.*` |
| Görev ata (own) | ✅ | ✅ | ✅ | `tasks.update.own` + `check_task_permission()` |

### 2.3 Enforcement Noktaları

**`md.service/app/routers/tasks.py` (güncelleme gerekiyor):**

1. **List Filtering**: `list_tasks()` → `filter_tasks_by_permission()`
   - Admin/Manager: Tüm görevler
   - User: Own tasks (personnel/team/createdBy)

2. **Detail Permission**: `get_task()` → `check_task_permission()`
   - Own task kontrolü: personnel assignment, team membership, createdBy

3. **CRUD Operations**: Her endpoint → `require_any_permission()` dependency
   - `create_task`: `tasks.create`
   - `update_task`: `tasks.update` veya `tasks.update.own` + `check_task_permission()`
   - `delete_task`: `tasks.delete` (own kontrolü yok)
   - `assign_task`: `tasks.update` veya `tasks.update.own` + `check_task_permission()`

---

## 🔌 3. API SÖZLEŞMESİ VE HATA STANDARDI (P0/P1)

### 3.1 Status Kodları

| Durum | Status | Açıklama |
|-------|--------|----------|
| Başarılı | 200 | GET/PUT başarılı |
| Oluşturuldu | 201 | POST başarılı |
| Validation hatası | 400 | Pydantic validation hatası |
| Kimlik doğrulaması gerekli | 401 | Header yok veya geçersiz user ID |
| Yetki yok | 403 | Permission yok veya aktifMi=false |
| Bulunamadı | 404 | Resource bulunamadı |
| Conflict | 409 | Duplicate email veya unique constraint ihlali |

### 3.2 Error Response Formatı

**FastAPI default:**
```json
{
  "detail": "Hata mesajı"
}
```

**Pydantic validation:**
```json
{
  "detail": [
    {
      "loc": ["body", "email"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

**Frontend parse:** `translateValidationError()` → Türkçeleştirme

### 3.3 Duplicate Email → 409 Conflict

**Değişiklik:** `md.service/app/routers/personnel.py`
- `create_personnel`: 400 → 409 Conflict
- `update_personnel`: 400 → 409 Conflict

**Gerekçe:** REST standardına uygun (Conflict = resource zaten var)

---

## 📁 4. DOSYA DEĞİŞİKLİKLERİ

### Tamamlanan Değişiklikler

1. **`md.service/app/auth.py`**
   - `AUTH_MODE` env eklendi
   - `get_current_user()`: Prod'da 401, dev'de None
   - `aktifMi=false` kontrolü → 403

2. **`md.service/app/routers/auth.py`**
   - `/me` endpoint: Prod'da header zorunlu, dev'de opsiyonel

3. **`md.service/app/routers/personnel.py`**
   - Email duplicate: 400 → 409 Conflict

### Devam Eden Değişiklikler

4. **`md.service/app/routers/tasks.py`** (⚠️ DEVAM EDİYOR)
   - RBAC import'ları eklendi
   - `filter_tasks_by_permission()` eklenmesi gerekiyor
   - `check_task_permission()` eklenmesi gerekiyor
   - `list_tasks()`: RBAC + assigneeName join güncellemesi gerekiyor
   - `get_task()`: RBAC + assigneeName join güncellemesi gerekiyor
   - Tüm endpoint'lere permission check eklenmesi gerekiyor

### Eksik Değişiklikler

5. **`md.web/src/contexts/AuthContext.jsx`** (❌ EKSIK)
   - Auth context/provider
   - `getMe()` check (prod blocked screen)

6. **`md.web/src/components/UserSwitch.jsx`** (❌ EKSIK)
   - Dev mode user switch component

7. **`md.web/src/pages/Gorevler.jsx`** (❌ EKSIK)
   - KPI kartları (Toplam, Todo, In Progress, Blocked, Done)
   - CRUD modalları (Create/Edit/Delete)
   - Assign modal
   - Detail drawer (assignment history timeline)
   - RBAC UI (permission bazlı buton göster/gizle)

8. **`md.web/src/constants/navigation.js`** (❌ EKSIK)
   - Navigation collapsible düzeltme (Görevler parent/child)

---

## 🧪 5. TEST CHECKLIST (20+ MADDE)

### Auth & RBAC (P0)

- [ ] AUTH_MODE="prod": Header yok → 401
- [ ] AUTH_MODE="dev": Header yok → None (okuma izin verilir)
- [ ] AUTH_MODE="prod": Header var ama user bulunamadı → 401
- [ ] AUTH_MODE="prod": aktifMi=false → 403
- [ ] `/me` AUTH_MODE="prod" header yok → 401
- [ ] `/me` AUTH_MODE="dev" header yok → `{authenticated: false}`
- [ ] Admin: `list_tasks()` tüm görevleri görür
- [ ] Manager: `list_tasks()` tüm görevleri görür
- [ ] User: `list_tasks()` sadece own tasks görür (personnel assignment)
- [ ] User: `list_tasks()` sadece own tasks görür (team assignment - ekip üyesi)
- [ ] User: `list_tasks()` kendi oluşturduğu görevleri görür (createdBy)
- [ ] User: `get_task()` own task görebilir (personnel assignment)
- [ ] User: `get_task()` own task görebilir (team assignment)
- [ ] User: `get_task()` own task görebilir (createdBy)
- [ ] User: `get_task()` başkasının görevini göremez → 403
- [ ] User: `create_task()` oluşturabilir
- [ ] User: `update_task()` own task güncelleyebilir (full update)
- [ ] User: `update_task()` başkasının görevini güncelleyemez → 403
- [ ] User: `delete_task()` izni yok → 403 (admin/manager only)
- [ ] User: `assign_task()` own task atayabilir

### API & Error (P0/P1)

- [ ] Email duplicate: `create_personnel()` → 409 Conflict
- [ ] Email duplicate: `update_personnel()` → 409 Conflict
- [ ] Validation error: Pydantic validation → 400
- [ ] Not found: `get_task()` id yok → 404

### Frontend (P1)

- [ ] Frontend: AUTH_MODE="prod" `getMe()` authenticated=false → blocked screen
- [ ] Frontend: AUTH_MODE="dev" User Switch component görünür
- [ ] Frontend: Gorevler KPI kartları gösteriliyor
- [ ] Frontend: Gorevler Create modal çalışıyor
- [ ] Frontend: Gorevler Edit modal çalışıyor
- [ ] Frontend: Gorevler Assign modal çalışıyor
- [ ] Frontend: Gorevler Detail drawer çalışıyor
- [ ] Frontend: RBAC UI - permission yoksa buton gizli/disable

---

## 🚧 6. BİLİNEN SINIRLAMALAR

### Kısa Vadeli

1. **tasks.py RBAC**: Güncelleme devam ediyor (büyük dosya, adım adım)
2. **Frontend Auth State**: Context/provider eksik
3. **Frontend CRUD Modalları**: Gorevler.jsx eksik
4. **Navigation Collapsible**: Parent/child açık kalma sorunu

### Orta Vadeli

5. **Pagination**: Büyük veri setlerinde performans sorunu olabilir
6. **Toast Notification**: Toast sistemi yok
7. **Request Logging**: Middleware eksik (observability)

### Uzun Vadeli

8. **Production Auth**: Gerçek JWT/session auth sistemi (şimdilik header-based dev auth)
9. **Real-time Updates**: WebSocket/SSE yok
10. **Performance**: Backend pagination, frontend virtual scrolling

---

## 🔄 7. SONRAKI ADIMLAR

### Acil (P0 - Bu Hafta)

1. **tasks.py RBAC Tamamlama**
   - `filter_tasks_by_permission()` ekle
   - `check_task_permission()` ekle
   - `list_tasks()` güncelle (RBAC + assigneeName join)
   - `get_task()` güncelle (RBAC + assigneeName join)
   - Tüm endpoint'lere permission check ekle

2. **Frontend Auth Context**
   - `AuthContext.jsx` oluştur
   - `getMe()` check (prod blocked screen)
   - `UserSwitch.jsx` (dev mode)

### Kısa Vadeli (P1 - Bu Ay)

3. **Gorevler.jsx MVP**
   - KPI kartları
   - CRUD modalları
   - Assign modal
   - Detail drawer

4. **Navigation Düzeltme**
   - Collapsible parent/child düzeltme

5. **Request Logging**
   - Backend middleware (method, path, status, duration)

### Orta Vadeli (P2 - Gelecek Ay)

6. Pagination + URL sync
7. Toast notification
8. Performance optimizasyonu

---

## 📝 8. COMMIT MESAJI ÖNERİLERİ

```
feat(auth): Production auth standard - AUTH_MODE env

- Add AUTH_MODE env (prod/dev, default: prod)
- get_current_user: prod'da header yoksa 401, dev'de None
- aktifMi=false kontrolü → 403 Forbidden
- /me endpoint: prod'da header zorunlu

feat(api): Duplicate email → 409 Conflict

- personnel create/update: 400 → 409 Conflict
- REST standardına uygun

feat(tasks): RBAC enforcement + assigneeName join

- Add filter_tasks_by_permission() (own task: personnel/team/createdBy)
- Add check_task_permission() (own task kontrolü)
- list_tasks: RBAC filtering + assigneeName join
- get_task: RBAC check + assigneeName join
- All endpoints: Permission dependency injection

feat(frontend): Auth context + User Switch (dev mode)

- Add AuthContext provider
- getMe() check (prod blocked screen)
- UserSwitch component (AUTH_MODE="dev")

feat(gorevler): MVP - KPI + CRUD + Assign + Detail

- KPI kartları (Toplam, Todo, In Progress, Blocked, Done)
- Create/Edit/Delete modals
- Assign modal (personnel/team)
- Detail drawer (assignment history timeline)
- RBAC UI (permission bazlı buton göster/gizle)
```

---

**Rapor Sonu**
