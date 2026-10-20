# Trip Planner

A progressive web app for planning trips within Indian cities and outstation travel.

## Files

| File | Description |
|------|-------------|
| `index.html` | Main HTML page |
| `style.css` | Styles (design tokens, layout, components) |
| `dataService.js` | Offline-first city/attraction data with OpenTripMap API |
| `app.js` | Main application logic (forms, itinerary, costs) |
| `sw.js` | Service worker for offline caching |
| `trip-planner.webmanifest` | PWA manifest for installability |

## Running locally

```bash
npx serve . -p 3000
```

Or simply open `index.html` in any modern browser (functionality available offline).

## Features

- Offline-first: Works without internet using curated city data
- Progressive Web App: Installable via browser prompt
- Trip planning: Origin, destination, dates, travelers, purpose
- Preferences: AC, WiFi, parking, budget/luxury tiers
- Transport modes: Train, bus, flight, cab with booking links
- Cost estimates with per-person breakdown
- Itinerary builder with day-by-day schedule