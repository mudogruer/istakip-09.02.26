"""
Tasks CRUD + persistence integration tests.
Create, read, update, soft-delete; list excludes deleted.
"""
import pytest


def test_tasks_list_without_auth(client):
    """GET /tasks/ works without auth (backend allows it for dev)."""
    r = client.get("/tasks/")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_tasks_list_with_auth(auth_headers, client):
    """GET /tasks/ with auth returns 200."""
    r = client.get("/tasks/", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_task_create_then_read(client):
    """POST task -> get by id -> verify fields."""
    payload = {
        "baslik": "E2E Test Görevi",
        "aciklama": "Otomatik test tarafından oluşturuldu",
        "oncelik": "med",
        "durum": "todo",
    }
    r = client.post("/tasks/", json=payload)
    assert r.status_code == 201
    created = r.json()
    assert created.get("baslik") == payload["baslik"]
    assert created.get("id")
    task_id = created["id"]

    r2 = client.get(f"/tasks/{task_id}")
    assert r2.status_code == 200
    detail = r2.json()
    assert detail.get("baslik") == payload["baslik"]
    assert detail.get("durum") == "todo"
    assert detail.get("deleted") is False


def test_task_update(client):
    """Create -> PUT update -> verify."""
    payload = {"baslik": "Güncelleme Testi", "aciklama": "A", "oncelik": "low", "durum": "todo"}
    r = client.post("/tasks/", json=payload)
    assert r.status_code == 201
    task_id = r.json()["id"]

    update_payload = {
        "baslik": "Güncellenmiş Başlık",
        "aciklama": "Yeni açıklama",
        "oncelik": "high",
        "durum": "in_progress",
    }
    r2 = client.put(f"/tasks/{task_id}", json=update_payload)
    assert r2.status_code == 200
    updated = r2.json()
    assert updated.get("baslik") == "Güncellenmiş Başlık"
    assert updated.get("durum") == "in_progress"

    r3 = client.get(f"/tasks/{task_id}")
    assert r3.status_code == 200
    assert r3.json().get("baslik") == "Güncellenmiş Başlık"


def test_task_soft_delete(client):
    """Create -> DELETE (soft) -> list excludes it, get 404."""
    payload = {"baslik": "Silinecek Görev", "aciklama": "", "oncelik": "med", "durum": "todo"}
    r = client.post("/tasks/", json=payload)
    assert r.status_code == 201
    task_id = r.json()["id"]

    r2 = client.delete(f"/tasks/{task_id}")
    assert r2.status_code == 200
    assert r2.json().get("deleted") is True

    # List should not include deleted
    r3 = client.get("/tasks/")
    ids = [t["id"] for t in r3.json()]
    assert task_id not in ids

    # Detail should 404 (backend filters deleted in get by id)
    r4 = client.get(f"/tasks/{task_id}")
    assert r4.status_code == 404


def test_task_assign_personnel(client):
    """Create task -> assign personnel -> verify."""
    payload = {"baslik": "Atama Testi", "aciklama": "", "oncelik": "med", "durum": "todo"}
    r = client.post("/tasks/", json=payload)
    assert r.status_code == 201
    task_id = r.json()["id"]

    r2 = client.post(
        f"/tasks/{task_id}/assign",
        json={"assigneeType": "personnel", "assigneeId": "PER-001", "note": "Test atama"},
    )
    assert r2.status_code == 200
    assign = r2.json()
    assert assign.get("taskId") == task_id
    assert assign.get("assigneeType") == "personnel"
    assert assign.get("assigneeId") == "PER-001"

    r3 = client.get(f"/tasks/{task_id}")
    assert r3.status_code == 200
    task = r3.json()
    assert task.get("currentAssignments")
    assert any(a.get("assigneeId") == "PER-001" for a in task.get("currentAssignments", []))
