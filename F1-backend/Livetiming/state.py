"""
Thread-safe state store for F1 live timing data.

Maintains current merged state for all topics.
signalrcore writes from its own thread; FastAPI reads from the async event loop.
A single threading.Lock covers both paths safely.
"""

import logging
import threading
from collections.abc import Callable
from copy import deepcopy
from typing import Any

log = logging.getLogger(__name__)

# Callbacks receive (topic, updated_topic_state) after each state update.
StateCallback = Callable[[str, dict[str, Any]], None]


def _deep_merge(base: dict[str, Any], patch: dict[str, Any]) -> None:
    """Recursively merge patch into base, modifying base in place.

    Rules:
    - Both values are dicts → recurse.
    - Otherwise → patch value overwrites base value.
    - _kf keys are stripped (F1 protocol artefact, not domain data).
    """
    for key, patch_val in patch.items():
        if key == "_kf":
            continue
        base_val = base.get(key)
        if isinstance(base_val, dict) and isinstance(patch_val, dict):
            _deep_merge(base_val, patch_val)
        else:
            base[key] = patch_val


class StateStore:
    """Thread-safe store for all F1 live timing topic states."""

    def __init__(self) -> None:
        self._state: dict[str, Any] = {}
        self._lock = threading.Lock()
        self._subscribers: list[StateCallback] = []

    def subscribe(self, callback: StateCallback) -> None:
        """Register a callback to be notified after each state update.

        Called outside the state lock — safe to call get_topic() from within.
        """
        with self._lock:
            self._subscribers.append(callback)

    def replace(self, topic: str, data: dict[str, Any]) -> None:
        """Overwrite entire state for a topic (replace semantics)."""
        clean = {k: v for k, v in data.items() if k != "_kf"}
        with self._lock:
            self._state[topic] = clean
            callbacks = list(self._subscribers)

        self._notify(callbacks, topic, clean)

    def merge(self, topic: str, patch: dict[str, Any]) -> None:
        """Deep-merge a delta patch into existing state for a topic."""
        with self._lock:
            if topic not in self._state:
                self._state[topic] = {}
            _deep_merge(self._state[topic], patch)
            callbacks = list(self._subscribers)
            snapshot = deepcopy(self._state[topic])

        self._notify(callbacks, topic, snapshot)

    def get_topic(self, topic: str) -> Any:
        """Return a deep copy of current state for a single topic.

        Safe to call from any thread.
        """
        with self._lock:
            return deepcopy(self._state.get(topic, {}))

    def get_all(self) -> dict[str, Any]:
        """Return a deep copy of the entire state.

        Intended for initial snapshot delivery to new WebSocket clients.
        """
        with self._lock:
            return deepcopy(self._state)

    def clear(self) -> None:
        """Reset all state. Call this when a new session starts."""
        with self._lock:
            self._state.clear()
        log.info("State cleared")

    @staticmethod
    def _notify(
        callbacks: list[StateCallback],
        topic: str,
        data: Any,
    ) -> None:
        for cb in callbacks:
            try:
                cb(topic, data)
            except Exception:
                log.exception("Error in state subscriber for topic %s", topic)
