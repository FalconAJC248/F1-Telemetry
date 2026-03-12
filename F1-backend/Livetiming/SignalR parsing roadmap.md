# SignalR Parsing Roadmap

## Goal
Build a custom F1 live timing ingestor that connects to F1's SignalR feed,
processes messages in real time, and broadcasts data to the frontend via WebSocket.
This replaces the need for OpenF1's paid tier.

---

## Source Reference
FastF1's SignalR client is open source and the primary reference:
- Client: `fastf1/livetiming/client.py`
- Auth: `fastf1/internals/f1auth.py`
- Repo: https://github.com/theOehrly/Fast-F1

---

## Connection Details

| Property | Value |
|---|---|
| WebSocket URL | `wss://livetiming.formula1.com/signalrcore` |
| Negotiate URL | `https://livetiming.formula1.com/signalrcore/negotiate` |
| Library | `signalrcore` (pip) — works on modern Python |
| Pre-auth step | OPTIONS request to negotiate URL to get `AWSALBCORS` cookie |
| Hub event name | `feed` |
| Subscribe method | `Subscribe` with list of topic names |

---

## Topics

```python
topics = [
    "Heartbeat",
    "AudioStreams",
    "DriverList",
    "ExtrapolatedClock",
    "RaceControlMessages",
    "SessionInfo",
    "SessionStatus",
    "TeamRadio",
    "TimingAppData",
    "TimingStats",
    "TrackStatus",
    "WeatherData",
    "Position.z",       # zlib compressed — raw car position (x, y, z)
    "CarData.z",        # zlib compressed — raw telemetry (speed, throttle, brake, RPM, gear, DRS)
    "ContentStreams",
    "SessionData",
    "TimingData",
    "TopThree",
    "RcmSeries",
    "LapCount"
]
```

The `.z` suffix indicates **zlib-compressed** data. These two topics carry the
highest-frequency data (~3.7 Hz) and require decompression before parsing.
**Both are auth-gated** — absent from snapshot without F1TV token, present with it.
**Confirmed live** against 2026 Australian GP FP2.

---

## `.z` Decompression

The compressed topics use **base64 + raw deflate** (zlib with no header):

```python
import zlib, base64, json

def parse_compressed(text: str) -> dict:
    if text.startswith('"'):
        text = text.strip('"')
    raw = zlib.decompress(base64.b64decode(text), -zlib.MAX_WBITS)
    return json.loads(raw.decode('utf-8-sig'))
```

The `-zlib.MAX_WBITS` flag is critical — it tells zlib to expect raw deflate
with no header, which is what F1 sends.

---

## CarData.z Schema

Sample rate: ~240ms. Channel keys are numeric strings, not names.

```json
{
  "Entries": [
    {
      "Utc": "2020-08-08T09:45:03.0619797Z",
      "Cars": {
        "16": {
          "Channels": {
            "0": 12345,
            "2": 250,
            "3": 7,
            "4": 95,
            "5": 0,
            "45": 10
          }
        }
      }
    }
  ]
}
```

| Channel key | Field | Type | Notes |
|---|---|---|---|
| `"0"` | RPM | int | |
| `"2"` | Speed | int | km/h |
| `"3"` | nGear | int | gear number |
| `"4"` | Throttle | int | 0–100% |
| `"5"` | Brake | bool | 0 or 1 |
| `"45"` | DRS | int | 0–14; **removed from feed in 2026** |

---

## Position.z Schema

Sample rate: ~220ms. Coordinates in 1/10 metre since 2020.

```json
{
  "Position": [
    {
      "Timestamp": "2020-08-08T09:45:03.0619797Z",
      "Entries": {
        "16": {
          "Status": "OnTrack",
          "X": 12345,
          "Y": 56789,
          "Z": 0
        }
      }
    }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `Status` | str | `"OnTrack"` or `"OffTrack"` |
| `X`, `Y` | int | 1/10 metre (divide by 10 for metres) |
| `Z` | int | altitude, usually 0 |

**Note:** Older API responses used numeric status codes (0 = OnTrack, non-zero = OffTrack)
instead of strings. Worth handling both.

---

## Authentication

F1TV subscription required (since 2025 Dutch GP some data is gated).

**FastF1's auth flow:**
1. Spin up a temporary local HTTP server on a random port
2. Print URL: `https://f1login.fastf1.dev?port={port}` (FastF1's own redirect service)
3. User logs into F1TV in browser
4. Redirect page POSTs the F1TV `loginSession` cookie back to local server
5. Extract `subscriptionToken` (a JWT) from the cookie payload
6. Verify JWT against F1's JWKS endpoint: `https://api.formula1.com/static/jwks.json`
7. Save token to disk, pass as `access_token` to SignalR connection

**Alternative**: Extract the JWT manually from browser devtools after logging into
the F1 live timing site, avoiding the need to replicate FastF1's redirect service.

**Confirmed working** — tested live against 2026 Australian GP FP2.
Token is cached to disk by FastF1's auth module after first login.
Re-use with `lambda: token` after calling `get_auth_token()` once upfront.

---

## Message Format

Two message types arrive on the `feed` event:

- `CompletionMessage` — response to the initial `Subscribe` call, contains a
  snapshot of current state for each topic
- `list` — ongoing streaming updates

Raw data has F1-specific quirks requiring cleanup before JSON parsing:
```python
data = data.replace("'", '"')
    .replace('True', 'true')
    .replace('False', 'false')
```

---

## Known Issues in FastF1's Implementation

- **No reconnection logic** — there is a `# TODO: enable auto reconnect?` comment
  where this should be. This is the root cause of the 2-hour disconnect problem.
- **Python 3.8/3.9 only** — FastF1's own restriction, not a `signalrcore` limitation.
  We can use modern Python.
- **File-only output** — `_on_message` just writes to disk. We replace this with
  real-time processing and WebSocket broadcasting.

---

## Plain-Text Topic Schemas

Non-`.z` topics arrive as `[timestamp, data_dict]` pairs. No decompression needed.

---

### TrackStatus

Status is a **numeric string**, not a word.

| Value | Meaning |
|---|---|
| `"1"` | All clear |
| `"2"` | Yellow flag |
| `"4"` | Safety car deployed |
| `"5"` | Red flag |
| `"6"` | VSC deployed |
| `"7"` | VSC ending |

```json
{ "Status": "4", "Message": "SAFETY CAR DEPLOYED" }
```

---

### SessionStatus

```json
{ "Status": "Started" }
```

Known values: `"Started"`, `"Finished"`, `"Aborted"`, `"Inactive"`.
This is what you use to know when to start/stop recording.

---

### LapCount

```json
{ "TotalLaps": 57, "CurrentLap": 23 }
```

---

### WeatherData

Updated every ~60 seconds. Note `Rainfall` is a string `"1"`/`"0"`, not a boolean.

```json
{
  "AirTemp": "28.4",
  "Humidity": "47.0",
  "Pressure": "988.4",
  "Rainfall": "0",
  "TrackTemp": "42.1",
  "WindDirection": "214",
  "WindSpeed": "1.8"
}
```

---

### RaceControlMessages

Messages arrive as a list (or dict of values). Each entry:

```json
{
  "Utc": "2024-03-02T14:23:01.000Z",
  "Category": "Flag",
  "Message": "YELLOW FLAG IN SECTOR 2",
  "Status": "",
  "Flag": "YELLOW",
  "Scope": "Sector",
  "Sector": 2,
  "RacingNumber": null,
  "Lap": null
}
```

`Category` values include: `"Flag"`, `"SafetyCar"`, `"Drs"`, `"Other"`.
`Flag` values include: `"GREEN"`, `"YELLOW"`, `"RED"`, `"CHEQUERED"`, `"CLEAR"`.

---

### DriverList

Delta-patched — updates only send changed fields, not the full driver object.
Need to merge patches into a local state dict keyed by racing number.

```json
{
  "16": {
    "RacingNumber": "16",
    "BroadcastName": "C LECLERC",
    "FullName": "Charles LECLERC",
    "Tla": "LEC",
    "Line": 1,
    "TeamName": "Ferrari",
    "TeamColour": "E8002D",
    "FirstName": "Charles",
    "LastName": "Leclerc",
    "HeadshotUrl": "...",
    "CountryCode": "MON"
  }
}
```

---

### TimingAppData (tyre/stint info)

Per-driver stint data, also delta-patched.

```json
{
  "Lines": {
    "16": {
      "Stints": [
        {
          "LapNumber": 1,
          "Compound": "SOFT",
          "New": "true",
          "TotalLaps": 0,
          "StartLaps": 0
        }
      ]
    }
  }
}
```

`Compound` values: `"SOFT"`, `"MEDIUM"`, `"HARD"`, `"INTERMEDIATE"`, `"WET"`.

---

### TimingData

The most complex topic and the core of any live timing display. Delta-patched.

**Message envelope:**
```json
{
  "Lines": {
    "16": { ...driver fields... },
    "44": { ...driver fields... }
  }
}
```

**Driver fields** (only changed fields are sent per message):
```json
{
  "NumberOfLaps": 23,
  "NumberOfPitStops": 1,
  "InPit": false,
  "PitOutTime": "00:32:14:412",
  "PitInTime":  "00:45:01:100",
  "LastLapTime": { "Value": "1:21.456", "PersonalFastest": true },
  "BestLapTime": { "Value": "1:21.456" },
  "IsPersonalBest": true,
  "Sectors": {
    "0": { "Value": "28.123" },
    "1": { "Value": "31.456" },
    "2": { "Value": "21.877" }
  },
  "Speeds": {
    "I1": { "Value": "312" },
    "I2": { "Value": "287" },
    "FL": { "Value": "298" },
    "ST": { "Value": "320" }
  },
  "Position": 3,
  "GapToLeader": "+4.231",
  "IntervalToPositionAhead": { "Value": "+1.102" }
}
```

**Field reference:**

| Field | Notes |
|---|---|
| `NumberOfLaps` | Current lap number — lap boundary signal |
| `NumberOfPitStops` | Total pit stops taken |
| `InPit` | Currently in pit lane |
| `PitInTime` / `PitOutTime` | Session timestamps |
| `LastLapTime.Value` | `"m:ss.mmm"` string |
| `IsPersonalBest` | Whether last lap was driver's personal best |
| `Sectors["0/1/2"].Value` | Sector times as `"ss.mmm"` strings |
| `Speeds["I1/I2/FL/ST"].Value` | Speed trap values in km/h as strings |
| `Position` | Current race position |
| `GapToLeader` | String like `"+4.231"` or `"1L"` (lapped) |
| `IntervalToPositionAhead.Value` | Gap to car ahead |

**FastF1 splits this into two streams:**
- **laps_data** — one row per completed lap per driver (lap time, sectors, speed traps, pit info)
- **stream_data** — continuous position/gap updates (Position, GapToLeader, IntervalToPositionAhead)

For a live ingestor you'll want both: stream_data for the live timing tower, laps_data for post-lap summaries.

---

### Topics Not Actively Parsed by FastF1

These are subscribed to but FastF1 doesn't expose dedicated parsers:

| Topic | Notes |
|---|---|
| `Heartbeat` | Keep-alive pulse, no data content |
| `AudioStreams` | URLs for broadcast audio |
| `TeamRadio` | URLs for team radio clips |
| `ContentStreams` | Media content links |
| `TopThree` | Top 3 driver summary |
| `TimingStats` | Best times/speed trap records |
| `ExtrapolatedClock` | Session remaining time |
| `RcmSeries` | Race control message series |

---

## TODO

- [x] Understand `.z` decompression
- [x] Map CarData.z and Position.z schemas
- [x] Map plain-text topic schemas
- [x] Deep-dive TimingData — the main live timing feed
- [ ] Design the ingestor architecture (async, reconnection logic)
- [ ] Decide on auth approach (replicate FastF1 flow vs. manual JWT extraction)
- [ ] Design WebSocket broadcast layer to frontend
