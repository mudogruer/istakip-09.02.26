"""
User Management Router - Kullanıcı CRUD işlemleri
"""
from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import secrets
import hashlib

from ..data_loader import load_json, save_json
from ..activity_logger import log_activity, get_action_icon
from .auth import get_current_user_from_token

router = APIRouter(prefix="/users", tags=["users"])


class UserCreate(BaseModel):
    username: str
    password: str
    displayName: str
    role: str = "user"  # admin, manager, user
    personnelId: Optional[str] = None
    permissions: Optional[List[str]] = None


class UserUpdate(BaseModel):
    displayName: Optional[str] = None
    role: Optional[str] = None
    permissions: Optional[List[str]] = None
    aktifMi: Optional[bool] = None


class PasswordChange(BaseModel):
    newPassword: str


def hash_password(password: str) -> str:
    """SHA-256 ile password hash'le"""
    return hashlib.sha256(password.encode()).hexdigest()


def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """Token'dan kullanıcı bilgisi al, yoksa hata fırlat"""
    user = get_current_user_from_token(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmanız gerekiyor")
    return user


@router.get("")
async def get_users(
    authorization: Optional[str] = Header(None),
    include_inactive: bool = Query(False)
):
    """Tüm kullanıcıları listele"""
    current_user = get_current_user_from_token(authorization)
    
    # Sadece admin ve manager görebilir
    if current_user and current_user.get("role") not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    users = load_json("users.json")
    
    if not include_inactive:
        users = [u for u in users if u.get("aktifMi", True)]
    
    # Password hash'lerini gizle
    result = []
    for u in users:
        user_data = {k: v for k, v in u.items() if k != "passwordHash"}
        result.append(user_data)
    
    return result


@router.get("/{user_id}")
async def get_user(user_id: str, authorization: Optional[str] = Header(None)):
    """Kullanıcı detayı getir"""
    current_user = get_current_user_from_token(authorization)
    
    # Kendi profilini veya admin/manager ise başkasının profilini görebilir
    if current_user and current_user.get("id") != user_id:
        if current_user.get("role") not in ["admin", "manager"]:
            raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    users = load_json("users.json")
    
    for u in users:
        if u.get("id") == user_id:
            # Password hash'i gizle
            return {k: v for k, v in u.items() if k != "passwordHash"}
    
    raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")


@router.post("")
async def create_user(data: UserCreate, authorization: Optional[str] = Header(None)):
    """Yeni kullanıcı oluştur"""
    current_user = get_current_user_from_token(authorization)
    
    # Sadece admin oluşturabilir
    if current_user and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    users = load_json("users.json")
    
    # Username benzersiz mi?
    for u in users:
        if u.get("username") == data.username:
            raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten kullanılıyor")
    
    # Personel ile eşleştirme varsa kontrol et
    if data.personnelId:
        personnel = load_json("personnel.json")
        person = None
        for p in personnel:
            if p.get("id") == data.personnelId:
                person = p
                break
        
        if not person:
            raise HTTPException(status_code=400, detail="Personel bulunamadı")
        
        # Bu personel zaten bir kullanıcıya bağlı mı?
        for u in users:
            if u.get("personnelId") == data.personnelId and u.get("aktifMi", True):
                raise HTTPException(status_code=400, detail="Bu personel zaten bir kullanıcıya bağlı")
    
    new_user = {
        "id": f"user_{datetime.now().strftime('%Y%m%d%H%M%S')}_{secrets.token_hex(4)}",
        "username": data.username,
        "passwordHash": hash_password(data.password),
        "displayName": data.displayName,
        "role": data.role,
        "personnelId": data.personnelId,
        "permissions": data.permissions or [],
        "aktifMi": True,
        "createdAt": datetime.now().isoformat(),
        "lastLoginAt": None
    }
    
    users.append(new_user)
    save_json("users.json", users)
    
    # Aktivite log
    if current_user:
        log_activity(
            user_id=current_user.get("id"),
            user_name=current_user.get("displayName") or current_user.get("username"),
            action="user_create",
            target_type="user",
            target_id=new_user["id"],
            target_name=new_user["displayName"],
            details=f"Yeni kullanıcı oluşturuldu: {new_user['username']}",
            icon=get_action_icon("user_create")
        )
    
    return {k: v for k, v in new_user.items() if k != "passwordHash"}


@router.put("/{user_id}")
async def update_user(user_id: str, data: UserUpdate, authorization: Optional[str] = Header(None)):
    """Kullanıcı güncelle"""
    current_user = get_current_user_from_token(authorization)
    
    # Kendi profilini veya admin ise başkasının profilini güncelleyebilir
    if current_user and current_user.get("id") != user_id:
        if current_user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    users = load_json("users.json")
    
    for i, u in enumerate(users):
        if u.get("id") == user_id:
            # Admin kullanıcısını pasif yapma engeli
            if u.get("username") == "admin" and data.aktifMi is False:
                raise HTTPException(status_code=400, detail="Admin kullanıcısı pasif yapılamaz")
            
            if data.displayName is not None:
                users[i]["displayName"] = data.displayName
            if data.role is not None:
                users[i]["role"] = data.role
            if data.permissions is not None:
                users[i]["permissions"] = data.permissions
            if data.aktifMi is not None:
                users[i]["aktifMi"] = data.aktifMi
            
            users[i]["updatedAt"] = datetime.now().isoformat()
            
            save_json("users.json", users)
            
            # Aktivite log
            if current_user:
                log_activity(
                    user_id=current_user.get("id"),
                    user_name=current_user.get("displayName") or current_user.get("username"),
                    action="update",
                    target_type="user",
                    target_id=user_id,
                    target_name=users[i].get("displayName"),
                    details=f"Kullanıcı güncellendi: {users[i].get('username')}",
                    icon=get_action_icon("update")
                )
            
            return {k: v for k, v in users[i].items() if k != "passwordHash"}
    
    raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")


@router.put("/{user_id}/password")
async def change_password(user_id: str, data: PasswordChange, authorization: Optional[str] = Header(None)):
    """Şifre değiştir"""
    current_user = get_current_user_from_token(authorization)
    
    # Kendi şifresini veya admin ise başkasının şifresini değiştirebilir
    if current_user and current_user.get("id") != user_id:
        if current_user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    if len(data.newPassword) < 4:
        raise HTTPException(status_code=400, detail="Şifre en az 4 karakter olmalı")
    
    users = load_json("users.json")
    
    for i, u in enumerate(users):
        if u.get("id") == user_id:
            users[i]["passwordHash"] = hash_password(data.newPassword)
            users[i]["updatedAt"] = datetime.now().isoformat()
            
            save_json("users.json", users)
            
            # Aktivite log
            if current_user:
                log_activity(
                    user_id=current_user.get("id"),
                    user_name=current_user.get("displayName") or current_user.get("username"),
                    action="update",
                    target_type="user",
                    target_id=user_id,
                    target_name=users[i].get("displayName"),
                    details=f"Şifre değiştirildi: {users[i].get('username')}",
                    icon="🔑"
                )
            
            return {"success": True, "message": "Şifre değiştirildi"}
    
    raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")


@router.delete("/{user_id}")
async def delete_user(user_id: str, authorization: Optional[str] = Header(None)):
    """Kullanıcı sil (pasif yap)"""
    current_user = get_current_user_from_token(authorization)
    
    # Sadece admin silebilir
    if current_user and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    users = load_json("users.json")
    
    for i, u in enumerate(users):
        if u.get("id") == user_id:
            # Admin kullanıcısını silme engeli
            if u.get("username") == "admin":
                raise HTTPException(status_code=400, detail="Admin kullanıcısı silinemez")
            
            users[i]["aktifMi"] = False
            users[i]["deletedAt"] = datetime.now().isoformat()
            
            save_json("users.json", users)
            
            # Aktivite log
            if current_user:
                log_activity(
                    user_id=current_user.get("id"),
                    user_name=current_user.get("displayName") or current_user.get("username"),
                    action="delete",
                    target_type="user",
                    target_id=user_id,
                    target_name=users[i].get("displayName"),
                    details=f"Kullanıcı silindi: {users[i].get('username')}",
                    icon=get_action_icon("delete")
                )
            
            return {"success": True, "message": "Kullanıcı silindi"}
    
    raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
