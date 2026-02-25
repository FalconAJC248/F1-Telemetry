# F1 Telemetry

A Formula 1 telemetry visualisation app. Browse races by season, explore session results, and view fastest-lap telemetry for any driver — with corner markers, DRS zones, and side-by-side driver comparison.

## Stack

| Layer | Technology |
|---|---|
| Backend | Python · FastAPI · FastF1 |
| Frontend | React 19 · TypeScript · Vite |
| Styling | TailwindCSS · Titillium Web |
| Data fetching | TanStack React Query |
| Charts | Recharts |
| Routing | React Router v6 |

## Project Structure

```
F1-project/
├── F1-backend/
│   ├── main.py          # FastAPI app + all endpoints
│   └── .venv/           # Python virtual environment
└── F1-frontend/
    ├── src/
    │   ├── components/
    │   │   └── Layout.tsx
    │   ├── pages/
    │   │   ├── Home.tsx
    │   │   ├── YearSelect.tsx
    │   │   ├── EventDetails.tsx
    │   │   ├── TelemetryView.tsx
    │   │   └── UploadTelemetry.tsx
    │   └── utils/
    │       └── countryFlags.ts
    └── index.html
```

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 18+

### 1. Start the backend

```bash
cd F1-backend
python3 -m venv .venv                          # first time only
.venv/bin/pip install -r requirements.txt      # first time only
fuser -k 8000/tcp 2>/dev/null                  # clear any stale process on port 8000
.venv/bin/python3 -m uvicorn main:app --reload
```

> **Note:** Invoke Python directly via `.venv/bin/python3` rather than activating the venv — the shebang paths in this environment point to the wrong location.

Backend runs at **http://localhost:8000**

### 2. Start the frontend

```bash
cd F1-frontend
npm install      # first time only
npm run dev
```

Frontend runs at **http://localhost:5173**

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Health check |
| `GET` | `/races/{year}` | All races for a season |
| `GET` | `/event/{year}/{event_name}` | Event details (sessions, dates) |
| `GET` | `/session/{year}/{event_name}/{session_name}` | Drivers in a session |
| `GET` | `/telemetry/{year}/{event_name}/{session_name}/{driver}` | Fastest-lap telemetry (~500 points) |
| `GET` | `/corners/{year}/{event_name}/{session_name}` | Corner apex distances |

## Frontend Routes

| Route | Page |
|---|---|
| `/` | Home / landing |
| `/telemetry` | Season & race browser |
| `/event/:year/:round` | Event sessions & driver list |
| `/event/:year/:round/:session/:driver` | Telemetry chart |
| `/upload` | Upload telemetry (coming soon) |

## Features

- **Telemetry chart** — speed, throttle, brake, RPM, gear, DRS plotted over lap distance
- **Overlay mode** — compare up to 4 metrics simultaneously, normalised to 0–100%
- **Driver comparison** — overlay a second driver's telemetry as dashed lines; tooltip shows both drivers' values
- **Corner markers** — apex lines and shaded braking zones derived from circuit info
- **DRS zones** — highlighted regions where DRS was active (threshold: above session average)
- **Lap stats** — top speed, corner count, DRS zone count; delta vs compare driver
- **Country flags** — flag images on race cards and event headers via flagcdn.com
