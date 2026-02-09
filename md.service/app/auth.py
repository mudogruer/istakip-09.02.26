"""
Authentication & Authorization helper modülü.
Header-based auth: X-User-Id header'ından kullanıcı bilgisi alınır.
AUTH_MODE env ile prod/dev modu kontrol edilir.
"""
import os
from typing import Optional, List
from fastapi import Header, HTTPException, Depends
from .data_loader import load_json

# Ortam değişkeni: "prod" veya "dev" (varsayılan: "prod")
AUTH_MODE = os.getenv("AUTH_MODE", "prod").lower()


class UserContext:
  """Kullanıcı context objesi"""
  def __init__(self, user_id: str, personnel: dict, role: dict = None):
    self.user_id = user_id
    self.personnel = personnel
    self.role = role
    self.permissions: List[str] = []
    
    # Rol izinlerini resolve et
    if role:
      self.permissions = role.get("permissions", [])
      # Admin ise "*" permission'ı tüm izinler demek
      if "*" in self.permissions:
        self.permissions = ["*"]
  
  def has_permission(self, permission: str) -> bool:
    """Kullanıcının belirtilen izne sahip olup olmadığını kontrol et"""
    if "*" in self.permissions:
      return True
    return permission in self.permissions
  
  def has_any_permission(self, permissions: List[str]) -> bool:
    """Kullanıcının listedeki herhangi bir izne sahip olup olmadığını kontrol et"""
    if "*" in self.permissions:
      return True
    return any(perm in self.permissions for perm in permissions)
  
  def can_manage_task(self, task: dict) -> bool:
    """Kullanıcının bu görevi yönetip yönetemeyeceğini kontrol et (own task kontrolü)"""
    # Admin veya manager ise tüm görevleri yönetebilir
    if self.has_permission("tasks.*") or self.has_permission("personnel.*"):
      return True
    
    # Kendi görevlerini yönetebilir
    if task.get("createdBy") == self.user_id:
      return True
    
    # Kendisine atanmış görevleri yönetebilir
    # Not: Bu kontrol task'ın currentAssignment'ına bakmalı, ama burada sadece task objesi var
    # Detaylı kontrol endpoint seviyesinde yapılmalı
    
    return False


def get_current_user(x_user_id: Optional[str] = Header(None, alias="X-User-Id")) -> Optional[UserContext]:
  """
  Header'dan kullanıcı bilgisini al ve UserContext döndür.
  AUTH_MODE="prod": X-User-Id yoksa 401 Unauthorized.
  AUTH_MODE="dev": X-User-Id yoksa None döner (okuma işlemleri için izin verilir).
  """
  if not x_user_id:
    # Prod modu: header zorunlu
    if AUTH_MODE == "prod":
      raise HTTPException(status_code=401, detail="Kullanıcı kimlik doğrulaması gerekli. X-User-Id header'ı eksik.")
    # Dev modu: header yoksa None döner (okuma işlemleri için)
    return None
  
  personnel_list = load_json("personnel.json")
  personnel = None
  for p in personnel_list:
    if p.get("id") == x_user_id and not p.get("deleted"):
      personnel = p
      break
  
  if not personnel:
    raise HTTPException(status_code=401, detail="Kullanıcı bulunamadı veya geçersiz kullanıcı ID")
  
  # Kullanıcı aktif mi kontrol et
  if not personnel.get("aktifMi", True):
    raise HTTPException(status_code=403, detail="Kullanıcı hesabı pasif durumda")
  
  # Rolü resolve et
  role = None
  role_id = personnel.get("rolId")
  if role_id:
    roles_list = load_json("roles.json")
    for r in roles_list:
      if r.get("id") == role_id and not r.get("deleted"):
        role = r
        break
  
  return UserContext(user_id=x_user_id, personnel=personnel, role=role)


def require_permission(permission: str):
  """
  Permission dependency factory.
  Kullanıcının belirtilen izne sahip olmasını gerektirir.
  """
  async def permission_checker(current_user: Optional[UserContext] = Depends(get_current_user)) -> UserContext:
    # Dev modu: current_user None ise (header yok) izin ver (backward compatibility)
    if current_user is None:
      return None
    
    if not current_user.has_permission(permission):
      raise HTTPException(status_code=403, detail=f"Bu işlem için yetkiniz yok. Gerekli izin: {permission}")
    
    return current_user
  
  return permission_checker


def require_any_permission(permissions: List[str]):
  """
  Herhangi bir permission dependency factory.
  Kullanıcının listedeki herhangi bir izne sahip olmasını gerektirir.
  """
  async def permission_checker(current_user: Optional[UserContext] = Depends(get_current_user)) -> UserContext:
    if current_user is None:
      return None
    
    if not current_user.has_any_permission(permissions):
      raise HTTPException(status_code=403, detail=f"Bu işlem için yetkiniz yok. Gerekli izinlerden biri: {', '.join(permissions)}")
    
    return current_user
  
  return permission_checker


def require_authenticated():
  """
  Sadece authenticated kullanıcı gerektirir (herhangi bir rol).
  """
  async def auth_checker(current_user: Optional[UserContext] = Depends(get_current_user)) -> UserContext:
    if current_user is None:
      raise HTTPException(status_code=401, detail="Kullanıcı kimlik doğrulaması gerekli")
    
    return current_user
  
  return auth_checker
