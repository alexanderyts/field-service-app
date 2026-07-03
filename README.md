# Field Service

A private, local-first app for organizing personal field ministry: contacts, territory map,
literature catalog, time/credit tracking, scheduling, and monthly reports. All data is stored
on-device in the browser (IndexedDB) — nothing is sent to a server.

## Tabs

- **Contacts** — add/sort householders (name, street, city, zip, date met); log calls with
  scriptures, literature, topics, and follow-up dates; get directions.
- **Calendar** — a one-time availability survey builds a scheduled weekly schedule; log ministry
  and credit time; weekly + yearly goal progress.
- **Map** — Leaflet/OpenStreetMap territory map with current location and contact pins.
- **Literature** — catalog of offerings; auto-fills when logging what was shared.
- **Schedule** — appointments and upcoming follow-ups.
- **Reports** — one-tap monthly overview (hours, credit hours, literature placed, goal
  progress) with the 55-hour credit cap applied, plus email export.

## Tech

React + TypeScript + Vite, Dexie (IndexedDB), Leaflet, installable PWA.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build to dist/
npm run lint
```

> Geolocation requires a secure context: it works on `localhost` and over HTTPS, but **not**
> over a plain-HTTP LAN address (e.g. `http://192.168.x.x`).
