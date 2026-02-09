# Görevler Modülü - Kök Neden Teşhisi ve Çözüm Planı

**Tarih:** 2025-01-26  
**Durum:** Teşhis Tamamlandı, Implementation Başlıyor

---

## 📋 KÖK NEDEN TEŞHİSİ

### 1. Backend (tasks.py) Sorunları

**Kritik Sorunlar:**
1. **RBAC Yok**: `list_tasks()` ve `get_task()` RBAC kontrolü yok → Herkes tüm görevleri görebilir
2. **assigneeName Join Yok**: `list_tasks()` ve `get_task()` assigneeName döndürmüyor → Frontend'de "Atanmamış" görünüyor
3. **Permission Check Yok**: POST/PUT/PATCH/DELETE endpoint'lerinde permission kontrolü yok
4. **Soft-Delete/Invalid Assignee Kontrolü Eksik**: `assign_task()` deleted/aktifMi=false kontrolü var ama yeterli değil

**Reproduce Adımları:**
```bash
# 1. tasks.py'de RBAC yok → Herkes tüm görevleri görebilir
curl http://localhost:8000/tasks
# Response: Tüm görevler (RBAC kontrolü yok)

# 2. assigneeName join yok → Frontend'de null
curl http://localhost:8000/tasks | jq '.[0]'
# Response: { "id": "TSK-...", "baslik": "...", ... } (assigneeName yok)
```

**Kök Neden:**
- `tasks.py` RBAC import'ları yok (`from ..auth import ...`)
- Helper fonksiyonlar yok (`filter_tasks_by_permission()`, `check_task_permission()`)
- `list_tasks()` ve `get_task()` personnel/teams join yapmıyor

---

### 2. Frontend (Gorevler.jsx) Sorunları

**Kritik Sorunlar:**
1. **CRUD Modalları Yok**: Sadece liste var, create/edit/delete yok
2. **KPI Kartları Yok**: Toplam/Todo/In Progress/Blocked/Done gösterilmiyor
3. **"Yeni Görev" Butonu İşlevsiz**: `onClick` handler yok
4. **Auth State Yok**: 401/403 hatası durumunda ne olacağı belirsiz
5. **Assign/Detail Modalları Yok**: Görev atama ve detay görüntüleme yok

**Reproduce Adımları:**
```bash
# 1. Gorevler sayfasına git
# 2. "Yeni Görev" butonuna tıkla
# Sonuç: Hiçbir şey olmuyor (onClick handler yok)

# 3. AUTH_MODE="prod" header yok
# Sonuç: 401 hatası, sayfa bozuk görünüyor (error state var ama blocked screen yok)
```

**Kök Neden:**
- `Gorevler.jsx` Personnel/Teams pattern'i kullanmıyor (Modal, form state, CRUD handlers)
- AuthContext yok → `getMe()` check yok, prod blocked screen yok

---

### 3. Navigation Sorunları

**Kritik Sorun:**
- **Parent ve Child Path Aynı**: `/gorevler` hem parent hem child → Collapsible her ikisi de açık kalıyor

**Reproduce Adımları:**
```javascript
// navigation.js
{
  icon: '✓',
  label: 'Görevler',
  path: '/gorevler',  // Parent
  collapsible: true,
  children: [
    { label: 'Görev Listesi', path: '/gorevler' },  // Child - AYNI PATH!
    ...
  ]
}
// Sonuç: Hem parent hem child açık kalıyor
```

**Kök Neden:**
- `navigation.js`'de parent path (`/gorevler`) ve child path (`/gorevler`) aynı
- Collapsible logic: aktif route altında parent açık kalıyor ama child'ın path'i parent ile aynı olduğu için her ikisi de açık

---

## 🔧 ÇÖZÜM PLANI

### Adım 1: Backend tasks.py RBAC + assigneeName Join (P0)

**Değişiklikler:**
1. Import'lar: `from ..auth import get_current_user, require_any_permission, UserContext`
2. Helper fonksiyonlar: `filter_tasks_by_permission()`, `check_task_permission()`
3. `list_tasks()`: RBAC + assigneeName join (personnel/teams mapping)
4. `get_task()`: RBAC + assigneeName join + assignmentHistory
5. POST/PUT/PATCH/DELETE: Permission dependency injection

**Dosya:** `md.service/app/routers/tasks.py`

---

### Adım 2: Frontend AuthContext (P0)

**Değişiklikler:**
1. `md.web/src/contexts/AuthContext.jsx` oluştur
2. `App.jsx`'e provider ekle
3. `getMe()` check → prod blocked screen

**Dosyalar:** 
- `md.web/src/contexts/AuthContext.jsx` (yeni)
- `md.web/src/App.jsx` (güncelleme)

---

### Adım 3: Frontend Gorevler.jsx MVP (P1)

**Değişiklikler:**
1. Personnel/Teams pattern'i kullan (Modal, form state, CRUD handlers)
2. KPI kartları (StatCard component)
3. Create/Edit/Assign/Delete modalları
4. Detail drawer (assignment history timeline)
5. RBAC UI (permission bazlı buton göster/gizle)

**Dosya:** `md.web/src/pages/Gorevler.jsx`

---

### Adım 4: Navigation Bugfix (P1)

**Değişiklikler:**
1. `navigation.js`: Görevler parent path'ini değiştir veya child path'lerini farklılaştır
2. Alternatif: Child path'leri `/gorevler/list` gibi yap

**Dosya:** `md.web/src/constants/navigation.js`

---

## ✅ İMPLEMENTASYON SIRASI

1. **Backend tasks.py RBAC** (Kritik - önce bu)
2. **Frontend AuthContext** (Kritik - prod auth için)
3. **Frontend Gorevler.jsx MVP** (Kullanıcı görünür iyileştirme)
4. **Navigation bugfix** (UX iyileştirme)

---

**Not:** Implementation'a başlıyoruz. Her adımı tamamlayıp test edeceğiz.
