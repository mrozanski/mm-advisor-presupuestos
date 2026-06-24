# Sheet v4 — HORARIOS column

## Overview

v4 adds an optional **HORARIOS** column to the activity table. Values are shown on the rendered presupuesto page next to the date (first activity in a day card) or above the activity name (additional activities on the same day).

The app does **not** format horario values — the sheet author controls the text (e.g. `09:30` or `11:00 - 14:30`).

## Sheet template changes

Update the Google Sheet template manually (not stored in this repo):

1. Set **K1** to `v4.0.0` (semver identifies the template version).
2. Insert **HORARIOS** as column **C** in the activity table (after FECHA).
3. Shift all columns from EXCURSIÓN onward one position to the right.

### Activity table columns (v4)

| Col | Header | Notes |
|-----|--------|-------|
| A | DIA | Unchanged |
| B | FECHA | Unchanged |
| C | HORARIOS | Optional; leave empty when not needed |
| D | EXCURSIÓN | Was column C |
| E | URL | Was column D |
| F–K | adto / valor ind / menor / infante | Shifted +1 |
| L | TOTAL x EXCURSIÓN | Was column K |

The v3 **meta block** (rows 1–5: Cliente, Fecha preparación, passenger counts) is unchanged.

### API fetch range

The app fetches `A1:M40` plus `Z1` so v2 issue-date cells and v4 subtotals remain available after the column shift.

## Backwards compatibility

- Sheets with **v2.0.0** or **v3.0.0** in K1 (or Z1) continue to use the existing parsers unchanged.
- v2/v3 activity rows have no HORARIOS column; the UI shows dates only (left-aligned in the day-card header).

## UI behavior

Activities are still grouped by **day number** (column A).

- **First activity** in a day card: date on the left, horario on the right in the day-card header (horario hidden when empty).
- **Additional activities** on the same day: horario (when present) appears in a row above the activity name, right-aligned. No date in that row.

## Local testing

Serve the repo over HTTP and open:

```
http://localhost:8080/?fixture=v4
```

Fixture: `test-data/response-v4-dev.json` (includes a day with two activities and different horarios).
