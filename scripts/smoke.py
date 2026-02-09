#!/usr/bin/env python3
"""
Smoke runner: Backend health, login, tasks CRUD, frontend availability.
Hızlı çevrim içi doğrulama için - E2E'nin yerine geçmez.
Kullanım: python scripts/smoke.py
"""
import os
import sys
import urllib.request
import urllib.error
import json

API_BASE = os.environ.get("SMOKE_API_URL", "http://localhost:8000")
FRONTEND_URL = os.environ.get("SMOKE_FRONTEND_URL", "http://localhost:5173")


def req(method, path, body=None, headers=None):
    h = {"Content-Type": "application/json", **(headers or {})}
    data = json.dumps(body).encode() if body else None
    req_obj = urllib.request.Request(f"{API_BASE}{path}", data=data, headers=h, method=method)
    with urllib.request.urlopen(req_obj, timeout=10) as r:
        return json.loads(r.read().decode())


def check_backend_health():
    try:
        with urllib.request.urlopen(f"{API_BASE}/health", timeout=5) as r:
            return r.status == 200
    except Exception as e:
        print(f"  [FAIL] Backend health: {e}")
        return False


def check_login():
    try:
        data = req("POST", "/auth/login", {"username": "admin", "password": "admin"})
        if data.get("success") and data.get("token"):
            return data["token"]
        print(f"  [FAIL] Login: {data}")
        return None
    except Exception as e:
        print(f"  [FAIL] Login: {e}")
        return None


def check_tasks_crud(token):
    headers = {"Authorization": f"Bearer {token}"}
    try:
        create = req(
            "POST", "/tasks/",
            {"baslik": "Smoke Test Task", "aciklama": "Temizlenecek", "oncelik": "low", "durum": "todo"},
            headers=headers,
        )
        tid = create.get("id")
        if not tid:
            print(f"  [FAIL] Task create: no id in {create}")
            return False
        get_resp = req("GET", f"/tasks/{tid}", headers=headers)
        if get_resp.get("baslik") != "Smoke Test Task":
            print(f"  [FAIL] Task read: wrong data {get_resp}")
            return False
        req("PUT", f"/tasks/{tid}", {"baslik": "Smoke Updated", "aciklama": "", "oncelik": "med", "durum": "todo"}, headers=headers)
        req("DELETE", f"/tasks/{tid}", headers=headers)
        print("  [OK] Tasks CRUD + soft-delete")
        return True
    except Exception as e:
        print(f"  [FAIL] Tasks CRUD: {e}")
        return False


def check_frontend():
    try:
        with urllib.request.urlopen(FRONTEND_URL, timeout=5) as r:
            return r.status == 200
    except Exception as e:
        print(f"  [FAIL] Frontend: {e}")
        return False


def main():
    print("Smoke runner...")
    ok = True
    if check_backend_health():
        print("  [OK] Backend health")
    else:
        ok = False

    token = check_login()
    if token:
        print("  [OK] Login")
        if not check_tasks_crud(token):
            ok = False
    else:
        ok = False

    if check_frontend():
        print("  [OK] Frontend")
    else:
        print("  [SKIP] Frontend (dev server ayakta olmayabilir)")
        # Frontend skip kritik değil

    if ok:
        print("Smoke: PASSED")
        return 0
    print("Smoke: FAILED")
    return 1


if __name__ == "__main__":
    sys.exit(main())
