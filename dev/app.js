/**
 * MM Advisors — Presupuesto App
 * Client-side data fetch + DOM population
 *
 * Flow:
 * 1. Optional local fixture (test-data/*.json) on localhost or ?local=1
 * 2. URL params id, gid → resolve tab name → batchGet grid A1:L{DATA_END_ROW} + Z1
 * 3. Layout v1 (legacy A–K) vs v2 (URL column D, semver in Z1 or header heuristic)
 * 4. Parse, populate DOM; v2 activities may show title + external-link icon
 *
 * On failure, default layout remains with error banner.
 *
 * Dev copy: open /dev/index.html; local fixtures use ../test-data/ relative to this file.
 */

(function () {
  'use strict';

  var API_KEY = 'AIzaSyAPM00wGH79nT0bIvAXSb3TDMMcnULjydU';
  var SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
  var DATA_END_ROW = 18;
  /** Relative to dev/index.html (repo root has test-data/). */
  var LOCAL_FIXTURE_PATH = '../test-data/response.json';
  /** Optional v2 sample (URL column + sheetVersion simulating Z1). */
  var LOCAL_FIXTURE_V2_PATH = '../test-data/response-v2-dev.json';

  var CURRENCY_MAP = {
    'R$':  { symbol: 'R$',  label: 'R$ (Reais)',           locale: 'pt-BR' },
    'USD': { symbol: 'U$S', label: 'USD (Dólares)',        locale: 'pt-BR' },
    'U$S': { symbol: 'U$S', label: 'USD (Dólares)',        locale: 'pt-BR' },
    'ARS': { symbol: '$',   label: '$ (Pesos Argentinos)', locale: 'es-AR' },
    '$':   { symbol: '$',   label: '$ (Pesos Argentinos)', locale: 'es-AR' }
  };

  var DEFAULT_CURRENCY = CURRENCY_MAP['R$'];

  function showError(msg) {
    console.error('[Presupuesto] ' + msg);
    var banner = document.getElementById('error-banner');
    var msgEl = document.getElementById('error-message');
    if (banner && msgEl) {
      msgEl.textContent = msg;
      banner.hidden = false;
    }
  }

  function setField(name, value, root) {
    var scope = root || document;
    var el = scope.querySelector('[data-field="' + name + '"]');
    if (el) el.textContent = value;
  }

  function fmtAmount(num, curr) {
    if (!num && num !== 0) return curr.symbol + ' 0';
    return curr.symbol + ' ' + num.toLocaleString(curr.locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  }

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
    s = s.replace(/\./g, '').replace(/,/g, '');
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  /**
   * @param {'v1'|'v2'} layout
   */
  function detectCurrency(rows, layout) {
    var priceCols = layout === 'v2' ? [5, 7, 9, 10] : [4, 6, 8, 9];
    var hasUsd = false;
    var hasArs = false;
    var hasRs = false;

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

  function formatDate(val) {
    if (!val) return '--/--/----';
    var d = parseSheetDate(val);
    if (!d) return String(val);
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var yyyy = d.getFullYear();
    return dd + '/' + mm + '/' + yyyy;
  }

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

  function buildPassengerString(adults, minors, infants) {
    var parts = [];
    if (adults > 0) parts.push(adults + ' adulto' + (adults !== 1 ? 's' : ''));
    if (minors > 0) parts.push(minors + ' menor' + (minors !== 1 ? 'es' : ''));
    if (infants > 0) parts.push(infants + ' infante' + (infants !== 1 ? 's' : ''));
    return parts.length > 0 ? parts.join(', ') : '--';
  }

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

  /**
   * Parse semver from Z1 (e.g. v2.0.0). Returns null if missing/invalid.
   */
  function parseSheetVersion(cell) {
    if (cell === null || cell === undefined) return null;
    var s = String(cell).trim();
    if (!s) return null;
    s = s.replace(/^v\s*/i, '');
    var m = s.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!m) return null;
    return {
      major: parseInt(m[1], 10),
      minor: parseInt(m[2], 10),
      patch: parseInt(m[3], 10)
    };
  }

  function headerLooksLikeV2(rows) {
    if (!rows || !rows[0]) return false;
    var h = rows[0][3];
    if (h === null || h === undefined) return false;
    var t = String(h).trim().toLowerCase();
    return t.indexOf('url') !== -1;
  }

  /**
   * @returns {'v1'|'v2'}
   */
  function resolveLayout(rows, versionRaw) {
    var v = parseSheetVersion(versionRaw);
    if (v && v.major >= 2) return 'v2';
    if (rows && headerLooksLikeV2(rows)) return 'v2';
    return 'v1';
  }

  function isSafeHttpUrl(s) {
    if (!s || typeof s !== 'string') return false;
    var t = s.trim();
    try {
      var u = new URL(t);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch (e) {
      return false;
    }
  }

  /**
   * batchGet: grid A1:L{DATA_END_ROW} + Z1 (column Z exists in all sheets; AA may error on narrow grids)
   * @returns {Promise<{ gridRows: Array, versionRaw: * }|null>}
   */
  async function fetchSheetData(spreadsheetId, tabName) {
    var gridRangeStr = tabName + '!A1:L' + DATA_END_ROW;
    var versionRangeStr = tabName + '!Z1';
    var url = SHEETS_API + '/' + spreadsheetId
      + '/values:batchGet'
      + '?ranges=' + encodeURIComponent(gridRangeStr)
      + '&ranges=' + encodeURIComponent(versionRangeStr)
      + '&valueRenderOption=FORMATTED_VALUE'
      + '&key=' + API_KEY;

    console.log('[Presupuesto] batchGet: ' + gridRangeStr + ' + ' + versionRangeStr);

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

    if (!data.valueRanges || !Array.isArray(data.valueRanges) || data.valueRanges.length === 0) {
      showError('La planilla no contiene datos en el rango esperado.');
      return null;
    }

    var grid = data.valueRanges[0];
    var gridRows = grid.values && Array.isArray(grid.values) ? grid.values : [];

    var versionRaw = null;
    if (data.valueRanges.length > 1) {
      var vr = data.valueRanges[1];
      if (vr && vr.values && vr.values[0] && vr.values[0][0] !== undefined && vr.values[0][0] !== '') {
        versionRaw = vr.values[0][0];
      }
    }

    console.log('[Presupuesto] Received grid rows: ' + gridRows.length + ', Z1: ' + String(versionRaw));
    return { gridRows: gridRows, versionRaw: versionRaw };
  }

  function shouldAttemptLocalFixture() {
    var h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return true;
    if (new URLSearchParams(location.search).get('local') === '1') return true;
    return false;
  }

  function tabNameFromRange(rangeStr) {
    if (!rangeStr || typeof rangeStr !== 'string') return 'Presupuesto';
    var bang = rangeStr.indexOf('!');
    if (bang === -1) return 'Presupuesto';
    var q = rangeStr.slice(0, bang);
    if (q.charAt(0) !== "'" || q.charAt(q.length - 1) !== "'") return 'Presupuesto';
    var inner = q.slice(1, -1).replace(/''/g, "'");
    return inner.trim() || 'Presupuesto';
  }

  /**
   * @returns {Promise<{ gridRows: Array, tabName: string, versionRaw: * }|null>}
   */
  function localFixturePaths() {
    var v = new URLSearchParams(location.search).get('fixture');
    if (v === 'v2') return [LOCAL_FIXTURE_V2_PATH, LOCAL_FIXTURE_PATH];
    return [LOCAL_FIXTURE_PATH, LOCAL_FIXTURE_V2_PATH];
  }

  async function tryLoadLocalFixture() {
    if (!shouldAttemptLocalFixture()) return null;

    var tryPaths = localFixturePaths();
    for (var p = 0; p < tryPaths.length; p++) {
      var path = tryPaths[p];
      var response;
      try {
        response = await fetch(path, { cache: 'no-store' });
      } catch (err) {
        continue;
      }
      if (!response.ok) continue;

      var data;
      try {
        data = await response.json();
      } catch (err) {
        console.warn('[Presupuesto] Local fixture invalid JSON: ' + path);
        continue;
      }

      // batch-shaped fixture
      if (data.valueRanges && Array.isArray(data.valueRanges) && data.valueRanges.length > 0) {
        var gr = data.valueRanges[0].values;
        if (!gr || !Array.isArray(gr) || gr.length === 0) continue;
        var ver = null;
        if (data.valueRanges.length > 1 && data.valueRanges[1].values && data.valueRanges[1].values[0]) {
          ver = data.valueRanges[1].values[0][0];
        }
        var tr = data.valueRanges[0].range || '';
        console.log('[Presupuesto] Local batch fixture: ' + path);
        return {
          gridRows: gr,
          tabName: tabNameFromRange(tr),
          versionRaw: ver
        };
      }

      // flat values + optional sheetVersion (simulates Z1)
      if (data.values && Array.isArray(data.values) && data.values.length > 0) {
        var versionRaw = data.sheetVersion !== undefined && data.sheetVersion !== null
          ? data.sheetVersion
          : null;
        console.log('[Presupuesto] Local fixture: ' + path + ' (tab: "' + tabNameFromRange(data.range) + '")');
        return {
          gridRows: data.values,
          tabName: tabNameFromRange(data.range),
          versionRaw: versionRaw
        };
      }
    }

    return null;
  }

  function parseEstimateData(rows, tabName, layout) {
    var issueCol = layout === 'v2' ? 11 : 10;
    var issueRaw = rows[4] && rows[4][issueCol];
    var issueDateDisplay = formatDate(issueRaw);

    var activityRows = rows.slice(1);
    var currency = detectCurrency(activityRows, layout);

    var activities = [];
    for (var i = 0; i < activityRows.length; i++) {
      var row = activityRows[i];
      var excursion = (row[2] || '').toString().trim();
      if (!excursion) continue;

      if (layout === 'v2') {
        var rawUrl = row[3];
        var urlStr = rawUrl !== null && rawUrl !== undefined ? String(rawUrl).trim() : '';
        activities.push({
          day: row[0] || '',
          date: row[1] || '',
          excursion: excursion,
          url: isSafeHttpUrl(urlStr) ? urlStr : '',
          adultsQty: parseNum(row[4]),
          adultsPrice: parseNum(row[5]),
          minorsQty: parseNum(row[6]),
          minorsPrice: parseNum(row[7]),
          infantsQty: parseNum(row[8]),
          infantsPrice: parseNum(row[9]),
          totalExcursion: parseNum(row[10])
        });
      } else {
        activities.push({
          day: row[0] || '',
          date: row[1] || '',
          excursion: excursion,
          url: '',
          adultsQty: parseNum(row[3]),
          adultsPrice: parseNum(row[4]),
          minorsQty: parseNum(row[5]),
          minorsPrice: parseNum(row[6]),
          infantsQty: parseNum(row[7]),
          infantsPrice: parseNum(row[8]),
          totalExcursion: parseNum(row[9])
        });
      }
    }

    var grandTotal = activities.reduce(function (sum, a) {
      return sum + a.totalExcursion;
    }, 0);

    var maxAdults = 0, maxMinors = 0, maxInfants = 0;
    activities.forEach(function (a) {
      if (a.adultsQty > maxAdults) maxAdults = a.adultsQty;
      if (a.minorsQty > maxMinors) maxMinors = a.minorsQty;
      if (a.infantsQty > maxInfants) maxInfants = a.infantsQty;
    });

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

    var tripDays = dayGroups.length;

    return {
      clientName: tabName,
      currency: currency,
      issueDateDisplay: issueDateDisplay,
      activities: activities,
      dayGroups: dayGroups,
      grandTotal: grandTotal,
      tripDays: tripDays,
      tripDateRange: buildTripDateRange(activities),
      layout: layout,
      passengers: {
        adults: maxAdults,
        minors: maxMinors,
        infants: maxInfants
      }
    };
  }

  function populateDOM(data) {
    var curr = data.currency;

    setField('budgetLabel', curr === CURRENCY_MAP['R$'] ? 'Orçamento para:' : 'Presupuesto para:');
    setField('clientName', data.clientName);
    setField('issueDate', data.issueDateDisplay);
    setField('currencyLabel', curr.label);

    setField('grandTotal', fmtAmount(data.grandTotal, curr));
    setField('tripDays', data.tripDays + ' Días');
    setField('tripDateRange', data.tripDateRange);
    setField('passengers', buildPassengerString(
      data.passengers.adults, data.passengers.minors, data.passengers.infants
    ));

    setField('grandTotalBottom', fmtAmount(data.grandTotal, curr));

    var waLink = document.getElementById('whatsapp-link');
    if (waLink) {
      waLink.href = 'https://wa.me/5492944516122?text='
        + encodeURIComponent('Consulta sobre presupuesto de ' + data.clientName);
    }

    document.title = 'Presupuesto — ' + data.clientName + ' — Marina Mosmann Advisor';

    var timeline = document.getElementById('timeline');
    var defaultDay = document.getElementById('default-day');
    var tplDay = document.getElementById('tpl-day');
    var tplActivity = document.getElementById('tpl-activity');
    var tplDayTotal = document.getElementById('tpl-day-total');
    var tplPaxRow = document.getElementById('tpl-pax-row');

    /* tpl-day-total is optional (omit from HTML to hide day footer). */
    if (!timeline || !tplDay || !tplActivity || !tplPaxRow) {
      console.error('[Presupuesto] Missing template elements');
      return;
    }

    if (defaultDay) defaultDay.remove();

    data.dayGroups.forEach(function (group) {
      var dayEl = tplDay.content.cloneNode(true);
      var dayBubble = dayEl.querySelector('[data-field="dayNumber"]');
      var dayDate = dayEl.querySelector('[data-field="dayDate"]');
      var dayCard = dayEl.querySelector('.day-card');

      if (dayBubble) dayBubble.textContent = group.day;
      if (dayDate) dayDate.textContent = formatDate(group.date);

      var article = dayEl.querySelector('.day-entry');
      if (article) article.setAttribute('aria-label', 'Día ' + group.day);

      group.activities.forEach(function (activity) {
        var actEl = tplActivity.content.cloneNode(true);
        var nameEl = actEl.querySelector('[data-field="excursionName"]');
        var paxList = actEl.querySelector('.pax-list');

        if (nameEl) {
          nameEl.textContent = '';
          if (activity.url) {
            var a = document.createElement('a');
            a.href = activity.url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.className = 'activity-name-link';
            a.appendChild(document.createTextNode(activity.excursion));
            a.appendChild(document.createTextNode(' '));
            var iconWrap = document.createElement('span');
            iconWrap.className = 'activity-link-icon';
            iconWrap.setAttribute('aria-hidden', 'true');
            iconWrap.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
            a.appendChild(iconWrap);
            nameEl.appendChild(a);
          } else {
            nameEl.textContent = activity.excursion;
          }
        }

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

          if (paxLabel) paxLabel.textContent = pax.label;
          if (paxCalc) paxCalc.textContent = pax.qty + ' × ' + fmtAmount(pax.price, curr);

          if (paxList) paxList.appendChild(rowEl);
        });

        var subtotalEl = actEl.querySelector('[data-field="activitySubtotal"]');
        if (subtotalEl) subtotalEl.textContent = fmtAmount(activity.totalExcursion, curr);

        if (dayCard) dayCard.appendChild(actEl);
      });

      if (dayCard && tplDayTotal) {
        var daySum = group.activities.reduce(function (s, a) {
          return s + a.totalExcursion;
        }, 0);
        var dayTotalFrag = tplDayTotal.content.cloneNode(true);
        var dayTotalLabel = dayTotalFrag.querySelector('[data-field="dayTotalLabel"]');
        var dayTotalAmount = dayTotalFrag.querySelector('[data-field="dayTotalAmount"]');
        if (dayTotalLabel) dayTotalLabel.textContent = 'Total día ' + group.day;
        if (dayTotalAmount) dayTotalAmount.textContent = fmtAmount(daySum, curr);
        dayCard.appendChild(dayTotalFrag);
      }

      timeline.appendChild(dayEl);
    });

    console.log('[Presupuesto] DOM populated (layout ' + data.layout + ')');
  }

  async function main() {
    var local = await tryLoadLocalFixture();
    if (local) {
      var layout = resolveLayout(local.gridRows, local.versionRaw);
      console.log('[Presupuesto] Local mode — layout: ' + layout + ', version cell: ' + String(local.versionRaw));
      var dataLocal = parseEstimateData(local.gridRows, local.tabName, layout);
      console.log('[Presupuesto] Parsed:', dataLocal);
      populateDOM(dataLocal);
      return;
    }

    var params = getParams();
    if (!params) return;

    var tabName = await fetchTabName(params.id, params.gid);
    if (!tabName) return;

    var fetched = await fetchSheetData(params.id, tabName);
    if (!fetched) return;

    var layout = resolveLayout(fetched.gridRows, fetched.versionRaw);
    console.log('[Presupuesto] Layout: ' + layout + ', Z1: ' + String(fetched.versionRaw));

    var data = parseEstimateData(fetched.gridRows, tabName, layout);
    console.log('[Presupuesto] Parsed:', data);

    populateDOM(data);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }

})();
