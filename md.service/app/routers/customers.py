import uuid
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field
from typing import Optional

from ..data_loader import load_json, save_json
from ..activity_logger import log_activity, get_action_icon

router = APIRouter(prefix="/customers", tags=["customers"])


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


class CustomerIn(BaseModel):
  name: str = Field(..., min_length=2)
  segment: str = "B2C"
  location: str = ""
  contact: str = ""
  phone: str = ""
  phone2: str = ""
  address: str = ""


@router.get("/")
def list_customers():
  return load_json("customers.json")


@router.post("/", status_code=201)
def create_customer(payload: CustomerIn, authorization: Optional[str] = Header(None)):
  user_id, user_name = _get_user_info(authorization)
  customers = load_json("customers.json")
  new_id = f"CST-{str(uuid.uuid4())[:8].upper()}"
  
  # Generate unique account code (Cari Kod) if not present
  existing_codes = {c.get("accountCode") for c in customers if c.get("accountCode")}
  
  # Simple strategy: C-{Year}-{Random4}
  import random
  from datetime import datetime
  year = datetime.now().year
  
  while True:
      code = f"C-{year}-{random.randint(1000, 9999)}"
      if code not in existing_codes:
          break

  new_item = {
      "id": new_id,
      "name": payload.name,
      "segment": payload.segment,
      "location": payload.location,
      "jobs": 0,
      "contact": payload.contact,
      "phone": payload.phone,
      "phone2": payload.phone2,
      "address": payload.address,
      "deleted": False,
      "accountCode": code
  }
  customers.append(new_item)
  save_json("customers.json", customers)
  
  # Aktivite log
  log_activity(
      user_id=user_id,
      user_name=user_name,
      action="customer_create",
      target_type="customer",
      target_id=new_id,
      target_name=payload.name,
      details=f"Yeni müşteri oluşturuldu: {payload.name}",
      icon=get_action_icon("customer_create")
  )
  
  return new_item


@router.put("/{customer_id}")
def update_customer(customer_id: str, payload: CustomerIn, authorization: Optional[str] = Header(None)):
  user_id, user_name = _get_user_info(authorization)
  customers = load_json("customers.json")
  for idx, item in enumerate(customers):
    if item.get("id") == customer_id:
      customers[idx] = {
          **item,
          "name": payload.name,
          "segment": payload.segment,
          "location": payload.location,
          "contact": payload.contact,
          "phone": payload.phone,
          "phone2": payload.phone2,
          "address": payload.address,
      }
      save_json("customers.json", customers)
      
      # Aktivite log
      log_activity(
          user_id=user_id,
          user_name=user_name,
          action="customer_update",
          target_type="customer",
          target_id=customer_id,
          target_name=payload.name,
          details=f"Müşteri güncellendi: {payload.name}",
          icon=get_action_icon("update")
      )
      
      return customers[idx]
  raise HTTPException(status_code=404, detail="Customer not found")


@router.delete("/{customer_id}")
def soft_delete_customer(customer_id: str, authorization: Optional[str] = Header(None)):
  user_id, user_name = _get_user_info(authorization)
  customers = load_json("customers.json")
  for idx, item in enumerate(customers):
    if item.get("id") == customer_id:
      customers[idx] = {**item, "deleted": True}
      save_json("customers.json", customers)
      
      # Aktivite log
      log_activity(
          user_id=user_id,
          user_name=user_name,
          action="customer_delete",
          target_type="customer",
          target_id=customer_id,
          target_name=item.get("name", ""),
          details=f"Müşteri silindi: {item.get('name', '')}",
          icon=get_action_icon("delete")
      )
      
      return {"id": customer_id, "deleted": True}
  raise HTTPException(status_code=404, detail="Customer not found")

