"""
Test script to connect to the F1 live timing SignalR feed
and print raw messages to understand the data format.

Run with the backend venv:
  /path/to/.venv/bin/python test_connection.py

By default tries unauthenticated. Pass --auth to use your F1TV account.
"""

import argparse
import json
import logging
import time

import requests
from signalrcore.hub_connection_builder import HubConnectionBuilder
from signalrcore.messages.completion_message import CompletionMessage

CONNECTION_URL = 'wss://livetiming.formula1.com/signalrcore'
NEGOTIATE_URL  = 'https://livetiming.formula1.com/signalrcore/negotiate'

TOPICS = [
    "Heartbeat", "AudioStreams", "DriverList",
    "ExtrapolatedClock", "RaceControlMessages",
    "SessionInfo", "SessionStatus", "TeamRadio",
    "TimingAppData", "TimingStats", "TrackStatus",
    "WeatherData", "Position.z", "CarData.z",
    "ContentStreams", "SessionData", "TimingData",
    "TopThree", "RcmSeries", "LapCount"
]

logging.basicConfig(format="%(asctime)s %(levelname)s: %(message)s", level=logging.INFO)
log = logging.getLogger("f1-test")

message_count = 0


def on_message(msg):
    global message_count
    message_count += 1

    if isinstance(msg, CompletionMessage):
        # Initial snapshot returned from the Subscribe call
        print(f"\n--- COMPLETION MESSAGE (snapshot) ---")
        if msg.result:
            for topic, data in msg.result.items():
                print(f"  Topic: {topic}")
                preview = json.dumps(data)[:200]
                print(f"  Data:  {preview}{'...' if len(json.dumps(data)) > 200 else ''}")
        return

    if isinstance(msg, list):
        # Ongoing streaming update: [topic_name, data]
        if len(msg) >= 2:
            topic = msg[0]
            data  = msg[1]
            print(f"\n[#{message_count}] STREAM: {topic}")
            preview = json.dumps(data)[:300]
            print(f"  {preview}{'...' if len(json.dumps(data)) > 300 else ''}")
        return

    print(f"\n[#{message_count}] UNKNOWN TYPE: {type(msg)}: {str(msg)[:200]}")


def on_open():
    log.info("Connection opened")


def on_close():
    log.info("Connection closed")


def on_error(err):
    log.error(f"Error: {err}")


def connect(use_auth: bool):
    headers = {}

    # Pre-negotiate for AWSALBCORS load-balancer cookie
    log.info("Pre-negotiating for AWSALBCORS cookie...")
    r = requests.options(NEGOTIATE_URL, headers=headers)
    if 'AWSALBCORS' in r.cookies:
        headers['Cookie'] = f"AWSALBCORS={r.cookies['AWSALBCORS']}"
        log.info("Got AWSALBCORS cookie")
    else:
        log.warning("No AWSALBCORS cookie returned — proceeding anyway")

    access_token_factory = None
    if use_auth:
        log.info("Authenticating with F1TV...")
        from fastf1.internals.f1auth import get_auth_token
        token = get_auth_token()
        if not token:
            log.error("Authentication failed — exiting.")
            return
        log.info("Auth token acquired.")
        access_token_factory = lambda: token

    options = {
        "verify_ssl": True,
        "headers": headers,
    }
    if access_token_factory:
        options["access_token_factory"] = access_token_factory

    connection = (
        HubConnectionBuilder()
        .with_url(CONNECTION_URL, options=options)
        .with_automatic_reconnect({
            "type": "raw",
            "keep_alive_interval": 10,
            "reconnect_interval": 5,
            "max_attempts": 999,
        })
        .configure_logging(logging.WARNING)
        .build()
    )

    connection.on_open(on_open)
    connection.on_close(on_close)
    connection.on_error(on_error)
    connection.on('feed', on_message)

    log.info("Connecting...")
    connection.start()

    # Wait for connection
    time.sleep(2)

    log.info(f"Subscribing to {len(TOPICS)} topics...")
    connection.send("Subscribe", [TOPICS], on_invocation=on_message)

    log.info("Listening for messages (Ctrl+C to stop)...")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        log.info(f"Stopping. Received {message_count} messages total.")
        connection.stop()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--auth", action="store_true",
                        help="Authenticate with F1TV (required for full data)")
    args = parser.parse_args()

    connect(use_auth=args.auth)
