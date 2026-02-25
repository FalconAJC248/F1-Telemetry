from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import math

### functions

import fastf1

def get_races(year: int):
    schedule = fastf1.get_event_schedule(year)

    return schedule.to_dict(orient='records')

def _event_id(event_name: str) -> int | str:
    """Convert a numeric round string to int so FastF1 looks up by round number.
    Round 0 is reserved for testing events which FastF1 requires by name — leave as string."""
    if event_name.isdigit():
        n = int(event_name)
        return n if n > 0 else event_name
    return event_name


def get_event(year: int, event_name: str):
    event = fastf1.get_event(year, _event_id(event_name))
    return event.to_dict()


def get_session_drivers(year: int, event_name: str, session_name: str) -> list[dict]:
    """Load session and return a list of participating drivers."""
    session = fastf1.get_session(year, _event_id(event_name), session_name)
    session.load(laps=False, telemetry=False, weather=False, messages=False)

    def clean(val: any, default: str = "") -> str:
        s = str(val)
        return default if s == "nan" else s

    result = []
    for driver_num in session.drivers:
        info = session.get_driver(driver_num)
        team_color = clean(info.get("TeamColor"), "ffffff")
        result.append({
            "number": clean(info.get("DriverNumber"), driver_num),
            "abbreviation": clean(info.get("Abbreviation")),
            "full_name": clean(info.get("FullName")),
            "team": clean(info.get("TeamName")),
            "team_color": f"#{team_color}",
        })

    return result


def get_driver_telemetry(year: int, event_name: str, session_name: str, driver: str) -> list[dict]:
    """Return fastest-lap telemetry for a driver, downsampled to ~500 points."""
    session = fastf1.get_session(year, _event_id(event_name), session_name)
    session.load(laps=True, telemetry=True, weather=False, messages=False)

    driver_laps = session.laps[session.laps["Driver"] == driver]
    fastest = driver_laps.pick_fastest()
    tel = fastest.get_telemetry()

    step = max(1, len(tel) // 500)
    tel = tel.iloc[::step]

    def safe_float(val: any, default: float = 0.0) -> float:
        try:
            f = float(val)
            return default if (math.isnan(f) or math.isinf(f)) else round(f, 1)
        except Exception:
            return default

    def safe_int(val: any, default: int = 0) -> int:
        try:
            f = float(val)
            return default if math.isnan(f) else int(f)
        except Exception:
            return default

    result = []
    for _, row in tel.iterrows():
        result.append({
            "distance": safe_float(row["Distance"]),
            "speed":    safe_float(row["Speed"]),
            "throttle": safe_float(row["Throttle"]),
            "brake":    safe_int(row["Brake"]),
            "rpm":      safe_int(row["RPM"]),
            "gear":     safe_int(row["nGear"]),
            "drs":      safe_int(row["DRS"]),
        })

    return result


def get_corners(year: int, event_name: str, session_name: str) -> list[dict]:
    """Return corner apex distances for the circuit from circuit_info."""
    session = fastf1.get_session(year, _event_id(event_name), session_name)
    session.load(laps=True, telemetry=True, weather=False, messages=False)

    circuit_info = session.get_circuit_info()
    if circuit_info is None:
        return []

    result = []
    for _, row in circuit_info.corners.iterrows():
        try:
            distance = float(row["Distance"])
            if math.isnan(distance) or math.isinf(distance):
                continue
            letter = str(row.get("Letter", ""))
            if letter in ("nan", "None", ""):
                letter = ""
            result.append({
                "number": int(row["Number"]),
                "letter": letter,
                "distance": round(distance, 1),
            })
        except (ValueError, TypeError):
            continue

    return result


### create fastapi app
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Hello World"}

@app.get("/races/{year}")
def races(year: int):
    return get_races(year)

@app.get("/event/{year}/{event_name}")
def event(year: int, event_name: str):
    return get_event(year, event_name)

@app.get("/session/{year}/{event_name}/{session_name}")
def session_drivers(year: int, event_name: str, session_name: str):
    """Return the list of drivers for a given session."""
    return get_session_drivers(year, event_name, session_name)

@app.get("/telemetry/{year}/{event_name}/{session_name}/{driver}")
def telemetry(year: int, event_name: str, session_name: str, driver: str):
    """Return fastest-lap telemetry for a driver in a session."""
    return get_driver_telemetry(year, event_name, session_name, driver)

@app.get("/corners/{year}/{event_name}/{session_name}")
def corners(year: int, event_name: str, session_name: str):
    """Return corner apex positions for the circuit."""
    return get_corners(year, event_name, session_name)