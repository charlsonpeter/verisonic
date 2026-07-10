"""Tests for in-memory live stream broker."""

import asyncio

import pytest


@pytest.mark.asyncio
async def test_is_live_false_when_no_broadcaster(live_stream_manager):
    assert live_stream_manager.is_live(1) is False


@pytest.mark.asyncio
async def test_broadcast_chunk_reaches_listener(live_stream_manager):
    station_id = 42
    live_stream_manager.broadcasters[station_id] = True

    queue = live_stream_manager.register_listener(station_id)
    chunk = b"\xff\xfb\x90\x00"  # MP3 frame header bytes

    await live_stream_manager.broadcast_chunk(station_id, chunk)

    received = await asyncio.wait_for(queue.get(), timeout=1.0)
    assert received == chunk


@pytest.mark.asyncio
async def test_history_prefilled_for_new_listener(live_stream_manager):
    station_id = 7
    live_stream_manager.broadcasters[station_id] = True

    await live_stream_manager.broadcast_chunk(station_id, b"chunk-a")
    await live_stream_manager.broadcast_chunk(station_id, b"chunk-b")

    queue = live_stream_manager.register_listener(station_id)
    history_block = await asyncio.wait_for(queue.get(), timeout=1.0)

    assert history_block == b"chunk-a" + b"chunk-b"


@pytest.mark.asyncio
async def test_skip_history_option(live_stream_manager):
    station_id = 8
    await live_stream_manager.broadcast_chunk(station_id, b"old-data")

    queue = live_stream_manager.register_listener(station_id, skip_history=True)

    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(queue.get(), timeout=0.1)


@pytest.mark.asyncio
async def test_stop_broadcasting_signals_listeners(live_stream_manager):
    station_id = 99
    live_stream_manager.broadcasters[station_id] = True
    queue = live_stream_manager.register_listener(station_id)

    await live_stream_manager.stop_broadcasting(station_id)

    assert live_stream_manager.is_live(station_id) is False
    sentinel = await asyncio.wait_for(queue.get(), timeout=1.0)
    assert sentinel is None


@pytest.mark.asyncio
async def test_unregister_listener_cleans_up(live_stream_manager):
    station_id = 3
    queue = live_stream_manager.register_listener(station_id)

    live_stream_manager.unregister_listener(station_id, queue)

    assert station_id not in live_stream_manager.listeners
