import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query, Header
from pydantic import BaseModel
from typing import Optional

from ..data_loader import load_json, save_json
from ..activity_logger import log_activity, get_action_icon

router = APIRouter(prefix="/purchase", tags=["purchase"])


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


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _today() -> str:
    return datetime.utcnow().isoformat()[:10]


class POItemIn(BaseModel):
    productCode: str
    colorCode: str
    productName: str
    quantity: float
    unit: str
    unitCost: float | None = None


class POCreate(BaseModel):
    supplierId: str
    supplierName: str
    items: list[POItemIn]
    notes: str | None = None
    expectedDate: str | None = None
    relatedJobs: list[str] = []


class POAddItems(BaseModel):
    items: list[POItemIn]
    relatedJobs: list[str] = []


class PODelivery(BaseModel):
    items: list  # [{productCode, colorCode, quantity}]
    note: str | None = None
    receivedBy: str | None = None


class SupplierIn(BaseModel):
    name: str
    type: str = "manufacturer"  # manufacturer | dealer
    category: str | None = None
    contact: dict | None = None
    leadTimeDays: int | None = None
    notes: str | None = None


class SupplierUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    category: str | None = None
    contact: dict | None = None
    leadTimeDays: int | None = None
    notes: str | None = None
    rating: float | None = None


# ==================== ORDERS ====================

@router.get("/orders")
def list_orders(
    status: str | None = None,
    supplierId: str | None = None,
    has_pending: bool = False
):
    """Satın alma siparişlerini listele"""
    orders = load_json("purchaseOrders.json")
    
    if status:
        orders = [o for o in orders if o.get("status") == status]
    if supplierId:
        orders = [o for o in orders if o.get("supplierId") == supplierId]
    if has_pending:
        # Teslim edilmemiş ürünü olan siparişler
        orders = [o for o in orders if o.get("status") in ("draft", "sent", "partial")]
    
    return orders


@router.get("/orders/{order_id}")
def get_order(order_id: str):
    """Sipariş detayını getir"""
    orders = load_json("purchaseOrders.json")
    for order in orders:
        if order.get("id") == order_id:
            return order
    raise HTTPException(status_code=404, detail="Sipariş bulunamadı")


@router.post("/orders", status_code=201)
def create_order(payload: POCreate, authorization: Optional[str] = Header(None)):
    """Yeni satın alma siparişi oluştur"""
    user_id, user_name = _get_user_info(authorization)
    orders = load_json("purchaseOrders.json")
    
    # Sipariş numarası: PO-YYMMDD-XXX
    today = _today().replace("-", "")[2:]  # YYMMDD
    existing_today = [o for o in orders if o.get("id", "").startswith(f"PO-{today}")]
    order_num = len(existing_today) + 1
    new_id = f"PO-{today}-{order_num:03d}"
    
    # Kalem ID'leri ve toplam hesapla
    items = []
    total_amount = 0
    for idx, item in enumerate(payload.items):
        item_data = item.model_dump()
        item_data["id"] = f"POI-{str(uuid.uuid4())[:8].upper()}"
        item_data["receivedQty"] = 0
        if item_data.get("unitCost"):
            item_data["totalCost"] = item_data["quantity"] * item_data["unitCost"]
            total_amount += item_data["totalCost"]
        items.append(item_data)
    
    new_order = {
        "id": new_id,
        "supplierId": payload.supplierId,
        "supplierName": payload.supplierName,
        "status": "draft",
        "createdAt": _now_iso(),
        "sentAt": None,
        "expectedDate": payload.expectedDate,
        "completedAt": None,
        "items": items,
        "deliveries": [],
        "totalAmount": total_amount,
        "notes": payload.notes,
        "createdBy": user_name,
        "relatedJobs": payload.relatedJobs or []
    }
    
    orders.insert(0, new_order)
    save_json("purchaseOrders.json", orders)
    
    # Aktivite log
    log_activity(
        user_id=user_id,
        user_name=user_name,
        action="purchase_create",
        target_type="purchase",
        target_id=new_id,
        target_name=f"{new_id} - {payload.supplierName}",
        details=f"Satın alma siparişi oluşturuldu: {payload.supplierName} ({len(items)} kalem)",
        icon=get_action_icon("purchase_create")
    )
    
    return new_order


@router.post("/orders/{order_id}/items")
def add_items_to_order(order_id: str, payload: POAddItems):
    """Mevcut taslak siparişe ürün ekle"""
    orders = load_json("purchaseOrders.json")
    
    for idx, order in enumerate(orders):
        if order.get("id") == order_id:
            if order.get("status") != "draft":
                raise HTTPException(status_code=400, detail="Sadece taslak siparişlere ürün eklenebilir")
            
            # Mevcut ürünleri al
            existing_items = order.get("items", [])
            total_amount = order.get("totalAmount", 0)
            
            for item in payload.items:
                item_data = item.model_dump()
                # Aynı ürün varsa miktarı artır
                found = False
                for ei in existing_items:
                    if ei.get("productCode") == item_data["productCode"] and ei.get("colorCode") == item_data["colorCode"]:
                        ei["quantity"] += item_data["quantity"]
                        if ei.get("unitCost"):
                            ei["totalCost"] = ei["quantity"] * ei["unitCost"]
                            # Total'ı yeniden hesapla
                        found = True
                        break
                
                if not found:
                    item_data["id"] = f"POI-{str(uuid.uuid4())[:8].upper()}"
                    item_data["receivedQty"] = 0
                    if item_data.get("unitCost"):
                        item_data["totalCost"] = item_data["quantity"] * item_data["unitCost"]
                    existing_items.append(item_data)
            
            # Total'ı yeniden hesapla
            total_amount = sum(i.get("totalCost", 0) for i in existing_items)
            
            order["items"] = existing_items
            order["totalAmount"] = total_amount
            order["relatedJobs"] = list(set(order.get("relatedJobs", []) + payload.relatedJobs))
            
            orders[idx] = order
            save_json("purchaseOrders.json", orders)
            return order
    
    raise HTTPException(status_code=404, detail="Sipariş bulunamadı")


@router.put("/orders/{order_id}/send")
def send_order(order_id: str, expectedDate: str | None = None):
    """Siparişi gönder (taslak -> gönderildi)"""
    orders = load_json("purchaseOrders.json")
    
    for idx, order in enumerate(orders):
        if order.get("id") == order_id:
            if order.get("status") != "draft":
                raise HTTPException(status_code=400, detail="Sadece taslak siparişler gönderilebilir")
            
            order["status"] = "sent"
            order["sentAt"] = _now_iso()
            if expectedDate:
                order["expectedDate"] = expectedDate
            
            orders[idx] = order
            save_json("purchaseOrders.json", orders)
            return order
    
    raise HTTPException(status_code=404, detail="Sipariş bulunamadı")


@router.post("/orders/{order_id}/receive")
def receive_delivery(order_id: str, payload: PODelivery, authorization: Optional[str] = Header(None)):
    """Kısmi veya tam teslimat kaydet"""
    user_id, user_name = _get_user_info(authorization)
    orders = load_json("purchaseOrders.json")
    stock_items = load_json("stockItems.json")
    stock_movements = load_json("stockMovements.json")
    
    for idx, order in enumerate(orders):
        if order.get("id") == order_id:
            if order.get("status") not in ("sent", "partial"):
                raise HTTPException(status_code=400, detail="Bu sipariş teslim alınamaz")
            
            # Teslimat kaydı oluştur
            delivery = {
                "id": f"DEL-{str(uuid.uuid4())[:8].upper()}",
                "date": _today(),
                "items": payload.items,
                "note": payload.note,
                "receivedBy": payload.receivedBy or "Sistem"
            }
            
            all_complete = True
            
            for recv_item in payload.items:
                prod_code = recv_item.get("productCode")
                color_code = recv_item.get("colorCode")
                qty = recv_item.get("quantity", 0)
                
                # Sipariş kalemini bul ve güncelle
                for poi in order.get("items", []):
                    if poi.get("productCode") == prod_code and poi.get("colorCode") == color_code:
                        poi["receivedQty"] = (poi.get("receivedQty") or 0) + qty
                        
                        if poi["receivedQty"] < poi["quantity"]:
                            all_complete = False
                        break
                
                # Stoku güncelle
                for sidx, si in enumerate(stock_items):
                    if si.get("productCode") == prod_code and si.get("colorCode") == color_code:
                        si["onHand"] = (si.get("onHand") or 0) + qty
                        si["lastUpdated"] = _today()
                        stock_items[sidx] = si
                        
                        # Hareket kaydı
                        stock_movements.insert(0, {
                            "id": f"MOV-{str(uuid.uuid4())[:8].upper()}",
                            "date": _today(),
                            "item": si.get("name"),
                            "itemId": si.get("id"),
                            "productCode": prod_code,
                            "colorCode": color_code,
                            "change": qty,
                            "type": "stockIn",
                            "reason": f"Sipariş teslimi - {order_id}",
                            "operator": payload.receivedBy or "Sistem",
                            "reference": order_id
                        })
                        break
            
            # Tüm kalemler tamamlandı mı kontrol et
            for poi in order.get("items", []):
                if (poi.get("receivedQty") or 0) < poi.get("quantity", 0):
                    all_complete = False
                    break
            
            order["deliveries"].append(delivery)
            
            if all_complete:
                order["status"] = "delivered"
                order["completedAt"] = _now_iso()
            else:
                order["status"] = "partial"
            
            orders[idx] = order
            save_json("purchaseOrders.json", orders)
            save_json("stockItems.json", stock_items)
            save_json("stockMovements.json", stock_movements)
            
            # Aktivite log
            status_label = "Tamamlandı" if all_complete else "Kısmi Teslimat"
            log_activity(
                user_id=user_id,
                user_name=user_name,
                action="purchase_receive",
                target_type="purchase",
                target_id=order_id,
                target_name=f"{order_id} - {order.get('supplierName', '')}",
                details=f"Teslimat kaydedildi ({status_label}): {len(payload.items)} kalem",
                icon=get_action_icon("purchase_receive")
            )
            
            return order
    
    raise HTTPException(status_code=404, detail="Sipariş bulunamadı")


@router.delete("/orders/{order_id}")
def delete_order(order_id: str):
    """Taslak siparişi sil"""
    orders = load_json("purchaseOrders.json")
    
    for order in orders:
        if order.get("id") == order_id:
            if order.get("status") != "draft":
                raise HTTPException(status_code=400, detail="Sadece taslak siparişler silinebilir")
            break
    
    orders = [o for o in orders if o.get("id") != order_id]
    save_json("purchaseOrders.json", orders)
    return {"success": True, "id": order_id}


@router.get("/missing-items")
def get_missing_items():
    """Eksik ürün listesi - sipariş edilmesi gerekenler"""
    stock_items = load_json("stockItems.json")
    orders = load_json("purchaseOrders.json")
    
    # Bekleyen siparişlerdeki ürünleri topla
    pending_orders = {}
    for order in orders:
        if order.get("status") in ("draft", "sent", "partial"):
            for item in order.get("items", []):
                key = f"{item.get('productCode')}_{item.get('colorCode')}"
                pending = item.get("quantity", 0) - (item.get("receivedQty") or 0)
                if pending > 0:
                    if key not in pending_orders:
                        pending_orders[key] = 0
                    pending_orders[key] += pending
    
    missing = []
    
    for item in stock_items:
        available = (item.get("onHand") or 0) - (item.get("reserved") or 0)
        critical = item.get("critical") or 0
        
        if available <= critical:
            shortage = critical - available + 10  # Kritik seviyenin 10 üstünü öner
            key = f"{item.get('productCode')}_{item.get('colorCode')}"
            pending = pending_orders.get(key, 0)
            
            missing.append({
                "itemId": item.get("id"),
                "productCode": item.get("productCode"),
                "colorCode": item.get("colorCode"),
                "name": item.get("name"),
                "colorName": item.get("colorName"),
                "unit": item.get("unit"),
                "supplierId": item.get("supplierId"),
                "supplierName": item.get("supplierName"),
                "onHand": item.get("onHand"),
                "reserved": item.get("reserved"),
                "available": available,
                "critical": critical,
                "suggestedQty": shortage,
                "pendingInOrders": pending
            })
    
    return missing


@router.get("/pending-items")
def get_pending_items():
    """Bekleyen sipariş kalemleri - tedarikçi takibi için"""
    orders = load_json("purchaseOrders.json")
    
    pending = []
    
    for order in orders:
        if order.get("status") in ("sent", "partial"):
            for item in order.get("items", []):
                remaining = item.get("quantity", 0) - (item.get("receivedQty") or 0)
                if remaining > 0:
                    pending.append({
                        "orderId": order.get("id"),
                        "supplierId": order.get("supplierId"),
                        "supplierName": order.get("supplierName"),
                        "expectedDate": order.get("expectedDate"),
                        "productCode": item.get("productCode"),
                        "colorCode": item.get("colorCode"),
                        "productName": item.get("productName"),
                        "ordered": item.get("quantity"),
                        "received": item.get("receivedQty") or 0,
                        "remaining": remaining,
                        "unit": item.get("unit")
                    })
    
    return pending


# ==================== SUPPLIERS ====================

@router.get("/suppliers")
def list_suppliers(type: str | None = None):
    """Tedarikçileri listele"""
    suppliers = load_json("suppliers.json")
    
    if type:
        suppliers = [s for s in suppliers if s.get("type") == type]
    
    return suppliers


@router.get("/suppliers/{supplier_id}")
def get_supplier(supplier_id: str):
    """Tedarikçi detayını getir"""
    suppliers = load_json("suppliers.json")
    for supplier in suppliers:
        if supplier.get("id") == supplier_id:
            return supplier
    raise HTTPException(status_code=404, detail="Tedarikçi bulunamadı")


@router.post("/suppliers", status_code=201)
def create_supplier(payload: SupplierIn):
    """Yeni tedarikçi oluştur"""
    suppliers = load_json("suppliers.json")
    
    new_id = f"SUP-{str(uuid.uuid4())[:8].upper()}"
    new_supplier = {
        "id": new_id,
        **payload.model_dump(),
        "rating": 0,
        "createdAt": _now_iso()
    }
    
    suppliers.insert(0, new_supplier)
    save_json("suppliers.json", suppliers)
    return new_supplier


@router.put("/suppliers/{supplier_id}")
def update_supplier(supplier_id: str, payload: SupplierUpdate):
    """Tedarikçi güncelle"""
    suppliers = load_json("suppliers.json")
    
    for idx, supplier in enumerate(suppliers):
        if supplier.get("id") == supplier_id:
            update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
            updated = {**supplier, **update_data}
            suppliers[idx] = updated
            save_json("suppliers.json", suppliers)
            return updated
    
    raise HTTPException(status_code=404, detail="Tedarikçi bulunamadı")


@router.delete("/suppliers/{supplier_id}")
def delete_supplier(supplier_id: str):
    """Tedarikçi sil"""
    suppliers = load_json("suppliers.json")
    suppliers = [s for s in suppliers if s.get("id") != supplier_id]
    save_json("suppliers.json", suppliers)
    return {"success": True, "id": supplier_id}


# ==================== SUPPLIER TRANSACTIONS (Bayi Ürün Hareketleri) ====================

class SupplierTransactionIn(BaseModel):
    productCode: str
    colorCode: str
    productName: str
    quantity: float
    unit: str
    type: str  # received | given
    note: str | None = None
    date: str | None = None


@router.get("/suppliers/{supplier_id}/transactions")
def get_supplier_transactions(supplier_id: str):
    """Tedarikçi/bayi ürün hareketlerini getir"""
    transactions = load_json("supplierTransactions.json")
    
    # Bu tedarikçiye ait hareketleri filtrele
    supplier_txs = [t for t in transactions if t.get("supplierId") == supplier_id]
    
    # Ürün bazlı bakiye hesapla
    product_balances = {}
    for tx in supplier_txs:
        key = f"{tx.get('productCode')}_{tx.get('colorCode')}"
        if key not in product_balances:
            product_balances[key] = {
                "productCode": tx.get("productCode"),
                "colorCode": tx.get("colorCode"),
                "productName": tx.get("productName"),
                "unit": tx.get("unit"),
                "totalReceived": 0,
                "totalGiven": 0
            }
        
        if tx.get("type") == "received":
            product_balances[key]["totalReceived"] += tx.get("quantity", 0)
        else:
            product_balances[key]["totalGiven"] += tx.get("quantity", 0)
    
    # Bakiye hesapla (pozitif = biz fazla aldık, negatif = biz fazla verdik)
    for key, balance in product_balances.items():
        balance["balance"] = balance["totalReceived"] - balance["totalGiven"]
    
    return {
        "transactions": supplier_txs,
        "balances": list(product_balances.values())
    }


@router.post("/suppliers/{supplier_id}/transactions", status_code=201)
def create_supplier_transaction(supplier_id: str, payload: SupplierTransactionIn):
    """Tedarikçi/bayi ürün hareketi ekle"""
    transactions = load_json("supplierTransactions.json")
    suppliers = load_json("suppliers.json")
    
    # Tedarikçiyi bul
    supplier = None
    for s in suppliers:
        if s.get("id") == supplier_id:
            supplier = s
            break
    
    if not supplier:
        raise HTTPException(status_code=404, detail="Tedarikçi bulunamadı")
    
    new_tx = {
        "id": f"SPT-{str(uuid.uuid4())[:8].upper()}",
        "supplierId": supplier_id,
        "supplierName": supplier.get("name"),
        "date": payload.date or _today(),
        "productCode": payload.productCode,
        "colorCode": payload.colorCode,
        "productName": payload.productName,
        "quantity": payload.quantity,
        "unit": payload.unit,
        "type": payload.type,
        "note": payload.note,
        "createdBy": "Sistem",
        "createdAt": _now_iso()
    }
    
    transactions.insert(0, new_tx)
    save_json("supplierTransactions.json", transactions)
    return new_tx


@router.delete("/suppliers/{supplier_id}/transactions/{transaction_id}")
def delete_supplier_transaction(supplier_id: str, transaction_id: str):
    """Tedarikçi/bayi ürün hareketini sil"""
    transactions = load_json("supplierTransactions.json")
    transactions = [t for t in transactions if t.get("id") != transaction_id]
    save_json("supplierTransactions.json", transactions)
    return {"success": True, "id": transaction_id}


@router.get("/requests")
def list_requests():
    """Malzeme taleplerini listele (geriye uyumluluk)"""
    return load_json("requests.json")
