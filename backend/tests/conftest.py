import pytest

from app.services.live_stream import LiveStreamManager


@pytest.fixture
def live_stream_manager() -> LiveStreamManager:
    return LiveStreamManager()
