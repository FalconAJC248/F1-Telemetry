"""
F1 live timing ingestor.

Connects to the F1 SignalR feed, parses all messages, maintains state,
and notifies subscribers on each update.

Usage:
    ingestor = F1Ingestor(use_auth=True)
    ingestor.subscribe(lambda topic, data: print(topic, data))
    ingestor.start()  # blocks until stop() or KeyboardInterrupt
"""

import logging
import time
import threading
from typing import Any

import requests
from signalrcore.hub_connection_builder import HubConnectionBuilder
from signalrcore.messages.completion_message import CompletionMessage

from .parsing import is_replace_topic, parse_topic_data
from .state import StateStore, StateCallback

log = logging.getLogger(__name__)

CONNECTION_URL = "wss://livetiming.formula1.com/signalrcore"
NEGOTIATE_URL  = "https://livetiming.formula1.com/signalrcore/negotiate"

TOPICS: list[str] = [
    "Heartbeat", "AudioStreams", "DriverList",
    "ExtrapolatedClock", "RaceControlMessages",
    "SessionInfo", "SessionStatus", "TeamRadio",
    "TimingAppData", "TimingStats", "TrackStatus",
    "WeatherData", "Position.z", "CarData.z",
    "ContentStreams", "SessionData", "TimingData",
    "TopThree", "RcmSeries", "LapCount",
]


class F1Ingestor:
    """Connects to the F1 live timing SignalR feed and maintains state.

    Designed to run in its own thread. Reads from state are safe from
    any thread (including the FastAPI async event loop) via StateStore.

    Args:
        use_auth: Acquire an F1TV token before connecting.
                  Required for CarData.z and Position.z.
        reconnect_interval: Seconds between reconnection attempts.
        max_reconnect_attempts: None for infinite retries.
    """

    def __init__(
        self,
        use_auth: bool = False,
        reconnect_interval: int = 5,
        max_reconnect_attempts: int | None = None,
    ) -> None:
        self.use_auth = use_auth
        self.reconnect_interval = reconnect_interval
        self.max_reconnect_attempts = max_reconnect_attempts

        self.state = StateStore()

        self._connection = None
        self._is_connected = False
        self._connected_event = threading.Event()
        self._stop_event = threading.Event()
        self._headers: dict[str, str] = {}

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def subscribe(self, callback: StateCallback) -> None:
        """Register a callback to receive (topic, data) on each update."""
        self.state.subscribe(callback)

    def start(self) -> None:
        """Connect and block until stop() is called or KeyboardInterrupt."""
        log.info("F1Ingestor starting")

        self._pre_negotiate()

        token: str | None = None
        if self.use_auth:
            token = self._acquire_token()

        self._build_connection(token)
        self._connection.start()

        if not self._connected_event.wait(timeout=15):
            log.error("Timed out waiting for connection to open")
            return

        self._subscribe()

        log.info("Ingestor running — Ctrl+C or stop() to exit")
        try:
            while not self._stop_event.is_set():
                time.sleep(1)
        except KeyboardInterrupt:
            log.info("KeyboardInterrupt — stopping")
        finally:
            self.stop()

    def stop(self) -> None:
        """Gracefully shut down the connection."""
        self._stop_event.set()
        if self._connection is not None:
            try:
                self._connection.stop()
            except Exception:
                log.exception("Error stopping connection")
        log.info("F1Ingestor stopped")

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    def _pre_negotiate(self) -> None:
        """Fetch the AWSALBCORS load-balancer cookie via OPTIONS request.

        Must be sent with the WebSocket upgrade or AWS may route to a
        different backend node, breaking the SignalR session.
        """
        log.info("Pre-negotiating for AWSALBCORS cookie...")
        try:
            resp = requests.options(NEGOTIATE_URL, timeout=10)
            if "AWSALBCORS" in resp.cookies:
                self._headers["Cookie"] = f"AWSALBCORS={resp.cookies['AWSALBCORS']}"
                log.info("AWSALBCORS cookie acquired")
            else:
                log.warning("No AWSALBCORS cookie — proceeding without it")
        except requests.RequestException:
            log.exception("Pre-negotiation failed — proceeding without cookie")

    def _acquire_token(self) -> str | None:
        """Acquire an F1TV subscription token via FastF1's auth module."""
        log.info("Acquiring F1TV auth token...")
        try:
            from fastf1.internals.f1auth import get_auth_token
            token = get_auth_token()
            if token:
                log.info("Auth token acquired")
                return token
            log.error("Auth returned no token")
            return None
        except Exception:
            log.exception("Auth failed")
            return None

    def _build_connection(self, token: str | None) -> None:
        """Build the SignalR HubConnection with reconnection configured."""
        options: dict[str, Any] = {
            "verify_ssl": True,
            "headers": self._headers,
        }
        if token is not None:
            options["access_token_factory"] = lambda: token

        self._connection = (
            HubConnectionBuilder()
            .with_url(CONNECTION_URL, options=options)
            .with_automatic_reconnect({
                "type": "raw",
                "keep_alive_interval": 10,
                "reconnect_interval": self.reconnect_interval,
                "max_attempts": self.max_reconnect_attempts,
            })
            .configure_logging(logging.WARNING)
            .build()
        )

        self._connection.on_open(self._on_open)
        self._connection.on_close(self._on_close)
        self._connection.on_error(self._on_error)
        self._connection.on_reconnect(self._on_reconnect)
        self._connection.on("feed", self._handle_stream_message)

    def _subscribe(self) -> None:
        """Send Subscribe to the hub for all topics."""
        log.info("Subscribing to %d topics...", len(TOPICS))
        self._connection.send(
            "Subscribe",
            [TOPICS],
            on_invocation=self._handle_completion_message,
        )

    # ------------------------------------------------------------------
    # SignalR event callbacks
    # ------------------------------------------------------------------

    def _on_open(self) -> None:
        self._is_connected = True
        self._connected_event.set()
        log.info("Connection opened")

    def _on_close(self) -> None:
        self._is_connected = False
        log.info("Connection closed")

    def _on_error(self, error: Any) -> None:
        log.error("SignalR error: %s", error)

    def _on_reconnect(self) -> None:
        """Re-subscribe after transport reconnects.

        signalrcore re-establishes the WebSocket but does NOT re-send our
        Subscribe call. We must do that ourselves. A brief sleep lets the
        connection state settle before sending.
        """
        log.info("Reconnected — re-subscribing")
        self._connected_event.set()
        time.sleep(1)
        self._subscribe()

    # ------------------------------------------------------------------
    # Message handling
    # ------------------------------------------------------------------

    def _handle_completion_message(self, msg: Any) -> None:
        """Process the initial snapshot from the Subscribe response."""
        if not isinstance(msg, CompletionMessage):
            log.warning("Expected CompletionMessage, got %s", type(msg))
            return

        if msg.error:
            log.error("Subscribe error: %s", msg.error)
            return

        if not msg.result:
            log.warning("Empty snapshot")
            return

        log.info("Snapshot received (%d topics)", len(msg.result))
        for topic, raw_data in msg.result.items():
            self._process(topic, raw_data, force_replace=True)

    def _handle_stream_message(self, msg: Any) -> None:
        """Process an ongoing stream delta from the 'feed' event."""
        if not isinstance(msg, list) or len(msg) < 2:
            return

        topic, raw_data = msg[0], msg[1]

        if not isinstance(topic, str):
            return

        self._process(topic, raw_data, force_replace=False)

    def _process(self, topic: str, raw_data: Any, force_replace: bool) -> None:
        """Parse raw data and apply it to the state store."""
        data = parse_topic_data(topic, raw_data)

        if not data:
            return

        if force_replace or is_replace_topic(topic, data):
            self.state.replace(topic, data)
        else:
            self.state.merge(topic, data)
