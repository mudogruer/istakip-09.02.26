import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query, Header
from pydantic import BaseModel, Field, EmailStr
from typing import Optional

from ..data_loader import load_json, save_json
from ..activity_logger import log_activity, get_action_icon

router = APIRouter(prefix="/personnel", tags=["personnel"])


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


class PersonnelIn(BaseModel):
  ad: str = Field(..., min_length=1, description="Personel adı")
  soyad: str = Field(..., min_length=1, description="Personel soyadı")
  email: EmailStr = Field(..., description="E-posta adresi (unique)")
  telefon: str = Field("", description="Telefon numarası")
  unvan: str = Field("", description="Ünvan/paylaşım")
  aktifMi: bool = Field(True, description="Aktif durumu")
  rolId: str = Field("", description="Rol ID (opsiyonel)")


@router.get("/")
def list_personnel(aktifMi: bool = None):
  personnel = load_json("personnel.json")
  if aktifMi is not None:
    personnel = [p for p in personnel if p.get("aktifMi") == aktifMi]
  return personnel


@router.get("/{personnel_id}")
def get_personnel(personnel_id: str):
  personnel = load_json("personnel.json")
  for p in personnel:
    if p.get("id") == personnel_id:
      return p
  raise HTTPException(status_code=404, detail="Personel bulunamadı")


@router.post("/", status_code=201)
def create_personnel(payload: PersonnelIn, authorization: Optional[str] = Header(None)):
  user_id, user_name = _get_user_info(authorization)
  personnel = load_json("personnel.json")
  
  # Email unique kontrolü
  existing_emails = {p.get("email") for p in personnel if p.get("email") and not p.get("deleted")}
  if payload.email in existing_emails:
    raise HTTPException(status_code=409, detail=f"Bu e-posta adresi zaten kullanılıyor: {payload.email}")
  
  new_id = f"PER-{str(uuid.uuid4())[:8].upper()}"
  now = datetime.now().isoformat()
  
  new_item = {
    "id": new_id,
    "ad": payload.ad,
    "soyad": payload.soyad,
    "email": payload.email,
    "telefon": payload.telefon,
    "unvan": payload.unvan,
    "aktifMi": payload.aktifMi,
    "rolId": payload.rolId,
    "createdAt": now,
    "updatedAt": now,
    "deleted": False,
  }
  personnel.append(new_item)
  save_json("personnel.json", personnel)
  
  # Aktivite log
  log_activity(
      user_id=user_id,
      user_name=user_name,
      action="personnel_create",
      target_type="personnel",
      target_id=new_id,
      target_name=f"{payload.ad} {payload.soyad}",
      details=f"Yeni personel oluşturuldu: {payload.ad} {payload.soyad}",
      icon=get_action_icon("personnel_create")
  )
  
  return new_item


@router.put("/{personnel_id}")
def update_personnel(personnel_id: str, payload: PersonnelIn, authorization: Optional[str] = Header(None)):
  user_id, user_name = _get_user_info(authorization)
  personnel = load_json("personnel.json")
  
  # Email unique kontrolü (kendisi hariç)
  existing_emails = {p.get("email") for p in personnel if p.get("email") and p.get("id") != personnel_id and not p.get("deleted")}
  if payload.email in existing_emails:
    raise HTTPException(status_code=409, detail=f"Bu e-posta adresi zaten kullanılıyor: {payload.email}")
  
  for idx, item in enumerate(personnel):
    if item.get("id") == personnel_id:
      personnel[idx] = {
        **item,
        "ad": payload.ad,
        "soyad": payload.soyad,
        "email": payload.email,
        "telefon": payload.telefon,
        "unvan": payload.unvan,
        "aktifMi": payload.aktifMi,
        "rolId": payload.rolId,
        "updatedAt": datetime.now().isoformat(),
      }
      save_json("personnel.json", personnel)
      
      # Aktivite log
      log_activity(
          user_id=user_id,
          user_name=user_name,
          action="personnel_update",
          target_type="personnel",
          target_id=personnel_id,
          target_name=f"{payload.ad} {payload.soyad}",
          details=f"Personel güncellendi: {payload.ad} {payload.soyad}",
          icon=get_action_icon("personnel_update")
      )
      
      return personnel[idx]
  raise HTTPException(status_code=404, detail="Personel bulunamadı")


@router.patch("/{personnel_id}/aktif")
def toggle_personnel_status(personnel_id: str, aktifMi: bool):
  personnel = load_json("personnel.json")
  for idx, item in enumerate(personnel):
    if item.get("id") == personnel_id:
      personnel[idx] = {
        **item,
        "aktifMi": aktifMi,
        "updatedAt": datetime.now().isoformat(),
      }
      save_json("personnel.json", personnel)
      return personnel[idx]
  raise HTTPException(status_code=404, detail="Personel bulunamadı")


@router.delete("/{personnel_id}")
def soft_delete_personnel(personnel_id: str, authorization: Optional[str] = Header(None)):
  user_id, user_name = _get_user_info(authorization)
  personnel = load_json("personnel.json")
  for idx, item in enumerate(personnel):
    if item.get("id") == personnel_id:
      personnel[idx] = {
        **item,
        "deleted": True,
        "aktifMi": False,
        "updatedAt": datetime.now().isoformat(),
      }
      save_json("personnel.json", personnel)
      
      # Aktivite log
      log_activity(
          user_id=user_id,
          user_name=user_name,
          action="personnel_delete",
          target_type="personnel",
          target_id=personnel_id,
          target_name=f"{item.get('ad', '')} {item.get('soyad', '')}",
          details=f"Personel silindi: {item.get('ad', '')} {item.get('soyad', '')}",
          icon=get_action_icon("personnel_delete")
      )
      
      return {"id": personnel_id, "deleted": True}
  raise HTTPException(status_code=404, detail="Personel bulunamadı")


@router.post("/{personnel_id}/rol")
def assign_role(personnel_id: str, rolId: str):
  personnel = load_json("personnel.json")
  roles = load_json("roles.json")
  
  # Rol var mı kontrol et
  role_exists = any(r.get("id") == rolId for r in roles if not r.get("deleted"))
  if not role_exists:
    raise HTTPException(status_code=404, detail="Rol bulunamadı")
  
  for idx, item in enumerate(personnel):
    if item.get("id") == personnel_id:
      personnel[idx] = {
        **item,
        "rolId": rolId,
        "updatedAt": datetime.now().isoformat(),
      }
      save_json("personnel.json", personnel)
      return personnel[idx]
  raise HTTPException(status_code=404, detail="Personel bulunamadı")
