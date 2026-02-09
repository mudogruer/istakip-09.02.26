"""
Üretim & Tedarik Siparişleri Router

Bu modül iç üretim ve dış sipariş takibini yönetir.
Her iş için hangi kalemlerin üretimde/siparişte olduğunu,
teslimat durumlarını ve sorunları takip eder.
"""

import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional

from ..data_loader import load_json, save_json
from ..activity_logger import log_activity, get_action_icon

router = APIRouter(prefix="/production", tags=["production"])


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

class OrderLineItem(BaseModel):
    """Sipariş kalemi"""
    glassType: str | None = None       # Cam tipi kodu (iç üretim cam bağımlılığı için)
    glassName: str | None = None       # Cam adı
    quantity: int                       # Sipariş adedi
    unit: str = "adet"                  # Birim
    combination: str | None = None     # Kombinasyon tipi (autocomplete için)
    notes: str | None = None


class DeliveryItem(BaseModel):
    """Teslimat kalemi"""
    lineIndex: int                      # Hangi kalem için
    receivedQty: int                    # Teslim alınan miktar
    problemQty: int = 0                 # Sorunlu miktar
    problemType: str | None = None      # broken | missing | wrong | other
    problemNote: str | None = None      # Sorun açıklaması


class CreateProductionOrder(BaseModel):
    """Üretim/Tedarik siparişi oluşturma"""
    jobId: str                          # Hangi iş için
    roleId: str                         # Hangi iş kolu
    roleName: str
    orderType: str                      # internal | external | glass
    supplierId: str | None = None       # Tedarikçi (dış sipariş/cam için)
    supplierName: str | None = None
    items: list[OrderLineItem]          # Kalemler
    documentUrl: str | None = None      # Dosya (üretim dosyası veya teklif onayı)
    estimatedDelivery: str | None = None  # Tahmini teslim tarihi
    notes: str | None = None


class RecordDelivery(BaseModel):
    """Teslimat kaydı"""
    deliveries: list[DeliveryItem]
    deliveryDate: str | None = None
    deliveryNote: str | None = None
    documentUrl: str | None = None      # Teslim belgesi


class ResolveIssue(BaseModel):
    """Sorun çözümü"""
    issueId: str
    resolution: str                     # replaced | refunded | credited | cancelled
    resolvedQty: int
    note: str | None = None
    newIssueQty: int = 0                # Zincirleme sorun: değişim de sorunlu geldiyse
    newIssueType: str | None = None
    newIssueNote: str | None = None


# ========== Helpers ==========

def _gen_id(prefix: str) -> str:
    return f"{prefix}-{str(uuid.uuid4())[:8].upper()}"


def _now() -> str:
    return datetime.utcnow().isoformat()


def _find_order(order_id: str):
    """Sipariş bul"""
    orders = load_json("productionOrders.json")
    for idx, order in enumerate(orders):
        if order.get("id") == order_id:
            return orders, idx, order
    raise HTTPException(status_code=404, detail="Sipariş bulunamadı")


def _calc_order_status(order: dict) -> str:
    """Sipariş durumunu hesapla"""
    items = order.get("items", [])
    if not items:
        return "pending"
    
    total_qty = sum(it.get("quantity", 0) for it in items)
    received_qty = sum(it.get("receivedQty", 0) for it in items)
    pending_issues = [iss for iss in order.get("issues", []) if iss.get("status") == "pending"]
    
    if received_qty == 0:
        return "pending"
    elif received_qty < total_qty or pending_issues:
        return "partial"
    else:
        return "completed"


def _is_overdue(order: dict) -> bool:
    """Gecikme kontrolü"""
    est = order.get("estimatedDelivery")
    if not est:
        return False
    try:
        est_date = datetime.fromisoformat(est[:10])
        return datetime.now() > est_date and order.get("status") != "completed"
    except:
        return False


def _save_combination(combination: str):
    """Kombinasyon tipini kaydet (autocomplete için)"""
    settings = load_json("settings.json")
    combinations = settings.get("combinationTypes", [])
    
    # Zaten varsa ekleme
    if any(c.get("name", "").lower() == combination.lower() for c in combinations):
        return
    
    new_comb = {
        "id": _gen_id("COMB"),
        "name": combination,
        "createdAt": _now()
    }
    combinations.append(new_comb)
    settings["combinationTypes"] = combinations
    save_json("settings.json", settings)


# ========== Endpoints ==========

@router.get("/")
def list_orders(
    jobId: str | None = None,
    roleId: str | None = None,
    orderType: str | None = None,
    status: str | None = None,
    supplierId: str | None = None,
    overdue: bool | None = None
):
    """Tüm üretim/tedarik siparişlerini listele"""
    orders = load_json("productionOrders.json")
    
    if jobId:
        orders = [o for o in orders if o.get("jobId") == jobId]
    if roleId:
        orders = [o for o in orders if o.get("roleId") == roleId]
    if orderType:
        orders = [o for o in orders if o.get("orderType") == orderType]
    if status:
        orders = [o for o in orders if o.get("status") == status]
    if supplierId:
        orders = [o for o in orders if o.get("supplierId") == supplierId]
    if overdue is True:
        orders = [o for o in orders if _is_overdue(o)]
    
    # Her sipariş için güncel durum ve gecikme bilgisi ekle
    for order in orders:
        order["isOverdue"] = _is_overdue(order)
        order["calculatedStatus"] = _calc_order_status(order)
    
    return orders


@router.get("/summary")
def get_summary():
    """Özet istatistikler"""
    orders = load_json("productionOrders.json")
    
    pending = [o for o in orders if o.get("status") == "pending"]
    partial = [o for o in orders if o.get("status") == "partial"]
    completed = [o for o in orders if o.get("status") == "completed"]
    overdue = [o for o in orders if _is_overdue(o)]
    
    # Tip bazlı
    internal = [o for o in orders if o.get("orderType") == "internal"]
    external = [o for o in orders if o.get("orderType") == "external"]
    glass = [o for o in orders if o.get("orderType") == "glass"]
    
    # Bekleyen sorunlar
    all_issues = []
    for order in orders:
        for issue in order.get("issues", []):
            if issue.get("status") == "pending":
                all_issues.append({**issue, "orderId": order.get("id"), "jobId": order.get("jobId")})
    
    return {
        "total": len(orders),
        "pending": len(pending),
        "partial": len(partial),
        "completed": len(completed),
        "overdue": len(overdue),
        "byType": {
            "internal": len(internal),
            "external": len(external),
            "glass": len(glass)
        },
        "pendingIssues": len(all_issues),
        "overdueOrders": overdue[:5],  # Son 5 geciken
        "recentIssues": all_issues[:5]  # Son 5 sorun
    }


@router.get("/by-job/{job_id}")
def get_orders_by_job(job_id: str):
    """Bir iş için tüm siparişleri getir"""
    orders = load_json("productionOrders.json")
    job_orders = [o for o in orders if o.get("jobId") == job_id]
    
    # Her sipariş için güncel durum
    for order in job_orders:
        order["isOverdue"] = _is_overdue(order)
        order["calculatedStatus"] = _calc_order_status(order)
    
    # Özet bilgi
    total_items = sum(sum(it.get("quantity", 0) for it in o.get("items", [])) for o in job_orders)
    received_items = sum(sum(it.get("receivedQty", 0) for it in o.get("items", [])) for o in job_orders)
    pending_issues = sum(len([iss for iss in o.get("issues", []) if iss.get("status") == "pending"]) for o in job_orders)
    
    all_completed = all(o.get("status") == "completed" for o in job_orders) if job_orders else False
    
    return {
        "orders": job_orders,
        "summary": {
            "totalOrders": len(job_orders),
            "totalItems": total_items,
            "receivedItems": received_items,
            "pendingIssues": pending_issues,
            "allCompleted": all_completed,
            "readyForAssembly": all_completed and pending_issues == 0
        }
    }


# ========== Static Routes (must be before /{order_id}) ==========

@router.get("/combinations")
def get_combinations():
    """Kayıtlı kombinasyon tiplerini getir (autocomplete için)"""
    settings = load_json("settings.json")
    return settings.get("combinationTypes", [])


@router.get("/alerts")
def get_alerts():
    """Uyarıları getir (gecikme, bekleyen sorunlar)"""
    orders = load_json("productionOrders.json")
    
    alerts = []
    
    # Geciken siparişler
    for order in orders:
        if _is_overdue(order):
            alerts.append({
                "type": "overdue",
                "severity": "high",
                "orderId": order.get("id"),
                "jobId": order.get("jobId"),
                "jobTitle": order.get("jobTitle"),
                "roleName": order.get("roleName"),
                "estimatedDelivery": order.get("estimatedDelivery"),
                "message": f"{order.get('roleName')} siparişi gecikti - {order.get('jobTitle')}"
            })
    
    # Bugün teslim beklenen
    today = datetime.now().strftime("%Y-%m-%d")
    for order in orders:
        est = order.get("estimatedDelivery", "")
        if est[:10] == today and order.get("status") != "completed":
            alerts.append({
                "type": "due_today",
                "severity": "medium",
                "orderId": order.get("id"),
                "jobId": order.get("jobId"),
                "jobTitle": order.get("jobTitle"),
                "roleName": order.get("roleName"),
                "message": f"{order.get('roleName')} siparişi bugün teslim bekleniyor - {order.get('jobTitle')}"
            })
    
    # Bekleyen sorunlar
    for order in orders:
        for issue in order.get("issues", []):
            if issue.get("status") == "pending":
                alerts.append({
                    "type": "pending_issue",
                    "severity": "medium",
                    "orderId": order.get("id"),
                    "jobId": order.get("jobId"),
                    "jobTitle": order.get("jobTitle"),
                    "issueId": issue.get("id"),
                    "issueType": issue.get("type"),
                    "quantity": issue.get("quantity"),
                    "message": f"{issue.get('quantity')} adet sorun bekliyor - {order.get('jobTitle')}"
                })
    
    # Severity'ye göre sırala
    severity_order = {"high": 0, "medium": 1, "low": 2}
    alerts.sort(key=lambda x: severity_order.get(x.get("severity"), 2))
    
    return alerts


# ========== Dynamic Routes ==========

@router.get("/{order_id}")
def get_order(order_id: str):
    """Tek bir sipariş detayı"""
    _, _, order = _find_order(order_id)
    order["isOverdue"] = _is_overdue(order)
    order["calculatedStatus"] = _calc_order_status(order)
    return order


@router.post("/", status_code=201)
def create_order(payload: CreateProductionOrder, authorization: Optional[str] = Header(None)):
    """Yeni sipariş oluştur"""
    user_id, user_name = _get_user_info(authorization)
    orders = load_json("productionOrders.json")
    
    # İş kontrolü
    jobs = load_json("jobs.json")
    job = next((j for j in jobs if j.get("id") == payload.jobId), None)
    if not job:
        raise HTTPException(status_code=404, detail="İş bulunamadı")
    
    # Kalemler hazırla
    items = []
    for item in payload.items:
        items.append({
            "glassType": item.glassType,
            "glassName": item.glassName,
            "quantity": item.quantity,
            "unit": item.unit,
            "combination": item.combination,
            "notes": item.notes,
            "receivedQty": 0,
            "problemQty": 0
        })
    
    new_order = {
        "id": _gen_id("PROD"),
        "jobId": payload.jobId,
        "jobTitle": job.get("title"),
        "customerName": job.get("customerName"),
        "roleId": payload.roleId,
        "roleName": payload.roleName,
        "orderType": payload.orderType,
        "supplierId": payload.supplierId,
        "supplierName": payload.supplierName,
        "items": items,
        "documentUrl": payload.documentUrl,
        "estimatedDelivery": payload.estimatedDelivery,
        "plannedDate": None,  # Takvimde planlanan tarih
        "notes": payload.notes,
        "status": "pending",
        
        # Üretim süreleri
        "productionStartedAt": None,  # Üretime alındı
        "productionCompletedAt": None,  # Üretim tamamlandı
        "firstDeliveryAt": None,  # İlk teslimat tarihi
        
        # Gecikme takibi
        "delays": [],
        "totalDelayDays": 0,
        "isDelayed": False,
        
        "issues": [],
        "deliveryHistory": [],
        "createdAt": _now(),
        "updatedAt": _now()
    }
    
    orders.insert(0, new_order)
    save_json("productionOrders.json", orders)
    
    # Kombinasyon tipini kaydet (autocomplete için)
    for item in payload.items:
        if item.combination:
            _save_combination(item.combination)
    
    # Aktivite log
    order_type_label = {"internal": "İç Üretim", "external": "Dış Sipariş", "glass": "Cam Sipariş"}.get(payload.orderType, payload.orderType)
    log_activity(
        user_id=user_id,
        user_name=user_name,
        action="production_create",
        target_type="production",
        target_id=new_order["id"],
        target_name=f"{new_order['id']} - {payload.roleName}",
        details=f"Üretim siparişi oluşturuldu: {order_type_label} - {payload.roleName}",
        icon=get_action_icon("production_create")
    )
    
    return new_order


class PlanUpdate(BaseModel):
    """Üretim planı güncelleme"""
    plannedDate: str | None = None
    estimatedDelivery: str | None = None


class RescheduleOrder(BaseModel):
    """Sipariş tarih değişikliği - gecikme kontrolü ile"""
    newDate: str
    delayReason: str | None = None  # Tarih ileri alınıyorsa zorunlu
    delayResponsiblePersonId: str | None = None  # Zorunlu
    delayNote: str | None = None


class StartProduction(BaseModel):
    """Üretime başlama"""
    startTime: str | None = None
    note: str | None = None


@router.patch("/{order_id}/plan")
def update_plan(order_id: str, payload: PlanUpdate):
    """Üretim planını güncelle (sürükle-bırak takvim için)"""
    orders, idx, order = _find_order(order_id)
    
    # model_fields_set ile hangi alanların gönderildiğini kontrol et (null olsa bile)
    if "plannedDate" in payload.model_fields_set:
        order["plannedDate"] = payload.plannedDate  # null olsa bile güncelle
    if "estimatedDelivery" in payload.model_fields_set:
        order["estimatedDelivery"] = payload.estimatedDelivery
    
    order["updatedAt"] = _now()
    orders[idx] = order
    save_json("productionOrders.json", orders)
    
    return order


class UpdateProductionDates(BaseModel):
    """Üretim tarihleri ve gecikme kaydı"""
    productionStartedAt: str | None = None
    productionCompletedAt: str | None = None
    delayReason: str | None = None
    delayNote: str | None = None
    responsiblePersonId: str | None = None


@router.patch("/{order_id}/dates")
def update_production_dates(order_id: str, payload: UpdateProductionDates):
    """Üretim tarihlerini güncelle ve gecikme kaydı ekle"""
    orders, idx, order = _find_order(order_id)
    
    if payload.productionStartedAt is not None:
        order["productionStartedAt"] = payload.productionStartedAt
    if payload.productionCompletedAt is not None:
        order["productionCompletedAt"] = payload.productionCompletedAt
    
    # Gecikme kaydı
    if payload.delayReason:
        delays = order.get("delays", [])
        delays.append({
            "id": _gen_id("DLY"),
            "date": _now(),
            "reason": payload.delayReason,
            "note": payload.delayNote,
            "responsiblePersonId": payload.responsiblePersonId
        })
        order["delays"] = delays
    
    order["updatedAt"] = _now()
    orders[idx] = order
    save_json("productionOrders.json", orders)
    
    return order


@router.post("/{order_id}/start")
def start_production(order_id: str, payload: StartProduction):
    """Üretime başla - üretim süresi takibi için"""
    orders, idx, order = _find_order(order_id)
    
    if order.get("productionStartedAt"):
        raise HTTPException(status_code=400, detail="Üretim zaten başlamış")
    
    order["productionStartedAt"] = payload.startTime or _now()
    order["status"] = "in_progress"
    
    if payload.note:
        order["notes"] = f"{order.get('notes', '') or ''}\n[Üretim Başladı] {payload.note}".strip()
    
    order["updatedAt"] = _now()
    orders[idx] = order
    save_json("productionOrders.json", orders)
    
    return order


@router.post("/{order_id}/reschedule")
def reschedule_order(order_id: str, payload: RescheduleOrder):
    """Siparişi yeniden planla - tarih ileri alınıyorsa gecikme zorunlu"""
    orders, idx, order = _find_order(order_id)
    
    old_date = order.get("plannedDate") or order.get("estimatedDelivery")
    new_date = payload.newDate
    
    # Tarih ileri mi alındı?
    is_postponed = False
    delay_days = 0
    
    if old_date and new_date:
        try:
            old_dt = datetime.fromisoformat(old_date[:10])
            new_dt = datetime.fromisoformat(new_date[:10])
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
        
        if "delays" not in order:
            order["delays"] = []
        order["delays"].append(delay_record)
        
        total_delay = sum(d.get("delayDays", 0) for d in order["delays"])
        order["totalDelayDays"] = total_delay
        order["isDelayed"] = True
    
    # Tarihi güncelle
    order["plannedDate"] = new_date
    order["estimatedDelivery"] = new_date
    order["updatedAt"] = _now()
    
    orders[idx] = order
    save_json("productionOrders.json", orders)
    
    return order


@router.put("/{order_id}")
def update_order(order_id: str, payload: CreateProductionOrder):
    """Siparişi güncelle"""
    orders, idx, order = _find_order(order_id)
    
    # Sadece pending durumundayken güncelleme yapılabilir
    if order.get("status") not in ["pending", "partial"]:
        raise HTTPException(status_code=400, detail="Tamamlanan sipariş güncellenemez")
    
    # Kalemler hazırla (mevcut receivedQty'leri koru)
    items = []
    for i, item in enumerate(payload.items):
        existing_received = 0
        if i < len(order.get("items", [])):
            existing_received = order["items"][i].get("receivedQty", 0)
        
        items.append({
            "glassType": item.glassType,
            "glassName": item.glassName,
            "quantity": item.quantity,
            "unit": item.unit,
            "combination": item.combination,
            "notes": item.notes,
            "receivedQty": existing_received,
            "problemQty": 0
        })
    
    order["roleId"] = payload.roleId
    order["roleName"] = payload.roleName
    order["supplierId"] = payload.supplierId
    order["supplierName"] = payload.supplierName
    order["items"] = items
    order["documentUrl"] = payload.documentUrl
    order["estimatedDelivery"] = payload.estimatedDelivery
    order["notes"] = payload.notes
    order["updatedAt"] = _now()
    
    orders[idx] = order
    save_json("productionOrders.json", orders)
    
    return order


@router.post("/{order_id}/delivery")
def record_delivery(order_id: str, payload: RecordDelivery):
    """Teslimat kaydet"""
    orders, idx, order = _find_order(order_id)
    
    delivery_record = {
        "id": _gen_id("DEL"),
        "date": payload.deliveryDate or _now()[:10],
        "note": payload.deliveryNote,
        "documentUrl": payload.documentUrl,
        "items": [],
        "createdAt": _now()
    }
    
    for delivery in payload.deliveries:
        line_idx = delivery.lineIndex
        if line_idx >= len(order["items"]):
            continue
        
        item = order["items"][line_idx]
        
        # Teslim miktarını güncelle
        item["receivedQty"] = item.get("receivedQty", 0) + delivery.receivedQty
        
        # Sorun varsa kaydet
        if delivery.problemQty > 0 and delivery.problemType:
            item["problemQty"] = item.get("problemQty", 0) + delivery.problemQty
            
            issue = {
                "id": _gen_id("ISS"),
                "lineIndex": line_idx,
                "type": delivery.problemType,
                "quantity": delivery.problemQty,
                "note": delivery.problemNote,
                "status": "pending",
                "createdAt": _now(),
                "history": []
            }
            order["issues"].append(issue)
        
        delivery_record["items"].append({
            "lineIndex": line_idx,
            "receivedQty": delivery.receivedQty,
            "problemQty": delivery.problemQty,
            "problemType": delivery.problemType,
            "problemNote": delivery.problemNote
        })
        
        order["items"][line_idx] = item
    
    order["deliveryHistory"].append(delivery_record)
    
    # İlk teslimat tarihini kaydet
    if not order.get("firstDeliveryAt"):
        order["firstDeliveryAt"] = delivery_record["date"]
    
    # Üretim tamamlandı mı kontrol et
    new_status = _calc_order_status(order)
    order["status"] = new_status
    
    if new_status == "completed" and not order.get("productionCompletedAt"):
        order["productionCompletedAt"] = _now()
    
    order["updatedAt"] = _now()
    
    orders[idx] = order
    save_json("productionOrders.json", orders)
    
    return order


@router.post("/{order_id}/issues/{issue_id}/resolve")
def resolve_issue(order_id: str, issue_id: str, payload: ResolveIssue):
    """Sorunu çöz (zincirleme sorun desteği)"""
    orders, idx, order = _find_order(order_id)
    
    # Sorunu bul
    issue = next((iss for iss in order.get("issues", []) if iss.get("id") == issue_id), None)
    if not issue:
        raise HTTPException(status_code=404, detail="Sorun bulunamadı")
    
    # Çözüm geçmişine ekle
    resolution_record = {
        "date": _now(),
        "resolution": payload.resolution,
        "resolvedQty": payload.resolvedQty,
        "note": payload.note
    }
    issue["history"].append(resolution_record)
    
    # Zincirleme sorun kontrolü
    if payload.newIssueQty > 0 and payload.newIssueType:
        # Değişim de sorunlu geldiyse yeni sorun oluştur
        new_issue = {
            "id": _gen_id("ISS"),
            "lineIndex": issue.get("lineIndex"),
            "type": payload.newIssueType,
            "quantity": payload.newIssueQty,
            "note": payload.newIssueNote,
            "status": "pending",
            "createdAt": _now(),
            "parentIssueId": issue_id,  # Zincirleme bağlantı
            "history": []
        }
        order["issues"].append(new_issue)
        
        # Orijinal sorun kısmen çözüldü
        remaining = payload.resolvedQty - payload.newIssueQty
        if remaining >= issue.get("quantity", 0):
            issue["status"] = "resolved"
        else:
            issue["status"] = "partial"
    else:
        # Tam çözüm
        if payload.resolvedQty >= issue.get("quantity", 0):
            issue["status"] = "resolved"
        else:
            issue["status"] = "partial"
    
    # Item'a eklenen miktarı güncelle (değişim geldi)
    if payload.resolution in ["replaced", "credited"]:
        line_idx = issue.get("lineIndex", 0)
        if line_idx < len(order["items"]):
            # Değişim geldi, effective received arttır
            order["items"][line_idx]["receivedQty"] = order["items"][line_idx].get("receivedQty", 0) + payload.resolvedQty - payload.newIssueQty
    
    order["status"] = _calc_order_status(order)
    order["updatedAt"] = _now()
    
    orders[idx] = order
    save_json("productionOrders.json", orders)
    
    return order


@router.delete("/{order_id}")
def delete_order(order_id: str):
    """Siparişi sil (sadece pending durumda)"""
    orders, idx, order = _find_order(order_id)
    
    if order.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Sadece bekleyen siparişler silinebilir")
    
    orders.pop(idx)
    save_json("productionOrders.json", orders)
    
    return {"success": True, "id": order_id}
