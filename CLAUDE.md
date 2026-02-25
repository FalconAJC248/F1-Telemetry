# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

F1 Telemetry Visualization application - a monorepo with a Python FastAPI backend and React TypeScript frontend for viewing Formula 1 race data.

## Development Commands

### Backend (F1-backend/)
```bash
source .venv/bin/activate           # Activate virtual environment
python main.py                      # Start server
uvicorn main:app --reload           # Start with auto-reload (development)
```
Server runs at http://localhost:8000

### Frontend (F1-frontend/)
```bash
npm install                         # Install dependencies
npm run dev                         # Start dev server (port 5173)
npm run build                       # Build for production
npm run lint                        # Run ESLint
```

### Running the Full Stack
Start backend first, then frontend. The frontend proxies `/api` requests to the backend at port 8000.

## Architecture

**Backend**: FastAPI application using FastF1 library for F1 data. Main application logic is in `main.py`. CORS configured for localhost:5173.

**Frontend**: React 19 + TypeScript with Vite. Uses TanStack React Query for data fetching with client-side caching. Styled with TailwindCSS (dark theme, F1 red accent).

**API Endpoints**:
- `GET /` - Health check
- `GET /races/{year}` - List races for a year
- `GET /event/{year}/{event_name}` - Event details

**Frontend Routes**:
- `/` - Landing page
- `/telemetry` - Year/race selection
- `/event/:year/:round` - Event session details

## Code Quality Standards

- Type hints required for all Python code
- Public APIs must have docstrings
- Functions must be focused and small
- Line length: 120 chars maximum
- New features require tests
- Bug fixes require regression tests
- Check for similar features before implementing new ones
