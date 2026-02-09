"""
Auth smoke tests: login, token validation, 401 without auth.
"""
import pytest


def test_health_no_auth_required(client):
    """Health endpoint does not require auth."""
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_login_fail_wrong_password(client):
    """Wrong password returns success=False."""
    r = client.post("/auth/login", json={"username": "admin", "password": "wrong"})
    assert r.status_code == 200
    data = r.json()
    assert data.get("success") is False
    assert "token" not in data or data.get("token") is None


def test_login_fail_unknown_user(client):
    """Unknown user returns success=False."""
    r = client.post("/auth/login", json={"username": "nobody", "password": "x"})
    assert r.status_code == 200
    assert r.json().get("success") is False


def test_login_success_returns_token(client):
    """Valid login returns token and user."""
    r = client.post("/auth/login", json={"username": "admin", "password": "admin"})
    assert r.status_code == 200
    data = r.json()
    assert data.get("success") is True
    assert data.get("token")
    assert data.get("user")
    assert data["user"].get("username") == "admin"


def test_me_without_token(client):
    """GET /auth/me without token returns authenticated=False."""
    r = client.get("/auth/me")
    assert r.status_code == 200
    assert r.json().get("authenticated") is False


def test_me_with_valid_token(auth_headers, client):
    """GET /auth/me with valid token returns user."""
    r = client.get("/auth/me", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data.get("authenticated") is True
    assert data.get("user", {}).get("username") == "admin"


def test_check_session_valid(auth_headers, client):
    """GET /auth/check with valid token returns valid=True."""
    r = client.get("/auth/check", headers=auth_headers)
    assert r.status_code == 200
    assert r.json().get("valid") is True
