import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional

from ..data_loader import load_json, save_json
from ..activity_logger import log_activity, get_action_icon

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


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


class SupplierContact(BaseModel):
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    contactPerson: str | None = None


class SupplierCreate(BaseModel):
    name: str
    type: str = "manufacturer"  # manufacturer | dealer
    category: str | None = None
    contact: SupplierContact | None = None
    leadTimeDays: int = 7
    notes: str | None = None


class SupplierUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    category: str | None = None
    contact: SupplierContact | None = None
    leadTimeDays: int | None = None
    rating: float | None = None
    notes: str | None = None


class ProductTransaction(BaseModel):
    productCode: str
    colorCode: str
    productName: str
    quantity: float
    unit: str
    type: str  # received | given
    date: str | None = None
    note: str | None = None
    createdBy: str | None = None


@router.get("/")
def list_suppliers(type: str | None = None, category: str | None = None):
    """Tedarikçileri listele"""
    suppliers = load_json("suppliers.json")
    
    if type:
        suppliers = [s for s in suppliers if s.get("type") == type]
    if category:
        suppliers = [s for s in suppliers if category.lower() in (s.get("category") or "").lower()]
    
    return suppliers


@router.get("/{supplier_id}")
def get_supplier(supplier_id: str):
    """Tek bir tedarikçiyi getir"""
    suppliers = load_json("suppliers.json")
    for supplier in suppliers:
        if supplier.get("id") == supplier_id:
            return supplier
    raise HTTPException(status_code=404, detail="Tedarikçi bulunamadı")


@router.post("/", status_code=201)
def create_supplier(payload: SupplierCreate, authorization: Optional[str] = Header(None)):
    """Yeni tedarikçi oluştur"""
    user_id, user_name = _get_user_info(authorization)
    suppliers = load_json("suppliers.json")
    
    new_id = f"SUP-{str(uuid.uuid4())[:8].upper()}"
    new_supplier = {
        "id": new_id,
        "name": payload.name,
        "type": payload.type,
        "category": payload.category,
        "contact": payload.contact.model_dump() if payload.contact else {},
        "leadTimeDays": payload.leadTimeDays,
        "rating": 0,
        "notes": payload.notes,
        "createdAt": datetime.utcnow().isoformat()
    }
    
    suppliers.insert(0, new_supplier)
    save_json("suppliers.json", suppliers)
    
    # Aktivite log
    log_activity(
        user_id=user_id,
        user_name=user_name,
        action="supplier_create",
        target_type="supplier",
        target_id=new_id,
        target_name=payload.name,
        details=f"Yeni tedarikçi oluşturuldu: {payload.name}",
        icon=get_action_icon("supplier_create")
    )
    
    return new_supplier


@router.put("/{supplier_id}")
def update_supplier(supplier_id: str, payload: SupplierUpdate, authorization: Optional[str] = Header(None)):
    """Tedarikçi güncelle"""
    user_id, user_name = _get_user_info(authorization)
    suppliers = load_json("suppliers.json")
    
    for idx, supplier in enumerate(suppliers):
        if supplier.get("id") == supplier_id:
            old_name = supplier.get("name")
            if payload.name is not None:
                supplier["name"] = payload.name
            if payload.type is not None:
                supplier["type"] = payload.type
            if payload.category is not None:
                supplier["category"] = payload.category
            if payload.contact is not None:
                supplier["contact"] = payload.contact.model_dump()
            if payload.leadTimeDays is not None:
                supplier["leadTimeDays"] = payload.leadTimeDays
            if payload.rating is not None:
                supplier["rating"] = payload.rating
            if payload.notes is not None:
                supplier["notes"] = payload.notes
            
            supplier["updatedAt"] = datetime.utcnow().isoformat()
            suppliers[idx] = supplier
            save_json("suppliers.json", suppliers)
            
            # Aktivite log
            log_activity(
                user_id=user_id,
                user_name=user_name,
                action="supplier_update",
                target_type="supplier",
                target_id=supplier_id,
                target_name=supplier.get("name"),
                details=f"Tedarikçi güncellendi: {supplier.get('name')}",
                icon=get_action_icon("update")
            )
            
            return supplier
    
    raise HTTPException(status_code=404, detail="Tedarikçi bulunamadı")


@router.delete("/{supplier_id}")
def delete_supplier(supplier_id: str, authorization: Optional[str] = Header(None)):
    """Tedarikçi sil"""
    user_id, user_name = _get_user_info(authorization)
    suppliers = load_json("suppliers.json")
    
    # Silinen tedarikçinin adını al
    deleted_name = next((s.get("name") for s in suppliers if s.get("id") == supplier_id), "Bilinmiyor")
    
    suppliers = [s for s in suppliers if s.get("id") != supplier_id]
    save_json("suppliers.json", suppliers)
    
    # Aktivite log
    log_activity(
        user_id=user_id,
        user_name=user_name,
        action="supplier_delete",
        target_type="supplier",
        target_id=supplier_id,
        target_name=deleted_name,
        details=f"Tedarikçi silindi: {deleted_name}",
        icon=get_action_icon("delete")
    )
    
    return {"success": True, "id": supplier_id}


# ========== Ürün Bazlı Hareket (Bayi Alışverişi) ==========

@router.get("/{supplier_id}/transactions")
def get_supplier_transactions(
    supplier_id: str,
    type: str | None = None,
    productCode: str | None = None
):
    """Tedarikçi ile ürün bazlı hareketleri getir"""
    transactions = load_json("supplierTransactions.json")
    
    result = [t for t in transactions if t.get("supplierId") == supplier_id]
    
    if type:
        result = [t for t in result if t.get("type") == type]
    if productCode:
        result = [t for t in result if t.get("productCode") == productCode]
    
    return result


@router.post("/{supplier_id}/transactions", status_code=201)
def create_transaction(supplier_id: str, payload: ProductTransaction, authorization: Optional[str] = Header(None)):
    """Tedarikçi ile ürün hareketi ekle (aldık/verdik)"""
    user_id, user_name = _get_user_info(authorization)
    suppliers = load_json("suppliers.json")
    transactions = load_json("supplierTransactions.json")
    
    # Tedarikçi kontrolü
    supplier = next((s for s in suppliers if s.get("id") == supplier_id), None)
    if not supplier:
        raise HTTPException(status_code=404, detail="Tedarikçi bulunamadı")
    
    new_trans = {
        "id": f"SPT-{str(uuid.uuid4())[:8].upper()}",
        "supplierId": supplier_id,
        "supplierName": supplier.get("name"),
        "date": payload.date or datetime.utcnow().isoformat()[:10],
        "productCode": payload.productCode,
        "colorCode": payload.colorCode,
        "productName": payload.productName,
        "quantity": payload.quantity,
        "unit": payload.unit,
        "type": payload.type,
        "note": payload.note,
        "createdBy": payload.createdBy or user_name,
        "createdAt": datetime.utcnow().isoformat()
    }
    
    transactions.insert(0, new_trans)
    save_json("supplierTransactions.json", transactions)
    
    # Aktivite log
    type_label = "Alım" if payload.type == "received" else "Verme"
    log_activity(
        user_id=user_id,
        user_name=user_name,
        action="supplier_transaction",
        target_type="supplier",
        target_id=supplier_id,
        target_name=supplier.get("name"),
        details=f"Tedarikçi {type_label}: {payload.quantity} {payload.unit} {payload.productName}",
        icon=get_action_icon("supplier_transaction"),
        extra_data={"transactionId": new_trans["id"], "type": payload.type}
    )
    
    return new_trans


@router.delete("/{supplier_id}/transactions/{transaction_id}")
def delete_transaction(supplier_id: str, transaction_id: str):
    """Hareket kaydını sil"""
    transactions = load_json("supplierTransactions.json")
    transactions = [t for t in transactions if t.get("id") != transaction_id]
    save_json("supplierTransactions.json", transactions)
    return {"success": True, "id": transaction_id}


@router.get("/{supplier_id}/balance")
def get_supplier_balance(supplier_id: str):
    """Tedarikçi ile ürün bazlı bakiye özeti"""
    suppliers = load_json("suppliers.json")
    transactions = load_json("supplierTransactions.json")
    
    # Tedarikçi kontrolü
    supplier = next((s for s in suppliers if s.get("id") == supplier_id), None)
    if not supplier:
        raise HTTPException(status_code=404, detail="Tedarikçi bulunamadı")
    
    supplier_trans = [t for t in transactions if t.get("supplierId") == supplier_id]
    
    # Ürün bazlı gruplama
    balance_map = {}
    for trans in supplier_trans:
        key = f"{trans.get('productCode')}-{trans.get('colorCode')}"
        if key not in balance_map:
            balance_map[key] = {
                "productCode": trans.get("productCode"),
                "colorCode": trans.get("colorCode"),
                "productName": trans.get("productName"),
                "unit": trans.get("unit"),
                "received": 0,
                "given": 0,
                "transactions": []
            }
        
        if trans.get("type") == "received":
            balance_map[key]["received"] += trans.get("quantity", 0)
        else:
            balance_map[key]["given"] += trans.get("quantity", 0)
        
        balance_map[key]["transactions"].append({
            "id": trans.get("id"),
            "date": trans.get("date"),
            "type": trans.get("type"),
            "quantity": trans.get("quantity"),
            "note": trans.get("note")
        })
    
    # Bakiye hesapla
    balances = []
    for key, data in balance_map.items():
        data["balance"] = data["received"] - data["given"]
        # Son 5 hareket
        data["transactions"] = sorted(data["transactions"], key=lambda x: x.get("date", ""), reverse=True)[:5]
        balances.append(data)
    
    total_received = sum(b["received"] for b in balances)
    total_given = sum(b["given"] for b in balances)
    
    return {
        "supplierId": supplier_id,
        "supplierName": supplier.get("name"),
        "supplierType": supplier.get("type"),
        "items": balances,
        "summary": {
            "totalReceived": total_received,
            "totalGiven": total_given,
            "netBalance": total_received - total_given,
            "balanceNote": "Pozitif = Biz fazla aldık (onlara borçluyuz), Negatif = Biz fazla verdik (onlar bize borçlu)"
        },
        "totalTransactions": len(supplier_trans)
    }


@router.get("/{supplier_id}/products")
def get_supplier_products(supplier_id: str):
    """Bu tedarikçiden alınan ürünleri listele"""
    stock_items = load_json("stockItems.json")
    return [item for item in stock_items if item.get("supplierId") == supplier_id]


@router.get("/{supplier_id}/orders")
def get_supplier_orders(supplier_id: str, status: str | None = None):
    """Bu tedarikçiye verilen siparişleri listele"""
    orders = load_json("purchaseOrders.json")
    result = [o for o in orders if o.get("supplierId") == supplier_id]
    
    if status:
        result = [o for o in result if o.get("status") == status]
    
    return result

