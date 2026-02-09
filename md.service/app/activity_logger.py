"""
Aktivite Log Helper - Tüm router'larda kullanılabilir
"""
from datetime import datetime
import secrets
from .data_loader import load_json, save_json


def log_activity(
    user_id: str,
    user_name: str,
    action: str,
    target_type: str,
    target_id: str = None,
    target_name: str = None,
    details: str = None,
    icon: str = "assignment",
    extra_data: dict = None
):
    """
    Aktivite log kaydet
    
    Args:
        user_id: Kullanıcı ID (users.json id)
        user_name: Kullanıcı görünen adı
        action: İşlem tipi (create, update, delete, view, status_change, upload, assign, approve, reject, vb.)
        target_type: Hedef tipi (job, customer, personnel, task, document, invoice, stock, planning, vb.)
        target_id: Hedef ID (opsiyonel)
        target_name: Hedef açıklama/isim (opsiyonel)
        details: Detaylı açıklama (opsiyonel)
        icon: Material icon adı (snake_case, varsayılan assignment)
        extra_data: Ekstra veriler dict (opsiyonel)
    """
    try:
        activities = load_json("activities.json")
    except:
        activities = []
    
    activity = {
        "id": f"act_{datetime.now().strftime('%Y%m%d%H%M%S')}_{secrets.token_hex(4)}",
        "timestamp": datetime.now().isoformat(),
        "userId": user_id,
        "userName": user_name,
        "action": action,
        "targetType": target_type,
        "targetId": target_id,
        "targetName": target_name,
        "details": details,
        "icon": icon
    }
    
    if extra_data:
        activity["extraData"] = extra_data
    
    activities.insert(0, activity)
    
    # Son 2000 aktiviteyi tut
    activities = activities[:2000]
    
    save_json("activities.json", activities)
    return activity


# Action türleri ve Material icon adları (muiIcons ARCHIVE_ICONS/STATUS_ICONS ile uyumlu)
ACTION_ICONS = {
    # Auth
    "login": "lock",
    "logout": "logout",
    
    # CRUD
    "create": "add",
    "update": "edit",
    "delete": "delete",
    "view": "visibility",
    
    # İş/Job işlemleri
    "job_create": "assignment",
    "job_status_change": "sync",
    "job_assign": "person",
    "job_role_add": "inventory_2",
    "job_role_remove": "inventory_2",
    "job_measure_schedule": "event",
    "job_measure_complete": "straighten",
    "job_technical_upload": "rule",
    "job_offer_create": "attach_money",
    "job_offer_update": "attach_money",
    "job_offer_approve": "check_circle",
    "job_offer_reject": "cancel",
    "job_contract_upload": "description",
    "job_production_start": "precision_manufacturing",
    "job_production_complete": "check_circle",
    "job_assembly_schedule": "build",
    "job_assembly_complete": "build",
    "job_delivery": "local_shipping",
    "job_complete": "star",
    "job_cancel": "cancel",
    
    # Planlama
    "planning_create": "event",
    "planning_update": "event",
    "planning_delete": "event",
    "planning_move": "swap_horiz",
    
    # Görev
    "task_create": "push_pin",
    "task_update": "edit",
    "task_assign": "person",
    "task_status_change": "sync",
    "task_complete": "check_circle",
    
    # Müşteri
    "customer_create": "person",
    "customer_update": "edit",
    "customer_delete": "delete",
    
    # Personel
    "personnel_create": "person",
    "personnel_update": "edit",
    "personnel_delete": "delete",
    "user_create": "vpn_key",
    
    # Ekip
    "team_create": "groups",
    "team_update": "edit",
    "team_member_add": "add",
    "team_member_remove": "remove",
    
    # Rol
    "role_create": "label",
    "role_update": "edit",
    "role_delete": "delete",
    
    # Stok
    "stock_create": "inventory_2",
    "stock_update": "edit",
    "stock_add": "trending_up",
    "stock_remove": "trending_down",
    "stock_movement": "sync",
    
    # Satınalma
    "purchase_create": "shopping_cart",
    "purchase_update": "edit",
    "purchase_receive": "download",
    "purchase_complete": "check_circle",
    
    # Üretim siparişi
    "production_order_create": "precision_manufacturing",
    "production_order_update": "edit",
    "production_order_receive": "download",
    "production_order_complete": "check_circle",
    "production_order_cancel": "cancel",
    "production_create": "precision_manufacturing",
    
    # Montaj
    "assembly_create": "build",
    "assembly_complete": "check_circle",
    
    # Tedarikçi
    "supplier_create": "business",
    "supplier_update": "edit",
    "supplier_delete": "delete",
    "supplier_transaction": "credit_card",
    
    # Finans
    "invoice_create": "receipt",
    "invoice_update": "edit",
    "payment_create": "attach_money",
    "payment_update": "edit",
    
    # Belge
    "document_upload": "upload_file",
    "document_delete": "delete",
    
    # Arşiv
    "archive_upload": "folder",
    "archive_delete": "delete",
    
    # Ayarlar
    "settings_update": "settings",
    
    # Servis
    "service_create": "build",
    "service_update": "edit",
    "service_complete": "check_circle",
    
    # Montaj görevleri
    "assembly_task_create": "build",
    "assembly_task_update": "edit",
    "assembly_task_complete": "check_circle",
    "assembly_photo_upload": "camera_alt",
    
    # Genel
    "approve": "check_circle",
    "reject": "cancel",
    "cancel": "cancel",
    "complete": "star",
    "assign": "person",
    "unassign": "person",
    "upload": "upload_file",
    "download": "download",
    "export": "bar_chart",
    "import": "download",
    "move": "swap_horiz",
    "copy": "assignment",
    "schedule": "event",
    "reschedule": "event",
    "note_add": "assignment",
}


def get_action_icon(action: str) -> str:
    """Aksiyon için ikon döndür"""
    return ACTION_ICONS.get(action, "assignment")
