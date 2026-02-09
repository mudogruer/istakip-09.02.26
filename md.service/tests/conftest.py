"""
Pytest fixtures for MD Service backend tests.
Test data isolation: DATA_DIR points to a temp copy of md.data.
"""
import os
import shutil
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Set DATA_DIR before importing app (data_loader caches get_data_dir)
TEST_DATA_DIR = Path(tempfile.mkdtemp(prefix="md_test_"))
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SOURCE_DATA = REPO_ROOT / "md.data"

# Required JSON files for tasks/auth tests
REQUIRED_FILES = [
    "tasks.json",
    "task_assignments.json",
    "users.json",
    "personnel.json",
    "teams.json",
    "roles.json",
    "activities.json",
]


def _setup_test_data():
    """Copy source data to test dir."""
    for f in REQUIRED_FILES:
        src = SOURCE_DATA / f
        if src.exists():
            shutil.copy2(src, TEST_DATA_DIR / f)
        else:
            # Create minimal empty structure
            (TEST_DATA_DIR / f).write_text("[]" if f != "users.json" else '[]', encoding="utf-8")
    # Ensure users has admin for login
    users_path = TEST_DATA_DIR / "users.json"
    if users_path.exists():
        import json
        users = json.loads(users_path.read_text(encoding="utf-8"))
        if not any(u.get("username") == "admin" for u in users):
            users.append({
                "id": "USER-ADMIN",
                "username": "admin",
                "passwordHash": "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918",
                "displayName": "Sistem Yöneticisi",
                "role": "admin",
                "aktifMi": True,
            })
            users_path.write_text(json.dumps(users, ensure_ascii=False, indent=2), encoding="utf-8")


@pytest.fixture(scope="session")
def test_data_dir():
    """Create and populate test data directory for the whole session."""
    _setup_test_data()
    yield str(TEST_DATA_DIR)
    # Cleanup
    if TEST_DATA_DIR.exists():
        shutil.rmtree(TEST_DATA_DIR, ignore_errors=True)


@pytest.fixture(scope="session")
def app_client(test_data_dir):
    """FastAPI TestClient with test DATA_DIR."""
    os.environ["DATA_DIR"] = test_data_dir
    # Clear data_loader cache so it picks up DATA_DIR
    from app.data_loader import get_data_dir
    get_data_dir.cache_clear()

    from app.main import app
    with TestClient(app) as client:
        yield client


@pytest.fixture
def client(app_client):
    """Per-test client (reuse session app_client)."""
    return app_client


@pytest.fixture
def auth_token(client):
    """Login and return Bearer token."""
    r = client.post("/auth/login", json={"username": "admin", "password": "admin"})
    assert r.status_code == 200
    data = r.json()
    assert data.get("success") and data.get("token")
    return data["token"]


@pytest.fixture
def auth_headers(auth_token):
    """Authorization header dict."""
    return {"Authorization": f"Bearer {auth_token}"}
