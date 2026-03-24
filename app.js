/**
 * ══════════════════════════════════════════════════════════
 * MM Advisors — Presupuesto App
 * Client-side data fetch + DOM population
 * ══════════════════════════════════════════════════════════
 *
 * Flow:
 * 1. Read URL params (id, gid)
 * 2. Fetch sheet metadata → resolve gid to tab name
 * 3. Fetch sheet data (A1:J10; row 1 header, rows 2–10 activities — top sheet row removed)
 * 4. Parse activities, detect currency, compute totals
 * 5. Populate DOM from templates
 *
 * On any failure, the page keeps its default layout with $0 values
 * and shows an error banner at the bottom.
 */

(function () {
  'use strict';

  // ── Configuration ────────────────────────────────────────
  var API_KEY = 'AIzaSyAPM00wGH79nT0bIvAXSb3TDMMcnULjydU';
  var SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
  var DATA_END_ROW = 10; // rows 2–10 contain activities (row 1 is header); was 11 before a top row was removed from the sheet

  // ── Currency config ──────────────────────────────────────
  var CURRENCY_MAP = {
    'R$':  { symbol: 'R$',  label: 'R$ (Reais)',           locale: 'pt-BR' },
    'USD': { symbol: 'U$S', label: 'USD (Dólares)',        locale: 'pt-BR' },
    'U$S': { symbol: 'U$S', label: 'USD (Dólares)',        locale: 'pt-BR' },
    'ARS': { symbol: '$',   label: '$ (Pesos Argentinos)', locale: 'es-AR' },
    '$':   { symbol: '$',   label: '$ (Pesos Argentinos)', locale: 'es-AR' }
  };

  var DEFAULT_CURRENCY = CURRENCY_MAP['R$'];

  // ── Helpers ──────────────────────────────────────────────

  /**
   * Show an error banner at the bottom of the page.
   * Does not throw — the page stays in its default state.
   */
  function showError(msg) {
    console.error('[Presupuesto] ' + msg);
    var banner = document.getElementById('error-banner');
    var msgEl = document.getElementById('error-message');
    if (banner && msgEl) {
      msgEl.textContent = msg;
      banner.hidden = false;
    }
  }

  /**
   * Set text content of the first element matching [data-field="name"].
   */
  function setField(name, value, root) {
    var scope = root || document;
    var el = scope.querySelector('[data-field="' + name + '"]');
    if (el) el.textContent = value;
  }

  /**
   * Format a number as currency.
   */
  function fmtAmount(num, curr) {
    if (!num && num !== 0) return curr.symbol + ' 0';
    return curr.symbol + ' ' + num.toLocaleString(curr.locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  }

  /**
   * Parse a cell value to a number, stripping currency prefixes and thousands separators.
   * Supports R$80, R$1.610, R$1,610, USD40, USD1,380, U$S… (whole amounts in cells).
   * Do not strip "USD" per-character (old /[R$U$S]/ removed U+S and turned "USD40" into "D40").
   */
  function parseNum(val) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    var s = String(val).trim();
    s = s.replace(/^USD\s*/i, '')
      .replace(/^U\$S\s*/i, '')
      .replace(/^R\$\s*/i, '')
      .replace(/^ARS\s*/i, '')
      .replace(/^\$\s*/, '');
    s = s.replace(/\s/g, '');
    // Thousands: remove . and , (cells use integers; e.g. USD1,380 → 1380, R$1.610 → 1610)
    s = s.replace(/\./g, '').replace(/,/g, '');
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  /**
   * Detect currency from sheet rows.
   * Scans unit-price columns E, G, I (4,6,8) and TOTAL column J (9). The API often
   * returns plain numbers in unit columns while J still shows "USD200" / "R$560" —
   * scanning only 4/6/8 made everything fall back to DEFAULT (R$) and looked
   * "always R$". We scan all, then pick USD > ARS > R$ if multiple hints appear.
   */
  function detectCurrency(rows) {
    var hasUsd = false;
    var hasArs = false;
    var hasRs = false;
    var priceCols = [4, 6, 8, 9];

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      for (var j = 0; j < priceCols.length; j++) {
        var cell = row[priceCols[j]];
        if (cell === null || cell === undefined || cell === '') continue;
        var str = String(cell).trim();
        if (!str) continue;

        if (str.indexOf('R$') !== -1) hasRs = true;
        if (/^USD/i.test(str) || str.indexOf('USD') !== -1) hasUsd = true;
        if (str.indexOf('U$S') !== -1) hasUsd = true;
        if (str.indexOf('ARS') !== -1) hasArs = true;
        if (str.indexOf('$') !== -1 && str.indexOf('R$') === -1 && str.indexOf('U$S') === -1) {
          hasArs = true;
        }
      }
    }

    if (hasUsd) return CURRENCY_MAP['USD'];
    if (hasArs) return CURRENCY_MAP['ARS'];
    if (hasRs) return CURRENCY_MAP['R$'];
    return DEFAULT_CURRENCY;
  }

  /**
   * Parse a sheet date cell to a local Date, or null if not parseable.
   * Sheet authors use DD/MM/YYYY; do not use Date(string) for "12/07/…" — JS parses that as MM/DD/YYYY.
   */
  function parseSheetDate(val) {
    if (val === null || val === undefined) return null;
    var s = String(val).trim();
    if (!s) return null;
    var d;
    var serial = s.match(/^Date\((\d+),(\d+),(\d+)\)$/);
    if (serial) {
      d = new Date(parseInt(serial[1], 10), parseInt(serial[2], 10), parseInt(serial[3], 10));
      return isNaN(d.getTime()) ? null : d;
    }
    var dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
      d = new Date(parseInt(dmy[3], 10), parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10));
      return isNaN(d.getTime()) ? null : d;
    }
    d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }

  /**
   * Format a date value from the sheet as DD/MM/YYYY.
   */
  function formatDate(val) {
    if (!val) return '--/--/----';
    var d = parseSheetDate(val);
    if (!d) return String(val);
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var yyyy = d.getFullYear();
    return dd + '/' + mm + '/' + yyyy;
  }

  /**
   * Min–max date range across activities (DD/MM/YYYY - DD/MM/YYYY), or placeholder if none.
   */
  function buildTripDateRange(activities) {
    var times = [];
    for (var i = 0; i < activities.length; i++) {
      var d = parseSheetDate(activities[i].date);
      if (d) times.push(d.getTime());
    }
    if (times.length === 0) return '--/--/---- - --/--/----';
    var minT = Math.min.apply(null, times);
    var maxT = Math.max.apply(null, times);
    function fmt(ms) {
      var x = new Date(ms);
      return String(x.getDate()).padStart(2, '0') + '/' + String(x.getMonth() + 1).padStart(2, '0') + '/' + x.getFullYear();
    }
    return fmt(minT) + ' - ' + fmt(maxT);
  }

  /**
   * Build passenger string from max counts.
   */
  function buildPassengerString(adults, minors, infants) {
    var parts = [];
    if (adults > 0) parts.push(adults + ' adulto' + (adults !== 1 ? 's' : ''));
    if (minors > 0) parts.push(minors + ' menor' + (minors !== 1 ? 'es' : ''));
    if (infants > 0) parts.push(infants + ' infante' + (infants !== 1 ? 's' : ''));
    return parts.length > 0 ? parts.join(', ') : '--';
  }

  // ── Step 1: Read URL params ──────────────────────────────

  function getParams() {
    var params = new URLSearchParams(window.location.search);
    var id = params.get('id');
    var gid = params.get('gid');

    if (!id) {
      showError('Faltan parámetros en la URL. Se requiere: ?id=SPREADSHEET_ID&gid=SHEET_GID');
      return null;
    }

    if (!gid) {
      showError('Falta el parámetro gid en la URL.');
      return null;
    }

    var gidNum = parseInt(gid, 10);
    if (isNaN(gidNum)) {
      showError('El parámetro gid debe ser un número. Recibido: "' + gid + '"');
      return null;
    }

    console.log('[Presupuesto] Params: id=' + id + ', gid=' + gidNum);
    return { id: id, gid: gidNum };
  }

  // ── Step 2: Fetch sheet metadata ─────────────────────────

  async function fetchTabName(spreadsheetId, gid) {
    var url = SHEETS_API + '/' + spreadsheetId
      + '?fields=sheets.properties'
      + '&key=' + API_KEY;

    console.log('[Presupuesto] Fetching metadata...');

    var response;
    try {
      response = await fetch(url);
    } catch (err) {
      showError('Error de red al consultar la planilla. Verificá tu conexión.');
      return null;
    }

    if (!response.ok) {
      if (response.status === 404) {
        showError('No se encontró la planilla. Verificá que el link sea correcto.');
      } else if (response.status === 403) {
        showError('Sin permiso para acceder a la planilla. Debe estar compartida como "Cualquier persona con el enlace".');
      } else {
        showError('Error al consultar la planilla (HTTP ' + response.status + ').');
      }
      return null;
    }

    var data;
    try {
      data = await response.json();
    } catch (err) {
      showError('Error al procesar la respuesta de la planilla.');
      return null;
    }

    if (!data.sheets || !Array.isArray(data.sheets)) {
      showError('Respuesta inesperada de la API.');
      return null;
    }

    var match = null;
    for (var i = 0; i < data.sheets.length; i++) {
      if (data.sheets[i].properties.sheetId === gid) {
        match = data.sheets[i].properties.title;
        break;
      }
    }

    if (!match) {
      showError('No se encontró la pestaña (gid ' + gid + ') en la planilla.');
      return null;
    }

    console.log('[Presupuesto] Tab resolved: gid ' + gid + ' → "' + match + '"');
    return match;
  }

  // ── Step 3: Fetch sheet data ─────────────────────────────

  async function fetchSheetData(spreadsheetId, tabName) {
    // Encode tab name for URL (handles spaces, special chars)
    var encodedTab = encodeURIComponent(tabName);

    var range = encodedTab + '!A1:J' + DATA_END_ROW;
    var url = SHEETS_API + '/' + spreadsheetId
      + '/values/' + range
      + '?valueRenderOption=FORMATTED_VALUE'
      + '&key=' + API_KEY;

    console.log('[Presupuesto] Fetching data: ' + tabName + '!A1:J' + DATA_END_ROW);

    var response;
    try {
      response = await fetch(url);
    } catch (err) {
      showError('Error de red al obtener los datos.');
      return null;
    }

    if (!response.ok) {
      showError('Error al obtener los datos (HTTP ' + response.status + ').');
      return null;
    }

    var data;
    try {
      data = await response.json();
    } catch (err) {
      showError('Error al procesar los datos.');
      return null;
    }

    if (!data.values || !Array.isArray(data.values)) {
      showError('La planilla no contiene datos en el rango esperado.');
      return null;
    }

    console.log('[Presupuesto] Received ' + data.values.length + ' rows');
    return data.values;
  }

  // ── Step 4: Parse data ───────────────────────────────────

  function parseEstimateData(rows, tabName) {
    // Row 0 is the header, rows 1+ are activities
    var activityRows = rows.slice(1);
    var currency = detectCurrency(activityRows);

    var activities = [];
    for (var i = 0; i < activityRows.length; i++) {
      var row = activityRows[i];
      // Skip empty rows (column C = excursion name is empty)
      var excursion = (row[2] || '').toString().trim();
      if (!excursion) continue;

      activities.push({
        day: row[0] || '',
        date: row[1] || '',
        excursion: excursion,
        adultsQty: parseNum(row[3]),
        adultsPrice: parseNum(row[4]),
        minorsQty: parseNum(row[5]),
        minorsPrice: parseNum(row[6]),
        infantsQty: parseNum(row[7]),
        infantsPrice: parseNum(row[8]),
        totalExcursion: parseNum(row[9])
      });
    }

    // Grand total: sum of all activity totals
    var grandTotal = activities.reduce(function (sum, a) {
      return sum + a.totalExcursion;
    }, 0);

    // Passenger counts: max per category
    var maxAdults = 0, maxMinors = 0, maxInfants = 0;
    activities.forEach(function (a) {
      if (a.adultsQty > maxAdults) maxAdults = a.adultsQty;
      if (a.minorsQty > maxMinors) maxMinors = a.minorsQty;
      if (a.infantsQty > maxInfants) maxInfants = a.infantsQty;
    });

    // Group by day
    var dayMap = {};
    activities.forEach(function (a) {
      var key = String(a.day);
      if (!dayMap[key]) {
        dayMap[key] = { day: a.day, date: a.date, activities: [] };
      }
      dayMap[key].activities.push(a);
    });

    var dayGroups = Object.keys(dayMap)
      .sort(function (a, b) { return parseInt(a) - parseInt(b); })
      .map(function (key) { return dayMap[key]; });

    // Unique days count
    var tripDays = dayGroups.length;

    return {
      clientName: tabName,
      currency: currency,
      activities: activities,
      dayGroups: dayGroups,
      grandTotal: grandTotal,
      tripDays: tripDays,
      tripDateRange: buildTripDateRange(activities),
      passengers: {
        adults: maxAdults,
        minors: maxMinors,
        infants: maxInfants
      }
    };
  }

  // ── Step 5: Populate DOM ─────────────────────────────────

  function populateDOM(data) {
    var curr = data.currency;

    // Header meta
    setField('budgetLabel', curr === CURRENCY_MAP['R$'] ? 'Orçamento para:' : 'Presupuesto para:');
    setField('clientName', data.clientName);
    var today = new Date();
    var dd = String(today.getDate()).padStart(2, '0');
    var mm = String(today.getMonth() + 1).padStart(2, '0');
    setField('issueDate', dd + '/' + mm + '/' + today.getFullYear());
    setField('currencyLabel', curr.label);

    // Resumen card
    setField('grandTotal', fmtAmount(data.grandTotal, curr));
    setField('tripDays', data.tripDays + ' Días');
    setField('tripDateRange', data.tripDateRange);
    setField('passengers', buildPassengerString(
      data.passengers.adults, data.passengers.minors, data.passengers.infants
    ));

    // Total final (bottom)
    setField('grandTotalBottom', fmtAmount(data.grandTotal, curr));

    // WhatsApp link with client name
    var waLink = document.getElementById('whatsapp-link');
    if (waLink) {
      waLink.href = 'https://wa.me/5492944516122?text='
        + encodeURIComponent('Consulta sobre presupuesto de ' + data.clientName);
    }

    // Page title
    document.title = 'Presupuesto — ' + data.clientName + ' — Marina Mosmann Advisor';

    // ── Build itinerary from templates ──
    var timeline = document.getElementById('timeline');
    var defaultDay = document.getElementById('default-day');
    var tplDay = document.getElementById('tpl-day');
    var tplActivity = document.getElementById('tpl-activity');
    var tplPaxRow = document.getElementById('tpl-pax-row');

    if (!timeline || !tplDay || !tplActivity || !tplPaxRow) {
      console.error('[Presupuesto] Missing template elements');
      return;
    }

    // Remove default day placeholder
    if (defaultDay) defaultDay.remove();

    data.dayGroups.forEach(function (group) {
      // Clone day template
      var dayEl = tplDay.content.cloneNode(true);
      var dayBubble = dayEl.querySelector('[data-field="dayNumber"]');
      var dayDate = dayEl.querySelector('[data-field="dayDate"]');
      var dayCard = dayEl.querySelector('.day-card');

      if (dayBubble) dayBubble.textContent = group.day;
      if (dayDate) dayDate.textContent = formatDate(group.date);

      // Set aria-label on the article
      var article = dayEl.querySelector('.day-entry');
      if (article) article.setAttribute('aria-label', 'Día ' + group.day);

      // Add activities to the day card
      group.activities.forEach(function (activity) {
        var actEl = tplActivity.content.cloneNode(true);
        var nameEl = actEl.querySelector('[data-field="excursionName"]');
        var paxList = actEl.querySelector('.pax-list');

        if (nameEl) nameEl.textContent = activity.excursion;

        // Pax rows
        var paxTypes = [
          { label: 'Adultos', qty: activity.adultsQty, price: activity.adultsPrice },
          { label: 'Menores', qty: activity.minorsQty, price: activity.minorsPrice },
          { label: 'Infantes', qty: activity.infantsQty, price: activity.infantsPrice }
        ];

        paxTypes.forEach(function (pax) {
          if (pax.qty <= 0) return;

          var rowEl = tplPaxRow.content.cloneNode(true);
          var paxLabel = rowEl.querySelector('[data-field="paxLabel"]');
          var paxCalc = rowEl.querySelector('[data-field="paxCalc"]');
          var paxTotal = rowEl.querySelector('[data-field="paxTotal"]');

          var lineTotal = pax.qty * pax.price;

          if (paxLabel) paxLabel.textContent = pax.label;
          if (paxCalc) paxCalc.textContent = pax.qty + ' × ' + fmtAmount(pax.price, curr);
          if (paxTotal) paxTotal.textContent = '= ' + fmtAmount(lineTotal, curr);

          if (paxList) paxList.appendChild(rowEl);
        });

        if (dayCard) dayCard.appendChild(actEl);
      });

      timeline.appendChild(dayEl);
    });

    console.log('[Presupuesto] DOM populated successfully');
  }

  // ── Main ─────────────────────────────────────────────────

  async function main() {
    // Step 1: URL params
    var params = getParams();
    if (!params) return;

    // Step 2: Resolve gid → tab name
    var tabName = await fetchTabName(params.id, params.gid);
    if (!tabName) return;

    // Step 3: Fetch sheet data
    var rows = await fetchSheetData(params.id, tabName);
    if (!rows) return;

    // Step 4: Parse
    var data = parseEstimateData(rows, tabName);
    console.log('[Presupuesto] Parsed:', data);

    // Step 5: Populate DOM
    populateDOM(data);
  }

  // ── Init ─────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }

})();
