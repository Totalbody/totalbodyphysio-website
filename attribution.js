/* ─────────────────────────────────────────────────────────────────────
   Traffic source → Cliniko booking links

   On arrival, work out where this visit came from and keep it in
   sessionStorage (first touch for the visit — later pages don't change it):

     URL has gclid                         → google / cpc
     URL has utm_source and/or utm_medium  → those values
     referrer is google. / bing. / yahoo.  → that engine / organic
     referrer is any other site            → its domain / referral
     no referrer (or our own site)         → direct / none

   Then every link to total-body-physio.au1.cliniko.com gets utm_source and
   utm_medium added — Book buttons, the team pop-ups' "Book with …" button
   (its link is set when it opens) and any booking link Jenny shows. A link
   that already has a utm_source or utm_medium is left alone. Parameters are
   appended to the end of the link, so anything already there — _gl, gclid,
   business_id — is kept exactly as it was.

   window.TBPAttribution.get()        → { utm_source, utm_medium, … }
   window.TBPAttribution.decorate(url) → url with the UTMs added
   ───────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var KEY = 'tbp_attribution';
  var BOOKING_HOST = 'total-body-physio.au1.cliniko.com';
  var OWN_SITE = /(^|\.)totalbodyphysio\.co\.nz$/i;

  function storage() {
    try { var s = window.sessionStorage; s.getItem(KEY); return s; } catch (e) { return null; }
  }
  var clip = function (v) { return String(v).trim().slice(0, 100); };

  function classify() {
    var q = null;
    try { q = new URLSearchParams(window.location.search); } catch (e) {}
    if (q && q.get('gclid')) return { utm_source: 'google', utm_medium: 'cpc' };

    var src = q && q.get('utm_source'), med = q && q.get('utm_medium');
    if ((src && src.trim()) || (med && med.trim())) {
      var tagged = {};
      if (src && src.trim()) tagged.utm_source = clip(src);
      if (med && med.trim()) tagged.utm_medium = clip(med);
      return tagged;
    }

    var host = '';
    try { host = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : ''; } catch (e) {}
    // Arriving from one of our own pages with nothing saved (e.g. a new tab)
    // says nothing about where the visit began.
    if (!host || host === window.location.hostname.toLowerCase() || OWN_SITE.test(host)) {
      return { utm_source: 'direct', utm_medium: 'none' };
    }
    // "(^|.)google." also catches the Google app (com.google.android.googlequicksearchbox).
    var engine = /(^|\.)google\./.test(host) ? 'google'
      : /(^|\.)bing\./.test(host) ? 'bing'
      : /(^|\.)yahoo\./.test(host) ? 'yahoo' : null;
    if (engine) return { utm_source: engine, utm_medium: 'organic' };
    return { utm_source: host.replace(/^www\./, ''), utm_medium: 'referral' };
  }

  // First touch for this visit: computed once, then read back on every page.
  var store = storage();
  var attribution = null;
  if (store) {
    try { attribution = JSON.parse(store.getItem(KEY) || 'null'); } catch (e) { attribution = null; }
  }
  if (!attribution || (!attribution.utm_source && !attribution.utm_medium)) {
    attribution = classify();
    attribution.landing_page = window.location.pathname;
    attribution.first_seen = new Date().toISOString();
    if (store) { try { store.setItem(KEY, JSON.stringify(attribution)); } catch (e) {} }
  }

  function isBookingLink(href) {
    try { return new URL(href, window.location.href).hostname.toLowerCase() === BOOKING_HOST; } catch (e) { return false; }
  }
  function hasUtm(href) {
    var query = String(href).split('#')[0].split('?')[1] || '';
    return /(^|&)utm_(source|medium)=/i.test(query);
  }

  // Appended as text rather than rebuilt with URLSearchParams, so existing
  // parameters (_gl's encoding in particular) come through byte for byte.
  function decorate(href) {
    if (!href || !isBookingLink(href) || hasUtm(href)) return href;
    var add = [];
    if (attribution.utm_source) add.push('utm_source=' + encodeURIComponent(attribution.utm_source));
    if (attribution.utm_medium) add.push('utm_medium=' + encodeURIComponent(attribution.utm_medium));
    if (!add.length) return href;
    var hashAt = href.indexOf('#');
    var base = hashAt >= 0 ? href.slice(0, hashAt) : href;
    var hash = hashAt >= 0 ? href.slice(hashAt) : '';
    var joiner = base.indexOf('?') < 0 ? '?' : (/[?&]$/.test(base) ? '' : '&');
    return base + joiner + add.join('&') + hash;
  }

  function decorateLink(a) {
    if (!a || a.tagName !== 'A') return;
    var href = a.getAttribute('href');
    var next = decorate(href);
    if (next !== href) a.setAttribute('href', next);
  }
  function decorateWithin(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.tagName === 'A') decorateLink(root);
    var links = root.querySelectorAll('a[href*="' + BOOKING_HOST + '"]');
    for (var i = 0; i < links.length; i++) decorateLink(links[i]);
  }

  // Links on the page now, links added later (Jenny's messages), and links
  // whose href changes later (the team pop-up's Book button).
  function start() {
    decorateWithin(document);
    if (window.MutationObserver) {
      new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          var r = records[i];
          if (r.type === 'attributes') decorateLink(r.target);
          else for (var j = 0; j < r.addedNodes.length; j++) decorateWithin(r.addedNodes[j]);
        }
      }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['href'] });
    }
  }
  // Belt and braces: check the link again as it's pressed. Capture phase, so
  // this runs before Google's tag adds _gl, which keeps what's already there.
  ['mousedown', 'touchstart', 'click', 'auxclick', 'keydown'].forEach(function (type) {
    document.addEventListener(type, function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (a) decorateLink(a);
    }, { capture: true, passive: true });
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.TBPAttribution = {
    get: function () { return { utm_source: attribution.utm_source, utm_medium: attribution.utm_medium, landing_page: attribution.landing_page, first_seen: attribution.first_seen }; },
    decorate: decorate,
  };
})();
