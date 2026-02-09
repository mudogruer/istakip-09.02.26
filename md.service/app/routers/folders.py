"""
Dijital Arşiv - Klasör Yönetimi API
Şirket belgeleri, tedarikçi belgeleri ve özel klasörler için
"""
import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from ..data_loader import load_json, save_json

router = APIRouter(prefix="/folders", tags=["folders"])


# Varsayılan sistem klasörleri
DEFAULT_FOLDERS = [
    {
        "id": "FOLDER-ISLER",
        "name": "İş Belgeleri",
        "icon": "📋",
        "color": "#3b82f6",
        "type": "system",
        "category": "jobs",
        "description": "İşlere ait tüm belgeler (ölçü, teknik, sözleşme vb.)",
        "isSystem": True,
        "order": 1
    },
    {
        "id": "FOLDER-SIRKET",
        "name": "Şirket Belgeleri",
        "icon": "🏢",
        "color": "#10b981",
        "type": "system",
        "category": "company",
        "description": "Şirket geneli belgeler",
        "isSystem": True,
        "order": 2,
        "subfolders": [
            {"id": "FOLDER-ARACLAR", "name": "Araçlar", "icon": "🚗", "color": "#f59e0b"},
            {"id": "FOLDER-MAKINELER", "name": "Makineler", "icon": "🏭", "color": "#8b5cf6"},
            {"id": "FOLDER-OFIS", "name": "Ofis", "icon": "🏠", "color": "#ec4899"},
            {"id": "FOLDER-GENEL", "name": "Genel", "icon": "📁", "color": "#6b7280"},
        ]
    },
    {
        "id": "FOLDER-TEDARIKCILER",
        "name": "Tedarikçi Belgeleri",
        "icon": "🤝",
        "color": "#f97316",
        "type": "system",
        "category": "suppliers",
        "description": "Tedarikçilere ait belgeler",
        "isSystem": True,
        "order": 3
    }
]


class FolderCreate(BaseModel):
    name: str
    icon: str = "📁"
    color: str = "#6b7280"
    parentId: Optional[str] = None
    category: str = "custom"  # jobs, company, suppliers, custom
    description: Optional[str] = None


class FolderUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None


def _ensure_default_folders():
    """Varsayılan klasörlerin varlığını kontrol et"""
    folders = load_json("folders.json")
    
    # Eğer hiç klasör yoksa varsayılanları ekle
    if not folders:
        folders = DEFAULT_FOLDERS
        save_json("folders.json", folders)
    
    return folders


@router.get("/")
def list_folders():
    """Tüm klasörleri listele"""
    folders = _ensure_default_folders()
    return folders


@router.get("/{folder_id}")
def get_folder(folder_id: str):
    """Klasör detayını getir"""
    folders = _ensure_default_folders()
    
    # Ana klasörlerde ara
    for folder in folders:
        if folder.get("id") == folder_id:
            return folder
        # Alt klasörlerde ara
        if "subfolders" in folder:
            for sub in folder["subfolders"]:
                if sub.get("id") == folder_id:
                    return {**sub, "parentId": folder["id"]}
    
    raise HTTPException(status_code=404, detail="Klasör bulunamadı")


@router.post("/")
def create_folder(data: FolderCreate):
    """Yeni klasör oluştur"""
    folders = _ensure_default_folders()
    
    folder_id = f"FOLDER-{str(uuid.uuid4())[:8].upper()}"
    
    new_folder = {
        "id": folder_id,
        "name": data.name,
        "icon": data.icon,
        "color": data.color,
        "type": "custom",
        "category": data.category,
        "description": data.description,
        "isSystem": False,
        "parentId": data.parentId,
        "createdAt": datetime.utcnow().isoformat() + "Z",
        "order": len(folders) + 1
    }
    
    # Eğer parentId varsa, alt klasör olarak ekle
    if data.parentId:
        for folder in folders:
            if folder.get("id") == data.parentId:
                if "subfolders" not in folder:
                    folder["subfolders"] = []
                folder["subfolders"].append(new_folder)
                save_json("folders.json", folders)
                return new_folder
        raise HTTPException(status_code=404, detail="Üst klasör bulunamadı")
    
    # Ana klasör olarak ekle
    folders.append(new_folder)
    save_json("folders.json", folders)
    
    return new_folder


@router.put("/{folder_id}")
def update_folder(folder_id: str, data: FolderUpdate):
    """Klasörü güncelle"""
    folders = _ensure_default_folders()
    
    # Ana klasörlerde ara
    for folder in folders:
        if folder.get("id") == folder_id:
            if folder.get("isSystem"):
                raise HTTPException(status_code=400, detail="Sistem klasörleri düzenlenemez")
            
            if data.name: folder["name"] = data.name
            if data.icon: folder["icon"] = data.icon
            if data.color: folder["color"] = data.color
            if data.description is not None: folder["description"] = data.description
            folder["updatedAt"] = datetime.utcnow().isoformat() + "Z"
            
            save_json("folders.json", folders)
            return folder
        
        # Alt klasörlerde ara
        if "subfolders" in folder:
            for sub in folder["subfolders"]:
                if sub.get("id") == folder_id:
                    if data.name: sub["name"] = data.name
                    if data.icon: sub["icon"] = data.icon
                    if data.color: sub["color"] = data.color
                    if data.description is not None: sub["description"] = data.description
                    sub["updatedAt"] = datetime.utcnow().isoformat() + "Z"
                    
                    save_json("folders.json", folders)
                    return sub
    
    raise HTTPException(status_code=404, detail="Klasör bulunamadı")


@router.delete("/{folder_id}")
def delete_folder(folder_id: str):
    """Klasörü sil"""
    folders = _ensure_default_folders()
    
    # Sistem klasörleri silinemez
    for folder in folders:
        if folder.get("id") == folder_id:
            if folder.get("isSystem"):
                raise HTTPException(status_code=400, detail="Sistem klasörleri silinemez")
            
            folders.remove(folder)
            save_json("folders.json", folders)
            return {"success": True, "id": folder_id}
        
        # Alt klasörlerde ara
        if "subfolders" in folder:
            for sub in folder["subfolders"]:
                if sub.get("id") == folder_id:
                    folder["subfolders"].remove(sub)
                    save_json("folders.json", folders)
                    return {"success": True, "id": folder_id}
    
    raise HTTPException(status_code=404, detail="Klasör bulunamadı")


@router.get("/{folder_id}/documents")
def get_folder_documents(folder_id: str):
    """Klasöre ait belgeleri getir"""
    documents = load_json("documents.json")
    
    # jobs kategorisi için jobId'ye göre filtrele
    folder = None
    folders = _ensure_default_folders()
    for f in folders:
        if f.get("id") == folder_id:
            folder = f
            break
        if "subfolders" in f:
            for sub in f["subfolders"]:
                if sub.get("id") == folder_id:
                    folder = sub
                    break
    
    if not folder:
        raise HTTPException(status_code=404, detail="Klasör bulunamadı")
    
    # Belgeleri filtrele
    if folder_id == "FOLDER-ISLER":
        # İş belgeleri - jobId olanlar
        return [d for d in documents if d.get("jobId") and not d.get("supplierId") and not d.get("folderId")]
    elif folder_id == "FOLDER-TEDARIKCILER":
        # Tedarikçi belgeleri
        return [d for d in documents if d.get("supplierId")]
    else:
        # Diğer klasörler - folderId'ye göre
        return [d for d in documents if d.get("folderId") == folder_id]
