"""
Authentication endpoints: login, logout, me, session check
"""
from fastapi import APIRouter, Depends, HTTPException, Header, Response
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import hashlib
import secrets

from ..data_loader import load_json, save_json
from ..activity_logger import log_activity, get_action_icon

router = APIRouter(prefix="/auth", tags=["auth"])

# Session storage (in-memory, üretimde Redis kullanılabilir)
active_sessions: dict = {}


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    success: bool
    token: str | None = None
    user: dict | None = None
    message: str | None = None


def hash_password(password: str) -> str:
    """SHA-256 ile password hash'le"""
    return hashlib.sha256(password.encode()).hexdigest()


def get_user_by_username(username: str) -> dict | None:
    """Username ile kullanıcı bul"""
    users = load_json("users.json")
    for user in users:
        if user.get("username") == username and user.get("aktifMi", True):
            return user
    return None


def get_user_by_id(user_id: str) -> dict | None:
    """User ID ile kullanıcı bul"""
    users = load_json("users.json")
    for user in users:
        if user.get("id") == user_id:
            return user
    return None


def get_current_user_from_token(authorization: Optional[str] = Header(None)) -> dict | None:
    """Token'dan kullanıcı bilgisi al"""
    if not authorization:
        return None
    
    # "Bearer TOKEN" formatını parse et
    if authorization.startswith("Bearer "):
        token = authorization[7:]
    else:
        token = authorization
    
    if token in active_sessions:
        session = active_sessions[token]
        return session.get("user")
    
    return None


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """Kullanıcı girişi"""
    user = get_user_by_username(request.username)
    
    if not user:
        return LoginResponse(success=False, message="Kullanıcı bulunamadı")
    
    # Password kontrolü
    password_hash = hash_password(request.password)
    if user.get("passwordHash") != password_hash:
        return LoginResponse(success=False, message="Hatalı şifre")
    
    # Kullanıcı aktif mi?
    if not user.get("aktifMi", True):
        return LoginResponse(success=False, message="Kullanıcı hesabı pasif durumda")
    
    # Token oluştur
    token = secrets.token_urlsafe(32)
    
    # Personel bilgilerini al
    personnel_info = None
    if user.get("personnelId"):
        personnel = load_json("personnel.json")
        for p in personnel:
            if p.get("id") == user.get("personnelId"):
                personnel_info = {
                    "id": p.get("id"),
                    "ad": p.get("ad"),
                    "soyad": p.get("soyad"),
                    "unvan": p.get("unvan"),
                    "email": p.get("email"),
                    "telefon": p.get("telefon")
                }
                break
    
    # Session kaydet
    active_sessions[token] = {
        "user": {
            "id": user.get("id"),
            "username": user.get("username"),
            "displayName": user.get("displayName"),
            "role": user.get("role"),
            "permissions": user.get("permissions", []),
            "personnelId": user.get("personnelId"),
            "personnel": personnel_info
        },
        "createdAt": datetime.now().isoformat()
    }
    
    # Son giriş tarihini güncelle
    users = load_json("users.json")
    for u in users:
        if u.get("id") == user.get("id"):
            u["lastLoginAt"] = datetime.now().isoformat()
            break
    save_json("users.json", users)
    
    # Aktivite log
    log_activity(
        user_id=user.get("id"),
        user_name=user.get("displayName") or user.get("username"),
        action="login",
        target_type="auth",
        details="Sisteme giriş yapıldı",
        icon=get_action_icon("login")
    )
    
    return LoginResponse(
        success=True,
        token=token,
        user=active_sessions[token]["user"]
    )


@router.post("/logout")
async def logout(authorization: Optional[str] = Header(None)):
    """Kullanıcı çıkışı"""
    if not authorization:
        return {"success": True, "message": "Zaten çıkış yapılmış"}
    
    token = authorization[7:] if authorization.startswith("Bearer ") else authorization
    
    if token in active_sessions:
        user = active_sessions[token]["user"]
        
        # Aktivite log
        log_activity(
            user_id=user.get("id"),
            user_name=user.get("displayName") or user.get("username"),
            action="logout",
            target_type="auth",
            details="Sistemden çıkış yapıldı",
            icon=get_action_icon("logout")
        )
        
        del active_sessions[token]
    
    return {"success": True, "message": "Çıkış yapıldı"}


@router.get("/me")
async def get_me(authorization: Optional[str] = Header(None)):
    """Aktif kullanıcı bilgilerini döndür"""
    user = get_current_user_from_token(authorization)
    
    if not user:
        return {
            "authenticated": False,
            "user": None
        }
    
    return {
        "authenticated": True,
        "user": user
    }


@router.get("/check")
async def check_session(authorization: Optional[str] = Header(None)):
    """Session geçerli mi kontrol et"""
    user = get_current_user_from_token(authorization)
    return {"valid": user is not None}
