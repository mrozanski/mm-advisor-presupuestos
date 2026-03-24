# MM Advisors — Presupuesto Web App

Responsive, mobile-first estimate page for a tourism agency in Bariloche, Argentina. Customers receive a link via WhatsApp and view a branded travel estimate in their phone's browser.

## How it works

Static HTML/CSS/JS hosted on GitHub Pages. The page reads two URL parameters (`id` and `gid`), fetches data from Google Sheets API v4, and renders the estimate client-side.

```
https://<your-gh-pages-domain>/?id=SPREADSHEET_ID&gid=SHEET_GID
```

No backend. No build step. No dependencies.

## Files

```
index.html   — Layout, default values, <template> elements for JS cloning
styles.css   — All styling (Raleway font, responsive, print-ready)
app.js       — URL param validation, Sheets API fetch, DOM population
test-data/   — Optional JSON fixture for local testing (see below)
```

## Architecture

1. **Optional:** If local fixture mode applies (see [Local development](#local-development)), `app.js` loads `test-data/response.json` and skips all Google API calls.
2. Otherwise, `app.js` reads `id` and `gid` from the URL
3. Fetches sheet metadata to resolve `gid` → tab name
4. Fetches cell data from that tab via Sheets API v4 (API key, no auth)
5. Parses activities, detects currency from cell values, computes totals
6. Clones `<template>` elements and populates the DOM

If JS fails or params are missing, the page stays in its default state (styled layout with placeholder values) and shows an error banner. CSS and layout can be edited independently without fetching data.

## Setup

1. Get a Google Sheets API key from [Google Cloud Console](https://console.cloud.google.com/) (APIs & Services → Credentials)
2. Update `API_KEY` in `app.js`
3. Push to GitHub Pages (or any static host)
4. Share links in the format `?id=SPREADSHEET_ID&gid=SHEET_GID`

## Currency

Detected automatically from cell values (R$, U$S, $). No manual config needed.

## Local development

### Default behavior

Open `index.html` in a browser. With no URL params it shows the default layout. Use `?id=SPREADSHEET_ID&gid=SHEET_GID` to hit the live Sheets API (your API key must allow requests from your origin; browser CORS may block calls when opening files from disk or from origins not allowed in Google Cloud).

### Local test mode (fixture, no Google API)

To preview the full UI without calling Google (for example when CORS blocks the API from your dev origin):

1. Keep or add a file at **`test-data/response.json`** with the same shape as a Sheets API `values.get` response (`range`, `majorDimension`, `values`).
2. Serve the project over **HTTP** from the repo root (required so the browser can `fetch` the JSON; opening `index.html` as `file://` usually prevents this). For example: `python3 -m http.server 8080` or `npx serve .`
3. Open **`http://localhost:8080/`** (adjust the port) and load `index.html`.

If the fixture loads successfully, the console logs **`Local test mode`** and the app uses that JSON for the tab title (from `range`) and sheet rows. No `id` or `gid` is required in this mode.

**When the fixture is attempted:** only on **`localhost`**, **`127.0.0.1`**, **`[::1]`**, or when the URL includes **`?local=1`** (so production hosts do not silently use a deployed fixture unless you opt in).

To test against the real API again, remove or rename the fixture, or use a host where local fixture loading is disabled and pass **`?id=…&gid=…`** as usual.
