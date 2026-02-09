# Görevler Modülü - Veri Yapısı ve İlişkiler

Bu doküman, Görevler modülündeki veri dosyaları ve aralarındaki ilişkileri açıklar.

## 📁 Veri Dosyaları

### 1. `tasks.json` - Görevler
**Dosya:** `md.data/tasks.json`

Görevlerin ana bilgilerini tutar. Bir görev oluşturulduğunda buraya kaydedilir.

**Yapı:**
```json
{
  "id": "TSK-204",                    // Görev ID (unique)
  "baslik": "Atölye kesim listesi",   // Görev başlığı
  "aciklama": "...",                  // Görev açıklaması
  "oncelik": "high",                  // low | med | high
  "durum": "in_progress",             // todo | in_progress | blocked | done
  "baslangicTarihi": "2025-01-17T08:00:00",
  "bitisTarihi": "2025-12-22T17:00:00",
  "createdBy": "PER-001",             // Oluşturan personel ID (personnel.json referansı)
  "createdAt": "2025-01-17T08:00:00",
  "updatedAt": "2025-01-17T14:30:00",
  "deleted": false                    // Soft-delete flag
}
```

**İlişkiler:**
- `createdBy` → `personnel.json` (`id` ile bağlantı)
- `id` → `task_assignments.json` (`taskId` ile bağlantı)

---

### 2. `task_assignments.json` - Görev Atamaları
**Dosya:** `md.data/task_assignments.json`

Görevlere yapılan atamaları tutar. Bir görev, birden fazla kişiye veya ekibe atanabilir (çoklu atama desteği).

**Yapı:**
```json
{
  "id": "TA-001",                     // Atama ID (unique)
  "taskId": "TSK-204",                // Görev ID (tasks.json referansı)
  "assigneeType": "personnel",        // "personnel" | "team"
  "assigneeId": "PER-002",            // Personel ID veya Ekip ID
  "assignedBy": "PER-001",            // Atayan personel ID (personnel.json referansı)
  "note": "Aciliyet var",             // Atama notu (opsiyonel)
  "active": true,                     // Aktif atama mı?
  "createdAt": "2025-01-16T08:00:00",
  "endedAt": "2025-01-21T17:00:00",  // Pasif edildiğinde (opsiyonel)
  "deleted": false                    // Soft-delete flag
}
```

**İlişkiler:**
- `taskId` → `tasks.json` (`id` ile bağlantı)
- `assigneeId` + `assigneeType="personnel"` → `personnel.json` (`id` ile bağlantı)
- `assigneeId` + `assigneeType="team"` → `teams.json` (`id` ile bağlantı)
- `assignedBy` → `personnel.json` (`id` ile bağlantı)

**Önemli:**
- Bir göreve **birden fazla aktif atama** yapılabilir (çoklu atama)
- `active: true` olan atamalar "mevcut atamalar"
- `active: false` olan atamalar "atama geçmişi"nde görünür

---

### 3. `personnel.json` - Personel
**Dosya:** `md.data/personnel.json`

Personel bilgilerini tutar. Görev oluşturan ve atanan kişiler burada.

**Yapı:**
```json
{
  "id": "PER-001",                    // Personel ID (unique)
  "ad": "Ahmet",
  "soyad": "Yılmaz",
  "email": "ahmet.yilmaz@example.com", // Unique
  "telefon": "+90 555 111 2233",
  "unvan": "Proje Müdürü",
  "aktifMi": true,
  "rolId": "ROL-001",                 // Rol ID (roles.json referansı)
  "createdAt": "2025-01-15T10:00:00",
  "updatedAt": "2026-01-18T05:48:09.725576",
  "deleted": false
}
```

**İlişkiler:**
- `id` → `tasks.json` (`createdBy` ile bağlantı)
- `id` → `task_assignments.json` (`assigneeId` veya `assignedBy` ile bağlantı)
- `id` → `team_members.json` (`personnelId` ile bağlantı)
- `rolId` → `roles.json` (`id` ile bağlantı)

---

### 4. `teams.json` - Ekipler
**Dosya:** `md.data/teams.json`

Ekip bilgilerini tutar. Görevler ekibe de atanabilir.

**Yapı:**
```json
{
  "id": "TEAM-001",                   // Ekip ID (unique)
  "ad": "Üretim Ekibi",
  "aciklama": "PVC pencere ve kapı üretimi ekibi",
  "aktifMi": true,
  "createdAt": "2025-01-15T11:00:00",
  "updatedAt": "2025-01-15T11:00:00",
  "deleted": false
}
```

**İlişkiler:**
- `id` → `task_assignments.json` (`assigneeId` + `assigneeType="team"` ile bağlantı)
- `id` → `team_members.json` (`teamId` ile bağlantı)

---

### 5. `team_members.json` - Ekip Üyeleri
**Dosya:** `md.data/team_members.json`

Personel-Ekip ilişkisini tutar (Many-to-Many). Bir personel birden fazla ekibe üye olabilir.

**Yapı:**
```json
{
  "id": "TM-001",                     // Üyelik ID (unique)
  "teamId": "TEAM-001",               // Ekip ID (teams.json referansı)
  "personnelId": "PER-002",           // Personel ID (personnel.json referansı)
  "createdAt": "2025-01-15T11:15:00",
  "deleted": false
}
```

**İlişkiler:**
- `teamId` → `teams.json` (`id` ile bağlantı)
- `personnelId` → `personnel.json` (`id` ile bağlantı)

**Önemli:**
- Bir görev ekibe atandığında, o ekibin tüm üyeleri (`team_members.json`) görevle ilişkilendirilmiş sayılır (RBAC için)

---

### 6. `roles.json` - Roller
**Dosya:** `md.data/roles.json`

RBAC (Rol Tabanlı Erişim Kontrolü) için roller ve izinleri tutar.

**Yapı:**
```json
{
  "id": "ROL-001",                    // Rol ID (unique)
  "ad": "admin",
  "aciklama": "Yönetici - Tüm yetkilere sahip",
  "permissions": ["*"],               // İzin listesi
  "aktifMi": true,
  "createdAt": "2025-01-15T09:00:00",
  "updatedAt": "2025-01-15T09:00:00",
  "deleted": false
}
```

**İlişkiler:**
- `id` → `personnel.json` (`rolId` ile bağlantı)

---

## 🔗 İlişki Diyagramı

```
┌─────────────────┐
│   tasks.json    │
│   (Görevler)    │
└────────┬────────┘
         │ createdBy
         │ ↓
         │ id
         │
         ├─────────────────────────────────┐
         │                                 │
         ▼                                 ▼
┌─────────────────┐              ┌──────────────────┐
│ personnel.json  │◄─────────────┤task_assignments. │
│   (Personel)    │  assigneeId  │      json        │
└────────┬────────┘  (personnel) │  (Atamalar)      │
         │                       └────────┬─────────┘
         │ rolId                          │ taskId
         │                                │
         ▼                                │
┌─────────────────┐                       │
│  roles.json     │                       │
│   (Roller)      │                       │
└─────────────────┘                       │
                                          │ assigneeId (team)
                                          │
         ┌────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│   teams.json    │
│    (Ekipler)    │
└────────┬────────┘
         │ id
         │
         ▼
┌──────────────────┐
│ team_members.json│
│  (Ekip Üyeleri)  │
└────────┬─────────┘
         │ personnelId
         │
         ▼
┌─────────────────┐
│ personnel.json  │
└─────────────────┘
```

---

## 📝 İş Akışı Örnekleri

### 1. Görev Oluşturma
```
1. Kullanıcı "Yeni Görev" butonuna tıklar
2. Form doldurulur: baslik, aciklama, oncelik, durum, tarihler
3. Backend: tasks.json'a yeni kayıt eklenir
   - id: otomatik üretilir (TSK-xxx)
   - createdBy: mevcut kullanıcı ID'si (X-User-Id header'dan)
   - createdAt: şu anki zaman
```

### 2. Göreve Personel Atama
```
1. Kullanıcı "Ata" butonuna tıklar
2. Modal açılır: assigneeType="personnel", assigneeId seçilir
3. Backend: task_assignments.json'a yeni kayıt eklenir
   - taskId: görev ID'si
   - assigneeType: "personnel"
   - assigneeId: seçilen personel ID'si
   - active: true
   - assignedBy: mevcut kullanıcı ID'si
```

### 3. Göreve Ekip Atama
```
1. Kullanıcı "Ata" butonuna tıklar
2. Modal açılır: assigneeType="team", assigneeId seçilir
3. Backend: task_assignments.json'a yeni kayıt eklenir
   - taskId: görev ID'si
   - assigneeType: "team"
   - assigneeId: seçilen ekip ID'si
   - active: true
```

### 4. Çoklu Atama (Birden Fazla Kişi/Ekip)
```
1. Aynı göreve tekrar atama yapılır (farklı personel/ekip)
2. Backend: task_assignments.json'a YENİ kayıt eklenir
   - Eski atama pasif edilmez (çoklu atama desteği)
   - Duplicate kontrolü yapılır (aynı atama varsa 409 Conflict)
3. Her iki atama da active: true kalır
```

---

## 🔍 Veri Sorgulama Örnekleri

### Görev Bilgisi + Atamaları
```python
# tasks.json'dan görev alınır
task = tasks[id="TSK-204"]

# task_assignments.json'da bu göreve ait tüm aktif atamalar bulunur
active_assignments = [
  ta for ta in task_assignments 
  if ta.taskId == "TSK-204" and ta.active == true
]

# Her atama için assignee bilgisi join edilir
for assignment in active_assignments:
  if assignment.assigneeType == "personnel":
    person = personnel[id=assignment.assigneeId]
    assignment.assigneeName = f"{person.ad} {person.soyad}"
  elif assignment.assigneeType == "team":
    team = teams[id=assignment.assigneeId]
    assignment.assigneeName = f"👥 {team.ad}"
```

### Ekip Üyeleri (RBAC için)
```python
# Bir görev ekibe atanmışsa, ekip üyelerini bul
team_assignment = task_assignments[
  taskId="TSK-204" AND assigneeType="team" AND active=true
]

if team_assignment:
  team_id = team_assignment.assigneeId
  
  # team_members.json'dan ekip üyelerini bul
  team_member_ids = [
    tm.personnelId 
    for tm in team_members 
    if tm.teamId == team_id AND tm.deleted == false
  ]
  
  # Bu personel ID'lerine sahip kullanıcılar görevi görebilir
```

---

## ⚠️ Önemli Notlar

1. **Soft Delete:** Tüm dosyalarda `deleted: false` flag'i var. Silme işleminde kayıt silinmez, `deleted: true` yapılır.

2. **Çoklu Atama:** Bir görev hem kişiye hem ekibe atanabilir. Her ikisi de `active: true` kalır.

3. **Atama Geçmişi:** `active: false` olan atamalar geçmişte kalan atamalar. Yeni atama yapıldığında eski atama pasif edilmez (çoklu atama desteği nedeniyle).

4. **Foreign Key Kontrolleri:** Backend'de atama yapılırken `assigneeId`'nin gerçekten `personnel.json` veya `teams.json`'da var olup olmadığı kontrol edilir.

5. **RBAC "Own Task" Kontrolü:**
   - Personel ataması: `task_assignments.assigneeId == current_user.id`
   - Ekip ataması: `task_assignments.assigneeId` ekip ID'si ve kullanıcı `team_members.json`'da o ekibin üyesi
   - Oluşturan: `tasks.createdBy == current_user.id`

---

## 📊 Dosya Özeti

| Dosya | Amaç | Ana İlişkiler |
|-------|------|---------------|
| `tasks.json` | Görev bilgileri | `createdBy` → personnel, `id` → task_assignments |
| `task_assignments.json` | Görev atamaları | `taskId` → tasks, `assigneeId` → personnel/teams |
| `personnel.json` | Personel bilgileri | `id` → tasks (createdBy), task_assignments, team_members |
| `teams.json` | Ekip bilgileri | `id` → task_assignments, team_members |
| `team_members.json` | Personel-Ekip ilişkisi | `teamId` → teams, `personnelId` → personnel |
| `roles.json` | RBAC rolleri | `id` → personnel (rolId) |

---

Bu yapı sayesinde:
- ✅ Görevler ve atamalar net ayrılmış
- ✅ Çoklu atama destekleniyor
- ✅ Atama geçmişi tutuluyor
- ✅ RBAC için gerekli ilişkiler kurulmuş
- ✅ Soft-delete uygulanmış
