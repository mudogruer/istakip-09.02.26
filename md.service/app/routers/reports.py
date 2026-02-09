from fastapi import APIRouter, HTTPException
from datetime import datetime, timedelta
from collections import defaultdict

from ..data_loader import load_json

router = APIRouter(prefix="/reports", tags=["reports"])


def _parse_date(date_str):
    """Tarih string'ini datetime'a çevir"""
    if not date_str:
        return None
    try:
        return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
    except:
        return None


def _days_between(start, end):
    """İki tarih arası gün farkı"""
    if not start or not end:
        return None
    s = _parse_date(start) if isinstance(start, str) else start
    e = _parse_date(end) if isinstance(end, str) else end
    if not s or not e:
        return None
    return (e - s).days


@router.get("/")
def list_reports():
    """Hazır rapor listesi"""
    return load_json("reports.json")


@router.get("/production")
def production_report(start_date: str = None, end_date: str = None):
    """Üretim Raporu - Üretim süreleri, iç/dış üretim analizi"""
    orders = load_json("productionOrders.json")
    jobs = load_json("jobs.json")
    settings = load_json("settings.json")
    
    # Tarih filtresi
    if start_date:
        orders = [o for o in orders if o.get("createdAt", "") >= start_date]
    if end_date:
        orders = [o for o in orders if o.get("createdAt", "") <= end_date]
    
    job_map = {j["id"]: j for j in jobs}
    role_configs = {r["id"]: r for r in settings.get("jobRoles", [])}
    
    internal_orders = []
    external_orders = []
    glass_orders = []
    
    for order in orders:
        order_type = order.get("orderType", "internal")
        production_days = _days_between(
            order.get("productionStartedAt") or order.get("createdAt"),
            order.get("productionCompletedAt") or order.get("deliveredAt")
        )
        
        order_data = {
            "id": order.get("id"),
            "jobId": order.get("jobId"),
            "jobTitle": job_map.get(order.get("jobId"), {}).get("title", "-"),
            "customerName": order.get("customerName") or job_map.get(order.get("jobId"), {}).get("customerName", "-"),
            "roleName": order.get("roleName", "-"),
            "status": order.get("status"),
            "productionDays": production_days,
            "plannedDate": order.get("plannedDate"),
            "deliveredAt": order.get("deliveredAt"),
            "hasIssue": len(order.get("issues", [])) > 0,
            "delays": order.get("delays", [])
        }
        
        if order_type == "glass":
            glass_orders.append(order_data)
        elif order_type == "external":
            external_orders.append(order_data)
        else:
            internal_orders.append(order_data)
    
    # İstatistikler
    def calc_stats(order_list):
        completed = [o for o in order_list if o.get("productionDays") is not None]
        if not completed:
            return {"count": len(order_list), "avgDays": 0, "minDays": 0, "maxDays": 0, "withIssues": 0, "delayed": 0}
        days = [o["productionDays"] for o in completed]
        return {
            "count": len(order_list),
            "completed": len(completed),
            "avgDays": round(sum(days) / len(days), 1) if days else 0,
            "minDays": min(days) if days else 0,
            "maxDays": max(days) if days else 0,
            "withIssues": len([o for o in order_list if o.get("hasIssue")]),
            "delayed": len([o for o in order_list if o.get("delays")])
        }
    
    return {
        "summary": {
            "total": len(orders),
            "internal": calc_stats(internal_orders),
            "external": calc_stats(external_orders),
            "glass": calc_stats(glass_orders),
        },
        "internal": internal_orders,
        "external": external_orders,
        "glass": glass_orders
    }


@router.get("/assembly")
def assembly_report(start_date: str = None, end_date: str = None):
    """Montaj Raporu - Ekip performansı, sorunlar"""
    tasks = load_json("assemblyTasks.json")
    jobs = load_json("jobs.json")
    teams = load_json("teams.json")
    personnel = load_json("personnel.json")
    settings = load_json("settings.json")
    
    # Tarih filtresi
    if start_date:
        tasks = [t for t in tasks if t.get("createdAt", "") >= start_date]
    if end_date:
        tasks = [t for t in tasks if t.get("createdAt", "") <= end_date]
    
    job_map = {j["id"]: j for j in jobs}
    team_map = {t["id"]: t for t in teams}
    personnel_map = {p["id"]: p for p in personnel}
    issue_types = {it["id"]: it for it in settings.get("issueTypes", [])}
    fault_sources = {fs["id"]: fs for fs in settings.get("faultSources", [])}
    
    # Ekip bazlı analiz
    team_stats = defaultdict(lambda: {
        "taskCount": 0, "completed": 0, "issueCount": 0, 
        "totalDays": 0, "issues": [], "delays": []
    })
    
    # Personel bazlı sorun analizi (hatalı personel)
    personnel_issues = defaultdict(lambda: {"count": 0, "issues": []})
    
    # Sorun tipleri analizi
    issue_analysis = defaultdict(lambda: {"count": 0, "byFaultSource": defaultdict(int)})
    
    all_issues = []
    
    for task in tasks:
        team_id = task.get("teamId")
        if team_id:
            team_stats[team_id]["taskCount"] += 1
            if task.get("status") == "completed":
                team_stats[team_id]["completed"] += 1
                # Tamamlanma süresi
                completion_days = _days_between(task.get("plannedDate"), task.get("completedAt"))
                if completion_days:
                    team_stats[team_id]["totalDays"] += completion_days
        
        # Sorunlar
        for issue in task.get("issues", []):
            team_stats[team_id]["issueCount"] += 1
            team_stats[team_id]["issues"].append(issue)
            
            issue_type = issue.get("issueType", "unknown")
            fault_source = issue.get("faultSource", "unknown")
            
            issue_analysis[issue_type]["count"] += 1
            issue_analysis[issue_type]["byFaultSource"][fault_source] += 1
            
            # Personel hata takibi
            responsible = issue.get("responsiblePersonId")
            if responsible:
                personnel_issues[responsible]["count"] += 1
                personnel_issues[responsible]["issues"].append({
                    "taskId": task.get("id"),
                    "jobTitle": task.get("jobTitle"),
                    "issueType": issue_type,
                    "date": issue.get("reportedAt")
                })
            
            all_issues.append({
                "taskId": task.get("id"),
                "jobId": task.get("jobId"),
                "jobTitle": task.get("jobTitle"),
                "teamId": team_id,
                "teamName": team_map.get(team_id, {}).get("ad", "Bilinmiyor"),
                "issueType": issue_types.get(issue_type, {}).get("name", issue_type),
                "faultSource": fault_sources.get(fault_source, {}).get("name", fault_source),
                "description": issue.get("description"),
                "status": issue.get("status"),
                "reportedAt": issue.get("reportedAt"),
                "responsiblePersonId": responsible,
                "responsiblePersonName": personnel_map.get(responsible, {}).get("ad", "Belirtilmemiş")
            })
        
        # Gecikmeler
        for delay in task.get("delays", []):
            team_stats[team_id]["delays"].append(delay)
    
    # Ekip özet listesi
    team_summary = []
    for team_id, stats in team_stats.items():
        team = team_map.get(team_id, {})
        avg_days = stats["totalDays"] / stats["completed"] if stats["completed"] > 0 else 0
        team_summary.append({
            "teamId": team_id,
            "teamName": team.get("ad", "Bilinmiyor"),
            "taskCount": stats["taskCount"],
            "completed": stats["completed"],
            "completionRate": round(stats["completed"] / stats["taskCount"] * 100, 1) if stats["taskCount"] > 0 else 0,
            "avgCompletionDays": round(avg_days, 1),
            "issueCount": stats["issueCount"],
            "delayCount": len(stats["delays"])
        })
    
    # Personel sorun özeti
    personnel_summary = []
    for person_id, data in personnel_issues.items():
        person = personnel_map.get(person_id, {})
        person_name = person.get("ad", "Bilinmiyor")
        if person.get("soyad"):
            person_name += " " + person.get("soyad")
        personnel_summary.append({
            "personId": person_id,
            "personName": person_name,
            "role": person.get("unvan", "-"),
            "issueCount": data["count"],
            "issues": data["issues"]
        })
    personnel_summary.sort(key=lambda x: x["issueCount"], reverse=True)
    
    # Sorun tipi özeti
    issue_type_summary = []
    for issue_id, data in issue_analysis.items():
        issue_type_summary.append({
            "issueType": issue_id,
            "issueTypeName": issue_types.get(issue_id, {}).get("name", issue_id),
            "count": data["count"],
            "byFaultSource": dict(data["byFaultSource"])
        })
    issue_type_summary.sort(key=lambda x: x["count"], reverse=True)
    
    return {
        "summary": {
            "totalTasks": len(tasks),
            "completedTasks": len([t for t in tasks if t.get("status") == "completed"]),
            "totalIssues": len(all_issues),
            "pendingIssues": len([i for i in all_issues if i.get("status") == "pending"]),
        },
        "teamPerformance": sorted(team_summary, key=lambda x: x["completionRate"], reverse=True),
        "personnelIssues": personnel_summary[:20],  # Top 20
        "issueTypeAnalysis": issue_type_summary,
        "allIssues": all_issues
    }


@router.get("/delays")
def delays_report(start_date: str = None, end_date: str = None):
    """Gecikme Raporu - Gecikme nedenleri ve sorumlular"""
    orders = load_json("productionOrders.json")
    tasks = load_json("assemblyTasks.json")
    jobs = load_json("jobs.json")
    personnel = load_json("personnel.json")
    settings = load_json("settings.json")
    
    job_map = {j["id"]: j for j in jobs}
    personnel_map = {p["id"]: p for p in personnel}
    delay_reasons = {r["id"]: r for r in settings.get("delayReasons", [])}
    
    all_delays = []
    
    # Üretim gecikmeleri
    for order in orders:
        for delay in order.get("delays", []):
            delay_date = delay.get("date", "")
            if start_date and delay_date < start_date:
                continue
            if end_date and delay_date > end_date:
                continue
            
            responsible = delay.get("responsiblePersonId")
            all_delays.append({
                "type": "production",
                "sourceId": order.get("id"),
                "jobId": order.get("jobId"),
                "jobTitle": job_map.get(order.get("jobId"), {}).get("title", "-"),
                "customerName": order.get("customerName") or job_map.get(order.get("jobId"), {}).get("customerName", "-"),
                "reason": delay_reasons.get(delay.get("reason"), {}).get("name", delay.get("reason")),
                "reasonId": delay.get("reason"),
                "note": delay.get("note"),
                "date": delay_date,
                "responsiblePersonId": responsible,
                "responsiblePersonName": personnel_map.get(responsible, {}).get("ad", "Belirtilmemiş")
            })
    
    # Montaj gecikmeleri
    for task in tasks:
        for delay in task.get("delays", []):
            delay_date = delay.get("date", "")
            if start_date and delay_date < start_date:
                continue
            if end_date and delay_date > end_date:
                continue
            
            responsible = delay.get("responsiblePersonId")
            all_delays.append({
                "type": "assembly",
                "sourceId": task.get("id"),
                "jobId": task.get("jobId"),
                "jobTitle": task.get("jobTitle") or job_map.get(task.get("jobId"), {}).get("title", "-"),
                "customerName": job_map.get(task.get("jobId"), {}).get("customerName", "-"),
                "reason": delay_reasons.get(delay.get("reason"), {}).get("name", delay.get("reason")),
                "reasonId": delay.get("reason"),
                "note": delay.get("note"),
                "date": delay_date,
                "responsiblePersonId": responsible,
                "responsiblePersonName": personnel_map.get(responsible, {}).get("ad", "Belirtilmemiş")
            })
    
    # Neden bazlı analiz
    reason_stats = defaultdict(lambda: {"count": 0, "byPerson": defaultdict(int)})
    for delay in all_delays:
        reason_id = delay.get("reasonId", "unknown")
        reason_stats[reason_id]["count"] += 1
        if delay.get("responsiblePersonId"):
            reason_stats[reason_id]["byPerson"][delay["responsiblePersonId"]] += 1
    
    reason_summary = []
    for reason_id, data in reason_stats.items():
        reason_summary.append({
            "reasonId": reason_id,
            "reasonName": delay_reasons.get(reason_id, {}).get("name", reason_id),
            "count": data["count"],
            "topResponsible": sorted(
                [(personnel_map.get(pid, {}).get("ad", pid), cnt) for pid, cnt in data["byPerson"].items()],
                key=lambda x: x[1], reverse=True
            )[:5]
        })
    reason_summary.sort(key=lambda x: x["count"], reverse=True)
    
    # Personel bazlı analiz
    person_delays = defaultdict(int)
    for delay in all_delays:
        if delay.get("responsiblePersonId"):
            person_delays[delay["responsiblePersonId"]] += 1
    
    person_summary = []
    for person_id, count in person_delays.items():
        person = personnel_map.get(person_id, {})
        person_name = person.get("ad", "Bilinmiyor")
        if person.get("soyad"):
            person_name += " " + person.get("soyad")
        person_summary.append({
            "personId": person_id,
            "personName": person_name,
            "role": person.get("unvan", "-"),
            "delayCount": count
        })
    person_summary.sort(key=lambda x: x["delayCount"], reverse=True)
    
    return {
        "summary": {
            "totalDelays": len(all_delays),
            "productionDelays": len([d for d in all_delays if d["type"] == "production"]),
            "assemblyDelays": len([d for d in all_delays if d["type"] == "assembly"]),
        },
        "byReason": reason_summary,
        "byPerson": person_summary[:20],
        "allDelays": sorted(all_delays, key=lambda x: x.get("date", ""), reverse=True)
    }


@router.get("/finance")
def finance_report(start_date: str = None, end_date: str = None):
    """Finansal Rapor - Ciro, tahsilat, ödeme durumu"""
    jobs = load_json("jobs.json")
    payments = load_json("payments.json")
    invoices = load_json("invoices.json")
    
    # Tarih filtresi
    if start_date:
        jobs = [j for j in jobs if j.get("createdAt", "") >= start_date]
    if end_date:
        jobs = [j for j in jobs if j.get("createdAt", "") <= end_date]
    
    total_offer = 0
    total_collected = 0
    total_remaining = 0
    
    # Ödeme tipi breakdown - Sistemdeki gerçek ödeme tipleri
    payment_by_type = {
        "cash": {"label": "Nakit", "icon": "💵", "amount": 0, "count": 0},
        "card": {"label": "Kredi Kartı", "icon": "💳", "amount": 0, "count": 0},
        "cheque": {"label": "Çek (Tahsil)", "icon": "📜", "amount": 0, "count": 0},
        "cheque_pending": {"label": "Çek (Bekleyen)", "icon": "⏳", "amount": 0, "count": 0},
        "afterDelivery": {"label": "Teslim Sonrası", "icon": "🏠", "amount": 0, "count": 0},
    }
    
    by_status = defaultdict(lambda: {"count": 0, "offer": 0, "collected": 0})
    by_month = defaultdict(lambda: {"offer": 0, "collected": 0, "count": 0})
    
    job_details = []
    
    for job in jobs:
        offer_total = job.get("offer", {}).get("total") or job.get("finance", {}).get("total") or 0
        
        # Tahsilatları hesapla ve tiplere ayır
        collected = 0
        finance = job.get("finance", {})
        if finance:
            # Ön ödemeler
            pre_payments = finance.get("prePayments", {})
            cash_pre = pre_payments.get("cash", 0) or 0
            card_pre = pre_payments.get("card", 0) or 0
            after_delivery_pre = pre_payments.get("afterDelivery", 0) or 0
            
            if cash_pre > 0:
                payment_by_type["cash"]["amount"] += cash_pre
                payment_by_type["cash"]["count"] += 1
            if card_pre > 0:
                payment_by_type["card"]["amount"] += card_pre
                payment_by_type["card"]["count"] += 1
            if after_delivery_pre > 0:
                payment_by_type["afterDelivery"]["amount"] += after_delivery_pre
                payment_by_type["afterDelivery"]["count"] += 1
            
            collected += cash_pre + card_pre
            
            for cheque in pre_payments.get("cheques", []):
                cheque_amount = cheque.get("amount", 0) or 0
                if cheque.get("status") == "collected":
                    collected += cheque_amount
                    payment_by_type["cheque"]["amount"] += cheque_amount
                    payment_by_type["cheque"]["count"] += 1
                else:
                    payment_by_type["cheque_pending"]["amount"] += cheque_amount
                    payment_by_type["cheque_pending"]["count"] += 1
            
            # Son ödemeler
            post_payments = finance.get("postPayments", {})
            cash_post = post_payments.get("cash", 0) or 0
            card_post = post_payments.get("card", 0) or 0
            after_delivery_post = post_payments.get("afterDelivery", 0) or 0
            
            if cash_post > 0:
                payment_by_type["cash"]["amount"] += cash_post
                payment_by_type["cash"]["count"] += 1
            if card_post > 0:
                payment_by_type["card"]["amount"] += card_post
                payment_by_type["card"]["count"] += 1
            if after_delivery_post > 0:
                payment_by_type["afterDelivery"]["amount"] += after_delivery_post
                payment_by_type["afterDelivery"]["count"] += 1
            
            collected += cash_post + card_post
            
            for cheque in post_payments.get("cheques", []):
                cheque_amount = cheque.get("amount", 0) or 0
                if cheque.get("status") == "collected":
                    collected += cheque_amount
                    payment_by_type["cheque"]["amount"] += cheque_amount
                    payment_by_type["cheque"]["count"] += 1
                else:
                    payment_by_type["cheque_pending"]["amount"] += cheque_amount
                    payment_by_type["cheque_pending"]["count"] += 1
        
        remaining = offer_total - collected
        
        total_offer += offer_total
        total_collected += collected
        total_remaining += remaining
        
        status = job.get("status", "unknown")
        by_status[status]["count"] += 1
        by_status[status]["offer"] += offer_total
        by_status[status]["collected"] += collected
        
        # Aylık analiz
        created = job.get("createdAt", "")[:7]  # YYYY-MM
        if created:
            by_month[created]["offer"] += offer_total
            by_month[created]["collected"] += collected
            by_month[created]["count"] += 1
        
        job_details.append({
            "id": job.get("id"),
            "title": job.get("title"),
            "customerName": job.get("customerName"),
            "status": status,
            "offerTotal": offer_total,
            "collected": collected,
            "remaining": remaining,
            "collectionRate": round(collected / offer_total * 100, 1) if offer_total > 0 else 0,
            "createdAt": job.get("createdAt")
        })
    
    # Ödeme tipi yüzdeleri hesapla
    payment_breakdown = []
    for key, data in payment_by_type.items():
        if data["amount"] > 0 or key not in ["cheque_pending"]:  # Bekleyen çek hariç boşları gösterme
            percentage = round(data["amount"] / total_collected * 100, 1) if total_collected > 0 else 0
            payment_breakdown.append({
                "type": key,
                "label": data["label"],
                "icon": data["icon"],
                "amount": data["amount"],
                "count": data["count"],
                "percentage": percentage
            })
    
    return {
        "summary": {
            "totalJobs": len(jobs),
            "totalOffer": total_offer,
            "totalCollected": total_collected,
            "totalRemaining": total_remaining,
            "collectionRate": round(total_collected / total_offer * 100, 1) if total_offer > 0 else 0
        },
        "paymentBreakdown": payment_breakdown,
        "byStatus": [{"status": k, **v} for k, v in by_status.items()],
        "byMonth": [{"month": k, **v} for k, v in sorted(by_month.items())],
        "jobs": sorted(job_details, key=lambda x: x.get("remaining", 0), reverse=True)[:50]  # Top 50 borçlu
    }


@router.get("/issues")
def issues_report(start_date: str = None, end_date: str = None):
    """Sorun Analizi - Tüm sorun tipleri"""
    jobs = load_json("jobs.json")
    tasks = load_json("assemblyTasks.json")
    orders = load_json("productionOrders.json")
    settings = load_json("settings.json")
    personnel = load_json("personnel.json")
    
    personnel_map = {p["id"]: p for p in personnel}
    issue_types = {it["id"]: it for it in settings.get("issueTypes", [])}
    fault_sources = {fs["id"]: fs for fs in settings.get("faultSources", [])}
    
    all_issues = []
    
    # Ölçü sorunları
    for job in jobs:
        for issue in job.get("measure", {}).get("issues", []):
            issue_date = issue.get("createdAt", "")
            if start_date and issue_date < start_date:
                continue
            if end_date and issue_date > end_date:
                continue
            
            all_issues.append({
                "source": "measure",
                "sourceLabel": "Ölçü",
                "jobId": job.get("id"),
                "jobTitle": job.get("title"),
                "customerName": job.get("customerName"),
                "issueType": issue_types.get(issue.get("issueType"), {}).get("name", issue.get("issueType")),
                "issueTypeId": issue.get("issueType"),
                "faultSource": fault_sources.get(issue.get("faultSource"), {}).get("name", issue.get("faultSource")),
                "faultSourceId": issue.get("faultSource"),
                "description": issue.get("description"),
                "status": issue.get("status"),
                "date": issue_date,
                "responsiblePerson": personnel_map.get(issue.get("responsiblePersonId"), {}).get("ad", "-")
            })
    
    # Montaj sorunları
    for task in tasks:
        for issue in task.get("issues", []):
            issue_date = issue.get("reportedAt", "")
            if start_date and issue_date < start_date:
                continue
            if end_date and issue_date > end_date:
                continue
            
            all_issues.append({
                "source": "assembly",
                "sourceLabel": "Montaj",
                "jobId": task.get("jobId"),
                "jobTitle": task.get("jobTitle"),
                "customerName": "-",
                "issueType": issue_types.get(issue.get("issueType"), {}).get("name", issue.get("issueType")),
                "issueTypeId": issue.get("issueType"),
                "faultSource": fault_sources.get(issue.get("faultSource"), {}).get("name", issue.get("faultSource")),
                "faultSourceId": issue.get("faultSource"),
                "description": issue.get("description"),
                "status": issue.get("status"),
                "date": issue_date,
                "responsiblePerson": personnel_map.get(issue.get("responsiblePersonId"), {}).get("ad", "-")
            })
    
    # Üretim sorunları
    for order in orders:
        for issue in order.get("issues", []):
            issue_date = issue.get("reportedAt", "")
            if start_date and issue_date < start_date:
                continue
            if end_date and issue_date > end_date:
                continue
            
            all_issues.append({
                "source": "production",
                "sourceLabel": "Üretim",
                "jobId": order.get("jobId"),
                "jobTitle": order.get("jobTitle") or "-",
                "customerName": order.get("customerName"),
                "issueType": issue_types.get(issue.get("issueType"), {}).get("name", issue.get("issueType")),
                "issueTypeId": issue.get("issueType"),
                "faultSource": fault_sources.get(issue.get("faultSource"), {}).get("name", issue.get("faultSource")),
                "faultSourceId": issue.get("faultSource"),
                "description": issue.get("description"),
                "status": issue.get("status"),
                "date": issue_date,
                "responsiblePerson": personnel_map.get(issue.get("responsiblePersonId"), {}).get("ad", "-")
            })
    
    # Kaynak bazlı analiz
    by_source = defaultdict(int)
    by_type = defaultdict(int)
    by_fault = defaultdict(int)
    
    for issue in all_issues:
        by_source[issue["source"]] += 1
        by_type[issue.get("issueTypeId", "unknown")] += 1
        by_fault[issue.get("faultSourceId", "unknown")] += 1
    
    return {
        "summary": {
            "total": len(all_issues),
            "pending": len([i for i in all_issues if i.get("status") == "pending"]),
            "resolved": len([i for i in all_issues if i.get("status") == "resolved"]),
        },
        "bySource": [
            {"source": "measure", "label": "Ölçü", "count": by_source.get("measure", 0)},
            {"source": "production", "label": "Üretim", "count": by_source.get("production", 0)},
            {"source": "assembly", "label": "Montaj", "count": by_source.get("assembly", 0)},
        ],
        "byType": [
            {"typeId": k, "typeName": issue_types.get(k, {}).get("name", k), "count": v}
            for k, v in sorted(by_type.items(), key=lambda x: x[1], reverse=True)
        ],
        "byFaultSource": [
            {"sourceId": k, "sourceName": fault_sources.get(k, {}).get("name", k), "count": v}
            for k, v in sorted(by_fault.items(), key=lambda x: x[1], reverse=True)
        ],
        "allIssues": sorted(all_issues, key=lambda x: x.get("date", ""), reverse=True)
    }


@router.get("/performance")
def performance_report(start_date: str = None, end_date: str = None):
    """Genel Performans Özeti"""
    jobs = load_json("jobs.json")
    orders = load_json("productionOrders.json")
    tasks = load_json("assemblyTasks.json")
    
    # Tarih filtresi
    if start_date:
        jobs = [j for j in jobs if j.get("createdAt", "") >= start_date]
    if end_date:
        jobs = [j for j in jobs if j.get("createdAt", "") <= end_date]
    
    # İş durumu analizi
    status_counts = defaultdict(int)
    for job in jobs:
        status_counts[job.get("status", "unknown")] += 1
    
    # Aylık iş sayısı
    monthly_jobs = defaultdict(int)
    for job in jobs:
        month = job.get("createdAt", "")[:7]
        if month:
            monthly_jobs[month] += 1
    
    # Ortalama süre hesaplamaları
    job_durations = []
    for job in jobs:
        if job.get("status") == "KAPALI" and job.get("createdAt") and job.get("finance", {}).get("closedAt"):
            days = _days_between(job["createdAt"], job["finance"]["closedAt"])
            if days is not None:
                job_durations.append(days)
    
    avg_job_duration = round(sum(job_durations) / len(job_durations), 1) if job_durations else 0
    
    # Üretim istatistikleri
    completed_orders = [o for o in orders if o.get("status") == "delivered"]
    pending_orders = [o for o in orders if o.get("status") in ["pending", "in_production"]]
    
    # Montaj istatistikleri
    completed_tasks = [t for t in tasks if t.get("status") == "completed"]
    pending_tasks = [t for t in tasks if t.get("status") in ["pending", "planned", "in_progress"]]
    
    # Teslim tipi istatistikleri
    demonte_jobs = len([j for j in jobs if j.get("deliveryType") == "demonte"])
    montajli_jobs = len([j for j in jobs if j.get("deliveryType") == "montajli" or (j.get("status") in ["MONTAJA_HAZIR", "MONTAJ_TERMIN"] and j.get("deliveryType") != "demonte")])
    
    return {
        "summary": {
            "totalJobs": len(jobs),
            "activeJobs": len([j for j in jobs if j.get("status") not in ["KAPALI", "ANLASILAMADI", "SERVIS_KAPALI"]]),
            "completedJobs": len([j for j in jobs if j.get("status") == "KAPALI"]),
            "cancelledJobs": len([j for j in jobs if j.get("status") == "ANLASILAMADI"]),
            "demonteJobs": demonte_jobs,
            "montajliJobs": montajli_jobs,
            "avgJobDuration": avg_job_duration,
        },
        "production": {
            "total": len(orders),
            "completed": len(completed_orders),
            "pending": len(pending_orders),
            "completionRate": round(len(completed_orders) / len(orders) * 100, 1) if orders else 0
        },
        "assembly": {
            "total": len(tasks),
            "completed": len(completed_tasks),
            "pending": len(pending_tasks),
            "completionRate": round(len(completed_tasks) / len(tasks) * 100, 1) if tasks else 0
        },
        "statusDistribution": [{"status": k, "count": v} for k, v in status_counts.items()],
        "monthlyTrend": [{"month": k, "count": v} for k, v in sorted(monthly_jobs.items())]
    }


# ==================== YENİ DETAYLI RAPORLAR ====================

@router.get("/suppliers")
def suppliers_report(start_date: str = None, end_date: str = None):
    """Tüm Tedarikçilerin Performans Özeti - Üretim + Satınalma Siparişleri"""
    production_orders = load_json("productionOrders.json")
    purchase_orders = load_json("purchaseOrders.json")
    suppliers = load_json("suppliers.json")
    
    # Tarih filtresi - Production Orders
    if start_date:
        production_orders = [o for o in production_orders if o.get("createdAt", "") >= start_date]
    if end_date:
        production_orders = [o for o in production_orders if o.get("createdAt", "") <= end_date]
    
    # Tarih filtresi - Purchase Orders
    if start_date:
        purchase_orders = [o for o in purchase_orders if o.get("createdAt", "") >= start_date]
    if end_date:
        purchase_orders = [o for o in purchase_orders if o.get("createdAt", "") <= end_date]
    
    # Aktif tedarikçiler (deleted olmayanlar)
    active_suppliers = [s for s in suppliers if not s.get("deleted")]
    supplier_map = {s["id"]: s for s in active_suppliers}
    
    # Tüm aktif tedarikçiler için başlangıç istatistikleri
    supplier_stats = {}
    for s in active_suppliers:
        supplier_stats[s["id"]] = {
            "productionOrderCount": 0, "purchaseOrderCount": 0,
            "totalQuantity": 0, "totalAmount": 0,
            "onTime": 0, "delayed": 0, "totalDelayDays": 0,
            "problemCount": 0, "problemQuantity": 0,
            "orderTypes": {"glass": 0, "external": 0, "purchase": 0}
        }
    
    # 1. Production Orders (cam + dış üretim)
    for order in production_orders:
        supplier_id = order.get("supplierId")
        if not supplier_id or supplier_id not in supplier_stats:
            continue
        
        order_type = order.get("orderType", "")
        if order_type not in ["external", "glass"]:
            continue
        
        stats = supplier_stats[supplier_id]
        stats["productionOrderCount"] += 1
        stats["orderTypes"][order_type] += 1
        
        # Toplam miktar
        for item in order.get("items", []):
            stats["totalQuantity"] += item.get("quantity", 0) or 0
            stats["problemQuantity"] += item.get("problemQty", 0) or 0
            if item.get("problemQty", 0) > 0:
                stats["problemCount"] += 1
        
        # Gecikme analizi
        estimated = order.get("estimatedDelivery")
        delivery_history = order.get("deliveryHistory", [])
        actual_delivery = delivery_history[0].get("date") if delivery_history else None
        
        if estimated and actual_delivery:
            delay_days = _days_between(estimated, actual_delivery)
            if delay_days is not None:
                if delay_days > 0:
                    stats["delayed"] += 1
                    stats["totalDelayDays"] += delay_days
                else:
                    stats["onTime"] += 1
    
    # 2. Purchase Orders (satınalma siparişleri)
    for order in purchase_orders:
        supplier_id = order.get("supplierId")
        if not supplier_id or supplier_id not in supplier_stats:
            continue
        
        stats = supplier_stats[supplier_id]
        stats["purchaseOrderCount"] += 1
        stats["orderTypes"]["purchase"] += 1
        
        # Toplam miktar ve tutar
        for item in order.get("items", []):
            stats["totalQuantity"] += item.get("quantity", 0) or 0
            stats["totalAmount"] += (item.get("quantity", 0) or 0) * (item.get("unitCost", 0) or 0)
        
        # Gecikme analizi
        expected = order.get("expectedDate")
        deliveries = order.get("deliveries", [])
        if deliveries and expected:
            last_delivery = deliveries[-1]
            actual = last_delivery.get("date")
            if actual:
                delay_days = _days_between(expected, actual)
                if delay_days is not None:
                    if delay_days > 0:
                        stats["delayed"] += 1
                        stats["totalDelayDays"] += delay_days
                    else:
                        stats["onTime"] += 1
    
    # Özet listesi oluştur - TÜM aktif tedarikçiler
    summary_list = []
    for supplier_id, stats in supplier_stats.items():
        supplier = supplier_map.get(supplier_id, {})
        total_orders = stats["productionOrderCount"] + stats["purchaseOrderCount"]
        delivered = stats["onTime"] + stats["delayed"]
        avg_delay = round(stats["totalDelayDays"] / stats["delayed"], 1) if stats["delayed"] > 0 else 0
        on_time_rate = round(stats["onTime"] / delivered * 100, 1) if delivered > 0 else 0
        problem_rate = round(stats["problemQuantity"] / stats["totalQuantity"] * 100, 1) if stats["totalQuantity"] > 0 else 0
        
        summary_list.append({
            "supplierId": supplier_id,
            "supplierName": supplier.get("name", "Bilinmiyor"),
            "category": supplier.get("category", "-"),
            "supplyType": supplier.get("supplyType", "-"),
            "orderCount": total_orders,
            "productionOrderCount": stats["productionOrderCount"],
            "purchaseOrderCount": stats["purchaseOrderCount"],
            "totalQuantity": stats["totalQuantity"],
            "totalAmount": stats["totalAmount"],
            "onTime": stats["onTime"],
            "delayed": stats["delayed"],
            "onTimeRate": on_time_rate,
            "avgDelayDays": avg_delay,
            "problemCount": stats["problemCount"],
            "problemQuantity": stats["problemQuantity"],
            "problemRate": problem_rate,
            "orderTypes": stats["orderTypes"],
            "hasData": total_orders > 0
        })
    
    # Sipariş sayısına göre sırala, sipariş olmayanlar en sonda
    summary_list.sort(key=lambda x: (x["hasData"], x["orderCount"]), reverse=True)
    
    # Genel istatistikler
    suppliers_with_data = [s for s in summary_list if s["hasData"]]
    
    return {
        "summary": {
            "totalSuppliers": len(summary_list),
            "suppliersWithOrders": len(suppliers_with_data),
            "suppliersWithoutOrders": len(summary_list) - len(suppliers_with_data),
            "totalOrders": sum(s["orderCount"] for s in summary_list),
            "totalProductionOrders": sum(s["productionOrderCount"] for s in summary_list),
            "totalPurchaseOrders": sum(s["purchaseOrderCount"] for s in summary_list),
            "totalQuantity": sum(s["totalQuantity"] for s in summary_list),
            "totalAmount": sum(s["totalAmount"] for s in summary_list),
            "overallOnTimeRate": round(
                sum(s["onTime"] for s in summary_list) / 
                max(sum(s["onTime"] + s["delayed"] for s in summary_list), 1) * 100, 1
            ),
            "overallProblemRate": round(
                sum(s["problemQuantity"] for s in summary_list) / 
                max(sum(s["totalQuantity"] for s in summary_list), 1) * 100, 1
            )
        },
        "suppliers": summary_list
    }


@router.get("/supplier/{supplier_id}")
def supplier_detail_report(supplier_id: str, start_date: str = None, end_date: str = None):
    """Tek Tedarikçi Detay Raporu - Üretim + Satınalma Siparişleri"""
    production_orders = load_json("productionOrders.json")
    purchase_orders = load_json("purchaseOrders.json")
    suppliers = load_json("suppliers.json")
    
    supplier = next((s for s in suppliers if s.get("id") == supplier_id), None)
    if not supplier:
        raise HTTPException(status_code=404, detail="Tedarikçi bulunamadı")
    
    # Tarih filtresi
    if start_date:
        production_orders = [o for o in production_orders if o.get("createdAt", "") >= start_date]
        purchase_orders = [o for o in purchase_orders if o.get("createdAt", "") >= start_date]
    if end_date:
        production_orders = [o for o in production_orders if o.get("createdAt", "") <= end_date]
        purchase_orders = [o for o in purchase_orders if o.get("createdAt", "") <= end_date]
    
    # Bu tedarikçinin siparişleri
    supplier_production = [o for o in production_orders if o.get("supplierId") == supplier_id]
    supplier_purchase = [o for o in purchase_orders if o.get("supplierId") == supplier_id]
    
    total_quantity = 0
    total_amount = 0
    problem_quantity = 0
    on_time_count = 0
    delayed_count = 0
    total_delay_days = 0
    
    delayed_orders = []
    problem_orders = []
    all_orders = []
    
    # 1. Production Orders işle
    for order in supplier_production:
        order_qty = sum(item.get("quantity", 0) or 0 for item in order.get("items", []))
        order_problem_qty = sum(item.get("problemQty", 0) or 0 for item in order.get("items", []))
        total_quantity += order_qty
        problem_quantity += order_problem_qty
        
        estimated = order.get("estimatedDelivery")
        delivery_history = order.get("deliveryHistory", [])
        actual_delivery = delivery_history[0].get("date") if delivery_history else None
        delay_days = 0
        
        if estimated and actual_delivery:
            delay_days = _days_between(estimated, actual_delivery)
            if delay_days is not None and delay_days > 0:
                delayed_count += 1
                total_delay_days += delay_days
                delayed_orders.append({
                    "orderId": order.get("id"),
                    "orderType": "production",
                    "jobTitle": order.get("jobTitle"),
                    "customerName": order.get("customerName"),
                    "estimatedDelivery": estimated,
                    "actualDelivery": actual_delivery,
                    "delayDays": delay_days,
                    "quantity": order_qty
                })
            else:
                on_time_count += 1
        
        if order_problem_qty > 0:
            for item in order.get("items", []):
                if item.get("problemQty", 0) > 0:
                    problem_type = ""
                    problem_note = ""
                    for dh in delivery_history:
                        for di in dh.get("items", []):
                            if di.get("problemQty", 0) > 0:
                                problem_type = di.get("problemType", "")
                                problem_note = di.get("problemNote", "")
                    
                    problem_orders.append({
                        "orderId": order.get("id"),
                        "orderType": "production",
                        "jobTitle": order.get("jobTitle"),
                        "customerName": order.get("customerName"),
                        "itemName": item.get("glassName") or item.get("notes") or "-",
                        "quantity": item.get("quantity", 0),
                        "problemQty": item.get("problemQty", 0),
                        "problemType": problem_type,
                        "problemNote": problem_note,
                        "date": actual_delivery or order.get("createdAt", "")[:10]
                    })
        
        all_orders.append({
            "orderId": order.get("id"),
            "orderType": "production",
            "orderTypeLabel": order.get("orderType", ""),
            "jobTitle": order.get("jobTitle"),
            "customerName": order.get("customerName"),
            "quantity": order_qty,
            "amount": 0,
            "estimatedDelivery": estimated,
            "actualDelivery": actual_delivery,
            "delayDays": delay_days if delay_days and delay_days > 0 else 0,
            "problemQty": order_problem_qty,
            "status": order.get("status"),
            "createdAt": order.get("createdAt", "")[:10]
        })
    
    # 2. Purchase Orders işle
    for order in supplier_purchase:
        order_qty = sum(item.get("quantity", 0) or 0 for item in order.get("items", []))
        order_amount = sum((item.get("quantity", 0) or 0) * (item.get("unitCost", 0) or 0) for item in order.get("items", []))
        total_quantity += order_qty
        total_amount += order_amount
        
        expected = order.get("expectedDate")
        deliveries = order.get("deliveries", [])
        actual_delivery = deliveries[-1].get("date") if deliveries else None
        delay_days = 0
        
        if expected and actual_delivery:
            delay_days = _days_between(expected, actual_delivery)
            if delay_days is not None and delay_days > 0:
                delayed_count += 1
                total_delay_days += delay_days
                delayed_orders.append({
                    "orderId": order.get("id"),
                    "orderType": "purchase",
                    "jobTitle": "-",
                    "customerName": "-",
                    "estimatedDelivery": expected,
                    "actualDelivery": actual_delivery,
                    "delayDays": delay_days,
                    "quantity": order_qty
                })
            else:
                on_time_count += 1
        
        all_orders.append({
            "orderId": order.get("id"),
            "orderType": "purchase",
            "orderTypeLabel": "Satınalma",
            "jobTitle": "-",
            "customerName": "-",
            "quantity": order_qty,
            "amount": order_amount,
            "estimatedDelivery": expected,
            "actualDelivery": actual_delivery,
            "delayDays": delay_days if delay_days and delay_days > 0 else 0,
            "problemQty": 0,
            "status": order.get("status"),
            "createdAt": order.get("createdAt", "")[:10]
        })
    
    delivered_count = on_time_count + delayed_count
    total_orders = len(supplier_production) + len(supplier_purchase)
    
    return {
        "reportDate": datetime.now().strftime("%d.%m.%Y"),
        "periodStart": start_date or "Tüm Zamanlar",
        "periodEnd": end_date or "",
        "supplier": {
            "id": supplier.get("id"),
            "name": supplier.get("name"),
            "category": supplier.get("category"),
            "supplyType": supplier.get("supplyType"),
            "contact": supplier.get("contact", {}),
            "leadTimeDays": supplier.get("leadTimeDays", 0)
        },
        "summary": {
            "totalOrders": total_orders,
            "productionOrderCount": len(supplier_production),
            "purchaseOrderCount": len(supplier_purchase),
            "totalQuantity": total_quantity,
            "totalAmount": total_amount,
            "deliveredCount": delivered_count,
            "onTimeCount": on_time_count,
            "delayedCount": delayed_count,
            "onTimeRate": round(on_time_count / delivered_count * 100, 1) if delivered_count > 0 else 0,
            "avgDelayDays": round(total_delay_days / delayed_count, 1) if delayed_count > 0 else 0,
            "problemQuantity": problem_quantity,
            "problemRate": round(problem_quantity / total_quantity * 100, 1) if total_quantity > 0 else 0
        },
        "delayedOrders": sorted(delayed_orders, key=lambda x: x.get("delayDays", 0), reverse=True),
        "problemOrders": problem_orders,
        "allOrders": sorted(all_orders, key=lambda x: x.get("createdAt", ""), reverse=True)
    }


@router.get("/customers-analysis")
def customers_analysis_report(start_date: str = None, end_date: str = None):
    """Müşteri Analizi - Segment dahil"""
    jobs = load_json("jobs.json")
    customers = load_json("customers.json")
    
    # Tarih filtresi
    if start_date:
        jobs = [j for j in jobs if j.get("createdAt", "") >= start_date]
    if end_date:
        jobs = [j for j in jobs if j.get("createdAt", "") <= end_date]
    
    customer_map = {c["id"]: c for c in customers}
    customer_stats = defaultdict(lambda: {
        "jobCount": 0, "totalOffer": 0, "totalCollected": 0,
        "completedCount": 0, "cancelledCount": 0, "activeCount": 0,
        "segment": "B2C"
    })
    
    for job in jobs:
        customer_id = job.get("customerId")
        customer_name = job.get("customerName", "Bilinmiyor")
        
        # Müşteri ID yoksa isimle eşleştir
        if not customer_id:
            for c in customers:
                if c.get("name") == customer_name:
                    customer_id = c.get("id")
                    break
        
        if not customer_id:
            customer_id = f"UNKNOWN-{customer_name}"
        
        stats = customer_stats[customer_id]
        stats["customerName"] = customer_name
        stats["jobCount"] += 1
        
        # Segment bilgisi
        if customer_id in customer_map:
            stats["segment"] = customer_map[customer_id].get("segment", "B2C")
        
        # Ciro
        offer_total = job.get("offer", {}).get("total", 0) or 0
        stats["totalOffer"] += offer_total
        
        # Tahsilat
        collected = 0
        finance = job.get("finance", {})
        if finance:
            pre = finance.get("prePayments", {})
            collected += (pre.get("cash", 0) or 0) + (pre.get("card", 0) or 0)
            for cheque in pre.get("cheques", []):
                if cheque.get("status") == "collected":
                    collected += cheque.get("amount", 0) or 0
            
            post = finance.get("postPayments", {})
            collected += (post.get("cash", 0) or 0) + (post.get("card", 0) or 0)
            for cheque in post.get("cheques", []):
                if cheque.get("status") == "collected":
                    collected += cheque.get("amount", 0) or 0
        stats["totalCollected"] += collected
        
        # Durum
        status = job.get("status", "")
        if status == "KAPALI":
            stats["completedCount"] += 1
        elif status == "ANLASILAMADI":
            stats["cancelledCount"] += 1
        else:
            stats["activeCount"] += 1
    
    # Müşteri listesi oluştur ve segment hesapla
    customer_list = []
    for customer_id, stats in customer_stats.items():
        collection_rate = round(stats["totalCollected"] / stats["totalOffer"] * 100, 1) if stats["totalOffer"] > 0 else 0
        
        # Segment hesaplama
        # ⭐ VIP: Toplam ciro > 100K VE tahsilat > %90 VE en az 3 tamamlanan iş
        # ✅ Normal: Tahsilat %70-90
        # ⚠️ Riskli: Tahsilat %50-70
        # 🔴 Kara Liste: Tahsilat < %50
        if stats["totalOffer"] >= 100000 and collection_rate >= 90 and stats["completedCount"] >= 3:
            calculated_segment = "VIP"
        elif collection_rate >= 70:
            calculated_segment = "Normal"
        elif collection_rate >= 50:
            calculated_segment = "Riskli"
        elif stats["totalOffer"] > 0:  # En az bir teklif varsa
            calculated_segment = "Kara Liste"
        else:
            calculated_segment = "Yeni"
        
        customer_list.append({
            "customerId": customer_id,
            "customerName": stats["customerName"],
            "businessSegment": stats["segment"],
            "performanceSegment": calculated_segment,
            "jobCount": stats["jobCount"],
            "totalOffer": stats["totalOffer"],
            "totalCollected": stats["totalCollected"],
            "remaining": stats["totalOffer"] - stats["totalCollected"],
            "collectionRate": collection_rate,
            "completedCount": stats["completedCount"],
            "cancelledCount": stats["cancelledCount"],
            "activeCount": stats["activeCount"]
        })
    
    customer_list.sort(key=lambda x: x["totalOffer"], reverse=True)
    
    # Segment dağılımı
    segment_dist = defaultdict(lambda: {"count": 0, "totalOffer": 0})
    for c in customer_list:
        seg = c["performanceSegment"]
        segment_dist[seg]["count"] += 1
        segment_dist[seg]["totalOffer"] += c["totalOffer"]
    
    return {
        "summary": {
            "totalCustomers": len(customer_list),
            "totalOffer": sum(c["totalOffer"] for c in customer_list),
            "totalCollected": sum(c["totalCollected"] for c in customer_list),
            "overallCollectionRate": round(
                sum(c["totalCollected"] for c in customer_list) / 
                max(sum(c["totalOffer"] for c in customer_list), 1) * 100, 1
            ),
            "vipCount": segment_dist["VIP"]["count"],
            "riskyCount": segment_dist["Riskli"]["count"] + segment_dist["Kara Liste"]["count"]
        },
        "segmentDistribution": [
            {"segment": "VIP", "icon": "⭐", "count": segment_dist["VIP"]["count"], "totalOffer": segment_dist["VIP"]["totalOffer"]},
            {"segment": "Normal", "icon": "✅", "count": segment_dist["Normal"]["count"], "totalOffer": segment_dist["Normal"]["totalOffer"]},
            {"segment": "Riskli", "icon": "⚠️", "count": segment_dist["Riskli"]["count"], "totalOffer": segment_dist["Riskli"]["totalOffer"]},
            {"segment": "Kara Liste", "icon": "🔴", "count": segment_dist["Kara Liste"]["count"], "totalOffer": segment_dist["Kara Liste"]["totalOffer"]},
            {"segment": "Yeni", "icon": "🆕", "count": segment_dist["Yeni"]["count"], "totalOffer": segment_dist["Yeni"]["totalOffer"]},
        ],
        "customers": customer_list[:100]  # Top 100
    }


@router.get("/cancellations")
def cancellations_report(start_date: str = None, end_date: str = None):
    """İptal/Red Analizi"""
    jobs = load_json("jobs.json")
    settings = load_json("settings.json")
    
    # Tarih filtresi
    if start_date:
        jobs = [j for j in jobs if j.get("createdAt", "") >= start_date]
    if end_date:
        jobs = [j for j in jobs if j.get("createdAt", "") <= end_date]
    
    cancelled_jobs = [j for j in jobs if j.get("status") == "ANLASILAMADI"]
    cancel_reasons = {r["id"]: r for r in settings.get("cancelReasons", [])}
    
    reason_stats = defaultdict(lambda: {"count": 0, "lostRevenue": 0, "jobs": []})
    
    total_lost = 0
    
    for job in cancelled_jobs:
        # İptal nedeni
        reason_id = job.get("cancelReason") or job.get("rejection", {}).get("category", "other")
        offer_total = job.get("offer", {}).get("total", 0) or 0
        total_lost += offer_total
        
        reason_stats[reason_id]["count"] += 1
        reason_stats[reason_id]["lostRevenue"] += offer_total
        reason_stats[reason_id]["jobs"].append({
            "id": job.get("id"),
            "title": job.get("title"),
            "customerName": job.get("customerName"),
            "offerTotal": offer_total,
            "note": job.get("cancelNote") or job.get("rejection", {}).get("reason", ""),
            "date": job.get("updatedAt", job.get("createdAt", ""))[:10]
        })
    
    # Neden listesi
    reason_list = []
    for reason_id, stats in reason_stats.items():
        reason = cancel_reasons.get(reason_id, {})
        reason_list.append({
            "reasonId": reason_id,
            "reasonName": reason.get("name", reason_id),
            "icon": reason.get("icon", "❌"),
            "count": stats["count"],
            "lostRevenue": stats["lostRevenue"],
            "percentage": round(stats["count"] / len(cancelled_jobs) * 100, 1) if cancelled_jobs else 0,
            "jobs": sorted(stats["jobs"], key=lambda x: x.get("offerTotal", 0), reverse=True)
        })
    
    reason_list.sort(key=lambda x: x["count"], reverse=True)
    
    return {
        "summary": {
            "totalCancelled": len(cancelled_jobs),
            "totalLostRevenue": total_lost,
            "avgLostPerJob": round(total_lost / len(cancelled_jobs)) if cancelled_jobs else 0
        },
        "byReason": reason_list,
        "allCancelled": sorted(
            [{"id": j.get("id"), "title": j.get("title"), "customerName": j.get("customerName"),
              "offerTotal": j.get("offer", {}).get("total", 0), 
              "reason": cancel_reasons.get(j.get("cancelReason", ""), {}).get("name", j.get("cancelReason", "Belirtilmemiş")),
              "date": j.get("updatedAt", j.get("createdAt", ""))[:10]} 
             for j in cancelled_jobs],
            key=lambda x: x.get("offerTotal", 0), reverse=True
        )
    }


@router.get("/period-comparison")
def period_comparison_report(period1_start: str, period1_end: str, period2_start: str, period2_end: str):
    """Dönemsel Karşılaştırma - İki dönem arası karşılaştırma"""
    jobs = load_json("jobs.json")
    orders = load_json("productionOrders.json")
    
    def get_period_stats(jobs_list, orders_list, start, end):
        filtered_jobs = [j for j in jobs_list if start <= j.get("createdAt", "")[:10] <= end]
        filtered_orders = [o for o in orders_list if start <= o.get("createdAt", "")[:10] <= end]
        
        total_offer = sum(j.get("offer", {}).get("total", 0) or 0 for j in filtered_jobs)
        
        # Tahsilat hesapla
        total_collected = 0
        for job in filtered_jobs:
            finance = job.get("finance", {})
            if finance:
                pre = finance.get("prePayments", {})
                total_collected += (pre.get("cash", 0) or 0) + (pre.get("card", 0) or 0)
                post = finance.get("postPayments", {})
                total_collected += (post.get("cash", 0) or 0) + (post.get("card", 0) or 0)
        
        cancelled = len([j for j in filtered_jobs if j.get("status") == "ANLASILAMADI"])
        completed = len([j for j in filtered_jobs if j.get("status") == "KAPALI"])
        
        return {
            "newJobs": len(filtered_jobs),
            "totalOffer": total_offer,
            "totalCollected": total_collected,
            "completedJobs": completed,
            "cancelledJobs": cancelled,
            "productionOrders": len(filtered_orders),
            "deliveredOrders": len([o for o in filtered_orders if o.get("status") == "delivered"])
        }
    
    period1 = get_period_stats(jobs, orders, period1_start, period1_end)
    period2 = get_period_stats(jobs, orders, period2_start, period2_end)
    
    def calc_change(new_val, old_val):
        if old_val == 0:
            return 100 if new_val > 0 else 0
        return round((new_val - old_val) / old_val * 100, 1)
    
    comparison = []
    metrics = [
        ("Yeni İş", "newJobs", "adet"),
        ("Toplam Teklif", "totalOffer", "₺"),
        ("Tahsilat", "totalCollected", "₺"),
        ("Tamamlanan İş", "completedJobs", "adet"),
        ("İptal Edilen", "cancelledJobs", "adet"),
        ("Üretim Siparişi", "productionOrders", "adet"),
        ("Teslim Edilen", "deliveredOrders", "adet"),
    ]
    
    for label, key, unit in metrics:
        val1 = period1[key]
        val2 = period2[key]
        change = calc_change(val1, val2)
        comparison.append({
            "metric": label,
            "period1Value": val1,
            "period2Value": val2,
            "change": change,
            "trend": "up" if change > 0 else "down" if change < 0 else "stable",
            "unit": unit
        })
    
    return {
        "period1": {"start": period1_start, "end": period1_end, "stats": period1},
        "period2": {"start": period2_start, "end": period2_end, "stats": period2},
        "comparison": comparison
    }


@router.get("/personnel-performance")
def personnel_performance_report(start_date: str = None, end_date: str = None):
    """Personel Verimlilik Raporu - Genel Görevler + Montaj Görevleri (V3 - Tüm Personel)"""
    assembly_tasks = load_json("assemblyTasks.json")
    general_tasks = load_json("tasks.json")
    task_assignments = load_json("task_assignments.json")
    personnel = load_json("personnel.json")
    teams = load_json("teams.json")
    team_members_data = load_json("team_members.json")
    
    # Tarih filtresi - montaj görevleri
    if start_date:
        assembly_tasks = [t for t in assembly_tasks if t.get("createdAt", "") >= start_date]
    if end_date:
        assembly_tasks = [t for t in assembly_tasks if t.get("createdAt", "") <= end_date]
    
    # Tarih filtresi - genel görevler
    if start_date:
        general_tasks = [t for t in general_tasks if t.get("createdAt", "") >= start_date]
    if end_date:
        general_tasks = [t for t in general_tasks if t.get("createdAt", "") <= end_date]
    
    # TÜM personeli al (aktifMi filtresiz, sadece deleted olmayanlar)
    personnel_map = {p["id"]: p for p in personnel if not p.get("deleted")}
    team_map = {t["id"]: t for t in teams if not t.get("deleted")}
    general_tasks_map = {t["id"]: t for t in general_tasks if not t.get("deleted")}
    
    # Ekip üyelerini al (team_members.json dosyasından)
    team_members = {}
    for tm in team_members_data:
        if tm.get("deleted"):
            continue
        person_id = tm.get("personnelId")
        team_id = tm.get("teamId")
        if person_id and team_id and person_id not in team_members:
            team = team_map.get(team_id, {})
            person = personnel_map.get(person_id, {})
            team_members[person_id] = {
                "teamId": team_id,
                "teamName": team.get("ad", "-"),
                "role": person.get("unvan", "-")
            }
    
    # Ekip bazlı üyeleri tut: teamId -> [personnelId, ...]
    team_to_members = defaultdict(list)
    for tm in team_members_data:
        if tm.get("deleted"):
            continue
        team_id = tm.get("teamId")
        person_id = tm.get("personnelId")
        if team_id and person_id:
            team_to_members[team_id].append(person_id)
    
    # Personel istatistikleri - TÜM personel için başlat
    person_stats = {}
    for person_id, person in personnel_map.items():
        member_info = team_members.get(person_id, {})
        person_stats[person_id] = {
            "generalTaskCount": 0, "generalCompletedCount": 0,
            "assemblyTaskCount": 0, "assemblyCompletedCount": 0,
            "totalDays": 0, "issueCount": 0, "delayCount": 0,
            "teamId": member_info.get("teamId"),
            "teamName": member_info.get("teamName", "-"),
            "role": person.get("unvan", "-")
        }
    
    # 1. GENEL GÖREV ATAMALARI (task_assignments.json)
    for assignment in task_assignments:
        if assignment.get("deleted") or not assignment.get("active"):
            continue
        
        task_id = assignment.get("taskId")
        task = general_tasks_map.get(task_id)
        if not task:
            continue
        
        assignee_type = assignment.get("assigneeType")
        assignee_id = assignment.get("assigneeId")
        
        if assignee_type == "personnel" and assignee_id in person_stats:
            # Direkt personele atanmış
            person_stats[assignee_id]["generalTaskCount"] += 1
            if task.get("durum") == "done":
                person_stats[assignee_id]["generalCompletedCount"] += 1
        
        elif assignee_type == "team" and assignee_id:
            # Ekibe atanmış - ekipteki tüm üyelere say
            members = team_to_members.get(assignee_id, [])
            for person_id in members:
                if person_id in person_stats:
                    person_stats[person_id]["generalTaskCount"] += 1
                    if task.get("durum") == "done":
                        person_stats[person_id]["generalCompletedCount"] += 1
    
    # 2. MONTAJ GÖREVLERİ (assemblyTasks.json)
    for task in assembly_tasks:
        team_id = task.get("teamId")
        if not team_id:
            continue
        
        members_in_team = team_to_members.get(team_id, [])
        for person_id in members_in_team:
            if person_id not in person_stats:
                continue
            
            person_stats[person_id]["assemblyTaskCount"] += 1
            
            if task.get("status") == "completed":
                person_stats[person_id]["assemblyCompletedCount"] += 1
                # Süre hesapla
                planned = task.get("plannedDate")
                completed = task.get("completedAt")
                if planned and completed:
                    days = _days_between(planned, completed)
                    if days is not None:
                        person_stats[person_id]["totalDays"] += abs(days)
            
            # Sorunlar
            for issue in task.get("issues", []):
                if issue.get("responsiblePersonId") == person_id:
                    person_stats[person_id]["issueCount"] += 1
            
            # Gecikmeler
            for delay in task.get("delays", []):
                if delay.get("responsiblePersonId") == person_id:
                    person_stats[person_id]["delayCount"] += 1
    
    # Personel listesi oluştur
    person_list = []
    for person_id, stats in person_stats.items():
        person = personnel_map.get(person_id, {})
        
        # Toplam görev sayısı
        total_tasks = stats["generalTaskCount"] + stats["assemblyTaskCount"]
        total_completed = stats["generalCompletedCount"] + stats["assemblyCompletedCount"]
        
        avg_days = round(stats["totalDays"] / stats["assemblyCompletedCount"], 1) if stats["assemblyCompletedCount"] > 0 else 0
        completion_rate = round(total_completed / total_tasks * 100, 1) if total_tasks > 0 else 0
        
        # Performans hesaplama
        if total_tasks == 0:
            performance = "Yeni"  # Hiç görev atanmamış
        elif completion_rate >= 80 and stats["issueCount"] < 2:
            performance = "İyi"
        elif completion_rate >= 50 and stats["issueCount"] <= 5:
            performance = "Gelişmeli"
        else:
            performance = "Düşük"
        
        # Personel adı (ad + soyad)
        person_name = person.get("ad", "Bilinmiyor")
        if person.get("soyad"):
            person_name += " " + person.get("soyad")
        
        person_list.append({
            "personId": person_id,
            "personName": person_name,
            "teamId": stats["teamId"],
            "teamName": stats["teamName"],
            "role": stats["role"],
            "generalTaskCount": stats["generalTaskCount"],
            "generalCompletedCount": stats["generalCompletedCount"],
            "assemblyTaskCount": stats["assemblyTaskCount"],
            "assemblyCompletedCount": stats["assemblyCompletedCount"],
            "taskCount": total_tasks,
            "completedCount": total_completed,
            "completionRate": completion_rate,
            "avgCompletionDays": avg_days,
            "issueCount": stats["issueCount"],
            "delayCount": stats["delayCount"],
            "performance": performance
        })
    
    person_list.sort(key=lambda x: x["completionRate"], reverse=True)
    
    # Performans dağılımı
    perf_dist = defaultdict(int)
    for p in person_list:
        perf_dist[p["performance"]] += 1
    
    # Görev atanmış personel sayısı (Yeni hariç)
    active_personnel = [p for p in person_list if p["performance"] != "Yeni"]
    
    return {
        "summary": {
            "totalPersonnel": len(person_list),
            "activePersonnel": len(active_personnel),
            "avgCompletionRate": round(sum(p["completionRate"] for p in active_personnel) / len(active_personnel), 1) if active_personnel else 0,
            "totalIssues": sum(p["issueCount"] for p in person_list),
            "totalDelays": sum(p["delayCount"] for p in person_list),
            "totalGeneralTasks": sum(p["generalTaskCount"] for p in person_list),
            "totalAssemblyTasks": sum(p["assemblyTaskCount"] for p in person_list)
        },
        "performanceDistribution": [
            {"level": "İyi", "icon": "⭐", "count": perf_dist["İyi"]},
            {"level": "Gelişmeli", "icon": "⚠️", "count": perf_dist["Gelişmeli"]},
            {"level": "Düşük", "icon": "🔴", "count": perf_dist["Düşük"]},
            {"level": "Yeni", "icon": "🆕", "count": perf_dist["Yeni"]},
        ],
        "personnel": person_list
    }


@router.get("/process-time")
def process_time_report(start_date: str = None, end_date: str = None):
    """Süreç/Zaman Analizi - Aşamalar arası süre"""
    jobs = load_json("jobs.json")
    
    # Tarih filtresi
    if start_date:
        jobs = [j for j in jobs if j.get("createdAt", "") >= start_date]
    if end_date:
        jobs = [j for j in jobs if j.get("createdAt", "") <= end_date]
    
    # Aşama geçişleri
    stage_transitions = {
        "olcu_fiyat": {"label": "Ölçü → Fiyatlandırma", "durations": []},
        "fiyat_anlasma": {"label": "Fiyat → Anlaşma", "durations": []},
        "anlasma_uretim": {"label": "Anlaşma → Üretim", "durations": []},
        "uretim_montaj": {"label": "Üretim → Montaj", "durations": []},
        "montaj_kapanis": {"label": "Montaj → Kapanış", "durations": []},
    }
    
    status_map = {
        "MUSTERI_OLCUSU_BEKLENIYOR": "olcu",
        "OLCU_ALINDI": "olcu",
        "FIYATLANDIRMA": "fiyat",
        "FIYAT_VERILDI": "fiyat",
        "ANLASMA_YAPILIYOR": "anlasma",
        "ONAY_BEKLENIYOR": "anlasma",
        "STOK_KONTROL": "uretim",
        "URETIME_HAZIR": "uretim",
        "URETIMDE": "uretim",
        "MONTAJA_HAZIR": "montaj",
        "MUHASEBE_BEKLIYOR": "montaj",
        "KAPALI": "kapanis"
    }
    
    for job in jobs:
        logs = job.get("logs", [])
        stage_times = {}
        
        for log in logs:
            action = log.get("action", "")
            log_time = log.get("at")
            
            if "status.updated" in action:
                note = log.get("note", "")
                # "OLD_STATUS -> NEW_STATUS" formatından parse et
                if " -> " in note:
                    new_status = note.split(" -> ")[1].strip()
                    stage = status_map.get(new_status)
                    if stage and log_time:
                        stage_times[stage] = log_time
        
        # Geçiş sürelerini hesapla
        if "olcu" in stage_times and "fiyat" in stage_times:
            days = _days_between(stage_times["olcu"], stage_times["fiyat"])
            if days is not None:
                stage_transitions["olcu_fiyat"]["durations"].append(days)
        
        if "fiyat" in stage_times and "anlasma" in stage_times:
            days = _days_between(stage_times["fiyat"], stage_times["anlasma"])
            if days is not None:
                stage_transitions["fiyat_anlasma"]["durations"].append(days)
        
        if "anlasma" in stage_times and "uretim" in stage_times:
            days = _days_between(stage_times["anlasma"], stage_times["uretim"])
            if days is not None:
                stage_transitions["anlasma_uretim"]["durations"].append(days)
        
        if "uretim" in stage_times and "montaj" in stage_times:
            days = _days_between(stage_times["uretim"], stage_times["montaj"])
            if days is not None:
                stage_transitions["uretim_montaj"]["durations"].append(days)
        
        if "montaj" in stage_times and "kapanis" in stage_times:
            days = _days_between(stage_times["montaj"], stage_times["kapanis"])
            if days is not None:
                stage_transitions["montaj_kapanis"]["durations"].append(days)
    
    # Özet oluştur
    result = []
    for key, data in stage_transitions.items():
        durations = data["durations"]
        if durations:
            avg_days = round(sum(durations) / len(durations), 1)
            min_days = min(durations)
            max_days = max(durations)
        else:
            avg_days = min_days = max_days = 0
        
        # Hedef süreler (örnek)
        targets = {
            "olcu_fiyat": 2,
            "fiyat_anlasma": 3,
            "anlasma_uretim": 2,
            "uretim_montaj": 7,
            "montaj_kapanis": 3
        }
        target = targets.get(key, 5)
        
        status = "Normal" if avg_days <= target else "Uzun" if avg_days <= target * 1.5 else "Darboğaz"
        
        result.append({
            "transition": key,
            "label": data["label"],
            "sampleCount": len(durations),
            "avgDays": avg_days,
            "minDays": min_days,
            "maxDays": max_days,
            "targetDays": target,
            "deviation": round(avg_days - target, 1),
            "status": status
        })
    
    # Toplam ortalama süre
    total_avg = sum(r["avgDays"] for r in result)
    
    return {
        "summary": {
            "totalAvgDays": round(total_avg, 1),
            "bottleneck": max(result, key=lambda x: x["avgDays"])["label"] if result else "-"
        },
        "transitions": result
    }


@router.get("/personnel/{person_id}")
def personnel_detail_report(person_id: str, start_date: str = None, end_date: str = None):
    """Personel Detay Raporu"""
    personnel = load_json("personnel.json")
    teams = load_json("teams.json")
    team_members_data = load_json("team_members.json")
    assembly_tasks = load_json("assemblyTasks.json")
    general_tasks = load_json("tasks.json")
    task_assignments = load_json("task_assignments.json")
    
    # Personeli bul
    person = next((p for p in personnel if p.get("id") == person_id), None)
    if not person:
        raise HTTPException(status_code=404, detail="Personel bulunamadı")
    
    # Tarih filtresi
    if start_date:
        assembly_tasks = [t for t in assembly_tasks if t.get("createdAt", "") >= start_date]
        general_tasks = [t for t in general_tasks if t.get("createdAt", "") >= start_date]
    if end_date:
        assembly_tasks = [t for t in assembly_tasks if t.get("createdAt", "") <= end_date]
        general_tasks = [t for t in general_tasks if t.get("createdAt", "") <= end_date]
    
    team_map = {t["id"]: t for t in teams if not t.get("deleted")}
    general_tasks_map = {t["id"]: t for t in general_tasks if not t.get("deleted")}
    
    # Personelin ekiplerini bul
    person_teams = []
    team_ids = []
    for tm in team_members_data:
        if tm.get("personnelId") == person_id and not tm.get("deleted"):
            team_id = tm.get("teamId")
            if team_id and team_id in team_map:
                team_ids.append(team_id)
                person_teams.append({
                    "id": team_id,
                    "name": team_map[team_id].get("ad", "-")
                })
    
    # Genel görevler - direkt atananlar
    direct_general_tasks = []
    for assignment in task_assignments:
        if assignment.get("deleted") or not assignment.get("active"):
            continue
        if assignment.get("assigneeType") == "personnel" and assignment.get("assigneeId") == person_id:
            task_id = assignment.get("taskId")
            task = general_tasks_map.get(task_id)
            if task:
                direct_general_tasks.append({
                    "id": task.get("id"),
                    "title": task.get("baslik", "-"),
                    "status": task.get("durum", "-"),
                    "createdAt": task.get("createdAt"),
                    "assignmentType": "direct"
                })
    
    # Montaj görevleri (ekip üzerinden)
    person_assembly_tasks = []
    for task in assembly_tasks:
        if task.get("teamId") in team_ids:
            person_assembly_tasks.append({
                "id": task.get("id"),
                "jobId": task.get("jobId"),
                "jobTitle": task.get("jobTitle", "-"),
                "stageName": task.get("stageName", "-"),
                "status": task.get("status"),
                "plannedDate": task.get("plannedDate"),
                "completedAt": task.get("completedAt"),
                "teamId": task.get("teamId")
            })
    
    # İstatistikler
    general_completed = len([t for t in direct_general_tasks if t["status"] == "done"])
    assembly_completed = len([t for t in person_assembly_tasks if t["status"] == "completed"])
    
    # Sorunlar ve gecikmeler
    issues = []
    delays = []
    for task in assembly_tasks:
        for issue in task.get("issues", []):
            if issue.get("responsiblePersonId") == person_id:
                issues.append({
                    "taskId": task.get("id"),
                    "jobTitle": task.get("jobTitle", "-"),
                    "type": issue.get("type"),
                    "note": issue.get("note"),
                    "date": issue.get("reportedAt")
                })
        for delay in task.get("delays", []):
            if delay.get("responsiblePersonId") == person_id:
                delays.append({
                    "taskId": task.get("id"),
                    "jobTitle": task.get("jobTitle", "-"),
                    "reason": delay.get("reason"),
                    "note": delay.get("note"),
                    "date": delay.get("date")
                })
    
    person_name = person.get("ad", "") + " " + person.get("soyad", "")
    
    return {
        "person": {
            "id": person_id,
            "name": person_name.strip(),
            "email": person.get("email"),
            "phone": person.get("telefon"),
            "role": person.get("unvan", "-"),
            "active": person.get("aktifMi", False)
        },
        "teams": person_teams,
        "summary": {
            "generalTaskCount": len(direct_general_tasks),
            "generalCompletedCount": general_completed,
            "assemblyTaskCount": len(person_assembly_tasks),
            "assemblyCompletedCount": assembly_completed,
            "issueCount": len(issues),
            "delayCount": len(delays)
        },
        "generalTasks": direct_general_tasks[:20],  # Son 20
        "assemblyTasks": person_assembly_tasks[:20],
        "issues": issues[:10],
        "delays": delays[:10]
    }


@router.get("/customer/{customer_id}")
def customer_detail_report(customer_id: str, start_date: str = None, end_date: str = None):
    """Müşteri Detay Raporu"""
    customers = load_json("customers.json")
    jobs = load_json("jobs.json")
    
    # Müşteriyi bul
    customer = next((c for c in customers if c.get("id") == customer_id), None)
    if not customer:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı")
    
    # Müşterinin işleri
    customer_jobs = [j for j in jobs if j.get("customerId") == customer_id]
    
    # Tarih filtresi
    if start_date:
        customer_jobs = [j for j in customer_jobs if j.get("createdAt", "") >= start_date]
    if end_date:
        customer_jobs = [j for j in customer_jobs if j.get("createdAt", "") <= end_date]
    
    # İstatistikler
    total_offer = 0
    total_collected = 0
    jobs_list = []
    
    status_counts = defaultdict(int)
    
    for job in customer_jobs:
        offer_total = job.get("offer", {}).get("total", 0) or 0
        payments = job.get("payments", {})
        collected = sum(float(p.get("amount", 0) or 0) for p in payments.get("received", []))
        
        total_offer += offer_total
        total_collected += collected
        status_counts[job.get("status", "unknown")] += 1
        
        jobs_list.append({
            "id": job.get("id"),
            "title": job.get("title", "-"),
            "status": job.get("status"),
            "createdAt": job.get("createdAt"),
            "offer": offer_total,
            "collected": collected,
            "remaining": offer_total - collected,
            "roles": [r.get("name", r.get("id", "-")) for r in job.get("roles", [])]
        })
    
    # Ödeme detayları
    payment_details = []
    for job in customer_jobs:
        payments = job.get("payments", {})
        for payment in payments.get("received", []):
            payment_details.append({
                "jobId": job.get("id"),
                "jobTitle": job.get("title", "-"),
                "amount": float(payment.get("amount", 0) or 0),
                "type": payment.get("type", "-"),
                "date": payment.get("date"),
                "note": payment.get("note")
            })
    
    collection_rate = round(total_collected / total_offer * 100, 1) if total_offer > 0 else 0
    
    # Segment hesaplama
    if len(customer_jobs) == 0:
        segment = "Yeni"
    elif collection_rate >= 90 and total_offer >= 100000:
        segment = "VIP"
    elif collection_rate >= 70:
        segment = "Normal"
    elif collection_rate >= 40:
        segment = "Riskli"
    else:
        segment = "Kara Liste"
    
    return {
        "customer": {
            "id": customer_id,
            "name": customer.get("name", "-"),
            "contact": customer.get("contact"),  # email veya telefon
            "location": customer.get("location"),  # konum
            "customerSegment": customer.get("segment"),  # B2B/B2C
            "performanceSegment": segment  # hesaplanan segment
        },
        "summary": {
            "totalJobs": len(customer_jobs),
            "activeJobs": len([j for j in customer_jobs if j.get("status") not in ["KAPALI", "ANLASILAMADI", "SERVIS_KAPALI"]]),
            "completedJobs": len([j for j in customer_jobs if j.get("status") == "KAPALI"]),
            "totalOffer": total_offer,
            "totalCollected": total_collected,
            "remaining": total_offer - total_collected,
            "collectionRate": collection_rate
        },
        "statusDistribution": [{"status": k, "count": v} for k, v in status_counts.items()],
        "jobs": sorted(jobs_list, key=lambda x: x.get("createdAt", ""), reverse=True)[:20],
        "payments": sorted(payment_details, key=lambda x: x.get("date", ""), reverse=True)[:20]
    }


@router.get("/inquiry-conversion")
def inquiry_conversion_report(start_date: str = None, end_date: str = None):
    """Fiyat Sorgusu (Müşteri Ölçüsü) Dönüşüm Raporu"""
    jobs = load_json("jobs.json")
    settings = load_json("settings.json")
    
    # Sadece müşteri ölçüsü işleri
    inquiry_jobs = [j for j in jobs if j.get("startType") == "MUSTERI_OLCUSU"]
    
    # Tarih filtresi
    if start_date:
        inquiry_jobs = [j for j in inquiry_jobs if j.get("createdAt", "") >= start_date]
    if end_date:
        inquiry_jobs = [j for j in inquiry_jobs if j.get("createdAt", "") <= end_date]
    
    # İstatistikler
    total_count = len(inquiry_jobs)
    approved_count = len([j for j in inquiry_jobs if j.get("status") == "FIYAT_SORGUSU_ONAY"])
    rejected_count = len([j for j in inquiry_jobs if j.get("status") == "FIYAT_SORGUSU_RED"])
    pending_count = len([j for j in inquiry_jobs if j.get("status") not in ["FIYAT_SORGUSU_ONAY", "FIYAT_SORGUSU_RED"]])
    
    # Tutarlar
    total_offer = sum(j.get("offer", {}).get("total", 0) or 0 for j in inquiry_jobs)
    approved_offer = sum(j.get("offer", {}).get("total", 0) or 0 for j in inquiry_jobs if j.get("status") == "FIYAT_SORGUSU_ONAY")
    rejected_offer = sum(j.get("offer", {}).get("total", 0) or 0 for j in inquiry_jobs if j.get("status") == "FIYAT_SORGUSU_RED")
    
    # Dönüşüm oranı
    decided_count = approved_count + rejected_count
    conversion_rate = round(approved_count / decided_count * 100, 1) if decided_count > 0 else 0
    
    # Red nedenleri dağılımı
    cancel_reasons = settings.get("cancelReasons", [])
    reason_map = {r.get("id"): r.get("name") for r in cancel_reasons}
    
    rejection_by_reason = defaultdict(lambda: {"count": 0, "total": 0})
    for job in inquiry_jobs:
        if job.get("status") == "FIYAT_SORGUSU_RED":
            reason_id = job.get("inquiry", {}).get("cancelReason", "other")
            reason_name = reason_map.get(reason_id, reason_id)
            rejection_by_reason[reason_name]["count"] += 1
            rejection_by_reason[reason_name]["total"] += job.get("offer", {}).get("total", 0) or 0
    
    rejection_reasons = [
        {"reason": k, "count": v["count"], "totalOffer": v["total"]}
        for k, v in rejection_by_reason.items()
    ]
    rejection_reasons.sort(key=lambda x: x["count"], reverse=True)
    
    # Son fiyat sorguları listesi
    inquiry_list = []
    for job in sorted(inquiry_jobs, key=lambda x: x.get("createdAt", ""), reverse=True)[:30]:
        status = job.get("status", "")
        if status == "FIYAT_SORGUSU_ONAY":
            decision = "Onaylandı"
        elif status == "FIYAT_SORGUSU_RED":
            decision = "Reddedildi"
        else:
            decision = "Beklemede"
        
        inquiry_list.append({
            "id": job.get("id"),
            "title": job.get("title"),
            "customerName": job.get("customerName"),
            "createdAt": job.get("createdAt", "")[:10],
            "offerTotal": job.get("offer", {}).get("total", 0) or 0,
            "decision": decision,
            "decisionDate": job.get("inquiry", {}).get("decidedAt", "")[:10] if job.get("inquiry", {}).get("decidedAt") else None,
            "cancelReason": reason_map.get(job.get("inquiry", {}).get("cancelReason"), job.get("inquiry", {}).get("cancelReason")) if status == "FIYAT_SORGUSU_RED" else None,
            "roles": [r.get("name") for r in job.get("roles", [])]
        })
    
    return {
        "summary": {
            "totalInquiries": total_count,
            "approved": approved_count,
            "rejected": rejected_count,
            "pending": pending_count,
            "conversionRate": conversion_rate,
            "totalOfferAmount": total_offer,
            "approvedOfferAmount": approved_offer,
            "rejectedOfferAmount": rejected_offer
        },
        "rejectionReasons": rejection_reasons,
        "inquiries": inquiry_list
    }

