"""
Aktivite Log Router - Kullanıcı hareketlerini listele
"""
from fastapi import APIRouter, Query, Header
from typing import Optional
from datetime import datetime, timedelta

from ..data_loader import load_json

router = APIRouter(prefix="/activities", tags=["activities"])


@router.get("")
async def get_activities(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: Optional[str] = Query(None, alias="userId"),
    action: Optional[str] = Query(None),
    target_type: Optional[str] = Query(None, alias="targetType"),
    target_id: Optional[str] = Query(None, alias="targetId"),
    date_from: Optional[str] = Query(None, alias="dateFrom"),
    date_to: Optional[str] = Query(None, alias="dateTo"),
):
    """
    Aktivite loglarını listele
    Filtreler: userId, action, targetType, targetId, dateFrom, dateTo
    """
    activities = load_json("activities.json")
    
    # Filtreleme
    filtered = activities
    
    if user_id:
        filtered = [a for a in filtered if a.get("userId") == user_id]
    
    if action:
        filtered = [a for a in filtered if a.get("action") == action]
    
    if target_type:
        filtered = [a for a in filtered if a.get("targetType") == target_type]
    
    if target_id:
        filtered = [a for a in filtered if a.get("targetId") == target_id]
    
    if date_from:
        filtered = [a for a in filtered if a.get("timestamp", "") >= date_from]
    
    if date_to:
        filtered = [a for a in filtered if a.get("timestamp", "") <= date_to]
    
    # Toplam sayı
    total = len(filtered)
    
    # Pagination
    paginated = filtered[offset:offset + limit]
    
    return {
        "items": paginated,
        "total": total,
        "limit": limit,
        "offset": offset
    }


@router.get("/summary")
async def get_activity_summary(days: int = Query(7, ge=1, le=30)):
    """
    Son N gün için aktivite özeti
    """
    activities = load_json("activities.json")
    
    # Son N gün
    cutoff = (datetime.now() - timedelta(days=days)).isoformat()
    recent = [a for a in activities if a.get("timestamp", "") >= cutoff]
    
    # Kullanıcı bazlı grupla
    user_counts = {}
    action_counts = {}
    target_type_counts = {}
    daily_counts = {}
    
    for a in recent:
        # Kullanıcı sayıları
        user_name = a.get("userName", "Bilinmiyor")
        user_counts[user_name] = user_counts.get(user_name, 0) + 1
        
        # Aksiyon sayıları
        action = a.get("action", "other")
        action_counts[action] = action_counts.get(action, 0) + 1
        
        # Hedef tipi sayıları
        target_type = a.get("targetType", "other")
        target_type_counts[target_type] = target_type_counts.get(target_type, 0) + 1
        
        # Günlük sayılar
        date = a.get("timestamp", "")[:10]
        daily_counts[date] = daily_counts.get(date, 0) + 1
    
    return {
        "totalActivities": len(recent),
        "userCounts": [{"name": k, "count": v} for k, v in sorted(user_counts.items(), key=lambda x: -x[1])],
        "actionCounts": [{"action": k, "count": v} for k, v in sorted(action_counts.items(), key=lambda x: -x[1])],
        "targetTypeCounts": [{"type": k, "count": v} for k, v in sorted(target_type_counts.items(), key=lambda x: -x[1])],
        "dailyCounts": [{"date": k, "count": v} for k, v in sorted(daily_counts.items())]
    }


@router.get("/by-target/{target_type}/{target_id}")
async def get_activities_by_target(target_type: str, target_id: str, limit: int = Query(20)):
    """
    Belirli bir hedefle ilgili aktiviteleri getir (iş, müşteri, personel vb.)
    """
    activities = load_json("activities.json")
    
    filtered = [a for a in activities if a.get("targetType") == target_type and a.get("targetId") == target_id]
    
    return {
        "items": filtered[:limit],
        "total": len(filtered)
    }


@router.get("/by-user/{user_id}")
async def get_activities_by_user(user_id: str, limit: int = Query(50)):
    """
    Belirli bir kullanıcının aktivitelerini getir
    """
    activities = load_json("activities.json")
    
    filtered = [a for a in activities if a.get("userId") == user_id]
    
    return {
        "items": filtered[:limit],
        "total": len(filtered)
    }
