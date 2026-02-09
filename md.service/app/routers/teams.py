import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field
from typing import List, Optional

from ..data_loader import load_json, save_json
from ..activity_logger import log_activity, get_action_icon

router = APIRouter(prefix="/teams", tags=["teams"])


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


class TeamIn(BaseModel):
  ad: str = Field(..., min_length=1, description="Ekip adı")
  aciklama: str = Field("", description="Ekip açıklaması")
  aktifMi: bool = Field(True, description="Aktif durumu")


@router.get("/")
def list_teams(aktifMi: bool = None):
  teams = load_json("teams.json")
  if aktifMi is not None:
    teams = [t for t in teams if t.get("aktifMi") == aktifMi]
  return teams


@router.get("/{team_id}")
def get_team(team_id: str):
  teams = load_json("teams.json")
  for t in teams:
    if t.get("id") == team_id:
      # Üyeleri de ekle
      team_members = load_json("team_members.json")
      members = [tm for tm in team_members if tm.get("teamId") == team_id and not tm.get("deleted")]
      result = {**t, "members": members}
      return result
  raise HTTPException(status_code=404, detail="Ekip bulunamadı")


@router.post("/", status_code=201)
def create_team(payload: TeamIn, authorization: Optional[str] = Header(None)):
  user_id, user_name = _get_user_info(authorization)
  teams = load_json("teams.json")
  
  new_id = f"TEAM-{str(uuid.uuid4())[:8].upper()}"
  now = datetime.now().isoformat()
  
  new_item = {
    "id": new_id,
    "ad": payload.ad,
    "aciklama": payload.aciklama,
    "aktifMi": payload.aktifMi,
    "createdAt": now,
    "updatedAt": now,
    "deleted": False,
  }
  teams.append(new_item)
  save_json("teams.json", teams)
  
  # Aktivite log
  log_activity(
      user_id=user_id,
      user_name=user_name,
      action="team_create",
      target_type="team",
      target_id=new_id,
      target_name=payload.ad,
      details=f"Yeni ekip oluşturuldu: {payload.ad}",
      icon=get_action_icon("team_create")
  )
  
  return new_item


@router.put("/{team_id}")
def update_team(team_id: str, payload: TeamIn, authorization: Optional[str] = Header(None)):
  user_id, user_name = _get_user_info(authorization)
  teams = load_json("teams.json")
  for idx, item in enumerate(teams):
    if item.get("id") == team_id:
      teams[idx] = {
        **item,
        "ad": payload.ad,
        "aciklama": payload.aciklama,
        "aktifMi": payload.aktifMi,
        "updatedAt": datetime.now().isoformat(),
      }
      save_json("teams.json", teams)
      
      # Aktivite log
      log_activity(
          user_id=user_id,
          user_name=user_name,
          action="team_update",
          target_type="team",
          target_id=team_id,
          target_name=payload.ad,
          details=f"Ekip güncellendi: {payload.ad}",
          icon=get_action_icon("update")
      )
      
      return teams[idx]
  raise HTTPException(status_code=404, detail="Ekip bulunamadı")


@router.delete("/{team_id}")
def soft_delete_team(team_id: str, authorization: Optional[str] = Header(None)):
  user_id, user_name = _get_user_info(authorization)
  teams = load_json("teams.json")
  for idx, item in enumerate(teams):
    if item.get("id") == team_id:
      team_name = item.get("ad")
      teams[idx] = {
        **item,
        "deleted": True,
        "aktifMi": False,
        "updatedAt": datetime.now().isoformat(),
      }
      save_json("teams.json", teams)
      
      # Team members'ı da soft-delete et
      team_members = load_json("team_members.json")
      for tm_idx, tm in enumerate(team_members):
        if tm.get("teamId") == team_id:
          team_members[tm_idx] = {**tm, "deleted": True}
      save_json("team_members.json", team_members)
      
      # Aktivite log
      log_activity(
          user_id=user_id,
          user_name=user_name,
          action="delete",
          target_type="team",
          target_id=team_id,
          target_name=team_name,
          details=f"Ekip silindi: {team_name}",
          icon=get_action_icon("delete")
      )
      
      return {"id": team_id, "deleted": True}
  raise HTTPException(status_code=404, detail="Ekip bulunamadı")


@router.get("/{team_id}/members")
def list_team_members(team_id: str):
  team_members = load_json("team_members.json")
  members = [tm for tm in team_members if tm.get("teamId") == team_id and not tm.get("deleted")]
  return members


@router.post("/{team_id}/members")
def add_team_member(team_id: str, personnel_id: str, authorization: Optional[str] = Header(None)):
  user_id, user_name = _get_user_info(authorization)
  
  # Ekip var mı kontrol et
  teams = load_json("teams.json")
  team = next((t for t in teams if t.get("id") == team_id and not t.get("deleted")), None)
  if not team:
    raise HTTPException(status_code=404, detail="Ekip bulunamadı")
  
  # Personel var mı kontrol et
  personnel = load_json("personnel.json")
  person = next((p for p in personnel if p.get("id") == personnel_id and not p.get("deleted")), None)
  if not person:
    raise HTTPException(status_code=404, detail="Personel bulunamadı")
  
  team_members = load_json("team_members.json")
  
  # Zaten üye mi kontrol et
  existing = any(
    tm.get("teamId") == team_id and tm.get("personnelId") == personnel_id and not tm.get("deleted")
    for tm in team_members
  )
  if existing:
    raise HTTPException(status_code=400, detail="Bu personel zaten ekip üyesi")
  
  new_id = f"TM-{str(uuid.uuid4())[:8].upper()}"
  now = datetime.now().isoformat()
  
  new_member = {
    "id": new_id,
    "teamId": team_id,
    "personnelId": personnel_id,
    "createdAt": now,
    "deleted": False,
  }
  team_members.append(new_member)
  save_json("team_members.json", team_members)
  
  # Aktivite log
  person_name = f"{person.get('ad', '')} {person.get('soyad', '')}"
  log_activity(
      user_id=user_id,
      user_name=user_name,
      action="team_member_add",
      target_type="team",
      target_id=team_id,
      target_name=team.get("ad"),
      details=f"Ekibe üye eklendi: {person_name} → {team.get('ad')}",
      icon=get_action_icon("team_member_add")
  )
  
  return new_member


@router.delete("/{team_id}/members/{personnel_id}")
def remove_team_member(team_id: str, personnel_id: str, authorization: Optional[str] = Header(None)):
  user_id, user_name = _get_user_info(authorization)
  
  # Ekip ve personel bilgisini al
  teams = load_json("teams.json")
  team = next((t for t in teams if t.get("id") == team_id), None)
  personnel = load_json("personnel.json")
  person = next((p for p in personnel if p.get("id") == personnel_id), None)
  
  team_members = load_json("team_members.json")
  for idx, tm in enumerate(team_members):
    if tm.get("teamId") == team_id and tm.get("personnelId") == personnel_id:
      team_members[idx] = {**tm, "deleted": True}
      save_json("team_members.json", team_members)
      
      # Aktivite log
      person_name = f"{person.get('ad', '')} {person.get('soyad', '')}" if person else "Bilinmiyor"
      team_name = team.get("ad") if team else "Bilinmiyor"
      log_activity(
          user_id=user_id,
          user_name=user_name,
          action="team_member_remove",
          target_type="team",
          target_id=team_id,
          target_name=team_name,
          details=f"Ekipten üye çıkarıldı: {person_name} ← {team_name}",
          icon=get_action_icon("team_member_remove")
      )
      
      return {"teamId": team_id, "personnelId": personnel_id, "deleted": True}
  raise HTTPException(status_code=404, detail="Ekip üyesi bulunamadı")
