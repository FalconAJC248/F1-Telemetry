# F1 Frontend

React + TypeScript frontend for the F1 Telemetry app. See the [root README](../README.md) for full project setup.

## Commands

```bash
npm run dev      # Start dev server at http://localhost:5173
npm run build    # Production build
npm run preview  # Preview production build locally
npm run lint     # Run ESLint
```

## Structure

```
src/
├── components/
│   └── Layout.tsx          # Header, nav, red accent stripe
├── pages/
│   ├── Home.tsx            # Landing / hero
│   ├── YearSelect.tsx      # Season picker + race list
│   ├── EventDetails.tsx    # Session buttons + driver grid
│   ├── TelemetryView.tsx   # Chart, overlays, driver comparison
│   └── UploadTelemetry.tsx # Coming soon placeholder
└── utils/
    └── countryFlags.ts     # Country → flagcdn.com URL helper
```

## Routes

| Route | Component |
|---|---|
| `/` | `Home` |
| `/telemetry` | `YearSelect` |
| `/event/:year/:round` | `EventDetails` |
| `/event/:year/:round/:session/:driver` | `TelemetryView` |
| `/upload` | `UploadTelemetry` |
