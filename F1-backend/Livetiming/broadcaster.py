"""
Bridges the ingestor's threading callbacks to async WebSocket clients.

The ingestor runs in its own thread and calls broadcast() on each update.
Each connected WebSocket client owns an asyncio.Queue. broadcast() uses
loop.call_soon_threadsafe() to safely hand messages from the ingestor
thread into the async event loop, where the WebSocket handlers read them.
"""

import asyncio
import json
import logging
import threading
from typing import Any

log = logging.getLogger(__name__)


class Broadcaster:
    """Thread-safe bridge between the ingestor thread and async WebSocket clients."""

    def __init__(self) -> None:
        self._loop: asyncio.AbstractEventLoop | None = None
        self._clients: set[asyncio.Queue] = set()
        self._lock = threading.Lock()

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Register the running asyncio event loop.

        Must be called from the async context (e.g. FastAPI lifespan)
        before any WebSocket clients connect.
        """
        self._loop = loop
        log.info("Broadcaster loop registered")

    def add_client(self, queue: asyncio.Queue) -> None:
        """Register a new WebSocket client queue."""
        with self._lock:
            self._clients.add(queue)
        log.info("Client connected (%d total)", len(self._clients))

    def remove_client(self, queue: asyncio.Queue) -> None:
        """Remove a disconnected client queue."""
        with self._lock:
            self._clients.discard(queue)
        log.info("Client disconnected (%d remaining)", len(self._clients))

    def broadcast(self, topic: str, data: Any) -> None:
        """Push a topic update to all connected clients.

        Called from the ingestor thread. Uses call_soon_threadsafe to
        safely enqueue messages into the async event loop.

        Args:
            topic: The topic name (e.g. "TimingData").
            data: The updated topic state dict.
        """
        if not self._loop:
            return

        with self._lock:
            if not self._clients:
                return
            clients = list(self._clients)

        try:
            msg = json.dumps(
                {"type": "update", "topic": topic, "data": data},
                default=str,
            )
        except Exception:
            log.exception("Failed to serialize update for topic %s", topic)
            return

        for queue in clients:
            self._loop.call_soon_threadsafe(queue.put_nowait, msg)
