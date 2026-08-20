// =====================================================================
// api.js — CCST Elections  (bulletproof edition)
// =====================================================================
//
// Fixes "TypeError: Failed to fetch" by trying up to 3 strategies:
//   1. Direct fetch (works when Apps Script is deployed as "Anyone"
//      and the page is on a normal http(s):// origin)
//   2. JSONP via <script> tag  (works on file:// AND bypasses CORS)
//   3. CORS proxy               (works when everything else fails)
//
// POST requests use Content-Type: text/plain;charset=utf-8 to avoid
// the CORS preflight that Apps Script can't handle.
//
// If every strategy fails, the error message tells the user EXACTLY
// what to do (redeploy as Anyone, host the file, etc).
//
// =====================================================================

(function () {
  'use strict';

  // ---- Defaults (overridden by CONFIG if loaded) ----------------------
  const DEFAULTS = {
    CORS_PROXY: null,
    TIMEOUT_MS: 15000,
    DEBUG: true
  };

  function log()  { if ((window.CONFIG && CONFIG.DEBUG) || DEFAULTS.DEBUG) console.log.apply(console, ['[CCST-API]'].concat([].slice.call(arguments))); }
  function warn() { console.warn.apply(console,  ['[CCST-API]'].concat([].slice.call(arguments))); }
  function err()  { console.error.apply(console, ['[CCST-API]'].concat([].slice.call(arguments))); }

  // ---- Helpers --------------------------------------------------------
  function getCfg(key) {
    if (typeof CONFIG !== 'undefined' && CONFIG !== null && CONFIG[key] !== undefined) return CONFIG[key];
    return DEFAULTS[key];
  }

  function isFileProtocol() {
    return window.location.protocol === 'file:';
  }

  function looksLikeAppsScriptUrl(url) {
    return typeof url === 'string'
      && url.indexOf('https://script.google.com/') === 0
      && url.indexOf('/macros/') !== -1;
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    let timedOut = false;
    const timer = setTimeout(function () {
      timedOut = true;
      if (controller) controller.abort();
    }, timeoutMs);

    const opts = Object.assign({}, options);
    if (controller) opts.signal = controller.signal;
    // Apps Script occasionally 302s — follow automatically.
    if (opts.redirect === undefined) opts.redirect = 'follow';

    return fetch(url, opts)
      .then(function (r) { clearTimeout(timer); return r; })
      .catch(function (e) {
        clearTimeout(timer);
        if (timedOut) throw new Error('Request timed out after ' + timeoutMs + 'ms');
        throw e;
      });
  }

  // ---- JSONP ----------------------------------------------------------
  // <script> tags are not subject to CORS, so this works even from file://
  function jsonpRequest(url) {
    return new Promise(function (resolve, reject) {
      const cbName = 'ccst_cb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
      const timeoutMs = getCfg('TIMEOUT_MS');
      let script = null;
      let settled = false;

      function cleanup() {
        try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
        if (script && script.parentNode) script.parentNode.removeChild(script);
        clearTimeout(timer);
      }

      window[cbName] = function (data) {
        if (settled) return; settled = true;
        cleanup();
        resolve(data);
      };

      const timer = setTimeout(function () {
        if (settled) return; settled = true;
        cleanup();
        reject(new Error('JSONP request timed out'));
      }, timeoutMs);

      script = document.createElement('script');
      script.async = true;
      script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + cbName;
      script.onerror = function () {
        if (settled) return; settled = true;
        cleanup();
        reject(new Error('JSONP <script> failed to load — backend probably does not support JSONP'));
      };
      document.head.appendChild(script);
    });
  }

  // ---- Error message builder -----------------------------------------
  function friendlyError(action, lastError) {
    const what = 'Could not reach the voting server while "' + action + '"';
    const why  = (lastError && lastError.message) ? lastError.message : 'network error';

    const tips = [];
    if (isFileProtocol()) {
      tips.push('You opened the page from your disk (file://). Browsers block some requests from file:// — host the page on a web server (or use the CORS proxy in config.js).');
    }
    if (!getCfg('CORS_PROXY')) {
      tips.push('No CORS proxy is configured. Uncomment one of the CORS_PROXY lines in config.js as a fallback.');
    }
    tips.push('Make sure the Apps Script deployment has "Who has access" set to "Anyone" (Deploy → Manage deployments → edit).');
    tips.push('Make sure the API_URL in config.js matches the *current* deployment URL — every time you change the script, you must create a NEW deployment to get a new URL.');

    return what + ' — ' + why + '.\n\nHow to fix:\n • ' + tips.join('\n • ');
  }

  // ---- Main call ------------------------------------------------------
  async function callApi(action, data, method) {
    data = data || {};
    method = (method || 'POST').toUpperCase();
    const isGet = method === 'GET';

    // Validate config
    if (typeof CONFIG === 'undefined' || CONFIG === null || !CONFIG.API_URL) {
      return { success: false, message: 'CONFIG.API_URL is missing. Make sure the CONFIG block is loaded before api.js (check that the inline <script> with CONFIG appears above <script src=\'api.js\'>).' };
    }
    if (!looksLikeAppsScriptUrl(CONFIG.API_URL)) {
      return { success: false, message: 'CONFIG.API_URL is not a Google Apps Script URL. Current value: ' + CONFIG.API_URL };
    }

    // Build the request URL/body
    let url = CONFIG.API_URL;
    if (isGet) {
      const params = ['action=' + encodeURIComponent(action)];
      Object.keys(data).forEach(function (k) {
        const v = data[k];
        if (v === undefined || v === null || v === '') return;
        params.push(encodeURIComponent(k) + '=' + encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : v));
      });
      url += (url.indexOf('?') >= 0 ? '&' : '?') + params.join('&');
    }
    const body = isGet ? undefined : JSON.stringify(Object.assign({ action: action }, data));

    // Strategies (run in order until one succeeds)
    const strategies = [];

    // 1) Direct fetch
    strategies.push({
      name: 'direct',
      run: function () {
        const opts = isGet
          ? { method: 'GET' }
          : { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body };
        return fetchWithTimeout(url, opts, getCfg('TIMEOUT_MS')).then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText);
          return res.text();
        }).then(function (txt) {
          try { return JSON.parse(txt); }
          catch (e) { throw new Error('Backend returned non-JSON: ' + txt.substring(0, 120)); }
        });
      }
    });

    // 2) JSONP (GET only — needs backend support, see Code.gs)
    if (isGet) {
      strategies.push({
        name: 'jsonp',
        run: function () { return jsonpRequest(url); }
      });
    }

    // 3) CORS proxy (configured in config.js)
    const proxy = getCfg('CORS_PROXY');
    if (proxy) {
      strategies.push({
        name: 'cors-proxy',
        run: function () {
          // The proxy fetches the Apps Script on the server side (no CORS).
          // The result body should be the same JSON the script would have returned.
          return fetchWithTimeout(proxy + encodeURIComponent(url), { method: 'GET' }, getCfg('TIMEOUT_MS'))
            .then(function (res) {
              if (!res.ok) throw new Error('HTTP ' + res.status);
              return res.json();
            });
        }
      });
    }

    // Try each strategy
    let lastErr = null;
    for (let i = 0; i < strategies.length; i++) {
      const s = strategies[i];
      try {
        log('Trying', s.name, '→', action);
        const result = await s.run();
        log('  ✓', s.name, 'succeeded');
        return result;
      } catch (e) {
        lastErr = e;
        warn('  ✗', s.name, 'failed:', e.message || e);
      }
    }

    err('All strategies failed for', action, lastErr);
    return { success: false, message: friendlyError(action, lastErr) };
  }

  // ---- Domain-specific wrappers (same names as before) ---------------
  function get(url, action) { return callApi(action, {}, 'GET'); }
  function post(action, data) { return callApi(action, data, 'POST'); }

  async function checkAdminPassword(password)             { return callApi('checkAdminPassword', { password: password }, 'POST'); }
  async function getAdminCandidateList()                  { return callApi('getAdminCandidateList', {}, 'POST'); }
  async function addCandidateWithFile(pwd, pos, name, prog, fileData) {
    return callApi('addCandidateWithFile', { adminPassword: pwd, position: pos, name: name, program: prog, fileData: fileData }, 'POST');
  }
  async function updateCandidate(pwd, rowIndex, pos, name, prog) {
    return callApi('updateCandidate', { adminPassword: pwd, rowIndex: rowIndex, position: pos, name: name, program: prog }, 'POST');
  }
  async function deleteCandidate(pwd, rowIndex)           { return callApi('deleteCandidate', { adminPassword: pwd, rowIndex: rowIndex }, 'POST'); }
  async function deletePosition(pwd, posName)             { return callApi('deletePosition', { adminPassword: pwd, positionName: posName }, 'POST'); }
  async function getBallotData()                          { return callApi('getBallotData', {}, 'GET'); }
  async function submitVotes(voterName, studentId, selections, votedNone) {
    return callApi('submitVotes', { voterName: voterName, studentId: studentId, selections: selections, votedNone: votedNone }, 'POST');
  }
  async function getRealtimeTally()                        { return callApi('getRealtimeTally', {}, 'GET'); }

  // ---- Diagnostics ----------------------------------------------------
  async function pingApi() {
    const base = (typeof CONFIG !== 'undefined' && CONFIG !== null && CONFIG.API_URL) ? CONFIG.API_URL : null;
    const out = {
      apiUrl: base,
      apiUrlLooksValid: looksLikeAppsScriptUrl(base),
      pageProtocol: window.location.protocol,
      isFileProtocol: isFileProtocol(),
      corsProxyConfigured: !!getCfg('CORS_PROXY'),
      strategies: {}
    };
    if (!base) { out.error = 'CONFIG.API_URL is missing'; return out; }

    // Strategy 1: direct
    try {
      const r = await fetchWithTimeout(base + '?action=ping', { method: 'GET' }, 5000);
      out.strategies.direct = { ok: r.ok, status: r.status };
    } catch (e) { out.strategies.direct = { ok: false, error: e.message }; }

    // Strategy 2: JSONP
    try {
      const data = await jsonpRequest(base + '?action=ping');
      out.strategies.jsonp = { ok: true, sample: data };
    } catch (e) { out.strategies.jsonp = { ok: false, error: e.message }; }

    // Strategy 3: proxy
    if (getCfg('CORS_PROXY')) {
      try {
        const r = await fetchWithTimeout(getCfg('CORS_PROXY') + encodeURIComponent(base + '?action=ping'), { method: 'GET' }, 5000);
        out.strategies.corsProxy = { ok: r.ok, status: r.status };
      } catch (e) { out.strategies.corsProxy = { ok: false, error: e.message }; }
    }
    return out;
  }

  // ---- Expose ---------------------------------------------------------
  window.callApi                = callApi;
  window.checkAdminPassword     = checkAdminPassword;
  window.getAdminCandidateList  = getAdminCandidateList;
  window.addCandidateWithFile   = addCandidateWithFile;
  window.updateCandidate        = updateCandidate;
  window.deleteCandidate        = deleteCandidate;
  window.deletePosition         = deletePosition;
  window.getBallotData          = getBallotData;
  window.submitVotes            = submitVotes;
  window.getRealtimeTally       = getRealtimeTally;
  window.pingApi                = pingApi;
})();