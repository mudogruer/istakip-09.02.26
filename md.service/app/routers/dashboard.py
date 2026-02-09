"""
Dashboard Widget Verileri API
Her widget icin ayri endpoint ile gercek zamanli veri saglar.
"""
from fastapi import APIRouter
from datetime import datetime, timedelta
from ..data_loader import load_json

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


def get_date_range_filter(days=30):
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    return start_date.isoformat(), end_date.isoformat()


@router.get("/widgets/overview")
async def get_overview_stats():
    jobs = load_json("jobs.json")
    customers = load_json("customers.json")
    
    today = datetime.now().date().isoformat()
    this_month = datetime.now().strftime("%Y-%m")
    
    active_jobs = [j for j in jobs if j.get("status") not in ["TAMAMLANDI", "IPTAL", "FIYAT_SORGUSU_RED"]]
    month_jobs = [j for j in jobs if j.get("createdAt", "").startswith(this_month)]
    
    today_appointments = []
    for j in jobs:
        measure_date = j.get("measureDate", "")
        assembly_date = j.get("assemblyDate", "")
        if measure_date and measure_date.startswith(today):
            today_appointments.append({"type": "measure", "job": j})
        if assembly_date and assembly_date.startswith(today):
            today_appointments.append({"type": "assembly", "job": j})
    
    return {
        "activeJobs": len(active_jobs),
        "monthJobs": len(month_jobs),
        "totalCustomers": len([c for c in customers if not c.get("deleted")]),
        "todayAppointments": len(today_appointments)
    }




@router.get("/widgets/measure-status")
async def get_measure_status():
    """Olcu durumu ozeti"""
    jobs = load_json("jobs.json")
    
    # Olcu ile alakali durumlar
    status_counts = {
        "randevu_bekliyor": 0,  # OLCU_RANDEVU_BEKLIYOR
        "randevu_alindi": 0,    # Randevu tarihi var ama olcu alinmamis
        "olcu_alindi": 0,       # OLCU_ALINDI
        "teknik_cizim": 0,      # TEKNIK_CIZIM
    }
    
    for job in jobs:
        # Fiyat sorgulari dahil degil
        if job.get("startType") == "MUSTERI_OLCUSU":
            continue
        
        status = job.get("status", "")
        
        if status == "OLCU_RANDEVU_BEKLIYOR":
            status_counts["randevu_bekliyor"] += 1
        elif status == "OLCU_ALINDI":
            status_counts["olcu_alindi"] += 1
        elif status == "TEKNIK_CIZIM":
            status_counts["teknik_cizim"] += 1
        elif job.get("measureDate") and status not in ["TAMAMLANDI", "IPTAL", "KAPALI", "FIYAT_SORGUSU_RED", "FIYAT_SORGUSU_ONAY"]:
            # Randevu tarihi var ama henuz olcu alinmamis
            if status not in ["OLCU_RANDEVU_BEKLIYOR", "OLCU_ALINDI", "TEKNIK_CIZIM"]:
                status_counts["randevu_alindi"] += 1
    
    return {
        "counts": status_counts,
        "total": sum(status_counts.values())
    }


@router.get("/widgets/today-appointments")
async def get_today_appointments():
    jobs = load_json("jobs.json")
    
    try:
        production_orders = load_json("productionOrders.json")
    except FileNotFoundError:
        production_orders = []
    
    try:
        assembly_tasks = load_json("assemblyTasks.json")
    except FileNotFoundError:
        assembly_tasks = []
    
    today = datetime.now().date().isoformat()
    
    measure_appointments = []
    for j in jobs:
        measure_date = j.get("measureDate", "")
        if measure_date and measure_date.startswith(today):
            measure_appointments.append({
                "id": j["id"],
                "customer": j.get("customerName", ""),
                "title": j.get("title", ""),
                "time": measure_date,
                "address": j.get("address", ""),
                "roles": [r.get("name") for r in j.get("roles", [])]
            })
    
    production_deliveries = []
    for po in production_orders:
        est_date = po.get("estimatedDelivery", "")
        if est_date and est_date.startswith(today) and po.get("status") not in ["delivered", "cancelled"]:
            production_deliveries.append({
                "id": po["id"],
                "jobId": po.get("jobId"),
                "supplier": po.get("supplierName", ""),
                "type": po.get("orderType", ""),
                "status": po.get("status", "")
            })
    
    assembly_appointments = []
    for at in assembly_tasks:
        scheduled_date = at.get("scheduledDate", "")
        if scheduled_date and scheduled_date.startswith(today) and at.get("status") not in ["completed", "cancelled"]:
            assembly_appointments.append({
                "id": at["id"],
                "jobId": at.get("jobId"),
                "customer": at.get("customerName", ""),
                "team": at.get("teamName", ""),
                "role": at.get("roleName", ""),
                "status": at.get("status", "")
            })
    
    return {
        "measure": measure_appointments,
        "production": production_deliveries,
        "assembly": assembly_appointments
    }


@router.get("/widgets/production-status")
async def get_production_status():
    try:
        production_orders = load_json("productionOrders.json")
    except FileNotFoundError:
        production_orders = []
    
    today = datetime.now().date().isoformat()
    
    status_counts = {
        "pending": 0, "ordered": 0, "in_production": 0,
        "ready": 0, "delivered": 0, "overdue": 0
    }
    
    overdue_list = []
    
    for po in production_orders:
        status = po.get("status", "pending")
        if status in status_counts:
            status_counts[status] += 1
        
        est_date = po.get("estimatedDelivery", "")
        if est_date and est_date < today and status not in ["delivered", "cancelled"]:
            status_counts["overdue"] += 1
            try:
                days_late = (datetime.now().date() - datetime.fromisoformat(est_date).date()).days
            except:
                days_late = 0
            overdue_list.append({
                "id": po["id"],
                "jobId": po.get("jobId"),
                "supplier": po.get("supplierName", ""),
                "daysLate": days_late
            })
    
    return {
        "counts": status_counts,
        "total": len(production_orders),
        "overdueItems": overdue_list[:5]
    }


@router.get("/widgets/assembly-status")
async def get_assembly_status():
    try:
        assembly_tasks = load_json("assemblyTasks.json")
    except FileNotFoundError:
        assembly_tasks = []
    
    try:
        teams = load_json("teams.json")
    except FileNotFoundError:
        teams = []
    
    today = datetime.now().date().isoformat()
    
    status_counts = {
        "pending": 0, "scheduled": 0, "in_progress": 0,
        "completed": 0, "delayed": 0
    }
    
    team_workload = {}
    
    for at in assembly_tasks:
        status = at.get("status", "pending")
        if status in status_counts:
            status_counts[status] += 1
        
        scheduled_date = at.get("scheduledDate", "")
        if scheduled_date and scheduled_date < today and status not in ["completed", "cancelled"]:
            status_counts["delayed"] += 1
        
        team_id = at.get("teamId")
        if team_id and status not in ["completed", "cancelled"]:
            team_workload[team_id] = team_workload.get(team_id, 0) + 1
    
    team_names = {t["id"]: t.get("ad", "Takim") for t in teams}
    team_stats = [
        {"id": tid, "name": team_names.get(tid, "Takim"), "count": cnt}
        for tid, cnt in sorted(team_workload.items(), key=lambda x: -x[1])[:5]
    ]
    
    return {
        "counts": status_counts,
        "total": len(assembly_tasks),
        "teamWorkload": team_stats
    }


@router.get("/widgets/stock-alerts")
async def get_stock_alerts():
    try:
        stock_items = load_json("stockItems.json")
    except FileNotFoundError:
        stock_items = []
    
    critical = []
    low = []
    
    for item in stock_items:
        if item.get("deleted"):
            continue
        
        on_hand = item.get("onHand", 0) or 0
        critical_level = item.get("critical", 10) or 10
        min_level = item.get("minLevel", critical_level * 2) or critical_level * 2
        
        code_str = item.get("productCode", "") + "-" + item.get("colorCode", "")
        
        if on_hand <= critical_level:
            critical.append({
                "id": item["id"],
                "name": item.get("name", ""),
                "code": code_str,
                "current": on_hand,
                "critical": critical_level,
                "unit": item.get("unit", "adet")
            })
        elif on_hand <= min_level:
            low.append({
                "id": item["id"],
                "name": item.get("name", ""),
                "code": code_str,
                "current": on_hand,
                "min": min_level,
                "unit": item.get("unit", "adet")
            })
    
    return {
        "critical": critical[:10],
        "low": low[:10],
        "criticalCount": len(critical),
        "lowCount": len(low)
    }


@router.get("/widgets/pending-orders")
async def get_pending_orders():
    try:
        purchase_orders = load_json("purchaseOrders.json")
    except FileNotFoundError:
        purchase_orders = []
    
    pending = []
    
    for po in purchase_orders:
        if po.get("status") in ["draft", "sent", "partial"]:
            pending.append({
                "id": po["id"],
                "supplier": po.get("supplierName", ""),
                "status": po.get("status", ""),
                "expectedDate": po.get("expectedDate", ""),
                "total": po.get("total", 0),
                "itemCount": len(po.get("items", []))
            })
    
    return {
        "orders": pending[:10],
        "totalCount": len(pending)
    }


@router.get("/widgets/recent-activities")
async def get_recent_activities():
    jobs = load_json("jobs.json")
    
    # Collect all log entries from all jobs
    all_activities = []
    for job in jobs:
        logs = job.get("logs", []) or []
        for log in logs[-5:]:  # Last 5 logs per job
            all_activities.append({
                "id": job["id"],
                "type": log.get("action", "update"),
                "title": job.get("title", ""),
                "customer": job.get("customerName", ""),
                "status": job.get("status", ""),
                "time": log.get("at", ""),
                "note": log.get("note", ""),
                "icon": get_status_icon(job.get("status", ""))
            })
    
    # Sort by time descending and get top 10
    recent = sorted(all_activities, key=lambda x: x.get("time", ""), reverse=True)[:10]
    
    return {"activities": recent}


@router.get("/widgets/weekly-summary")
async def get_weekly_summary():
    jobs = load_json("jobs.json")
    
    try:
        assembly_tasks = load_json("assemblyTasks.json")
    except FileNotFoundError:
        assembly_tasks = []
    
    try:
        production_orders = load_json("productionOrders.json")
    except FileNotFoundError:
        production_orders = []
    
    today = datetime.now().date()
    week_start = today - timedelta(days=today.weekday())
    week_start_str = week_start.isoformat()
    
    completed_jobs = len([
        j for j in jobs 
        if j.get("status") == "TAMAMLANDI" and 
        j.get("updatedAt", "")[:10] >= week_start_str
    ])
    
    measures_taken = len([
        j for j in jobs 
        if j.get("measureDate", "") >= week_start_str and
        j.get("measureDate", "") <= today.isoformat()
    ])
    
    delivered_production = len([
        po for po in production_orders 
        if po.get("status") == "delivered" and 
        (po.get("deliveredDate", "") or "")[:10] >= week_start_str
    ])
    
    completed_assembly = len([
        at for at in assembly_tasks 
        if at.get("status") == "completed" and 
        (at.get("completedAt", "") or "")[:10] >= week_start_str
    ])
    
    return {
        "completedJobs": completed_jobs,
        "measuresTaken": measures_taken,
        "deliveredProduction": delivered_production,
        "completedAssembly": completed_assembly,
        "weekStart": week_start_str
    }


@router.get("/widgets/financial-summary")
async def get_financial_summary():
    jobs = load_json("jobs.json")
    
    today = datetime.now()
    this_month = today.strftime("%Y-%m")
    
    total_revenue = 0
    total_collected = 0
    total_pending = 0
    
    for job in jobs:
        offer = job.get("offer", {})
        if offer is None:
            offer = {}
        total = offer.get("total", 0) or 0
        
        approved_at = job.get("approvedAt", "") or ""
        if approved_at.startswith(this_month):
            total_revenue += total
        
        payment_plan = job.get("paymentPlan", []) or []
        for payment in payment_plan:
            amount = payment.get("amount", 0) or 0
            if payment.get("paid"):
                total_collected += amount
            elif payment.get("status") != "cancelled":
                total_pending += amount
    
    collection_total = total_collected + total_pending
    collection_rate = round((total_collected / collection_total * 100) if collection_total > 0 else 0, 1)
    
    return {
        "monthRevenue": total_revenue,
        "collected": total_collected,
        "pending": total_pending,
        "collectionRate": collection_rate
    }


@router.get("/widgets/tasks-summary")
async def get_tasks_summary():
    try:
        tasks = load_json("tasks.json")
    except FileNotFoundError:
        tasks = []
    
    try:
        task_assignments = load_json("task_assignments.json")
    except FileNotFoundError:
        task_assignments = []
    
    status_counts = {
        "todo": 0, "in_progress": 0,
        "done": 0, "cancelled": 0
    }
    
    priority_counts = {
        "high": 0, "med": 0, "low": 0
    }
    
    for task in tasks:
        if task.get("deleted"):
            continue
        
        status = task.get("durum", "todo")
        priority = task.get("oncelik", "med")
        
        if status in status_counts:
            status_counts[status] += 1
        if priority in priority_counts:
            priority_counts[priority] += 1
    
    return {
        "byStatus": status_counts,
        "byPriority": priority_counts,
        "total": sum(status_counts.values()),
        "assignedCount": len(task_assignments)
    }


@router.get("/widgets/inquiry-stats")
async def get_inquiry_stats():
    jobs = load_json("jobs.json")
    
    inquiries = [j for j in jobs if j.get("startType") == "MUSTERI_OLCUSU"]
    
    approved = len([j for j in inquiries if j.get("status") == "FIYAT_SORGUSU_ONAY"])
    rejected = len([j for j in inquiries if j.get("status") == "FIYAT_SORGUSU_RED"])
    pending = len([j for j in inquiries if j.get("status") not in ["FIYAT_SORGUSU_ONAY", "FIYAT_SORGUSU_RED", "TAMAMLANDI"]])
    
    conversion_rate = round((approved / len(inquiries) * 100) if len(inquiries) > 0 else 0, 1)
    
    return {
        "total": len(inquiries),
        "approved": approved,
        "rejected": rejected,
        "pending": pending,
        "conversionRate": conversion_rate
    }


def get_status_icon(status):
    icons = {
        "OLCU_RANDEVU_BEKLIYOR": "phone",
        "OLCU_ALINDI": "ruler",
        "TEKNIK_CIZIM": "design",
        "TEKLIF_HAZIRLANIYOR": "money",
        "TEKLIF_ONAY_BEKLIYOR": "wait",
        "ONAY_ALINDI": "check",
        "URETIMDE": "factory",
        "MONTAJ_BEKLIYOR": "tools",
        "MONTAJDA": "wrench",
        "TAMAMLANDI": "done",
        "IPTAL": "cancel",
        "FIYAT_SORGUSU_BEKLENIYOR": "price",
        "FIYAT_SORGUSU_ONAY": "approved",
        "FIYAT_SORGUSU_RED": "rejected"
    }
    return icons.get(status, "default")
