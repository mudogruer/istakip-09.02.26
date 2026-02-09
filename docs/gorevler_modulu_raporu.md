# Görevler Modülü - Analiz ve İyileştirme Raporu

**Tarih:** 2025-01-26  
**Kapsam:** Görevler Modülü (Task Management) - Domain Model, RBAC, UI/UX İyileştirmeleri

---

## 1. ÖZET

Bu rapor, "Görevler Modülü"nün mevcut durumunu analiz eder ve kurumsal seviyeye yükseltmek için gerekli iyileştirmeleri belgeler. Modül şu ana bileşenlerden oluşur:

- **Personel Yönetimi** (Personnel)
- **Rol Yönetimi** (Roles/RBAC)
- **Ekip Yönetimi** (Teams)
- **Görev Yönetimi** (Tasks)
- **Atama Yönetimi** (Task Assignments)

### 1.1 Mevcut Mimari

**Backend:**
- Python FastAPI (`md.service/`)
- JSON tabanlı veri katmanı (`md.data/`)
- Router bazlı API yapısı

**Frontend:**
- React + Vite (`md.web/`)
- React Router ile SPA
- Component-based mimari

---

## 2. MEVCUT DURUM TESPİTİ

### 2.1 Dosya Haritası

**Backend (md.service/app/routers/):**
- `tasks.py` - Görev CRUD, atama, filtreleme
- `personnel.py` - Personel CRUD, email unique, soft-delete
- `teams.py` - Ekip CRUD, üye yönetimi, soft-delete
- `roles.py` - Rol CRUD, permissions, soft-delete

**Data (md.data/):**
- `tasks.json` - Görev verileri
- `personnel.json` - Personel verileri
- `teams.json` - Ekip verileri
- `roles.json` - Rol ve izin verileri
- `team_members.json` - Ekip-üye ilişkileri (many-to-many)
- `task_assignments.json` - Görev atama kayıtları (history)

**Frontend (md.web/src/pages/):**
- `Gorevler.jsx` - Görev listesi (okuma, filtreleme)
- `Personnel.jsx` - Personel CRUD, rol atama
- `Teams.jsx` - Ekip CRUD, üye yönetimi
- `Roles.jsx` - Rol CRUD, permission yönetimi

**API Services (md.web/src/services/):**
- `dataService.js` - Tüm API çağrıları

**Navigation:**
- `constants/navigation.js` - Sidebar menü yapısı
- `App.jsx` - Route tanımları

---

## 3. DOMAIN MODEL

### 3.1 Varlıklar (Entities)

#### Personnel (Personel)
- `id` (UUID)
- `ad`, `soyad`
- `email` (unique, EmailStr)
- `telefon`, `unvan` (optional)
- `aktifMi` (bool)
- `rolId` (FK -> Roles)
- `createdAt`, `updatedAt`
- `deleted` (soft-delete flag)

#### Roles (Roller)
- `id` (UUID)
- `ad` (unique)
- `aciklama`
- `permissions` (List[str])
- `aktifMi` (bool)
- `createdAt`, `updatedAt`
- `deleted` (soft-delete flag)

**Varsayılan Roller:**
- `admin` - permissions: `["*"]`
- `manager` - permissions: `["tasks.*", "personnel.*", "teams.*", "tasks.view"]`
- `user` - permissions: `["tasks.view.own", "tasks.update.own", "personnel.view.limited"]`

#### Teams (Ekipler)
- `id` (UUID)
- `ad`
- `aciklama` (optional)
- `aktifMi` (bool)
- `createdAt`, `updatedAt`
- `deleted` (soft-delete flag)

#### Team Members (Ekip Üyeleri)
- `id` (UUID)
- `teamId` (FK -> Teams)
- `personnelId` (FK -> Personnel)
- `createdAt`
- `deleted` (soft-delete flag)

**İlişki:** Many-to-Many (Teams ↔ Personnel)

#### Tasks (Görevler)
- `id` (UUID)
- `baslik` (required)
- `aciklama` (optional)
- `oncelik` (enum: "low", "med", "high")
- `durum` (enum: "todo", "in_progress", "blocked", "done")
- `baslangicTarihi`, `bitisTarihi` (optional, ISO date)
- `createdBy` (FK -> Personnel, optional)
- `createdAt`, `updatedAt`
- `deleted` (soft-delete flag)

#### Task Assignments (Görev Atamaları)
- `id` (UUID)
- `taskId` (FK -> Tasks)
- `assigneeType` (enum: "personnel" | "team")
- `assigneeId` (FK -> Personnel veya Teams)
- `assignedBy` (FK -> Personnel, optional)
- `note` (optional)
- `active` (bool) - Aktif atama flag
- `createdAt`, `endedAt` (optional)
- `deleted` (soft-delete flag)

### 3.2 İlişkiler

```
Personnel (1) ──< (N) Team_Members (N) >── (1) Teams
Personnel (N) ──< (1) Roles
Tasks (1) ──< (N) Task_Assignments (N) >── (1) Personnel | Teams
```

**Not:** Bir görev şu anda **sadece bir atama** alabilir (personnel veya team). Aynı anda hem kişiye hem ekibe atama yapılamaz. Yeni atama yapıldığında eski atama `active: false` olur.

---

## 4. DOĞRULUK DENETİMİ (Kabul Kriterleri)

| # | Kriter | Durum | Kanıt | Notlar |
|---|--------|-------|-------|--------|
| 1 | Personel email unique validasyonu | ✅ PASS | `personnel.py:43-45` - Email kontrolü var, `EmailStr` tipi | Backend'de kontrol var |
| 2 | Email UI hatası anlamlı | ⚠️ PARTIAL | `dataService.js:31-70` - translateValidationError var, ama personnel için field mapping eksik | "email" field'ı Türkçe'ye çevrilmeli |
| 3 | Görev oluşturma: required alanlar validasyonu | ✅ PASS | `tasks.py:13` - `baslik` Field(..., min_length=1) | Pydantic validation |
| 4 | Görev durumu enum | ✅ PASS | `tasks.py:16` - Literal["todo", "in_progress", "blocked", "done"] | Enum validation |
| 5 | Görev durumu UI badge/filtre | ✅ PASS | `Gorevler.jsx:7-12, 20-27` - DURUM_LABELS, renderDurum, filtre var | UI'da doğru çalışıyor |
| 6 | Görev atama: assigneeType/assigneeId tutarlılık | ✅ PASS | `tasks.py:191-239` - assign_task endpoint, validasyon var | Backend kontrolü var |
| 7 | Assignment history tutuluyor | ✅ PASS | `task_assignments.json` - Her atama kaydediliyor, `active: false` ile geçmiş korunuyor | History korunuyor |
| 8 | Bir görev hem kişiye hem ekibe atanabilir mi? | ❌ FAIL | Mevcut: Bir görev sadece bir atama alabilir (`active: true` sadece bir tane) | Kural açık değil, implementasyon "tek atama" |
| 9 | Team membership değişince atama tutarlılığı | ⚠️ WARNING | Ekip üyesi çıkarıldığında görev ataması otomatik güncellenmiyor | Cascade silme yok, manuel kontrol gerekli |
| 10 | RBAC: user sadece kendi görevlerini görür | ❌ FAIL | Backend'de RBAC kontrolü yok | `tasks.py:22-27` - Yetki kontrolü yok |
| 11 | RBAC: manager kapsamlı yönetir | ❌ FAIL | Backend'de RBAC kontrolü yok | Permission check yok |
| 12 | RBAC: admin full yetki | ❌ FAIL | Backend'de RBAC kontrolü yok | Permission check yok |
| 13 | Frontend RBAC görünürlük kontrolü | ❌ FAIL | Frontend'de yetki kontrolü yok | Button/UI gösterimi kontrol edilmiyor |
| 14 | Soft-delete implementasyonu | ✅ PASS | Tüm router'larda `deleted: true` flag kullanılıyor | Soft-delete var |
| 15 | Soft-delete UI filtreleme | ⚠️ PARTIAL | `Gorevler.jsx:84` - `!t.deleted` filtresi var, ama UI'da "silinenleri göster" yok | Filtre var ama kullanıcı seçeneği yok |
| 16 | API response format tutarlılığı | ⚠️ PARTIAL | FastAPI default format, ama `{success, data, error}` formatı yok | Standart error format yok |
| 17 | Tasks listesinde atama bilgisi | ❌ FAIL | `Gorevler.jsx:77-81` - getAssigneeName placeholder, backend'de assigneeName dönmüyor | Atama bilgisi eksik |

### 4.1 Kritik Sorunlar Özeti

**Yüksek Öncelik:**
1. ❌ **RBAC kontrolü yok** - Backend ve frontend'de yetki kontrolü implement edilmeli
2. ❌ **Tasks listesinde atama bilgisi eksik** - Backend'den `assigneeName` dönmüyor
3. ⚠️ **Email field Türkçe hatası eksik** - translateValidationError'a "email" eklenmeli

**Orta Öncelik:**
4. ⚠️ **API response format** - Standart `{success, data, error}` formatına geçilmeli (opsiyonel)
5. ⚠️ **Team membership cascade** - Ekip üyesi çıkarıldığında görev ataması kontrolü (opsiyonel)

**Düşük Öncelik:**
6. ⚠️ **Soft-delete UI toggle** - "Silinenleri göster" seçeneği (opsiyonel)

---

## 5. GÖREV ATAMA KURALI

### 5.1 Mevcut Implementasyon

**Kural:** Bir görev **sadece bir aktif atama** alabilir.

**Nasıl çalışıyor:**
- Yeni atama yapıldığında (`POST /tasks/{id}/assign`):
  - Eski aktif atama `active: false` yapılır
  - `endedAt` tarihi set edilir
  - Yeni atama `active: true` ile oluşturulur
- Bir görev aynı anda **hem kişiye hem ekibe** atanamaz
- Atama geçmişi `task_assignments.json`'da `active: false` kayıtlarla tutulur

**Dosya:** `md.service/app/routers/tasks.py:213-219`

```python
# Eski atamayı pasif yap
for ta_idx, ta in enumerate(task_assignments):
    if ta.get("taskId") == task_id and ta.get("active", True) and not ta.get("deleted"):
        task_assignments[ta_idx] = {
            **ta,
            "active": False,
            "endedAt": datetime.now().isoformat(),
        }
```

### 5.2 Durum Akışı

**Görev Durumları:**
- `todo` → `in_progress` → `done`
- `todo` → `blocked` → `in_progress` → `done`
- `in_progress` → `blocked` → `in_progress`

**Geçiş Kuralları:**
- ✅ Backend'de enum validation var (`tasks.py:16`)
- ✅ PATCH endpoint'te validasyon var (`tasks.py:152-155`)
- ❌ Frontend'de durum geçişi kısıtlaması yok (tüm durumlar seçilebiliyor)
- ❌ İş mantığı kuralları yok (örn: "blocked" durumundan direkt "done" yapılabilir mi?)

---

## 6. RBAC (ROLE-BASED ACCESS CONTROL)

### 6.1 Rol İzin Matrisi

| İşlem | Admin | Manager | User |
|-------|-------|---------|------|
| Görev görüntüle (tümü) | ✅ | ✅ | ❌ |
| Görev görüntüle (kendi) | ✅ | ✅ | ✅ |
| Görev oluştur | ✅ | ✅ | ❓ (belirtilmemiş) |
| Görev güncelle (tümü) | ✅ | ✅ | ❌ |
| Görev güncelle (kendi) | ✅ | ✅ | ✅ |
| Görev sil | ✅ | ✅ | ❌ |
| Personel görüntüle (tümü) | ✅ | ✅ | ⚠️ (limited) |
| Personel görüntüle (sınırlı) | ✅ | ✅ | ✅ |
| Personel oluştur/güncelle | ✅ | ✅ | ❌ |
| Ekip yönetimi | ✅ | ✅ | ❌ |
| Rol yönetimi | ✅ | ❌ | ❌ |

### 6.2 Mevcut Durum

**Backend:**
- ❌ Permission kontrolü yok
- ❌ `createdBy` / `assignedBy` kontrolü yok
- ❌ Token/session bazlı kullanıcı bilgisi yok

**Frontend:**
- ❌ Button görünürlük kontrolü yok
- ❌ Route guard yok

**Not:** RBAC için önce authentication/authorization mekanizması kurulmalı (token, session, user context).

---

## 7. YAPILAN DEĞİŞİKLİKLER

### 7.1 Backend İyileştirmeleri

**Yapılan:**
1. ✅ `data_loader.py` - Atomic write (temp file + rename) eklendi
2. ✅ `tasks.py` - CRUD, atama, filtreleme eklendi
3. ✅ `personnel.py` - Email unique kontrolü, soft-delete
4. ✅ `teams.py` - Team members yönetimi
5. ✅ `roles.py` - Permission yönetimi

**Yapılması Gereken:**
1. ❌ Tasks listesinde `assigneeName` döndürülmeli
2. ❌ RBAC kontrolü backend'de implement edilmeli

### 7.2 Frontend İyileştirmeleri

**Yapılan:**
1. ✅ `Gorevler.jsx` - Yeni API formatına uyum, filtreleme, badge'ler
2. ✅ `Personnel.jsx` - CRUD, rol atama, filtreleme
3. ✅ `Teams.jsx` - CRUD, üye yönetimi
4. ✅ `Roles.jsx` - CRUD, permission yönetimi
5. ✅ `dataService.js` - Tüm API fonksiyonları eklendi
6. ✅ Navigation ve routes güncellendi

**Yapılması Gereken:**
1. ❌ Gorevler: CRUD (oluştur/güncelle/sil), atama modal, detay modal
2. ❌ KPI kartları (Toplam, Açık, Bloklu, Tamamlandı)
3. ❌ Atama bilgisi gösterimi (`assigneeName` kullanımı)
4. ❌ URL query sync (filtreler URL'de saklanmalı)
5. ❌ Pagination (client-side veya server-side)
6. ❌ RBAC görünürlük kontrolü

---

## 8. UI/UX İYİLEŞTİRMELERİ (Planlanan)

### 8.1 Görevler Ana Sayfası

**Eksikler:**
- ❌ KPI kartları (Toplam, Açık, Bloklu, Tamamlandı)
- ❌ Görev oluşturma formu/modal
- ❌ Görev detay modal/drawer
- ❌ Atama modal (personnel/team seçimi)
- ❌ Durum geçişi quick action (dropdown)
- ❌ URL query sync (filtreler URL'de)

**Mevcut:**
- ✅ Liste görünümü
- ✅ Filtreleme (durum, öncelik, arama)
- ✅ Badge'ler (durum, öncelik)
- ✅ Loading state

### 8.2 Form UX

**Eksikler:**
- ⚠️ Inline validation (submit öncesi)
- ❌ Toast/alert (başarı/hata mesajları)
- ⚠️ Double-submit engeli (button disabled + loading)
- ❌ Tarih inputları tutarlılık kontrolü (başlangıç < bitiş)

**Mevcut:**
- ✅ Modal form yapısı (Personnel, Teams, Roles)
- ✅ Form validation (required fields)
- ✅ Error state gösterimi

### 8.3 Erişilebilirlik (A11y)

**Eksikler:**
- ⚠️ Aria labels (bazı yerlerde var, bazılarında yok)
- ❌ Keyboard navigation (tab order)
- ⚠️ Form label'ları (bazı formlarda eksik)

### 8.4 Tutarlılık

**Mevcut:**
- ✅ Mevcut tasarım sistemine uyum (badge, card, button patternleri)
- ✅ Modal component tutarlılığı

**Eksikler:**
- ⚠️ Empty state mesajları (bazı yerlerde var, bazılarında generic)
- ❌ Error state tutarlılığı (farklı sayfalarda farklı gösterim)

---

## 9. API SÖZLEŞMESİ

### 9.1 Endpoint Listesi

**Tasks:**
- `GET /tasks` - Liste (filtreler: durum, oncelik, assigneeType, assigneeId)
- `GET /tasks/{id}` - Detay (currentAssignment, assignmentHistory ile)
- `POST /tasks` - Oluştur
- `PUT /tasks/{id}` - Güncelle
- `PATCH /tasks/{id}/durum` - Durum güncelle
- `DELETE /tasks/{id}` - Soft-delete
- `POST /tasks/{id}/assign` - Atama yap
- `DELETE /tasks/{id}/assign` - Atamayı kaldır

**Personnel:**
- `GET /personnel` - Liste (filtre: aktifMi)
- `GET /personnel/{id}` - Detay
- `POST /personnel` - Oluştur (email unique kontrolü)
- `PUT /personnel/{id}` - Güncelle
- `PATCH /personnel/{id}/aktif` - Durum toggle
- `DELETE /personnel/{id}` - Soft-delete
- `POST /personnel/{id}/rol` - Rol atama

**Teams:**
- `GET /teams` - Liste (filtre: aktifMi)
- `GET /teams/{id}` - Detay (members ile)
- `POST /teams` - Oluştur
- `PUT /teams/{id}` - Güncelle
- `DELETE /teams/{id}` - Soft-delete (+ members soft-delete)
- `GET /teams/{id}/members` - Üye listesi
- `POST /teams/{id}/members` - Üye ekle
- `DELETE /teams/{id}/members/{personnel_id}` - Üye çıkar

**Roles:**
- `GET /roles` - Liste (filtre: aktifMi)
- `GET /roles/{id}` - Detay
- `POST /roles` - Oluştur (ad unique kontrolü)
- `PUT /roles/{id}` - Güncelle
- `DELETE /roles/{id}` - Soft-delete

### 9.2 Örnek Response

**GET /tasks:**
```json
[
  {
    "id": "TSK-204",
    "baslik": "Atölye kesim listesi",
    "aciklama": "...",
    "oncelik": "high",
    "durum": "in_progress",
    "baslangicTarihi": "2025-01-17T08:00:00",
    "bitisTarihi": "2025-12-22T17:00:00",
    "createdBy": "PER-001",
    "createdAt": "2025-01-17T08:00:00",
    "updatedAt": "2025-01-17T14:30:00",
    "deleted": false,
    "currentAssignment": {
      "id": "TA-001",
      "assigneeType": "personnel",
      "assigneeId": "PER-002",
      ...
    },
    "assigneeName": "Ayşe Kaya",
    "assigneeType": "personnel"
  }
]
```

**Not:** `assigneeName` ve `assigneeType` şu anda backend'de dönmüyor (iyileştirme gerekli).

---

## 10. VERİ ŞEMALARI

### 10.1 tasks.json

```json
{
  "id": "TSK-XXX",
  "baslik": "string (required)",
  "aciklama": "string (optional)",
  "oncelik": "low" | "med" | "high",
  "durum": "todo" | "in_progress" | "blocked" | "done",
  "baslangicTarihi": "ISO date string (optional)",
  "bitisTarihi": "ISO date string (optional)",
  "createdBy": "PER-XXX (optional)",
  "createdAt": "ISO datetime",
  "updatedAt": "ISO datetime",
  "deleted": false
}
```

### 10.2 task_assignments.json

```json
{
  "id": "TA-XXX",
  "taskId": "TSK-XXX",
  "assigneeType": "personnel" | "team",
  "assigneeId": "PER-XXX | TEAM-XXX",
  "assignedBy": "PER-XXX (optional)",
  "note": "string (optional)",
  "active": true,
  "createdAt": "ISO datetime",
  "endedAt": "ISO datetime (optional, aktif=false ise)",
  "deleted": false
}
```

---

## 11. TEST CHECKLIST (15+ Senaryo)

### 11.1 Personel Yönetimi
- [ ] Personel oluştur (geçerli email)
- [ ] Personel oluştur (duplicate email - hata beklenmeli)
- [ ] Personel oluştur (geçersiz email formatı - hata beklenmeli)
- [ ] Personel güncelle
- [ ] Personel durum toggle (aktif/pasif)
- [ ] Personel soft-delete
- [ ] Rol atama

### 11.2 Görev Yönetimi
- [ ] Görev oluştur (geçerli veri)
- [ ] Görev oluştur (required alan eksik - hata beklenmeli)
- [ ] Görev oluştur (tarih tutarsızlığı: bitis < baslangic - hata beklenmeli)
- [ ] Görev güncelle
- [ ] Görev durum değiştir
- [ ] Görev sil (soft-delete)

### 11.3 Atama
- [ ] Görev atama (personnel)
- [ ] Görev atama (team)
- [ ] Atama değiştirme (eski atama active=false olmalı)
- [ ] Atama kaldırma
- [ ] Atama geçmişi görüntüleme

### 11.4 Filtreleme ve Arama
- [ ] Durum filtresi
- [ ] Öncelik filtresi
- [ ] Arama (başlık, açıklama)
- [ ] Atanan kişi/ekip filtresi

### 11.5 Ekip Yönetimi
- [ ] Ekip oluştur
- [ ] Ekip üyesi ekle
- [ ] Ekip üyesi çıkar
- [ ] Ekip sil (üyeler soft-delete olmalı)

### 11.6 RBAC (Gelecekte)
- [ ] User sadece kendi görevlerini görür
- [ ] Manager tüm görevleri görür
- [ ] Admin full yetki

### 11.7 Edge Cases
- [ ] Boş liste (empty state)
- [ ] API 500 hatası (error state)
- [ ] Network timeout (error handling)
- [ ] Geçersiz task ID (404)
- [ ] Silinen personel'e atama yapılamaz

---

## 12. BİLİNEN SINIRLAMALAR

1. **RBAC:** Backend'de yetki kontrolü yok (authentication/authorization mekanizması gerekli)
2. **Assignment:** Bir görev sadece bir atama alabilir (hem kişiye hem ekibe atama yapılamaz)
3. **Cascade:** Team membership değişince görev ataması otomatik güncellenmiyor
4. **API Format:** Standart `{success, data, error}` formatı yok (FastAPI default)
5. **Pagination:** Listelerde pagination yok (büyük veri setlerinde performans sorunu)
6. **URL Sync:** Filtreler URL'de saklanmıyor (refresh'te kaybolur)
7. **Validation:** Frontend'de inline validation eksik (sadece submit'te)

---

## 13. SONRAKİ ADIMLAR

### Yüksek Öncelik
1. Tasks listesinde `assigneeName` döndürülmeli (backend iyileştirmesi)
2. Gorevler sayfasına CRUD eklenmeli (oluştur/güncelle/sil modal)
3. Atama modal'ı eklenecek (personnel/team seçimi)
4. KPI kartları eklenmeli (Toplam, Açık, Bloklu, Tamamlandı)

### Orta Öncelik
5. URL query sync (filtreler URL'de saklanmalı)
6. Pagination (client-side veya server-side)
7. Toast/alert mesajları (başarı/hata)
8. Email field Türkçe hatası (`translateValidationError`)

### Düşük Öncelik (Gelecekte)
9. RBAC implementasyonu (authentication + authorization)
10. Cascade silme/kontrol (team membership → task assignment)
11. İş mantığı kuralları (durum geçişi kısıtlamaları)

---

## 14. COMMIT MESAJI ÖNERİLERİ

```
feat(gorevler): Görevler modülü backend router'ları eklendi

- Tasks, Personnel, Teams, Roles router'ları oluşturuldu
- Email unique kontrolü, soft-delete, audit alanları eklendi
- Assignment history mekanizması implement edildi

feat(gorevler): Frontend sayfaları ve navigation eklendi

- Gorevler, Personnel, Teams, Roles sayfaları oluşturuldu
- Navigation ve routes güncellendi
- dataService API fonksiyonları eklendi

fix(gorevler): Tasks listesinde atama bilgisi eksik

- Backend'de assigneeName join edilmeli
- Frontend'de placeholder yerine gerçek veri gösterilmeli

refactor(gorevler): UI/UX iyileştirmeleri

- KPI kartları, CRUD modal'ları, detay modal eklendi
- URL query sync, pagination, toast mesajları eklendi
- Loading, error, empty state iyileştirildi
```

---

## 15. SONUÇ

Görevler Modülü **temel CRUD işlemleri** için hazır durumda. Ancak **kurumsal seviye** için şu iyileştirmeler gerekli:

1. **Backend:** Atama bilgisi join, RBAC kontrolü
2. **Frontend:** CRUD modalları, KPI kartları, atama UI'ı
3. **UX:** URL sync, pagination, toast mesajları
4. **RBAC:** Authentication/authorization mekanizması (gelecekte)

Modül **geriye dönük uyumlu** şekilde geliştirilmiştir; mevcut sayfalar etkilenmemiştir.

---

**Rapor Sonu** - 2025-01-26
