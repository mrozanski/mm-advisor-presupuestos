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
```

## Architecture

1. `app.js` reads `id` and `gid` from the URL
2. Fetches sheet metadata to resolve `gid` → tab name
3. Fetches cell data from that tab via Sheets API v4 (API key, no auth)
4. Parses activities, detects currency from cell values, computes totals
5. Clones `<template>` elements and populates the DOM

If JS fails or params are missing, the page stays in its default state (styled layout with placeholder values) and shows an error banner. CSS and layout can be edited independently without fetching data.

## Setup

1. Get a Google Sheets API key from [Google Cloud Console](https://console.cloud.google.com/) (APIs & Services → Credentials)
2. Update `API_KEY` in `app.js`
3. Push to GitHub Pages (or any static host)
4. Share links in the format `?id=SPREADSHEET_ID&gid=SHEET_GID`

## Currency

Detected automatically from cell values (R$, U$S, $). No manual config needed.

## Local development

Just open `index.html` in a browser. With no URL params it shows the default layout. Add params to test with real data.
