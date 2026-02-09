"""
Montaj Takip Router

Bu modül montaj görevlerinin takibini yönetir.
Her iş için iş kollarına göre montaj aşamaları oluşturulur ve takip edilir.
"""

import uuid
from datetime import datetime, date
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional, List

from ..data_loader import load_json, save_json
from ..activity_logger import log_activity, get_action_icon

router = APIRouter(prefix="/assembly", tags=["assembly"])


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


# ========== Models ==========

class AssemblyStage(BaseModel):
    """Montaj aşaması"""
    id: str
    name: str
    order: int


class CreateAssemblyTask(BaseModel):
    """Montaj görevi oluşturma"""
    jobId: str
    roleId: str
    roleName: str
    stageId: str
    stageName: str
    stageOrder: int = 1
    estimatedDate: Optional[str] = None  # Müşteriye verilen termin
    plannedDate: Optional[str] = None
    teamId: Optional[str] = None
    teamName: Optional[str] = None
    assignedPersonnel: List[str] = []


class UpdateAssemblyTask(BaseModel):
    """Montaj görevi güncelleme"""
    plannedDate: Optional[str] = None
    teamId: Optional[str] = None
    teamName: Optional[str] = None
    assignedPersonnel: Optional[List[str]] = None
    status: Optional[str] = None
    note: Optional[str] = None


class StartTask(BaseModel):
    """Görevi başlat"""
    startTime: Optional[str] = None
    note: Optional[str] = None


class CompleteTask(BaseModel):
    """Görevi tamamla"""
    endTime: Optional[str] = None
    note: Optional[str] = None
    photosBefore: List[str] = []
    photosAfter: List[str] = []
    customerSignature: Optional[str] = None
    completedByPersonId: Optional[str] = None  # Görevi tamamlayan personel


class CompleteAllTasks(BaseModel):
    """Tüm görevleri tek seferde tamamla (perakende için)"""
    completedDate: Optional[str] = None
    note: Optional[str] = None
    photosBefore: List[str] = []
    photosAfter: List[str] = []
    customerSignature: Optional[str] = None
    completedByPersonId: Optional[str] = None  # Görevi tamamlayan personel


class ReportIssue(BaseModel):
    """Montaj sorunu bildir"""
    issueType: str  # settings.json'dan dinamik
    item: str
    quantity: int = 1
    faultSource: str  # settings.json'dan dinamik
    responsiblePersonId: str  # Zorunlu - sorumlu kişi
    photoUrl: Optional[str] = None
    note: Optional[str] = None
    createReplacement: bool = False
    replacementSupplierId: Optional[str] = None


class RecordDelay(BaseModel):
    """Gecikme kaydı - tarih ileri alındığında zorunlu"""
    originalDate: str
    newDate: str
    reason: str  # settings.json delayReasons'dan
    responsiblePersonId: str  # Zorunlu
    note: Optional[str] = None


class UpdateTaskWithDelay(BaseModel):
    """Tarih güncellemesi ile gecikme kaydı"""
    plannedDate: str
    delayReason: Optional[str] = None  # Eğer tarih ileri alınıyorsa zorunlu
    delayResponsiblePersonId: Optional[str] = None
    delayNote: Optional[str] = None


# ========== Helpers ==========

def _gen_id(prefix: str) -> str:
    return f"{prefix}-{str(uuid.uuid4())[:8].upper()}"


def _now() -> str:
    return datetime.utcnow().isoformat()


def _today() -> str:
    return date.today().isoformat()


def _find_task(task_id: str):
    """Görev bul"""
    tasks = load_json("assemblyTasks.json")
    for idx, task in enumerate(tasks):
        if task.get("id") == task_id:
            return tasks, idx, task
    raise HTTPException(status_code=404, detail="Montaj görevi bulunamadı")


def _get_job(job_id: str):
    """İş bilgilerini getir"""
    jobs = load_json("jobs.json")
    job = next((j for j in jobs if j.get("id") == job_id), None)
    if not job:
        raise HTTPException(status_code=404, detail="İş bulunamadı")
    return job


def _is_overdue(task: dict) -> bool:
    """Termin geçti mi?"""
    est = task.get("estimatedDate")
    if not est:
        return False
    try:
        est_date = datetime.fromisoformat(est[:10]).date()
        return date.today() > est_date and task.get("status") != "completed"
    except:
        return False


def _days_until(date_str: str) -> int:
    """Tarihe kaç gün kaldı"""
    if not date_str:
        return 0
    try:
        target = datetime.fromisoformat(date_str[:10]).date()
        return (target - date.today()).days
    except:
        return 0


# ========== Endpoints ==========

@router.get("/tasks")
def list_tasks(
    jobId: Optional[str] = None,
    roleId: Optional[str] = None,
    teamId: Optional[str] = None,
    status: Optional[str] = None,
    dateFrom: Optional[str] = None,
    dateTo: Optional[str] = None,
    overdue: Optional[bool] = None
):
    """Tüm montaj görevlerini listele"""
    tasks = load_json("assemblyTasks.json")
    
    if jobId:
        tasks = [t for t in tasks if t.get("jobId") == jobId]
    if roleId:
        tasks = [t for t in tasks if t.get("roleId") == roleId]
    if teamId:
        tasks = [t for t in tasks if t.get("teamId") == teamId]
    if status:
        tasks = [t for t in tasks if t.get("status") == status]
    if dateFrom:
        tasks = [t for t in tasks if (t.get("plannedDate") or "") >= dateFrom]
    if dateTo:
        tasks = [t for t in tasks if (t.get("plannedDate") or "") <= dateTo]
    if overdue is True:
        tasks = [t for t in tasks if _is_overdue(t)]
    
    # Her görev için ek bilgiler
    for task in tasks:
        task["isOverdue"] = _is_overdue(task)
        task["daysUntilEstimated"] = _days_until(task.get("estimatedDate"))
        task["daysUntilPlanned"] = _days_until(task.get("plannedDate"))
    
    return tasks


@router.get("/tasks/today")
def get_today_tasks(teamId: Optional[str] = None):
    """Bugünkü montaj görevleri (ekip görünümü için)"""
    tasks = load_json("assemblyTasks.json")
    today = _today()
    
    today_tasks = [t for t in tasks if t.get("plannedDate") == today]
    
    if teamId:
        today_tasks = [t for t in today_tasks if t.get("teamId") == teamId]
    
    # İş bazlı grupla
    jobs_map = {}
    for task in today_tasks:
        job_id = task.get("jobId")
        if job_id not in jobs_map:
            jobs_map[job_id] = {
                "jobId": job_id,
                "customerName": task.get("customerName"),
                "location": task.get("location"),
                "tasks": []
            }
        task["isOverdue"] = _is_overdue(task)
        jobs_map[job_id]["tasks"].append(task)
    
    # Sırala: devam eden önce, sonra planlanmış
    result = list(jobs_map.values())
    for job in result:
        job["tasks"].sort(key=lambda t: (
            0 if t.get("status") == "in_progress" else 
            1 if t.get("status") == "pending" else 2,
            t.get("stageOrder", 0)
        ))
    
    return result


@router.get("/tasks/by-job/{job_id}")
def get_tasks_by_job(job_id: str):
    """Bir iş için tüm montaj görevleri"""
    tasks = load_json("assemblyTasks.json")
    job_tasks = [t for t in tasks if t.get("jobId") == job_id]
    
    # İş kolu bazlı grupla
    roles_map = {}
    for task in job_tasks:
        role_id = task.get("roleId")
        if role_id not in roles_map:
            roles_map[role_id] = {
                "roleId": role_id,
                "roleName": task.get("roleName"),
                "tasks": [],
                "completedCount": 0,
                "totalCount": 0
            }
        task["isOverdue"] = _is_overdue(task)
        roles_map[role_id]["tasks"].append(task)
        roles_map[role_id]["totalCount"] += 1
        if task.get("status") == "completed":
            roles_map[role_id]["completedCount"] += 1
    
    # Her rol için görevleri sırala
    for role in roles_map.values():
        role["tasks"].sort(key=lambda t: t.get("stageOrder", 0))
        role["isComplete"] = role["completedCount"] == role["totalCount"]
    
    result = list(roles_map.values())
    result.sort(key=lambda r: r["roleName"])
    
    # Genel özet
    all_completed = all(r["isComplete"] for r in result) if result else False
    pending_issues = sum(
        len([i for i in t.get("issues", []) if i.get("status") == "pending"])
        for t in job_tasks
    )
    
    return {
        "roles": result,
        "summary": {
            "totalTasks": len(job_tasks),
            "completedTasks": sum(1 for t in job_tasks if t.get("status") == "completed"),
            "inProgressTasks": sum(1 for t in job_tasks if t.get("status") == "in_progress"),
            "pendingTasks": sum(1 for t in job_tasks if t.get("status") == "pending"),
            "blockedTasks": sum(1 for t in job_tasks if t.get("status") == "blocked"),
            "allCompleted": all_completed,
            "pendingIssues": pending_issues
        }
    }


@router.get("/tasks/{task_id}")
def get_task(task_id: str):
    """Tek bir görev detayı"""
    _, _, task = _find_task(task_id)
    task["isOverdue"] = _is_overdue(task)
    return task


@router.post("/tasks", status_code=201)
def create_task(payload: CreateAssemblyTask, authorization: Optional[str] = Header(None)):
    """Yeni montaj görevi oluştur"""
    user_id, user_name = _get_user_info(authorization)
    tasks = load_json("assemblyTasks.json")
    job = _get_job(payload.jobId)
    
    new_task = {
        "id": _gen_id("ASM"),
        "jobId": payload.jobId,
        "roleId": payload.roleId,
        "roleName": payload.roleName,
        "stageId": payload.stageId,
        "stageName": payload.stageName,
        "stageOrder": payload.stageOrder,
        
        "jobTitle": job.get("title"),
        "customerName": job.get("customerName"),
        "customerPhone": job.get("customerPhone"),
        "location": job.get("location"),
        
        "estimatedDate": payload.estimatedDate,  # Müşteriye verilen termin
        "plannedDate": payload.plannedDate,
        "startedAt": None,
        "completedAt": None,
        
        "teamId": payload.teamId,
        "teamName": payload.teamName,
        "assignedPersonnel": payload.assignedPersonnel,
        
        "status": "pending",  # pending | planned | in_progress | completed | blocked
        "note": None,
        
        "photos": {
            "before": [],
            "after": []
        },
        "customerSignature": None,
        
        "issues": [],
        "delays": [],  # Gecikme kayıtları
        "totalDelayDays": 0,
        "isDelayed": False,
        
        "createdAt": _now(),
        "updatedAt": _now()
    }
    
    tasks.append(new_task)
    save_json("assemblyTasks.json", tasks)
    
    # Aktivite log
    log_activity(
        user_id=user_id,
        user_name=user_name,
        action="assembly_create",
        target_type="assembly",
        target_id=new_task["id"],
        target_name=f"{new_task['id']} - {payload.roleName}",
        details=f"Montaj görevi oluşturuldu: {payload.stageName} - {payload.roleName}",
        icon=get_action_icon("assembly_create")
    )
    
    return new_task


@router.post("/tasks/create-for-job/{job_id}")
def create_tasks_for_job(job_id: str):
    """Bir iş için tüm montaj görevlerini oluştur (üretim→montaj geçişinde)"""
    job = _get_job(job_id)
    settings = load_json("settings.json")
    job_roles = settings.get("jobRoles", [])
    
    tasks = load_json("assemblyTasks.json")
    created_tasks = []
    
    # İşin her iş kolu için
    for role in job.get("roles", []):
        role_id = role.get("id")
        role_name = role.get("name")
        
        # İş kolu ayarlarını bul
        role_config = next((r for r in job_roles if r.get("id") == role_id), None)
        if not role_config:
            continue
        
        # Montaj aşamalarını al
        assembly_stages = role_config.get("assemblyStages", [])
        if not assembly_stages:
            # Varsayılan aşama
            assembly_stages = [{"id": "default", "name": f"{role_name} Montaj", "order": 1}]
        
        # Her aşama için görev oluştur
        for stage in assembly_stages:
            # Zaten varsa oluşturma
            existing = next((t for t in tasks if 
                t.get("jobId") == job_id and 
                t.get("roleId") == role_id and 
                t.get("stageId") == stage.get("id")
            ), None)
            
            if existing:
                continue
            
            new_task = {
                "id": _gen_id("ASM"),
                "jobId": job_id,
                "roleId": role_id,
                "roleName": role_name,
                "stageId": stage.get("id"),
                "stageName": stage.get("name"),
                "stageOrder": stage.get("order", 1),
                
                "jobTitle": job.get("title"),
                "customerName": job.get("customerName"),
                "customerPhone": job.get("customerPhone"),
                "location": job.get("location"),
                
                "estimatedDate": job.get("estimatedAssembly", {}).get("date"),
                "plannedDate": None,
                "startedAt": None,
                "completedAt": None,
                
                "teamId": None,
                "teamName": None,
                "assignedPersonnel": [],
                
                "status": "pending",
                "note": None,
                
                "photos": {
                    "before": [],
                    "after": []
                },
                "customerSignature": None,
                
                "issues": [],
                "delays": [],  # Gecikme kayıtları
                "totalDelayDays": 0,
                "isDelayed": False,
                
                "createdAt": _now(),
                "updatedAt": _now()
            }
            
            tasks.append(new_task)
            created_tasks.append(new_task)
    
    save_json("assemblyTasks.json", tasks)
    
    return {
        "created": len(created_tasks),
        "tasks": created_tasks
    }


@router.put("/tasks/{task_id}")
def update_task(task_id: str, payload: UpdateAssemblyTask):
    """Görevi güncelle"""
    tasks, idx, task = _find_task(task_id)
    
    # model_fields_set ile hangi alanların gönderildiğini kontrol et (null olsa bile)
    if "plannedDate" in payload.model_fields_set:
        task["plannedDate"] = payload.plannedDate
        # Tarih atandıysa planned, kaldırıldıysa pending
        if payload.plannedDate and task["status"] == "pending":
            task["status"] = "planned"
        elif payload.plannedDate is None and task["status"] == "planned":
            task["status"] = "pending"
    
    if "teamId" in payload.model_fields_set:
        task["teamId"] = payload.teamId
    if "teamName" in payload.model_fields_set:
        task["teamName"] = payload.teamName
    if "assignedPersonnel" in payload.model_fields_set:
        task["assignedPersonnel"] = payload.assignedPersonnel
    if "status" in payload.model_fields_set:
        task["status"] = payload.status
    if "note" in payload.model_fields_set:
        task["note"] = payload.note
    
    task["updatedAt"] = _now()
    tasks[idx] = task
    save_json("assemblyTasks.json", tasks)
    
    return task


@router.post("/tasks/{task_id}/start")
def start_task(task_id: str, payload: StartTask):
    """Görevi başlat"""
    tasks, idx, task = _find_task(task_id)
    
    task["status"] = "in_progress"
    task["startedAt"] = payload.startTime or _now()
    if payload.note:
        task["note"] = payload.note
    task["updatedAt"] = _now()
    
    tasks[idx] = task
    save_json("assemblyTasks.json", tasks)
    
    return task


@router.post("/tasks/{task_id}/complete")
def complete_task(task_id: str, payload: CompleteTask, authorization: Optional[str] = Header(None)):
    """Görevi tamamla"""
    user_id, user_name = _get_user_info(authorization)
    tasks, idx, task = _find_task(task_id)
    
    # Bekleyen sorun varsa tamamlanamaz
    pending_issues = [i for i in task.get("issues", []) if i.get("status") == "pending"]
    if pending_issues:
        raise HTTPException(
            status_code=400, 
            detail=f"{len(pending_issues)} bekleyen sorun var. Önce sorunları çözün."
        )
    
    # Fotoğraf zorunluluğu kontrolü - her aşama için
    if not payload.photosBefore or len(payload.photosBefore) == 0:
        raise HTTPException(status_code=400, detail="Montaj öncesi fotoğraf zorunludur.")
    if not payload.photosAfter or len(payload.photosAfter) == 0:
        raise HTTPException(status_code=400, detail="Montaj sonrası fotoğraf zorunludur.")
    
    # Son aşama kontrolü - imza zorunluluğu
    job_id = task.get("jobId")
    role_id = task.get("roleId")
    role_tasks = [t for t in tasks if t.get("jobId") == job_id and t.get("roleId") == role_id]
    role_tasks.sort(key=lambda t: t.get("stageOrder", 0))
    
    is_last_stage = len(role_tasks) > 0 and role_tasks[-1].get("id") == task_id
    if is_last_stage and not payload.customerSignature:
        raise HTTPException(status_code=400, detail="Son aşama için müşteri imzası zorunludur.")
    
    task["status"] = "completed"
    task["completedAt"] = payload.endTime or _now()
    
    if payload.completedByPersonId:
        task["completedByPersonId"] = payload.completedByPersonId
    if payload.note:
        task["note"] = payload.note
    if payload.photosBefore:
        task["photos"]["before"].extend(payload.photosBefore)
    if payload.photosAfter:
        task["photos"]["after"].extend(payload.photosAfter)
    if payload.customerSignature:
        task["customerSignature"] = payload.customerSignature
    
    task["updatedAt"] = _now()
    tasks[idx] = task
    save_json("assemblyTasks.json", tasks)
    
    # Aktivite log
    log_activity(
        user_id=user_id,
        user_name=user_name,
        action="assembly_complete",
        target_type="assembly",
        target_id=task_id,
        target_name=f"{task.get('roleName')} - {task.get('stageName')}",
        details=f"Montaj görevi tamamlandı: {task.get('stageName')} ({task.get('jobTitle', '')})",
        icon=get_action_icon("assembly_complete")
    )
    
    return task


@router.post("/tasks/complete-all/{job_id}")
def complete_all_tasks(job_id: str, payload: CompleteAllTasks):
    """Bir iş için tüm görevleri tek seferde tamamla (perakende için)"""
    tasks = load_json("assemblyTasks.json")
    job_tasks = [t for t in tasks if t.get("jobId") == job_id]
    
    if not job_tasks:
        raise HTTPException(status_code=404, detail="Bu iş için montaj görevi bulunamadı")
    
    # Bekleyen sorun kontrolü
    all_pending_issues = []
    for task in job_tasks:
        pending = [i for i in task.get("issues", []) if i.get("status") == "pending"]
        all_pending_issues.extend(pending)
    
    if all_pending_issues:
        raise HTTPException(
            status_code=400,
            detail=f"{len(all_pending_issues)} bekleyen sorun var. Önce sorunları çözün."
        )
    
    # Fotoğraf ve imza zorunluluğu kontrolü (tümünü tamamla için)
    if not payload.photosBefore or len(payload.photosBefore) == 0:
        raise HTTPException(status_code=400, detail="Montaj öncesi fotoğraf zorunludur.")
    if not payload.photosAfter or len(payload.photosAfter) == 0:
        raise HTTPException(status_code=400, detail="Montaj sonrası fotoğraf zorunludur.")
    if not payload.customerSignature:
        raise HTTPException(status_code=400, detail="Müşteri imzası zorunludur.")
    
    completed_date = payload.completedDate or _now()
    
    for task in job_tasks:
        task_idx = next(i for i, t in enumerate(tasks) if t.get("id") == task.get("id"))
        
        task["status"] = "completed"
        task["completedAt"] = completed_date
        if payload.completedByPersonId:
            task["completedByPersonId"] = payload.completedByPersonId
        
        if payload.note:
            task["note"] = payload.note
        
        # Tüm görevlere fotoğrafları kaydet
        if payload.photosBefore:
            task["photos"]["before"].extend(payload.photosBefore)
        if payload.photosAfter:
            task["photos"]["after"].extend(payload.photosAfter)
        if payload.customerSignature:
            task["customerSignature"] = payload.customerSignature
        
        task["updatedAt"] = _now()
        tasks[task_idx] = task
    
    save_json("assemblyTasks.json", tasks)
    
    return {
        "completed": len(job_tasks),
        "tasks": job_tasks
    }


@router.post("/tasks/{task_id}/issue")
def report_issue(task_id: str, payload: ReportIssue):
    """Montaj sorunu bildir"""
    tasks, idx, task = _find_task(task_id)
    
    issue = {
        "id": _gen_id("ISS"),
        "type": payload.issueType,
        "item": payload.item,
        "quantity": payload.quantity,
        "faultSource": payload.faultSource,
        "responsiblePersonId": payload.responsiblePersonId,
        "photoUrl": payload.photoUrl,
        "note": payload.note,
        "status": "pending",
        "replacementOrderId": None,
        "createdAt": _now()
    }
    
    # Yedek sipariş oluştur
    if payload.createReplacement:
        production_orders = load_json("productionOrders.json")
        
        replacement_order = {
            "id": _gen_id("PROD"),
            "jobId": task.get("jobId"),
            "jobTitle": f"{task.get('customerName')} - Yedek",
            "customerName": task.get("customerName"),
            "roleId": task.get("roleId"),
            "roleName": task.get("roleName"),
            "orderType": "glass",  # Varsayılan olarak cam
            "supplierId": payload.replacementSupplierId,
            "supplierName": None,
            "items": [{
                "glassType": None,
                "glassName": payload.item,
                "quantity": payload.quantity,
                "unit": "adet",
                "combination": None,
                "notes": f"Yedek - {payload.note or 'Montaj sorunu'}",
                "receivedQty": 0,
                "problemQty": 0,
                "isReplacement": True,
                "originalIssueId": issue["id"]
            }],
            "documentUrl": None,
            "estimatedDelivery": None,
            "notes": f"Montaj sorunu için yedek sipariş. Görev: {task_id}",
            "status": "pending",
            "issues": [],
            "deliveryHistory": [],
            "createdAt": _now(),
            "updatedAt": _now()
        }
        
        production_orders.insert(0, replacement_order)
        save_json("productionOrders.json", production_orders)
        
        issue["replacementOrderId"] = replacement_order["id"]
    
    # Görevi blocked yap
    task["issues"].append(issue)
    task["status"] = "blocked"
    task["updatedAt"] = _now()
    
    tasks[idx] = task
    save_json("assemblyTasks.json", tasks)
    
    return {
        "issue": issue,
        "task": task,
        "replacementOrderId": issue.get("replacementOrderId")
    }


@router.post("/tasks/{task_id}/issues/{issue_id}/resolve")
def resolve_issue(task_id: str, issue_id: str):
    """Sorunu çözüldü olarak işaretle"""
    tasks, idx, task = _find_task(task_id)
    
    issue = next((i for i in task.get("issues", []) if i.get("id") == issue_id), None)
    if not issue:
        raise HTTPException(status_code=404, detail="Sorun bulunamadı")
    
    issue["status"] = "resolved"
    issue["resolvedAt"] = _now()
    
    # Başka bekleyen sorun yoksa blocked'dan çıkar
    pending_issues = [i for i in task.get("issues", []) if i.get("status") == "pending" and i.get("id") != issue_id]
    if not pending_issues:
        task["status"] = "in_progress" if task.get("startedAt") else "planned"
    
    task["updatedAt"] = _now()
    tasks[idx] = task
    save_json("assemblyTasks.json", tasks)
    
    return task


@router.get("/summary")
def get_summary():
    """Montaj özet istatistikleri"""
    tasks = load_json("assemblyTasks.json")
    
    pending = [t for t in tasks if t.get("status") == "pending"]
    planned = [t for t in tasks if t.get("status") == "planned"]
    in_progress = [t for t in tasks if t.get("status") == "in_progress"]
    completed = [t for t in tasks if t.get("status") == "completed"]
    blocked = [t for t in tasks if t.get("status") == "blocked"]
    overdue = [t for t in tasks if _is_overdue(t)]
    
    today = _today()
    today_tasks = [t for t in tasks if t.get("plannedDate") == today]
    
    return {
        "total": len(tasks),
        "pending": len(pending),
        "planned": len(planned),
        "inProgress": len(in_progress),
        "completed": len(completed),
        "blocked": len(blocked),
        "overdue": len(overdue),
        "today": len(today_tasks),
        "overdueList": overdue[:5]
    }


@router.get("/team-availability")
def check_team_availability(teamId: str, date: str):
    """Ekip müsaitlik kontrolü"""
    tasks = load_json("assemblyTasks.json")
    
    team_tasks = [t for t in tasks if t.get("teamId") == teamId and t.get("plannedDate") == date]
    
    return {
        "teamId": teamId,
        "date": date,
        "available": True,  # Her zaman atanabilir
        "existingTaskCount": len(team_tasks),
        "existingTasks": team_tasks,
        "warning": f"⚠️ Bu ekip aynı gün {len(team_tasks)} başka görevde atanmış" if team_tasks else None
    }


@router.post("/tasks/{task_id}/delay")
def record_delay(task_id: str, payload: RecordDelay):
    """Gecikme kaydı oluştur - tarih ileri alındığında zorunlu"""
    tasks, idx, task = _find_task(task_id)
    
    # Gün farkını hesapla
    try:
        orig_date = datetime.fromisoformat(payload.originalDate[:10]).date()
        new_date = datetime.fromisoformat(payload.newDate[:10]).date()
        delay_days = (new_date - orig_date).days
    except:
        raise HTTPException(status_code=400, detail="Geçersiz tarih formatı")
    
    if delay_days <= 0:
        raise HTTPException(status_code=400, detail="Yeni tarih eski tarihten ileri olmalı")
    
    # Personel bilgisi al
    personnel = load_json("personnel.json")
    responsible = next((p for p in personnel if p.get("id") == payload.responsiblePersonId), None)
    
    delay_record = {
        "id": _gen_id("DLY"),
        "originalDate": payload.originalDate,
        "newDate": payload.newDate,
        "delayDays": delay_days,
        "reason": payload.reason,
        "responsiblePersonId": payload.responsiblePersonId,
        "responsiblePersonName": responsible.get("ad", "Bilinmiyor") if responsible else "Bilinmiyor",
        "note": payload.note,
        "createdAt": _now()
    }
    
    # Delays array yoksa oluştur
    if "delays" not in task:
        task["delays"] = []
    
    task["delays"].append(delay_record)
    
    # Toplam gecikme günlerini güncelle
    total_delay = sum(d.get("delayDays", 0) for d in task["delays"])
    task["totalDelayDays"] = total_delay
    task["isDelayed"] = total_delay > 0
    
    # Tarihi güncelle
    task["plannedDate"] = payload.newDate
    if task["status"] == "pending":
        task["status"] = "planned"
    
    task["updatedAt"] = _now()
    tasks[idx] = task
    save_json("assemblyTasks.json", tasks)
    
    return {
        "task": task,
        "delay": delay_record
    }


@router.put("/tasks/{task_id}/reschedule")
def reschedule_task(task_id: str, payload: UpdateTaskWithDelay):
    """Görevi yeniden planla - tarih ileri alınıyorsa gecikme nedeni zorunlu"""
    tasks, idx, task = _find_task(task_id)
    
    old_date = task.get("plannedDate")
    new_date = payload.plannedDate
    
    # Tarih ileri mi alındı?
    is_postponed = False
    delay_days = 0
    
    if old_date and new_date:
        try:
            old_dt = datetime.fromisoformat(old_date[:10]).date()
            new_dt = datetime.fromisoformat(new_date[:10]).date()
            delay_days = (new_dt - old_dt).days
            is_postponed = delay_days > 0
        except:
            pass
    
    # Tarih ileri alındıysa gecikme nedeni zorunlu
    if is_postponed:
        if not payload.delayReason:
            raise HTTPException(
                status_code=400, 
                detail=f"Tarih {delay_days} gün ileri alındı. Gecikme nedeni zorunludur."
            )
        if not payload.delayResponsiblePersonId:
            raise HTTPException(
                status_code=400, 
                detail="Gecikme için sorumlu kişi zorunludur."
            )
        
        # Personel bilgisi al
        personnel = load_json("personnel.json")
        responsible = next((p for p in personnel if p.get("id") == payload.delayResponsiblePersonId), None)
        
        delay_record = {
            "id": _gen_id("DLY"),
            "originalDate": old_date,
            "newDate": new_date,
            "delayDays": delay_days,
            "reason": payload.delayReason,
            "responsiblePersonId": payload.delayResponsiblePersonId,
            "responsiblePersonName": responsible.get("ad", "Bilinmiyor") if responsible else "Bilinmiyor",
            "note": payload.delayNote,
            "createdAt": _now()
        }
        
        if "delays" not in task:
            task["delays"] = []
        task["delays"].append(delay_record)
        
        total_delay = sum(d.get("delayDays", 0) for d in task["delays"])
        task["totalDelayDays"] = total_delay
        task["isDelayed"] = True
    
    # Tarihi güncelle
    task["plannedDate"] = new_date
    if task["status"] == "pending" and new_date:
        task["status"] = "planned"
    
    task["updatedAt"] = _now()
    tasks[idx] = task
    save_json("assemblyTasks.json", tasks)
    
    return task


@router.get("/delay-report")
def get_delay_report(dateFrom: Optional[str] = None, dateTo: Optional[str] = None):
    """Gecikme raporu - ekip/personel bazlı"""
    tasks = load_json("assemblyTasks.json")
    
    # Gecikmeli görevleri filtrele
    delayed_tasks = [t for t in tasks if t.get("isDelayed") or len(t.get("delays", [])) > 0]
    
    # Tüm gecikmeleri topla
    all_delays = []
    for task in delayed_tasks:
        for delay in task.get("delays", []):
            delay_info = {
                **delay,
                "taskId": task.get("id"),
                "jobId": task.get("jobId"),
                "customerName": task.get("customerName"),
                "roleName": task.get("roleName"),
                "stageName": task.get("stageName")
            }
            all_delays.append(delay_info)
    
    # Tarih filtresi
    if dateFrom:
        all_delays = [d for d in all_delays if d.get("createdAt", "")[:10] >= dateFrom]
    if dateTo:
        all_delays = [d for d in all_delays if d.get("createdAt", "")[:10] <= dateTo]
    
    # Personel bazlı grupla
    person_delays = {}
    for delay in all_delays:
        person_id = delay.get("responsiblePersonId", "unknown")
        person_name = delay.get("responsiblePersonName", "Bilinmiyor")
        
        if person_id not in person_delays:
            person_delays[person_id] = {
                "personId": person_id,
                "personName": person_name,
                "totalDelays": 0,
                "totalDays": 0,
                "reasons": {}
            }
        
        person_delays[person_id]["totalDelays"] += 1
        person_delays[person_id]["totalDays"] += delay.get("delayDays", 0)
        
        reason = delay.get("reason", "other")
        if reason not in person_delays[person_id]["reasons"]:
            person_delays[person_id]["reasons"][reason] = 0
        person_delays[person_id]["reasons"][reason] += 1
    
    # Neden bazlı grupla
    reason_stats = {}
    for delay in all_delays:
        reason = delay.get("reason", "other")
        if reason not in reason_stats:
            reason_stats[reason] = {"count": 0, "totalDays": 0}
        reason_stats[reason]["count"] += 1
        reason_stats[reason]["totalDays"] += delay.get("delayDays", 0)
    
    return {
        "totalDelays": len(all_delays),
        "totalDelayDays": sum(d.get("delayDays", 0) for d in all_delays),
        "avgDelayDays": round(sum(d.get("delayDays", 0) for d in all_delays) / len(all_delays), 1) if all_delays else 0,
        "byPerson": list(person_delays.values()),
        "byReason": reason_stats,
        "recentDelays": sorted(all_delays, key=lambda d: d.get("createdAt", ""), reverse=True)[:10]
    }
