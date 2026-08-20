// =====================================================================
// config.js — CCST Elections
// =====================================================================
//
// If the user reports "Failed to fetch" / "TypeError: Failed to fetch",
// the most common fix is to enable a CORS proxy below OR redeploy the
// Apps Script as "Who has access: Anyone".
//
// =====================================================================

const CONFIG = {
  // -------------------------------------------------------------------
  // 1) YOUR APPS SCRIPT DEPLOYMENT URL
  // -------------------------------------------------------------------
  // Get this from:  Apps Script editor → Deploy → Manage deployments
  //                 → copy the "Web app URL" of the *latest* deployment.
  //
  // IMPORTANT: the deployment must have:
  //   • Execute as:  Me
  //   • Who has access:  Anyone     <-- this is the one that fixes "Failed to fetch"
  //
  API_URL: 'https://script.google.com/macros/s/AKfycbxLi1e_sS-JTmDR8N51oAjUJQs7PchAmL-4Ub-EYJhIGTBPYQvlzl6mXVOGpc2cIZC6/exec',

  // -------------------------------------------------------------------
  // 2) CORS PROXY (optional fallback)
  // -------------------------------------------------------------------
  // If your page is hosted on a different origin (e.g. GitHub Pages)
  // and the Apps Script deployment is throwing CORS errors, the
  // api.js will automatically try one of these proxies as a backup.
  //
  // Uncomment ONE of the lines below to enable the proxy fallback:
  //
  // CORS_PROXY: 'https://corsproxy.io/?',
  // CORS_PROXY: 'https://api.allorigins.win/raw?url=',
  // CORS_PROXY: 'https://api.codetabs.com/v1/proxy?quest=',

  CORS_PROXY: null,

  // -------------------------------------------------------------------
  // 3) TUNING
  // -------------------------------------------------------------------
  TIMEOUT_MS: 15000,   // per-request timeout
  DEBUG: true          // set to false in production
};
