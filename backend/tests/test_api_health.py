"""Smoke tests for FastAPI app startup and public endpoints."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    """Create test client with DB/storage startup mocked to avoid external deps."""
    mock_session = MagicMock()
    mock_session.query.return_value.filter.return_value.first.return_value = None
    mock_session.query.return_value.count.return_value = 0
    mock_session.execute.side_effect = Exception("column exists")
    mock_session.__enter__ = MagicMock(return_value=mock_session)
    mock_session.__exit__ = MagicMock(return_value=False)

    with patch("app.db.session.engine"), \
         patch("app.db.base_class.Base.metadata.create_all"), \
         patch("app.services.storage.ensure_bucket_exists"), \
         patch("app.db.session.SessionLocal", return_value=mock_session):
        from app.main import app
        yield TestClient(app)


def test_root(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "VeriSonic" in response.json()["message"]


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
