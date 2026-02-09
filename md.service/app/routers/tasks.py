import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query, Header
from pydantic import BaseModel, Field
from typing import Optional, List, Literal

from ..data_loader import load_json, save_json
from ..activity_logger import log_activity, get_action_icon

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _get_user_info(authorization: Optional[str] = None) -> tuple:
    """Token'dan kullanıcı bilgisi al"""
    if not authorization:
        return "system", "Sistem"
    from .auth import active_sessions
    token = authorization[7:] if authorization.startswith("Bearer ") else authorization
    if token in active_sessions:
        user = active_sessions[token].get("user", {})
        return user.get("id", "unknown"), user.get("displayName") or user.get("username", "Bilinmiyor")
    return "system", "Sistem"


class TaskIn(BaseModel):
  baslik: str = Field(..., min_length=1, description="Görev başlığı")
  aciklama: str = Field("", description="Görev açıklaması")
  oncelik: Literal["low", "med", "high"] = Field("med", description="Öncelik seviyesi")
  durum: Literal["todo", "in_progress", "blocked", "done"] = Field("todo", description="Görev durumu")
  baslangicTarihi: Optional[str] = Field(None, description="Başlangıç tarihi (ISO format)")
  bitisTarihi: Optional[str] = Field(None, description="Bitiş tarihi (ISO format)")


@router.get("/")
def list_tasks(
  durum: Optional[str] = None,
  oncelik: Optional[str] = None,
  assigneeType: Optional[str] = None,  # "personnel" or "team"
  assigneeId: Optional[str] = None,
):
  tasks = load_json("tasks.json")
  task_assignments = load_json("task_assignments.json")
  personnel = load_json("personnel.json")
  teams = load_json("teams.json")
  
  # Mapping'ler
  personnel_map = {p.get("id"): p for p in personnel if not p.get("deleted")}
  teams_map = {t.get("id"): t for t in teams if not t.get("deleted")}
  
  # Filtreleme
  filtered = []
  for task in tasks:
    if task.get("deleted"):
      continue
    if durum and task.get("durum") != durum:
      continue
    if oncelik and task.get("oncelik") != oncelik:
      continue
    
    # Tüm aktif atamaları bul (çoklu atama desteği)
    current_assignments = []
    for ta in task_assignments:
      if (ta.get("taskId") == task.get("id") and 
          not ta.get("deleted") and
          ta.get("active", True)):
        current_assignments.append(ta)
    
    # Atama filtresi
    if assigneeType and assigneeId:
      has_matching_assignment = any(
        ta.get("assigneeType") == assigneeType and ta.get("assigneeId") == assigneeId
        for ta in current_assignments
      )
      if not has_matching_assignment:
        continue
    
    # Atama bilgilerini ekle (birden fazla atama için)
    assigneeNames = []
    for ca in current_assignments:
      if ca.get("assigneeType") == "personnel":
        person = personnel_map.get(ca.get("assigneeId"))
        if person:
          assigneeNames.append(f"{person.get('ad')} {person.get('soyad')}")
      elif ca.get("assigneeType") == "team":
        team = teams_map.get(ca.get("assigneeId"))
        if team:
          assigneeNames.append(f"👥 {team.get('ad')}")
    
    # Backward compatibility: assigneeName (virgülle ayrılmış)
    assignee_name_str = ", ".join(assigneeNames) if assigneeNames else None
    
    task_with_assignment = {
      **task,
      "currentAssignment": current_assignments[0] if current_assignments else None,
      "currentAssignments": current_assignments,
      "assigneeName": assignee_name_str,
      "assigneeType": current_assignments[0].get("assigneeType") if current_assignments else None,
    }
    
    filtered.append(task_with_assignment)
  
  return filtered


@router.get("/{task_id}")
def get_task(task_id: str):
  tasks = load_json("tasks.json")
  task_assignments = load_json("task_assignments.json")
  personnel = load_json("personnel.json")
  teams = load_json("teams.json")
  
  # Mapping'ler
  personnel_map = {p.get("id"): p for p in personnel if not p.get("deleted")}
  teams_map = {t.get("id"): t for t in teams if not t.get("deleted")}
  
  for task in tasks:
    if task.get("id") == task_id and not task.get("deleted"):
      # Tüm aktif atamaları bul (çoklu atama desteği)
      current_assignments = []
      for ta in task_assignments:
        if (ta.get("taskId") == task_id and 
            not ta.get("deleted") and
            ta.get("active", True)):
          current_assignments.append(ta)
      
      # Assignment history (tümü, active/passive)
      history = [ta for ta in task_assignments 
                 if ta.get("taskId") == task_id and not ta.get("deleted")]
      history.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
      
      # Backward compatibility: currentAssignment (ilk aktif atama)
      current_assignment = current_assignments[0] if current_assignments else None
      
      # Assignee bilgilerini ekle
      assigneeNames = []
      for ca in current_assignments:
        if ca.get("assigneeType") == "personnel":
          person = personnel_map.get(ca.get("assigneeId"))
          if person:
            assigneeNames.append(f"{person.get('ad')} {person.get('soyad')}")
        elif ca.get("assigneeType") == "team":
          team = teams_map.get(ca.get("assigneeId"))
          if team:
            assigneeNames.append(f"👥 {team.get('ad')}")
      
      result = {
        **task,
        "currentAssignment": current_assignment,  # Backward compatibility
        "currentAssignments": current_assignments,  # Tüm aktif atamalar
        "assigneeNames": assigneeNames,  # Atanan kişi/ekip isimleri
        "assignmentHistory": history
      }
      return result
  
  raise HTTPException(status_code=404, detail="Görev bulunamadı")


@router.post("/", status_code=201)
def create_task(payload: TaskIn, createdBy: Optional[str] = None, authorization: Optional[str] = Header(None)):
  user_id, user_name = _get_user_info(authorization)
  
  # Tarih validasyonu
  if payload.baslangicTarihi and payload.bitisTarihi:
    try:
      start = datetime.fromisoformat(payload.baslangicTarihi.replace('Z', '+00:00'))
      end = datetime.fromisoformat(payload.bitisTarihi.replace('Z', '+00:00'))
      if end < start:
        raise HTTPException(status_code=400, detail="Bitiş tarihi başlangıç tarihinden önce olamaz")
    except ValueError:
      raise HTTPException(status_code=400, detail="Geçersiz tarih formatı")
  
  tasks = load_json("tasks.json")
  new_id = f"TSK-{str(uuid.uuid4())[:8].upper()}"
  now = datetime.now().isoformat()
  
  new_item = {
    "id": new_id,
    "baslik": payload.baslik,
    "aciklama": payload.aciklama,
    "oncelik": payload.oncelik,
    "durum": payload.durum,
    "baslangicTarihi": payload.baslangicTarihi,
    "bitisTarihi": payload.bitisTarihi,
    "createdBy": createdBy or user_id,
    "createdAt": now,
    "updatedAt": now,
    "deleted": False,
  }
  tasks.append(new_item)
  save_json("tasks.json", tasks)
  
  # Aktivite log
  log_activity(
      user_id=user_id,
      user_name=user_name,
      action="task_create",
      target_type="task",
      target_id=new_id,
      target_name=payload.baslik,
      details=f"Yeni görev oluşturuldu: {payload.baslik}",
      icon=get_action_icon("task_create")
  )
  
  return new_item


@router.put("/{task_id}")
def update_task(task_id: str, payload: TaskIn):
  # Tarih validasyonu
  if payload.baslangicTarihi and payload.bitisTarihi:
    try:
      start = datetime.fromisoformat(payload.baslangicTarihi.replace('Z', '+00:00'))
      end = datetime.fromisoformat(payload.bitisTarihi.replace('Z', '+00:00'))
      if end < start:
        raise HTTPException(status_code=400, detail="Bitiş tarihi başlangıç tarihinden önce olamaz")
    except ValueError:
      raise HTTPException(status_code=400, detail="Geçersiz tarih formatı")
  
  tasks = load_json("tasks.json")
  for idx, item in enumerate(tasks):
    if item.get("id") == task_id:
      tasks[idx] = {
        **item,
        "baslik": payload.baslik,
        "aciklama": payload.aciklama,
        "oncelik": payload.oncelik,
        "durum": payload.durum,
        "baslangicTarihi": payload.baslangicTarihi,
        "bitisTarihi": payload.bitisTarihi,
        "updatedAt": datetime.now().isoformat(),
      }
      save_json("tasks.json", tasks)
      return tasks[idx]
  raise HTTPException(status_code=404, detail="Görev bulunamadı")


@router.patch("/{task_id}/durum")
def update_task_status(task_id: str, durum: str, authorization: Optional[str] = Header(None)):
  user_id, user_name = _get_user_info(authorization)
  valid_statuses = ["todo", "in_progress", "blocked", "done"]
  if durum not in valid_statuses:
    raise HTTPException(status_code=400, detail=f"Geçersiz durum. Geçerli değerler: {valid_statuses}")
  
  tasks = load_json("tasks.json")
  for idx, item in enumerate(tasks):
    if item.get("id") == task_id:
      old_status = item.get("durum")
      tasks[idx] = {
        **item,
        "durum": durum,
        "updatedAt": datetime.now().isoformat(),
      }
      save_json("tasks.json", tasks)
      
      # Aktivite log
      status_labels = {"todo": "Beklemede", "in_progress": "Devam Ediyor", "blocked": "Bloke", "done": "Tamamlandı"}
      log_activity(
          user_id=user_id,
          user_name=user_name,
          action="task_status_change",
          target_type="task",
          target_id=task_id,
          target_name=item.get("baslik"),
          details=f"Görev durumu değişti: {status_labels.get(old_status, old_status)} → {status_labels.get(durum, durum)}",
          icon=get_action_icon("task_status_change")
      )
      
      return tasks[idx]
  raise HTTPException(status_code=404, detail="Görev bulunamadı")


@router.delete("/{task_id}")
def soft_delete_task(task_id: str):
  tasks = load_json("tasks.json")
  for idx, item in enumerate(tasks):
    if item.get("id") == task_id:
      tasks[idx] = {
        **item,
        "deleted": True,
        "updatedAt": datetime.now().isoformat(),
      }
      save_json("tasks.json", tasks)
      return {"id": task_id, "deleted": True}
  raise HTTPException(status_code=404, detail="Görev bulunamadı")


class TaskAssignmentIn(BaseModel):
  assigneeType: Literal["personnel", "team"] = Field(..., description="Atama tipi")
  assigneeId: str = Field(..., description="Atanan kişi/ekip ID")
  note: Optional[str] = Field(None, description="Atama notu")


@router.post("/{task_id}/assign")
def assign_task(task_id: str, payload: TaskAssignmentIn, assignedBy: Optional[str] = None):
  # Görev var mı kontrol et
  tasks = load_json("tasks.json")
  task_exists = any(t.get("id") == task_id for t in tasks if not t.get("deleted"))
  if not task_exists:
    raise HTTPException(status_code=404, detail="Görev bulunamadı")
  
  # Assignee var mı kontrol et
  if payload.assigneeType == "personnel":
    personnel = load_json("personnel.json")
    assignee_exists = any(p.get("id") == payload.assigneeId for p in personnel if not p.get("deleted"))
    if not assignee_exists:
      raise HTTPException(status_code=404, detail="Personel bulunamadı")
  elif payload.assigneeType == "team":
    teams = load_json("teams.json")
    assignee_exists = any(t.get("id") == payload.assigneeId for t in teams if not t.get("deleted"))
    if not assignee_exists:
      raise HTTPException(status_code=404, detail="Ekip bulunamadı")
  
  task_assignments = load_json("task_assignments.json")
  
  # Duplicate kontrolü: Aynı atama zaten var mı?
  for ta in task_assignments:
    if (ta.get("taskId") == task_id and 
        ta.get("assigneeType") == payload.assigneeType and
        ta.get("assigneeId") == payload.assigneeId and
        ta.get("active", True) and
        not ta.get("deleted")):
      raise HTTPException(status_code=409, detail="Bu atama zaten mevcut")
  
  # Çoklu atama destekleniyor - eski atamayı pasif yapmıyoruz
  # Yeni atama oluştur
  new_id = f"TA-{str(uuid.uuid4())[:8].upper()}"
  now = datetime.now().isoformat()
  
  new_assignment = {
    "id": new_id,
    "taskId": task_id,
    "assigneeType": payload.assigneeType,
    "assigneeId": payload.assigneeId,
    "assignedBy": assignedBy,
    "note": payload.note,
    "active": True,
    "createdAt": now,
    "deleted": False,
  }
  task_assignments.append(new_assignment)
  save_json("task_assignments.json", task_assignments)
  return new_assignment


@router.delete("/{task_id}/assign")
def unassign_task(task_id: str):
  task_assignments = load_json("task_assignments.json")
  found = False
  for ta_idx, ta in enumerate(task_assignments):
    if ta.get("taskId") == task_id and ta.get("active", True) and not ta.get("deleted"):
      task_assignments[ta_idx] = {
        **ta,
        "active": False,
        "endedAt": datetime.now().isoformat(),
      }
      found = True
  if found:
    save_json("task_assignments.json", task_assignments)
    return {"taskId": task_id, "unassigned": True}
  raise HTTPException(status_code=404, detail="Aktif atama bulunamadı")