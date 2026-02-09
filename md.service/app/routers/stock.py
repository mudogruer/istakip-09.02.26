import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query, Header
from pydantic import BaseModel
from typing import Optional

from ..data_loader import load_json, save_json
from ..activity_logger import log_activity, get_action_icon

router = APIRouter(prefix="/stock", tags=["stock"])


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


class StockItemIn(BaseModel):
    productCode: str
    colorCode: str
    name: str
    colorName: str | None = None
    unit: str
    supplierId: str
    supplierName: str | None = None
    onHand: float = 0
    reserved: float = 0
    critical: float = 0
    unitCost: float | None = None
    notes: str | None = None


class StockItemUpdate(BaseModel):
    productCode: str | None = None
    colorCode: str | None = None
    name: str | None = None
    colorName: str | None = None
    unit: str | None = None
    supplierId: str | None = None
    supplierName: str | None = None
    onHand: float | None = None
    reserved: float | None = None
    critical: float | None = None
    unitCost: float | None = None
    notes: str | None = None


class MovementIn(BaseModel):
    itemId: str
    qty: float
    type: str  # stockIn, stockOut, reserve, release
    reason: str | None = None
    operator: str | None = None
    reference: str | None = None
    jobId: str | None = None


class BulkReservation(BaseModel):
    jobId: str
    items: list  # [{itemId, qty}]
    reserveType: str = "reserve"  # reserve | consume (stoktan düş)
    note: str | None = None


@router.get("/items")
def list_items(
    productCode: str | None = None,
    colorCode: str | None = None,
    supplierId: str | None = None,
    critical_only: bool = False
):
    """Stok kalemlerini listele, opsiyonel filtrelerle"""
    items = load_json("stockItems.json")
    
    if productCode:
        items = [i for i in items if i.get("productCode", "").startswith(productCode)]
    if colorCode:
        items = [i for i in items if i.get("colorCode", "").startswith(colorCode)]
    if supplierId:
        items = [i for i in items if i.get("supplierId") == supplierId]
    if critical_only:
        items = [i for i in items if (i.get("onHand", 0) - i.get("reserved", 0)) <= i.get("critical", 0)]
    
    return items


@router.get("/items/search")
def search_items(
    q: str = Query(None, description="Ürün kodu veya adı ile arama"),
    productCode: str = Query(None, description="Ürün kodu ile filtrele"),
    colorCode: str = Query(None, description="Renk kodu ile filtrele")
):
    """Ürün arama - klavye odaklı stok girişi için"""
    items = load_json("stockItems.json")
    
    if q:
        q_lower = q.lower()
        items = [i for i in items if 
                 q_lower in i.get("productCode", "").lower() or
                 q_lower in i.get("name", "").lower() or
                 q_lower in i.get("colorName", "").lower()]
    
    if productCode:
        items = [i for i in items if i.get("productCode", "").startswith(productCode)]
    
    if colorCode:
        items = [i for i in items if i.get("colorCode", "").startswith(colorCode)]
    
    # Her ürün için kullanılabilir stok hesapla
    for item in items:
        item["available"] = (item.get("onHand", 0) or 0) - (item.get("reserved", 0) or 0)
        item["isCritical"] = item["available"] <= (item.get("critical", 0) or 0)
    
    return items


@router.get("/items/{item_id}")
def get_item(item_id: str):
    """Tek bir stok kalemini getir"""
    items = load_json("stockItems.json")
    for item in items:
        if item.get("id") == item_id:
            item["available"] = (item.get("onHand", 0) or 0) - (item.get("reserved", 0) or 0)
            item["isCritical"] = item["available"] <= (item.get("critical", 0) or 0)
            return item
    raise HTTPException(status_code=404, detail="Stok kalemi bulunamadı")


@router.get("/items/by-code/{product_code}/{color_code}")
def get_item_by_code(product_code: str, color_code: str):
    """Ürün kodu ve renk kodu ile stok kalemini getir"""
    items = load_json("stockItems.json")
    for item in items:
        if item.get("productCode") == product_code and item.get("colorCode") == color_code:
            item["available"] = (item.get("onHand", 0) or 0) - (item.get("reserved", 0) or 0)
            item["isCritical"] = item["available"] <= (item.get("critical", 0) or 0)
            return item
    raise HTTPException(status_code=404, detail="Stok kalemi bulunamadı")


@router.post("/items", status_code=201)
def create_item(payload: StockItemIn, authorization: Optional[str] = Header(None)):
    """Yeni stok kalemi oluştur"""
    user_id, user_name = _get_user_info(authorization)
    items = load_json("stockItems.json")
    
    # Aynı ürün kodu + renk kodu kontrolü
    for item in items:
        if item.get("productCode") == payload.productCode and item.get("colorCode") == payload.colorCode:
            raise HTTPException(status_code=400, detail="Bu ürün kodu ve renk kodu kombinasyonu zaten mevcut")
    
    new_id = f"STK-{str(uuid.uuid4())[:8].upper()}"
    new_item = {
        "id": new_id,
        **payload.model_dump(),
        "lastUpdated": datetime.utcnow().isoformat()[:10]
    }
    
    items.insert(0, new_item)
    save_json("stockItems.json", items)
    
    # Aktivite log
    log_activity(
        user_id=user_id,
        user_name=user_name,
        action="stock_create",
        target_type="stock",
        target_id=new_id,
        target_name=f"{payload.productCode} - {payload.name}",
        details=f"Yeni stok kalemi: {payload.productCode} {payload.colorCode} - {payload.name}",
        icon=get_action_icon("stock_create")
    )
    
    return new_item


@router.put("/items/{item_id}")
def update_item(item_id: str, payload: StockItemUpdate):
    """Stok kalemini güncelle"""
    items = load_json("stockItems.json")
    for idx, item in enumerate(items):
        if item.get("id") == item_id:
            update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
            updated = {**item, **update_data}
            updated["lastUpdated"] = datetime.utcnow().isoformat()[:10]
            items[idx] = updated
            save_json("stockItems.json", items)
            return updated
    raise HTTPException(status_code=404, detail="Stok kalemi bulunamadı")


@router.delete("/items/{item_id}")
def delete_item(item_id: str):
    """Stok kalemini sil"""
    items = load_json("stockItems.json")
    items = [i for i in items if i.get("id") != item_id]
    save_json("stockItems.json", items)
    return {"success": True, "id": item_id}


@router.get("/movements")
def list_movements(
    itemId: str | None = None,
    jobId: str | None = None,
    limit: int = 100
):
    """Stok hareketlerini listele"""
    movements = load_json("stockMovements.json")
    
    if itemId:
        movements = [m for m in movements if m.get("itemId") == itemId]
    if jobId:
        movements = [m for m in movements if m.get("jobId") == jobId]
    
    return movements[:limit]


@router.post("/movements", status_code=201)
def create_movement(payload: MovementIn, authorization: Optional[str] = Header(None)):
    """Stok hareketi oluştur"""
    user_id, user_name = _get_user_info(authorization)
    items = load_json("stockItems.json")
    movements = load_json("stockMovements.json")
    
    # Find item
    target = None
    target_idx = -1
    for idx, item in enumerate(items):
        if item.get("id") == payload.itemId:
            target = item
            target_idx = idx
            break
    
    if not target:
        raise HTTPException(status_code=404, detail="Stok kalemi bulunamadı")
    
    qty = payload.qty
    
    # Apply movement
    if payload.type == "stockIn":
        target["onHand"] = (target.get("onHand") or 0) + qty
    elif payload.type == "stockOut":
        available = (target.get("onHand") or 0) - (target.get("reserved") or 0)
        if qty > available:
            raise HTTPException(status_code=400, detail=f"Yetersiz stok. Kullanılabilir: {available}")
        target["onHand"] = max(0, (target.get("onHand") or 0) - qty)
    elif payload.type == "reserve":
        available = (target.get("onHand") or 0) - (target.get("reserved") or 0)
        if qty > available:
            raise HTTPException(status_code=400, detail=f"Yetersiz stok. Kullanılabilir: {available}")
        target["reserved"] = (target.get("reserved") or 0) + qty
    elif payload.type == "release":
        target["reserved"] = max(0, (target.get("reserved") or 0) - qty)
    elif payload.type == "consume":
        # Rezervasyonu kaldır ve stoktan düş (üretime alındığında)
        target["reserved"] = max(0, (target.get("reserved") or 0) - qty)
        target["onHand"] = max(0, (target.get("onHand") or 0) - qty)
    
    target["lastUpdated"] = datetime.utcnow().isoformat()[:10]
    items[target_idx] = target
    
    # Create movement record
    change = qty if payload.type in ("stockIn",) else -qty
    if payload.type == "reserve":
        change = qty  # Rezervasyon pozitif gösterilir
    elif payload.type == "release":
        change = -qty
    
    movement = {
        "id": f"MOV-{str(uuid.uuid4())[:8].upper()}",
        "date": datetime.utcnow().isoformat()[:10],
        "item": target.get("name"),
        "itemId": payload.itemId,
        "productCode": target.get("productCode"),
        "colorCode": target.get("colorCode"),
        "change": change,
        "type": payload.type,
        "reason": payload.reason or payload.type,
        "operator": payload.operator or "Sistem",
        "reference": payload.reference,
        "jobId": payload.jobId,
    }
    
    movements.insert(0, movement)
    
    save_json("stockItems.json", items)
    save_json("stockMovements.json", movements)
    
    # Aktivite log
    type_labels = {"stockIn": "Stok Girişi", "stockOut": "Stok Çıkışı", "reserve": "Rezervasyon", "release": "Rezervasyon İptal", "consume": "Tüketim"}
    log_activity(
        user_id=user_id,
        user_name=user_name,
        action="stock_movement",
        target_type="stock",
        target_id=payload.itemId,
        target_name=target.get("name"),
        details=f"{type_labels.get(payload.type, payload.type)}: {qty} {target.get('unit', 'adet')} - {target.get('productCode')}",
        icon=get_action_icon("stock_movement"),
        extra_data={"movementId": movement["id"], "type": payload.type, "qty": qty}
    )
    
    return {"item": target, "movement": movement}


@router.post("/bulk-reserve", status_code=201)
def bulk_reserve(payload: BulkReservation):
    """Toplu rezervasyon veya stoktan düşme (iş için)"""
    items = load_json("stockItems.json")
    movements = load_json("stockMovements.json")
    reservations = load_json("reservations.json")
    
    results = []
    errors = []
    
    for line in payload.items:
        item_id = line.get("itemId")
        qty = line.get("qty", 0)
        
        # Find item
        target = None
        target_idx = -1
        for idx, item in enumerate(items):
            if item.get("id") == item_id:
                target = item
                target_idx = idx
                break
        
        if not target:
            errors.append({"itemId": item_id, "error": "Stok kalemi bulunamadı"})
            continue
        
        available = (target.get("onHand") or 0) - (target.get("reserved") or 0)
        
        if payload.reserveType == "consume":
            # Direkt stoktan düş (üretime al)
            if qty > (target.get("onHand") or 0):
                errors.append({
                    "itemId": item_id,
                    "name": target.get("name"),
                    "error": f"Yetersiz stok. Mevcut: {target.get('onHand')}, İstenen: {qty}"
                })
                continue
            
            # Stoktan düş
            old_on_hand = target.get("onHand") or 0
            old_reserved = target.get("reserved") or 0
            target["onHand"] = max(0, old_on_hand - qty)
            
            # Eğer düşülen miktar, başka işlerin rezervasyonunu etkiliyor ise
            # reserved değerini de ayarla (available negatif olamaz)
            new_available = target["onHand"] - old_reserved
            affected_reservations = []
            if new_available < 0:
                # Başka işlerin rezervasyonları etkilendi
                affected_amount = abs(new_available)
                target["reserved"] = max(0, old_reserved - affected_amount)
                
                # Etkilenen rezervasyonları bul ve güncelle
                for rsv in reservations:
                    if rsv.get("itemId") == item_id and rsv.get("status") == "Beklemede" and rsv.get("jobId") != payload.jobId:
                        if affected_amount <= 0:
                            break
                        rsv_qty = rsv.get("qty", 0)
                        reduce_by = min(rsv_qty, affected_amount)
                        rsv["qty"] = rsv_qty - reduce_by
                        rsv["affectedBy"] = payload.jobId
                        rsv["note"] = f"Stok başka iş için kullanıldı (-{reduce_by})"
                        affected_amount -= reduce_by
                        if rsv["qty"] <= 0:
                            rsv["status"] = "İptal"
                        affected_reservations.append({
                            "reservationId": rsv.get("id"),
                            "jobId": rsv.get("jobId"),
                            "reducedBy": reduce_by
                        })
            
            movement_type = "stockOut"
            reason = f"Üretime alındı - {payload.jobId}"
            if affected_reservations:
                reason += f" (⚠️ {len(affected_reservations)} iş etkilendi)"
        else:
            # Rezerve et
            affected_reservations = []  # Reserve işleminde etkilenen rezervasyon yok
            if qty > available:
                errors.append({
                    "itemId": item_id,
                    "name": target.get("name"),
                    "error": f"Yetersiz kullanılabilir stok. Kullanılabilir: {available}, İstenen: {qty}",
                    "shortage": qty - available
                })
                continue
            
            target["reserved"] = (target.get("reserved") or 0) + qty
            movement_type = "reserve"
            reason = f"Rezerve edildi - {payload.jobId}"
            
            # Rezervasyon kaydı
            reservations.insert(0, {
                "id": f"RSV-{str(uuid.uuid4())[:8].upper()}",
                "jobId": payload.jobId,
                "itemId": item_id,
                "productCode": target.get("productCode"),
                "colorCode": target.get("colorCode"),
                "item": target.get("name"),
                "qty": qty,
                "unit": target.get("unit"),
                "createdAt": datetime.utcnow().isoformat(),
                "status": "Beklemede"
            })
        
        target["lastUpdated"] = datetime.utcnow().isoformat()[:10]
        items[target_idx] = target
        
        # Movement record
        movements.insert(0, {
            "id": f"MOV-{str(uuid.uuid4())[:8].upper()}",
            "date": datetime.utcnow().isoformat()[:10],
            "item": target.get("name"),
            "itemId": item_id,
            "productCode": target.get("productCode"),
            "colorCode": target.get("colorCode"),
            "change": -qty if movement_type == "stockOut" else qty,
            "type": movement_type,
            "reason": reason,
            "operator": "Sistem",
            "jobId": payload.jobId,
        })
        
        result_item = {
            "itemId": item_id,
            "name": target.get("name"),
            "qty": qty,
            "newOnHand": target.get("onHand"),
            "newReserved": target.get("reserved"),
            "available": target.get("onHand", 0) - target.get("reserved", 0)
        }
        if payload.reserveType == "consume" and affected_reservations:
            result_item["affectedReservations"] = affected_reservations
        results.append(result_item)
    
    save_json("stockItems.json", items)
    save_json("stockMovements.json", movements)
    save_json("reservations.json", reservations)
    
    return {
        "success": len(errors) == 0,
        "results": results,
        "errors": errors,
        "jobId": payload.jobId
    }


@router.get("/reservations")
def list_reservations(jobId: str | None = None, status: str | None = None):
    """Rezervasyonları listele"""
    reservations = load_json("reservations.json")
    
    if jobId:
        reservations = [r for r in reservations if r.get("jobId") == jobId]
    if status:
        reservations = [r for r in reservations if r.get("status") == status]
    
    return reservations


@router.put("/reservations/{reservation_id}/release")
def release_reservation(reservation_id: str):
    """Rezervasyonu serbest bırak"""
    reservations = load_json("reservations.json")
    items = load_json("stockItems.json")
    movements = load_json("stockMovements.json")
    
    target_res = None
    target_idx = -1
    for idx, res in enumerate(reservations):
        if res.get("id") == reservation_id:
            target_res = res
            target_idx = idx
            break
    
    if not target_res:
        raise HTTPException(status_code=404, detail="Rezervasyon bulunamadı")
    
    # Find item and release
    for idx, item in enumerate(items):
        if item.get("id") == target_res.get("itemId"):
            item["reserved"] = max(0, (item.get("reserved") or 0) - target_res.get("qty", 0))
            item["lastUpdated"] = datetime.utcnow().isoformat()[:10]
            items[idx] = item
            
            # Movement record
            movements.insert(0, {
                "id": f"MOV-{str(uuid.uuid4())[:8].upper()}",
                "date": datetime.utcnow().isoformat()[:10],
                "item": item.get("name"),
                "itemId": item.get("id"),
                "productCode": item.get("productCode"),
                "colorCode": item.get("colorCode"),
                "change": -target_res.get("qty", 0),
                "type": "release",
                "reason": f"Rezervasyon iptal - {target_res.get('jobId')}",
                "operator": "Sistem",
                "jobId": target_res.get("jobId"),
            })
            break
    
    # Update reservation status
    target_res["status"] = "İptal"
    target_res["releasedAt"] = datetime.utcnow().isoformat()
    reservations[target_idx] = target_res
    
    save_json("stockItems.json", items)
    save_json("stockMovements.json", movements)
    save_json("reservations.json", reservations)
    
    return {"success": True, "reservation": target_res}


@router.get("/critical")
def get_critical_items():
    """Kritik seviyedeki stok kalemlerini getir"""
    items = load_json("stockItems.json")
    critical = []
    
    for item in items:
        available = (item.get("onHand") or 0) - (item.get("reserved") or 0)
        if available <= (item.get("critical") or 0):
            item["available"] = available
            item["shortage"] = (item.get("critical") or 0) - available
            critical.append(item)
    
    return critical


@router.get("/availability-check")
def check_availability(items: str):
    """Birden fazla ürün için stok yeterliliği kontrolü
    items format: itemId:qty,itemId:qty,...
    """
    stock_items = load_json("stockItems.json")
    
    results = []
    total_shortage = False
    
    for item_str in items.split(","):
        if ":" not in item_str:
            continue
        item_id, qty_str = item_str.split(":")
        qty = float(qty_str)
        
        target = None
        for si in stock_items:
            if si.get("id") == item_id:
                target = si
                break
        
        if not target:
            results.append({
                "itemId": item_id,
                "error": "Bulunamadı",
                "available": False
            })
            total_shortage = True
            continue
        
        available = (target.get("onHand") or 0) - (target.get("reserved") or 0)
        is_enough = available >= qty
        
        if not is_enough:
            total_shortage = True
        
        results.append({
            "itemId": item_id,
            "name": target.get("name"),
            "productCode": target.get("productCode"),
            "colorCode": target.get("colorCode"),
            "requested": qty,
            "available": available,
            "isEnough": is_enough,
            "shortage": max(0, qty - available) if not is_enough else 0
        })
    
    return {
        "allAvailable": not total_shortage,
        "items": results
    }
