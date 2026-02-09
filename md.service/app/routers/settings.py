"""
Ayarlar Router

Sistem ayarları ve iş kolu yapılandırması yönetimi.
"""

import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from ..data_loader import load_json, save_json

router = APIRouter(prefix="/settings", tags=["settings"])


# ========== Models ==========

class GeneralSetting(BaseModel):
    label: str
    value: bool
    description: str | None = None


class CompanyInfo(BaseModel):
    name: str | None = None
    logo: str | None = None
    logoUrl: str | None = None
    address: str | None = None
    city: str | None = None
    phone: str | None = None
    phone2: str | None = None
    email: str | None = None
    website: str | None = None
    taxOffice: str | None = None
    taxNumber: str | None = None
    iban: str | None = None


class AssemblyStage(BaseModel):
    """Montaj aşaması"""
    id: str | None = None
    name: str
    order: int = 1


class JobRoleConfig(BaseModel):
    name: str
    description: str | None = None
    productionType: str = "internal"  # internal | external
    requiresGlass: bool = False
    defaultGlassSupplier: str | None = None
    defaultSupplier: str | None = None  # Dış sipariş için
    estimatedDays: int = 5
    active: bool = True
    assemblyStages: List[AssemblyStage] = []  # Montaj aşamaları


class GlassType(BaseModel):
    name: str
    code: str


# ========== Helpers ==========

def _gen_id(prefix: str) -> str:
    return f"{prefix}-{str(uuid.uuid4())[:8].upper()}"


def _get_settings():
    """Settings dosyasını oku, eski format ise migrate et"""
    data = load_json("settings.json")
    
    # Eski format kontrolü (array ise)
    if isinstance(data, list):
        # Migrate to new format
        data = {
            "general": data,
            "jobRoles": [],
            "glassTypes": [],
            "combinationTypes": []
        }
        save_json("settings.json", data)
    
    return data


# ========== General Settings ==========

@router.get("/")
def list_settings():
    """Tüm ayarları getir"""
    return _get_settings()


# ========== Company Info ==========

@router.get("/company")
def get_company_info():
    """Şirket bilgilerini getir"""
    settings = _get_settings()
    return settings.get("company", {})


@router.put("/company")
def update_company_info(payload: CompanyInfo):
    """Şirket bilgilerini güncelle"""
    settings = _get_settings()
    
    company = settings.get("company", {})
    
    # Sadece gönderilen alanları güncelle
    update_data = payload.model_dump(exclude_none=True)
    company.update(update_data)
    company["updatedAt"] = datetime.utcnow().isoformat() + "Z"
    
    settings["company"] = company
    save_json("settings.json", settings)
    
    return company


@router.get("/general")
def get_general_settings():
    """Genel ayarları getir"""
    settings = _get_settings()
    return settings.get("general", [])


@router.put("/general/{setting_id}")
def update_general_setting(setting_id: str, payload: GeneralSetting):
    """Genel ayar güncelle"""
    settings = _get_settings()
    general = settings.get("general", [])
    
    for idx, setting in enumerate(general):
        if setting.get("id") == setting_id:
            setting["label"] = payload.label
            setting["value"] = payload.value
            setting["description"] = payload.description
            general[idx] = setting
            settings["general"] = general
            save_json("settings.json", settings)
            return setting
    
    raise HTTPException(status_code=404, detail="Ayar bulunamadı")


# ========== Job Roles ==========

@router.get("/job-roles")
def get_job_roles(active_only: bool = False):
    """İş kollarını getir"""
    settings = _get_settings()
    roles = settings.get("jobRoles", [])
    
    if active_only:
        roles = [r for r in roles if r.get("active", True)]
    
    return roles


@router.get("/job-roles/{role_id}")
def get_job_role(role_id: str):
    """Tek bir iş kolunu getir"""
    settings = _get_settings()
    roles = settings.get("jobRoles", [])
    
    role = next((r for r in roles if r.get("id") == role_id), None)
    if not role:
        raise HTTPException(status_code=404, detail="İş kolu bulunamadı")
    
    return role


@router.post("/job-roles", status_code=201)
def create_job_role(payload: JobRoleConfig):
    """Yeni iş kolu oluştur"""
    settings = _get_settings()
    roles = settings.get("jobRoles", [])
    
    # Montaj aşamalarına ID ata
    assembly_stages = []
    for i, stage in enumerate(payload.assemblyStages):
        assembly_stages.append({
            "id": stage.id or _gen_id("STG"),
            "name": stage.name,
            "order": stage.order or (i + 1)
        })
    
    new_role = {
        "id": _gen_id("ROLE"),
        "name": payload.name,
        "description": payload.description,
        "productionType": payload.productionType,
        "requiresGlass": payload.requiresGlass,
        "defaultGlassSupplier": payload.defaultGlassSupplier,
        "defaultSupplier": payload.defaultSupplier,
        "estimatedDays": payload.estimatedDays,
        "active": payload.active,
        "assemblyStages": assembly_stages,
        "createdAt": datetime.utcnow().isoformat()
    }
    
    roles.append(new_role)
    settings["jobRoles"] = roles
    save_json("settings.json", settings)
    
    return new_role


@router.put("/job-roles/{role_id}")
def update_job_role(role_id: str, payload: JobRoleConfig):
    """İş kolunu güncelle"""
    settings = _get_settings()
    roles = settings.get("jobRoles", [])
    
    for idx, role in enumerate(roles):
        if role.get("id") == role_id:
            # Montaj aşamalarına ID ata
            assembly_stages = []
            for i, stage in enumerate(payload.assemblyStages):
                assembly_stages.append({
                    "id": stage.id or _gen_id("STG"),
                    "name": stage.name,
                    "order": stage.order or (i + 1)
                })
            
            role["name"] = payload.name
            role["description"] = payload.description
            role["productionType"] = payload.productionType
            role["requiresGlass"] = payload.requiresGlass
            role["defaultGlassSupplier"] = payload.defaultGlassSupplier
            role["defaultSupplier"] = payload.defaultSupplier
            role["estimatedDays"] = payload.estimatedDays
            role["active"] = payload.active
            role["assemblyStages"] = assembly_stages
            role["updatedAt"] = datetime.utcnow().isoformat()
            
            roles[idx] = role
            settings["jobRoles"] = roles
            save_json("settings.json", settings)
            return role
    
    raise HTTPException(status_code=404, detail="İş kolu bulunamadı")


@router.delete("/job-roles/{role_id}")
def delete_job_role(role_id: str):
    """İş kolunu sil (soft delete - inactive yap)"""
    settings = _get_settings()
    roles = settings.get("jobRoles", [])
    
    for idx, role in enumerate(roles):
        if role.get("id") == role_id:
            role["active"] = False
            role["deletedAt"] = datetime.utcnow().isoformat()
            roles[idx] = role
            settings["jobRoles"] = roles
            save_json("settings.json", settings)
            return {"success": True, "id": role_id}
    
    raise HTTPException(status_code=404, detail="İş kolu bulunamadı")


# ========== Glass Types ==========

@router.get("/glass-types")
def get_glass_types():
    """Cam tiplerini getir"""
    settings = _get_settings()
    return settings.get("glassTypes", [])


@router.post("/glass-types", status_code=201)
def create_glass_type(payload: GlassType):
    """Yeni cam tipi ekle"""
    settings = _get_settings()
    glass_types = settings.get("glassTypes", [])
    
    new_glass = {
        "id": _gen_id("GLASS"),
        "name": payload.name,
        "code": payload.code
    }
    
    glass_types.append(new_glass)
    settings["glassTypes"] = glass_types
    save_json("settings.json", settings)
    
    return new_glass


@router.put("/glass-types/{glass_id}")
def update_glass_type(glass_id: str, payload: GlassType):
    """Cam tipini güncelle"""
    settings = _get_settings()
    glass_types = settings.get("glassTypes", [])
    
    for idx, glass in enumerate(glass_types):
        if glass.get("id") == glass_id:
            glass["name"] = payload.name
            glass["code"] = payload.code
            glass_types[idx] = glass
            settings["glassTypes"] = glass_types
            save_json("settings.json", settings)
            return glass
    
    raise HTTPException(status_code=404, detail="Cam tipi bulunamadı")


@router.delete("/glass-types/{glass_id}")
def delete_glass_type(glass_id: str):
    """Cam tipini sil"""
    settings = _get_settings()
    glass_types = settings.get("glassTypes", [])
    glass_types = [g for g in glass_types if g.get("id") != glass_id]
    settings["glassTypes"] = glass_types
    save_json("settings.json", settings)
    return {"success": True, "id": glass_id}


# ========== Combination Types ==========

@router.get("/combination-types")
def get_combination_types():
    """Kombinasyon tiplerini getir (autocomplete için)"""
    settings = _get_settings()
    return settings.get("combinationTypes", [])


@router.post("/combination-types", status_code=201)
def add_combination_type(name: str):
    """Yeni kombinasyon tipi ekle"""
    settings = _get_settings()
    combinations = settings.get("combinationTypes", [])
    
    # Zaten varsa ekleme
    if any(c.get("name", "").lower() == name.lower() for c in combinations):
        return {"message": "Zaten mevcut"}
    
    new_comb = {
        "id": _gen_id("COMB"),
        "name": name,
        "createdAt": datetime.utcnow().isoformat()
    }
    
    combinations.append(new_comb)
    settings["combinationTypes"] = combinations
    save_json("settings.json", settings)
    
    return new_comb


# ========== Generic Config Items (IssueTypes, FaultSources, CancelReasons, DelayReasons) ==========

class ConfigItem(BaseModel):
    """Genel yapılandırma öğesi"""
    name: str
    icon: str | None = None


# ----- Issue Types -----
@router.get("/issue-types")
def get_issue_types():
    """Sorun tiplerini getir"""
    settings = _get_settings()
    return settings.get("issueTypes", [])


@router.post("/issue-types", status_code=201)
def create_issue_type(payload: ConfigItem):
    """Yeni sorun tipi ekle"""
    settings = _get_settings()
    items = settings.get("issueTypes", [])
    
    new_item = {
        "id": _gen_id("ISS"),
        "name": payload.name,
        "icon": payload.icon or "❓"
    }
    
    items.append(new_item)
    settings["issueTypes"] = items
    save_json("settings.json", settings)
    return new_item


@router.put("/issue-types/{item_id}")
def update_issue_type(item_id: str, payload: ConfigItem):
    """Sorun tipini güncelle"""
    settings = _get_settings()
    items = settings.get("issueTypes", [])
    
    for idx, item in enumerate(items):
        if item.get("id") == item_id:
            item["name"] = payload.name
            item["icon"] = payload.icon or item.get("icon", "❓")
            items[idx] = item
            settings["issueTypes"] = items
            save_json("settings.json", settings)
            return item
    
    raise HTTPException(status_code=404, detail="Sorun tipi bulunamadı")


@router.delete("/issue-types/{item_id}")
def delete_issue_type(item_id: str):
    """Sorun tipini sil"""
    settings = _get_settings()
    items = settings.get("issueTypes", [])
    items = [i for i in items if i.get("id") != item_id]
    settings["issueTypes"] = items
    save_json("settings.json", settings)
    return {"success": True, "id": item_id}


# ----- Fault Sources -----
@router.get("/fault-sources")
def get_fault_sources():
    """Hata kaynaklarını getir"""
    settings = _get_settings()
    return settings.get("faultSources", [])


@router.post("/fault-sources", status_code=201)
def create_fault_source(payload: ConfigItem):
    """Yeni hata kaynağı ekle"""
    settings = _get_settings()
    items = settings.get("faultSources", [])
    
    new_item = {
        "id": _gen_id("FLT"),
        "name": payload.name
    }
    
    items.append(new_item)
    settings["faultSources"] = items
    save_json("settings.json", settings)
    return new_item


@router.put("/fault-sources/{item_id}")
def update_fault_source(item_id: str, payload: ConfigItem):
    """Hata kaynağını güncelle"""
    settings = _get_settings()
    items = settings.get("faultSources", [])
    
    for idx, item in enumerate(items):
        if item.get("id") == item_id:
            item["name"] = payload.name
            items[idx] = item
            settings["faultSources"] = items
            save_json("settings.json", settings)
            return item
    
    raise HTTPException(status_code=404, detail="Hata kaynağı bulunamadı")


@router.delete("/fault-sources/{item_id}")
def delete_fault_source(item_id: str):
    """Hata kaynağını sil"""
    settings = _get_settings()
    items = settings.get("faultSources", [])
    items = [i for i in items if i.get("id") != item_id]
    settings["faultSources"] = items
    save_json("settings.json", settings)
    return {"success": True, "id": item_id}


# ----- Cancel Reasons -----
@router.get("/cancel-reasons")
def get_cancel_reasons():
    """İptal nedenlerini getir"""
    settings = _get_settings()
    return settings.get("cancelReasons", [])


@router.post("/cancel-reasons", status_code=201)
def create_cancel_reason(payload: ConfigItem):
    """Yeni iptal nedeni ekle"""
    settings = _get_settings()
    items = settings.get("cancelReasons", [])
    
    new_item = {
        "id": _gen_id("CNL"),
        "name": payload.name
    }
    
    items.append(new_item)
    settings["cancelReasons"] = items
    save_json("settings.json", settings)
    return new_item


@router.put("/cancel-reasons/{item_id}")
def update_cancel_reason(item_id: str, payload: ConfigItem):
    """İptal nedenini güncelle"""
    settings = _get_settings()
    items = settings.get("cancelReasons", [])
    
    for idx, item in enumerate(items):
        if item.get("id") == item_id:
            item["name"] = payload.name
            items[idx] = item
            settings["cancelReasons"] = items
            save_json("settings.json", settings)
            return item
    
    raise HTTPException(status_code=404, detail="İptal nedeni bulunamadı")


@router.delete("/cancel-reasons/{item_id}")
def delete_cancel_reason(item_id: str):
    """İptal nedenini sil"""
    settings = _get_settings()
    items = settings.get("cancelReasons", [])
    items = [i for i in items if i.get("id") != item_id]
    settings["cancelReasons"] = items
    save_json("settings.json", settings)
    return {"success": True, "id": item_id}


# ----- Delay Reasons -----
@router.get("/delay-reasons")
def get_delay_reasons():
    """Gecikme nedenlerini getir"""
    settings = _get_settings()
    return settings.get("delayReasons", [])


@router.post("/delay-reasons", status_code=201)
def create_delay_reason(payload: ConfigItem):
    """Yeni gecikme nedeni ekle"""
    settings = _get_settings()
    items = settings.get("delayReasons", [])
    
    new_item = {
        "id": _gen_id("DLY"),
        "name": payload.name
    }
    
    items.append(new_item)
    settings["delayReasons"] = items
    save_json("settings.json", settings)
    return new_item


@router.put("/delay-reasons/{item_id}")
def update_delay_reason(item_id: str, payload: ConfigItem):
    """Gecikme nedenini güncelle"""
    settings = _get_settings()
    items = settings.get("delayReasons", [])
    
    for idx, item in enumerate(items):
        if item.get("id") == item_id:
            item["name"] = payload.name
            items[idx] = item
            settings["delayReasons"] = items
            save_json("settings.json", settings)
            return item
    
    raise HTTPException(status_code=404, detail="Gecikme nedeni bulunamadı")


@router.delete("/delay-reasons/{item_id}")
def delete_delay_reason(item_id: str):
    """Gecikme nedenini sil"""
    settings = _get_settings()
    items = settings.get("delayReasons", [])
    items = [i for i in items if i.get("id") != item_id]
    settings["delayReasons"] = items
    save_json("settings.json", settings)
    return {"success": True, "id": item_id}
