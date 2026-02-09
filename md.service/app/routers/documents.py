import os
import uuid
import shutil
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Header
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional

from ..data_loader import load_json, save_json
from ..activity_logger import log_activity, get_action_icon

router = APIRouter(prefix="/documents", tags=["documents"])


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

# Base paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
DOCS_DIR = BASE_DIR / "md.docs" / "documents"

# Ensure directories exist
DOCS_DIR.mkdir(parents=True, exist_ok=True)
for subdir in ["olcu", "teknik", "sozlesme", "teklif", "diger", "servis", "montaj", "irsaliye"]:
    (DOCS_DIR / subdir).mkdir(exist_ok=True)

ALLOWED_TYPES = {
    # Görsel formatları
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
    "image/tiff": ".tiff",
    # PDF
    "application/pdf": ".pdf",
    # Microsoft Office
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-powerpoint": ".ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    # CAD formatları
    "application/acad": ".dwg",
    "application/x-acad": ".dwg",
    "application/x-autocad": ".dwg",
    "image/vnd.dwg": ".dwg",
    "image/x-dwg": ".dwg",
    "application/dxf": ".dxf",
    "image/vnd.dxf": ".dxf",
    "image/x-dxf": ".dxf",
    # Arşiv
    "application/zip": ".zip",
    "application/x-rar-compressed": ".rar",
    "application/x-7z-compressed": ".7z",
    # Metin
    "text/plain": ".txt",
    "text/csv": ".csv",
    # Fallback - bilinmeyen tipler için uzantıya bak
    "application/octet-stream": None,  # Uzantıya göre belirlenecek
}

# Uzantıya göre izin verilen dosyalar (content-type belirsiz olduğunda)
ALLOWED_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".dwg", ".dxf", ".zip", ".rar", ".7z", ".txt", ".csv"
}


class DocumentMeta(BaseModel):
    jobId: str
    type: str
    description: str | None = None


@router.get("/")
def list_documents(job_id: str | None = None, doc_type: str | None = None):
    """List all documents, optionally filtered by jobId or type"""
    docs = load_json("documents.json")
    if job_id:
        docs = [d for d in docs if d.get("jobId") == job_id]
    if doc_type:
        docs = [d for d in docs if d.get("type") == doc_type]
    return docs


@router.get("/{doc_id}")
def get_document(doc_id: str):
    """Get document metadata by ID"""
    docs = load_json("documents.json")
    for doc in docs:
        if doc.get("id") == doc_id:
            return doc
    raise HTTPException(status_code=404, detail="Döküman bulunamadı")


@router.get("/{doc_id}/download")
def download_document(doc_id: str):
    """Download a document file"""
    docs = load_json("documents.json")
    doc = None
    for d in docs:
        if d.get("id") == doc_id:
            doc = d
            break
    
    if not doc:
        raise HTTPException(status_code=404, detail="Döküman bulunamadı")
    
    file_path = BASE_DIR / "md.docs" / doc["path"]
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Dosya bulunamadı")
    
    return FileResponse(
        path=str(file_path),
        filename=doc.get("originalName", doc["filename"]),
        media_type=doc.get("mimeType", "application/octet-stream")
    )


MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    jobId: str = Form(None),  # Opsiyonel - şirket belgeleri için
    docType: str = Form(...),
    description: str = Form(None),
    folderId: str = Form(None),  # Klasör ID (şirket belgeleri için)
    supplierId: str = Form(None),  # Tedarikçi ID (tedarikçi belgeleri için)
    authorization: Optional[str] = Header(None)
):
    """
    Upload a document file.
    docType: olcu, teknik, sozlesme, teklif, diger, measure_*, technical_*, arac, makine, ofis, genel
    Max file size: 100MB
    jobId, folderId veya supplierId'den en az biri gerekli.
    """
    # Dosya boyutu kontrolü (100MB)
    contents = await file.read()
    file_size = len(contents)
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413, 
            detail=f"Dosya boyutu çok büyük. Maksimum: 100MB, Yüklenen: {file_size / (1024*1024):.1f}MB"
        )
    # Dosyayı başa sar (okuduktan sonra)
    await file.seek(0)
    
    # En az bir referans gerekli
    if not jobId and not folderId and not supplierId:
        raise HTTPException(status_code=400, detail="jobId, folderId veya supplierId'den en az biri gerekli")
    
    # Validate type - ana tipler ve iş kolu bazlı tipler
    valid_base_types = [
        "olcu", "teknik", "sozlesme", "teklif", "diger", 
        "servis_oncesi", "servis_sonrasi", "montaj", "irsaliye",
        # Montaj fotoğrafları
        "montaj_oncesi", "montaj_sonrasi", "musteri_imza", "montaj_sorun",
        # Müşteri ölçüsü (fiyat sorgusu)
        "musteri_olcusu",
        # Şirket belgeleri
        "arac", "makine", "ofis", "genel",
        # Tedarikçi belgeleri
        "fiyat_listesi", "kalite", "tedarikci_sozlesme"
    ]
    is_role_based = docType.startswith("measure_") or docType.startswith("technical_")
    
    if docType not in valid_base_types and not is_role_based:
        raise HTTPException(status_code=400, detail="Geçersiz döküman tipi")
    
    # Dosya uzantısını al
    original_name = file.filename or "unnamed"
    file_ext = os.path.splitext(original_name)[1].lower()
    
    # content-type veya uzantıya göre kontrol
    content_type = file.content_type or ""
    
    # Önce content-type'a bak
    if content_type in ALLOWED_TYPES and ALLOWED_TYPES[content_type] is not None:
        ext = ALLOWED_TYPES[content_type]
    # content-type bilinmiyorsa uzantıya bak
    elif file_ext in ALLOWED_EXTENSIONS:
        ext = file_ext
    # application/octet-stream ise uzantıya güven
    elif content_type == "application/octet-stream" and file_ext in ALLOWED_EXTENSIONS:
        ext = file_ext
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Desteklenmeyen dosya tipi: {content_type or 'bilinmiyor'} ({file_ext}). "
                   f"Desteklenen formatlar: JPG, PNG, PDF, DOC, DOCX, XLS, XLSX, DWG, DXF, ZIP, RAR vb."
        )
    
    # Generate unique filename
    doc_id = f"DOC-{str(uuid.uuid4())[:8].upper()}"
    safe_name = f"{doc_id}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}{ext}"
    
    # Klasör belirleme - belge tipine göre
    target_subdir = "diger"
    if docType in ["olcu", "teknik", "sozlesme", "teklif", "diger", "montaj", "irsaliye"]:
        target_subdir = docType
    elif docType.startswith("measure_"):
        target_subdir = "olcu"
    elif docType.startswith("technical_"):
        target_subdir = "teknik"
    elif docType.startswith("servis"):
        target_subdir = "servis"
    # Müşteri ölçüsü (fiyat sorgusu)
    elif docType == "musteri_olcusu":
        target_subdir = "musteri_olcusu"
    # Montaj fotoğrafları
    elif docType in ["montaj_oncesi", "montaj_sonrasi", "musteri_imza", "montaj_sorun"]:
        target_subdir = "montaj"
    # Şirket belgeleri
    elif docType in ["arac", "makine", "ofis", "genel"]:
        target_subdir = f"sirket/{docType}"
    # Tedarikçi belgeleri
    elif docType in ["fiyat_listesi", "kalite", "tedarikci_sozlesme"]:
        target_subdir = "tedarikciler"
    
    # Save file
    target_dir = DOCS_DIR / target_subdir
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / safe_name
    
    try:
        with open(target_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dosya kaydedilemedi: {str(e)}")
    
    # Get file size
    file_size = target_path.stat().st_size
    
    # Kullanıcı bilgisi
    user_id, user_name = _get_user_info(authorization)
    
    # Create metadata
    doc_meta = {
        "id": doc_id,
        "jobId": jobId,
        "folderId": folderId,
        "supplierId": supplierId,
        "type": docType,
        "filename": safe_name,
        "originalName": file.filename,
        "path": f"documents/{target_subdir}/{safe_name}",
        "mimeType": content_type,
        "size": file_size,
        "uploadedBy": user_name,
        "uploadedAt": datetime.utcnow().isoformat() + "Z",
        "description": description
    }
    
    # Save to database
    docs = load_json("documents.json")
    docs.insert(0, doc_meta)
    save_json("documents.json", docs)
    
    # Aktivite log
    target_name = file.filename or "Dosya"
    if jobId:
        target_type = "job"
        target_id = jobId
        details = f"İşe belge yüklendi: {target_name}"
    elif supplierId:
        target_type = "supplier"
        target_id = supplierId
        details = f"Tedarikçiye belge yüklendi: {target_name}"
    else:
        target_type = "document"
        target_id = doc_id
        details = f"Belge yüklendi: {target_name}"
    
    log_activity(
        user_id=user_id,
        user_name=user_name,
        action="document_upload",
        target_type=target_type,
        target_id=target_id,
        target_name=target_name,
        details=details,
        icon=get_action_icon("document_upload")
    )
    
    return doc_meta


@router.delete("/{doc_id}")
def delete_document(doc_id: str, authorization: Optional[str] = Header(None)):
    """Delete a document and its file"""
    user_id, user_name = _get_user_info(authorization)
    docs = load_json("documents.json")
    doc = None
    doc_idx = -1
    
    for idx, d in enumerate(docs):
        if d.get("id") == doc_id:
            doc = d
            doc_idx = idx
            break
    
    if not doc:
        raise HTTPException(status_code=404, detail="Döküman bulunamadı")
    
    # Delete file
    file_path = BASE_DIR / "md.docs" / doc["path"]
    if file_path.exists():
        try:
            file_path.unlink()
        except Exception:
            pass  # File deletion is best effort
    
    # Remove from database
    docs.pop(doc_idx)
    save_json("documents.json", docs)
    
    # Aktivite log
    log_activity(
        user_id=user_id,
        user_name=user_name,
        action="document_delete",
        target_type="document",
        target_id=doc_id,
        target_name=doc.get("originalName", "Dosya"),
        details=f"Belge silindi: {doc.get('originalName', 'Dosya')}",
        icon=get_action_icon("document_delete")
    )
    
    return {"success": True, "id": doc_id}


@router.get("/job/{job_id}")
def get_job_documents(job_id: str):
    """Get all documents for a specific job"""
    docs = load_json("documents.json")
    return [d for d in docs if d.get("jobId") == job_id]

