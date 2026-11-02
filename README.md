# Inventory Dashboard UI

A mock frontend for the [KL_Test](../KL_Test) inventory API, built with React, TypeScript and Vite. It lives in its own project and needs no backend changes.

The sign-in screen offers two ways in:

- **Mock data:** an in-browser copy of the API with about 500 sample vehicles. No backend is needed, and changes reset when you reload.
- **Live backend:** paste a real token and use the API through Vite's proxy.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

For live mode, start the backend and mint a token. The role can be `viewer`, `manager` or `ingest`:

```bash
cd ../KL_Test
docker compose up -d
docker compose exec -T api /api token -role manager
```

The API sends no CORS headers, so the browser calls Vite and Vite forwards `/v1` and `/readyz`. To use a backend somewhere other than `http://localhost:8080`, set `API_TARGET`:

```bash
API_TARGET=http://localhost:9000 npm run dev
```

## Data refresh

The dashboard, vehicle tables, open vehicle panel and settings refetch every 30 seconds in the background, so data from the ingest feed appears without a reload.

- **Your place is kept:** a refresh does not change your page or filters, or clear anything you are typing.
- **Hidden tabs:** polling pauses while the browser tab is hidden. It refetches on return if a refresh is due.
- **Failures:** the current data stays on screen with a "Could not refresh" message, and the next refresh tries again.
- **Interval:** set `POLL_INTERVAL_MS` in `src/lib/poller.ts`. The "Refreshes every 30 seconds" text is in `src/components/States.tsx`.

## What each role sees

| Screen | Viewer | Manager | Ingest |
|---|:-:|:-:|:-:|
| Dashboard, inventory, aging stock, action history | Read | Read | |
| Log an action | | Yes | |
| Aging threshold | Read | Change | |
| Upload a vehicle batch | | | Yes |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with the API proxy |
| `npm test` | Tests that the mock follows the API's rules |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Type check and production build into `dist/` |
| `npm run preview` | Serve the production build, also with the proxy |

## Project layout

```
src/api/        types.ts (mirrors the OpenAPI spec), http.ts (real API), mock.ts (in-browser API)
src/lib/        session, routing, formatting, polling
src/components/ bar chart, vehicle panel, shared states
src/pages/      sign-in, dashboard, vehicle tables, settings, ingest
```

Screens only use the `Api` interface in `types.ts`, so they behave the same in both modes. If the backend's API changes, update `types.ts`, `http.ts` and `mock.ts` together.
