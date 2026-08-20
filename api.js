// =====================================================================
// api.js — CCST Elections (bulletproof edition with Voter Verification)
// =====================================================================

(function () {
  'use strict';

  const DEFAULTS = { CORS_PROXY: null, TIMEOUT_MS: 15000, DEBUG: true };

  function log()  { if ((typeof CONFIG !== 'undefined' && CONFIG && CONFIG.DEBUG) || DEFAULTS.DEBUG) console.log.apply(console, ['[CCST-API]'].concat([].slice.call(arguments))); }
  function warn() { console.warn.apply(console,  ['[CCST-API]'].concat([].slice.call(arguments))); }
  function err()  { console.error.apply(console, ['[CCST-API]'].concat([].slice.call(arguments))); }

  function getCfg(key) {
    if (typeof CONFIG !== 'undefined' && CONFIG !== null && CONFIG[key] !== undefined) return CONFIG[key];
    return DEFAULTS[key];
  }

  function isFileProtocol() { return window.location.protocol === 'file:'; }

  function looksLikeAppsScriptUrl(url) {
    return typeof url === 'string' && url.indexOf('https://script.google.com/') === 0 && url.indexOf('/macros/') !== -1;
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    let timedOut = false;
    const timer = setTimeout(function () { timedOut = true; if (controller) controller.abort(); }, timeoutMs);
    const opts = Object.assign({}, options);
    if (controller) opts.signal = controller.signal;
    if (opts.redirect === undefined) opts.redirect = 'follow';
    return fetch(url, opts)
      .then(function (r) { clearTimeout(timer); return r; })
      .catch(function (e) { clearTimeout(timer); if (timedOut) throw new Error('Request timed out after ' + timeoutMs + 'ms'); throw e; });
  }

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
      window[cbName] = function (data) { if (settled) return; settled = true; cleanup(); resolve(data); };
      const timer = setTimeout(function () { if (settled) return; settled = true; cleanup(); reject(new Error('JSONP request timed out')); }, timeoutMs);
      script = document.createElement('script');
      script.async = true;
      script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + cbName;
      script.onerror = function () { if (settled) return; settled = true; cleanup(); reject(new Error('JSONP <script> failed to load')); };
      document.head.appendChild(script);
    });
  }

  function friendlyError(action, lastError) {
    const what = 'Could not reach the voting server while "' + action + '"';
    const why  = (lastError && lastError.message) ? lastError.message : 'network error';
    const tips = [];
    if (isFileProtocol()) tips.push('You opened the page from your disk (file://). Host the page on a web server.');
    tips.push('Make sure the Apps Script deployment has "Who has access" set to "Anyone".');
    tips.push('Make sure the API_URL matches the current deployment URL.');
    return what + ' — ' + why + '.\n\nHow to fix:\n • ' + tips.join('\n • ');
  }

  async function callApi(action, data, method) {
    data = data || {};
    method = (method || 'POST').toUpperCase();
    const isGet = method === 'GET';

    if (typeof CONFIG === 'undefined' || CONFIG === null || !CONFIG.API_URL) {
      return { success: false, message: 'CONFIG.API_URL is missing. Make sure the inline CONFIG script appears before api.js.' };
    }
    if (!looksLikeAppsScriptUrl(CONFIG.API_URL)) {
      return { success: false, message: 'CONFIG.API_URL is not a Google Apps Script URL. Current value: ' + CONFIG.API_URL };
    }

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

    const strategies = [];

    strategies.push({
      name: 'direct',
      run: function () {
        const opts = isGet ? { method: 'GET' } : { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body };
        return fetchWithTimeout(url, opts, getCfg('TIMEOUT_MS')).then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText);
          return res.text();
        }).then(function (txt) {
          try { return JSON.parse(txt); }
          catch (e) { throw new Error('Backend returned non-JSON: ' + txt.substring(0, 120)); }
        });
      }
    });

    if (isGet) {
      strategies.push({ name: 'jsonp', run: function () { return jsonpRequest(url); } });
    }

    const proxy = getCfg('CORS_PROXY');
    if (proxy) {
      strategies.push({
        name: 'cors-proxy',
        run: function () {
          return fetchWithTimeout(proxy + encodeURIComponent(url), { method: 'GET' }, getCfg('TIMEOUT_MS'))
            .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); });
        }
      });
    }

    let lastErr = null;
    for (let i = 0; i < strategies.length; i++) {
      const s = strategies[i];
      try { log('Trying', s.name, '->', action); const result = await s.run(); log('  ✓', s.name, 'succeeded'); return result; }
      catch (e) { lastErr = e; warn('  ✗', s.name, 'failed:', e.message || e); }
    }
    err('All strategies failed for', action, lastErr);
    return { success: false, message: friendlyError(action, lastErr) };
  }

  async function checkAdminPassword(password)             { return callApi('checkAdminPassword', { password: password }, 'POST'); }
  async function getAdminCandidateList()                  { return callApi('getAdminCandidateList', {}, 'POST'); }
  async function addCandidateWithFile(pwd, pos, name, prog, fileData, imgUrl) { return callApi('addCandidateWithFile', { adminPassword: pwd, position: pos, name: name, program: prog, fileData: fileData, imgUrl: imgUrl }, 'POST'); }
  async function updateCandidate(pwd, rowIndex, pos, name, prog) { return callApi('updateCandidate', { adminPassword: pwd, rowIndex: rowIndex, position: pos, name: name, program: prog }, 'POST'); }
  async function deleteCandidate(pwd, rowIndex)           { return callApi('deleteCandidate', { adminPassword: pwd, rowIndex: rowIndex }, 'POST'); }
  async function deletePosition(pwd, posName)             { return callApi('deletePosition', { adminPassword: pwd, positionName: posName }, 'POST'); }
  async function getBallotData()                          { return callApi('getBallotData', {}, 'GET'); }
  async function submitVotes(voterName, studentId, selections, votedNone) { return callApi('submitVotes', { voterName: voterName, studentId: studentId, selections: selections, votedNone: votedNone }, 'POST'); }
  async function getRealtimeTally()                       { return callApi('getRealtimeTally', {}, 'GET'); }
  async function verifyVoter(studentId, fullName, votingPin) { return callApi('verifyVoter', { studentId: studentId, fullName: fullName, votingPin: votingPin }, 'POST'); }
  async function submitVotesWithVerification(voterName, studentId, selections, votedNone, voterRowIndex) {
    return callApi('submitVotesWithVerification', { voterName: voterName, studentId: studentId, selections: selections, votedNone: votedNone, voterRowIndex: voterRowIndex }, 'POST');
  }

  async function pingApi() {
    const base = (typeof CONFIG !== 'undefined' && CONFIG !== null && CONFIG.API_URL) ? CONFIG.API_URL : null;
    const out = { apiUrl: base, apiUrlLooksValid: looksLikeAppsScriptUrl(base), pageProtocol: window.location.protocol, isFileProtocol: isFileProtocol(), corsProxyConfigured: !!getCfg('CORS_PROXY'), strategies: {} };
    if (!base) { out.error = 'CONFIG.API_URL is missing'; return out; }
    try { const r = await fetchWithTimeout(base + '?action=ping', { method: 'GET' }, 5000); out.strategies.direct = { ok: r.ok, status: r.status }; }
    catch (e) { out.strategies.direct = { ok: false, error: e.message }; }
    try { const data = await jsonpRequest(base + '?action=ping'); out.strategies.jsonp = { ok: true, sample: data }; }
    catch (e) { out.strategies.jsonp = { ok: false, error: e.message }; }
    if (getCfg('CORS_PROXY')) {
      try { const r = await fetchWithTimeout(getCfg('CORS_PROXY') + encodeURIComponent(base + '?action=ping'), { method: 'GET' }, 5000); out.strategies.corsProxy = { ok: r.ok, status: r.status }; }
      catch (e) { out.strategies.corsProxy = { ok: false, error: e.message }; }
    }
    return out;
  }

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
  window.verifyVoter            = verifyVoter;
  window.submitVotesWithVerification = submitVotesWithVerification;
})();