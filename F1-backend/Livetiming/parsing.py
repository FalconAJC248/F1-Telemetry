"""
Stateless parsing functions for F1 live timing SignalR messages.
No classes, no state, no side effects.
"""

import base64
import json
import logging
import zlib
from typing import Any

log = logging.getLogger(__name__)

# Topics whose payloads are base64 + raw-deflate compressed.
COMPRESSED_TOPICS: frozenset[str] = frozenset({"CarData.z", "Position.z"})

# Topics that always carry full state — replace, never merge.
REPLACE_TOPICS: frozenset[str] = frozenset({
    "Heartbeat",
    "TrackStatus",
    "WeatherData",
    "SessionStatus",
    "ExtrapolatedClock",
    "LapCount",
    "TopThree",
    "SessionInfo",
    "SessionData",
    "AudioStreams",
    "ContentStreams",
})

# Topics that carry delta patches and require deep merge.
MERGE_TOPICS: frozenset[str] = frozenset({
    "TimingData",
    "DriverList",
    "TimingAppData",
    "TimingStats",
    "RaceControlMessages",
    "TeamRadio",
})


def decompress_z(raw: str) -> dict[str, Any]:
    """Decompress a base64 + raw-deflate payload from a .z topic.

    F1 uses raw deflate (no zlib header) — the -zlib.MAX_WBITS flag is required.

    Args:
        raw: Raw string from SignalR, optionally wrapped in double quotes.

    Returns:
        Parsed dict from the decompressed JSON payload.

    Raises:
        ValueError: If decompression or JSON parsing fails.
    """
    text = raw.strip('"')
    try:
        compressed = base64.b64decode(text)
        decompressed = zlib.decompress(compressed, -zlib.MAX_WBITS)
        return json.loads(decompressed.decode("utf-8-sig"))
    except Exception as exc:
        raise ValueError(f"Failed to decompress .z data: {exc}") from exc


def _fix_f1_json(raw: str) -> str:
    """Fix F1's non-standard JSON before parsing.

    F1 sometimes emits Python-style literals (True/False, single quotes).
    """
    return raw.replace("'", '"').replace("True", "true").replace("False", "false")


def parse_topic_data(topic: str, raw_data: Any) -> dict[str, Any]:
    """Parse raw topic data into a dict.

    Handles decompression for .z topics, JSON sanitisation for string
    topics, and pass-through for already-parsed dicts.

    Args:
        topic: Topic name (e.g. "TimingData", "CarData.z").
        raw_data: Raw value from the SignalR message.

    Returns:
        Parsed dict. Returns {} on unrecoverable error.
    """
    try:
        if topic in COMPRESSED_TOPICS:
            if not isinstance(raw_data, str):
                raise ValueError(f"Expected str for {topic}, got {type(raw_data)}")
            return decompress_z(raw_data)

        if isinstance(raw_data, str):
            return json.loads(_fix_f1_json(raw_data))

        if isinstance(raw_data, dict):
            return raw_data

        log.warning("Unexpected data type for topic %s: %s", topic, type(raw_data))
        return {}

    except Exception:
        log.exception("Error parsing topic %s", topic)
        return {}


def is_replace_topic(topic: str, data: dict[str, Any]) -> bool:
    """Return True if this topic's data should fully replace existing state.

    Uses the static REPLACE_TOPICS / COMPRESSED_TOPICS sets as the primary
    check. Falls back to the _kf (key frame) flag in the data for topics
    not in any set.

    Args:
        topic: Topic name.
        data: Parsed data dict.
    """
    if topic in REPLACE_TOPICS or topic in COMPRESSED_TOPICS:
        return True
    return bool(data.get("_kf", False))
