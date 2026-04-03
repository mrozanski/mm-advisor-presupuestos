Here’s a concise testing approach that fits a **static HTML + one big `app.js` IIFE**, **no build step today**, and **versioned sheet shapes** (v1 / v2 / v3).

## 1. Prefer a **thin parser module** + **Node unit tests** for logic

Most of the risk is in **pure data work**: semver resolution, finding the v3 header row, parsing rows into `activities`, passenger meta vs max, currency detection, `parseNum` edge cases. That does not need a browser.

**Suggested direction:**

- Move (or gradually extract) **only pure helpers** into something like `sheet-parse.js` (or `sheet-parse.mjs`): e.g. `getSheetSemver`, `resolveLayout`, `findV3ActivityHeaderIndex`, `parseActivityRowV2`, `parseEstimateData` / `parseEstimateDataV3`, `detectCurrency`, `parseNum`, etc.
- **`populateDOM` stays in `app.js`** (or a tiny `ui.js`) and stays out of unit tests, or is tested only via E2E.
- **Unit tests** (Node’s built-in `node:test` or **Vitest**) import the parser module and assert **given fixture JSON → expected parsed object** (or a **stable subset**: `layout`, `passengers`, `activities.length`, first activity fields, `grandTotal`, `clientName`).

**Why this matches versioning:** each layout is one **fixture file** + one **describe block** (`response-v2-dev.json`, `response-v3-dev.json`, and a minimal v1 fixture if you still care). Adding v4 later = add JSON + assertions.

**Refactor cost:** small if you use **ES modules** (`<script type="module">` + `import`) or a **global** attach pattern (`window.MMAdvisorParse = { ... }`) that Node can load with a one-line `vm`/wrapper. The important part is **one source of truth** for parsing, not duplicated logic in tests.

---

## 2. Add **Playwright (or similar) E2E** for regression on the real page

Use this to answer: “does the **page** show the right numbers and labels for each fixture?”

- Serve the repo over HTTP (as you already do for local fixtures).
- Visit e.g. `/?local=1&fixture=v2` and `/?local=1&fixture=v3`.
- Assert on **`[data-field="…"]`** (and maybe title), not on full HTML snapshots, to avoid brittle tests.

**Strengths:** no need to export internals; catches wiring mistakes (wrong `DATA_END_ROW`, broken `tryLoadLocalFixture`, DOM field names). **Weakness:** when something fails, you may still need unit tests to pinpoint the function.

**Recommendation:** **E2E for a few golden paths per version** + **unit tests for parsing** is a good split.

---

## 3. What **not** to prioritize first

- **Full browser E2E only** — good smoke coverage, poor isolation when parsing regresses.
- **Duplicating parsing logic inside tests** — drifts from production quickly with new versions.
- **Heavy mocking of the Sheets API** in unit tests — your **fixtures already are** the API; use them as inputs.

---

## 4. CI

A single **GitHub Action** (or similar) that runs:

1. `npm test` → unit tests on the parser module.  
2. `npx playwright test` (install browsers once in CI).

Keeps **versioned fixtures** as the **contract** between sheet structure and app behavior.

---

## 5. Practical order of work (when you implement)

1. Extract **pure parse + layout resolution** into one module (minimal surface).  
2. Add **unit tests** wired to existing `test-data/*.json`.  
3. Add **Playwright** with 2–3 routes (`fixture=v2`, `fixture=v3`, optional default).  
4. Optionally add **one “malformed / partial row”** unit case per version for edge cases.

That gives you **fast feedback on structure changes** (unit) and **confidence the UI still renders** (E2E), which is a good match for your versioning pattern and recent v3 work. When you’re ready to implement, we can turn this into a concrete file layout and `package.json` scripts.