// SPA renderer for vrfy.lol — dark-mode-first, green accent, design system compliant
// POST-only email validation: input → fetch POST → render JSON result

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderPage(path: string, nonce: string): string {
  const title = pageTitle(path);
  const desc = 'Know everything DNS can tell you about an email address. Free, open-source, no accounts, no tracking.';
  const nonceAttr = ` nonce="${nonce}"`;

  let bodyContent: string;
  if (path === '/about') bodyContent = aboutPage();
  else if (path === '/api/docs') bodyContent = docsPage();
  else if (path === '/privacy') bodyContent = privacyPage();
  else if (path === '/terms') bodyContent = termsPage();
  else if (path === '/status') bodyContent = statusPage();
  else if (path === '/usage') bodyContent = usagePage();
  else if (path === '/cli') bodyContent = cliPage();
  else if (path === '/pow') bodyContent = powPage();
  else bodyContent = landingPage();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${path === '/usage' ? '<meta name="robots" content="noindex, nofollow">\n' : ''}<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="https://vrfy.lol${path === '/' ? '' : esc(path)}">
<meta name="twitter:card" content="summary">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="canonical" href="https://vrfy.lol${path === '/' ? '' : esc(path)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script type="application/ld+json"${nonceAttr}>${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'vrfy.lol',
    url: 'https://vrfy.lol',
    description: 'Email address validation API. No SMTP probes. No API keys. POST-only.',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Any',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    author: { '@type': 'Organization', name: '.lol tools', url: 'https://yoke.lol/tools' },
  })}</script>
${styles()}
</head>
<body data-theme="dark">
<a href="#main" class="skip-nav">Skip to content</a>
<div class="theme-toggle">
  <button class="theme-opt active" data-t="dark">Dark</button>
  <button class="theme-opt" data-t="light">Light</button>
</div>
<div class="page">
  <header class="hdr">
    <a href="/" class="logo">vrfy<span>.lol</span></a>
    <span class="tag">email validation, no SMTP probes</span>
  </header>
  <div class="input-wrap">
    <form id="vrfyForm" onsubmit="return false">
      <span class="p">$</span>
      <span class="cm">vrfy</span>
      <span class="dm">&nbsp;▸&nbsp;</span>
      <input class="di" id="emailInput" type="email" placeholder="user@example.com" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" inputmode="email" aria-label="Email to validate">
      <button type="submit" class="submit-btn" aria-label="Validate">→</button>
    </form>
    <span class="cur" aria-hidden="true"></span>
  </div>
  <div class="mode-toggle">
    <button class="mode-opt active" data-m="full">Full</button>
    <button class="mode-opt" data-m="quick">Quick</button>
  </div>
  <main id="main" role="main">
    ${bodyContent}
  </main>
  ${footer()}
</div>
${scripts(nonce)}
</body>
</html>`;
}

function pageTitle(path: string): string {
  switch (path) {
    case '/about': return 'About — vrfy.lol';
    case '/api/docs': return 'API Docs — vrfy.lol';
    case '/privacy': return 'Privacy — vrfy.lol';
    case '/terms': return 'Terms of Use — vrfy.lol';
    case '/status': return 'Status — vrfy.lol';
    case '/usage': return 'Usage — vrfy.lol';
    case '/cli': return 'CLI — vrfy.lol';
    case '/pow': return 'Proof of Work — vrfy.lol';
    default: return 'vrfy.lol — Email validation, no SMTP probes.';
  }
}

/* ── Styles ─────────────────────────────────────────────────────────── */

function styles(): string {
  return `<style>
:root {
  --bg: #0d1117; --surface: #161b22; --border: #30363d;
  --text: #c9d1d9; --text-bright: #f0f6fc; --text-muted: #484f58;
  --accent: #38d9a9; --accent-dim: rgba(56,217,169,0.15);
  --green: #3fb950; --yellow: #d29922; --red: #f85149; --blue: #58a6ff;
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
}
[data-theme="light"] {
  --bg: #ffffff; --surface: #f6f8fa; --border: #d0d7de;
  --text: #1f2328; --text-bright: #0d1117; --text-muted: #656d76;
  --accent: #0d9668; --accent-dim: rgba(13,150,104,0.1);
  --green: #1a7f37; --yellow: #9a6700; --red: #cf222e; --blue: #0969da;
}
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html { font-size: 16px; }
body {
  font-family: var(--font-sans); background: var(--bg); color: var(--text);
  min-height: 100vh; line-height: 1.5; -webkit-font-smoothing: antialiased;
}
.skip-nav {
  position: absolute; left: -999px; top: 4px; z-index: 100;
  background: var(--accent); color: #000; padding: 4px 12px; border-radius: 4px;
  font-size: 13px; text-decoration: none;
}
.skip-nav:focus { left: 8px; }
.theme-toggle {
  position: fixed; top: 12px; right: 12px; z-index: 50;
  display: flex; gap: 2px; background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px; padding: 2px;
}
.theme-opt {
  font-family: var(--font-mono); font-size: 11px; padding: 3px 8px;
  border: none; border-radius: 4px; cursor: pointer;
  background: transparent; color: var(--text-muted); transition: all .15s;
}
.theme-opt.active { background: var(--accent-dim); color: var(--accent); }
.mode-toggle {
  display: flex; gap: 2px; background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px; padding: 2px; margin-bottom: 1.5rem; width: fit-content;
}
.mode-opt {
  font-family: var(--font-mono); font-size: 11px; padding: 3px 10px;
  border: none; border-radius: 4px; cursor: pointer;
  background: transparent; color: var(--text-muted); transition: all .15s;
}
.mode-opt.active { background: var(--accent-dim); color: var(--accent); }
.progress-bar {
  margin-bottom: 1rem;
}
.progress-stages {
  display: flex; gap: 2px; margin-bottom: 0.5rem;
}
.progress-stage {
  flex: 1; height: 4px; border-radius: 2px;
  background: var(--border); transition: background .3s;
}
.progress-stage.done { background: var(--accent); }
.progress-stage.active { background: var(--accent); animation: pulse-bar 0.8s ease-in-out infinite; }
.progress-label {
  font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted);
}
@keyframes pulse-bar { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
.page { max-width: 720px; margin: 0 auto; padding: 2rem 1.5rem 3rem; }
.hdr { margin-bottom: 1.5rem; }
.logo {
  font-family: var(--font-mono); font-size: 2rem; font-weight: 700;
  color: var(--text-bright); text-decoration: none;
}
.logo span { color: var(--accent); }
.tag {
  display: block; font-family: var(--font-mono); font-size: 0.8rem;
  color: var(--text-muted); margin-top: 0.15rem;
}
.input-wrap {
  display: flex; align-items: center; gap: 0;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1.5rem;
  font-family: var(--font-mono); font-size: 0.95rem;
  transition: border-color .15s;
}
.input-wrap:focus-within { border-color: var(--accent); }
.p { color: var(--accent); font-weight: 700; }
.cm { color: var(--text-bright); font-weight: 600; }
.dm { color: var(--text-muted); }
.di {
  flex: 1; background: transparent; border: none; outline: none;
  font-family: var(--font-mono); font-size: 0.95rem; color: var(--text-bright);
  caret-color: var(--accent);
}
.di::placeholder { color: var(--text-muted); }
.cur { display: none; }
.submit-btn {
  background: none; border: none; color: var(--accent); cursor: pointer;
  font-family: var(--font-mono); font-size: 1.1rem; font-weight: 700;
  padding: 0 0.25rem 0 0.5rem; line-height: 1; transition: color .15s;
}
.submit-btn:hover { color: var(--text-bright); }

/* Result area */
#result { margin-top: 0; }
.result-loading {
  text-align: center; padding: 2rem; color: var(--text-muted);
  font-family: var(--font-mono); font-size: 0.85rem;
}
.result-error {
  background: rgba(248,81,73,0.1); border: 1px solid var(--red);
  border-radius: 8px; padding: 1rem 1.25rem; color: var(--red);
  font-family: var(--font-mono); font-size: 0.85rem;
}

/* Action hero */
.action-hero {
  display: flex; align-items: center; gap: 1rem;
  padding: 1.25rem 1.5rem; border-radius: 8px; margin-bottom: 1rem;
  background: var(--surface); border: 1px solid var(--border);
}
.action-badge {
  font-family: var(--font-mono); font-weight: 700; font-size: 0.85rem;
  padding: 0.3rem 0.75rem; border-radius: 4px; text-transform: uppercase;
  letter-spacing: 0.05em;
}
.action-allow { background: rgba(63,185,80,0.15); color: var(--green); }
.action-verify { background: rgba(210,153,34,0.15); color: var(--yellow); }
.action-block { background: rgba(248,81,73,0.15); color: var(--red); }
.action-email {
  font-family: var(--font-mono); font-size: 0.95rem; color: var(--text-bright);
  word-break: break-all;
}
.action-confidence {
  margin-left: auto; font-family: var(--font-mono); font-size: 0.75rem;
  color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;
  white-space: nowrap;
}

/* Signal sections */
.signal-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;
  margin-bottom: 1rem;
}
@media (max-width: 560px) { .signal-grid { grid-template-columns: 1fr; } }
.signal-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px; padding: 0.75rem 1rem;
  display: flex; align-items: center; gap: 0.6rem;
}
.signal-icon { font-size: 1rem; flex-shrink: 0; width: 1.2rem; text-align: center; }
.signal-label {
  font-family: var(--font-mono); font-size: 0.8rem; color: var(--text);
}
.signal-value {
  margin-left: auto; font-family: var(--font-mono); font-size: 0.75rem;
  color: var(--text-muted); white-space: nowrap;
}
.signal-card.good { border-left: 3px solid var(--green); }
.signal-card.warn { border-left: 3px solid var(--yellow); }
.signal-card.bad { border-left: 3px solid var(--red); }
.signal-card.info { border-left: 3px solid var(--blue); }

/* Provider card */
.provider-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px; padding: 0.75rem 1rem; margin-bottom: 1rem;
  font-family: var(--font-mono); font-size: 0.8rem;
}
.provider-card .provider-name { color: var(--text-bright); font-weight: 600; }
.provider-card .provider-detail { color: var(--text-muted); margin-top: 0.25rem; }

/* Typo suggestion */
.typo-suggestion {
  background: rgba(210,153,34,0.1); border: 1px solid var(--yellow);
  border-radius: 6px; padding: 0.75rem 1rem; margin-bottom: 1rem;
  font-family: var(--font-mono); font-size: 0.85rem;
}
.typo-suggestion a {
  color: var(--yellow); cursor: pointer; text-decoration: underline;
}

/* Raw JSON toggle */

/* Security & Heuristics sections */
.section-header {
  font-family: var(--font-mono); font-size: 0.75rem; font-weight: 600;
  color: var(--text-bright); text-transform: uppercase; letter-spacing: 0.05em;
  margin: 1rem 0 0.5rem;
}
.detail-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.5rem; margin-bottom: 1rem;
}
.detail-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px; padding: 0.5rem 0.6rem;
  font-family: var(--font-mono); font-size: 0.75rem;
}
.detail-card .detail-label { color: var(--text-muted); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.03em; }
.detail-card .detail-value { color: var(--text-bright); margin-top: 0.15rem; }
.detail-card.detail-good { border-left: 3px solid var(--green); }
.detail-card.detail-bad { border-left: 3px solid var(--red); }
.detail-card.detail-warn { border-left: 3px solid var(--yellow); }
.detail-card.detail-info { border-left: 3px solid var(--accent); }
.grade-badge {
  display: inline-block; font-family: var(--font-mono); font-weight: 700;
  font-size: 1.1rem; padding: 0.15rem 0.5rem; border-radius: 4px;
  background: var(--surface); border: 1px solid var(--border);
}
.grade-A, .grade-Ap { color: var(--green); border-color: var(--green); }
.grade-B { color: #5dade2; border-color: #5dade2; }
.grade-C { color: var(--yellow); border-color: var(--yellow); }
.grade-D, .grade-F { color: var(--red); border-color: var(--red); }

.raw-toggle {
  font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted);
  background: none; border: 1px solid var(--border); border-radius: 4px;
  padding: 0.25rem 0.6rem; cursor: pointer; margin-bottom: 0.5rem;
}
.raw-toggle:hover { border-color: var(--accent); color: var(--accent); }
.raw-json {
  display: none; background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px; padding: 1rem; margin-bottom: 1rem;
  font-family: var(--font-mono); font-size: 0.75rem; color: var(--text);
  overflow-x: auto; white-space: pre-wrap; word-break: break-all;
}
.raw-json.open { display: block; }

/* Meta bar */
.meta-bar {
  display: flex; gap: 1rem; flex-wrap: wrap;
  font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-muted);
  padding-top: 0.5rem; border-top: 1px solid var(--border);
}

/* Landing page */
.landing-curl {
  font-family: var(--font-mono); font-size: 0.8rem; color: var(--accent);
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; padding: 1rem 1.25rem; margin: 1.5rem 0;
  white-space: pre-wrap; word-break: break-all; position: relative;
}
.landing-curl .prompt { color: var(--accent); }
.landing-curl .str { color: var(--yellow); }
.copy-btn {
  position: absolute; top: 8px; right: 8px;
  font-family: var(--font-mono); font-size: 0.65rem; color: var(--text-muted);
  background: var(--bg); border: 1px solid var(--border); border-radius: 4px;
  padding: 2px 8px; cursor: pointer;
}
.copy-btn:hover { border-color: var(--accent); color: var(--accent); }
.badges {
  display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 1.5rem 0;
}
.badge {
  font-family: var(--font-mono); font-size: 0.75rem;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 4px; padding: 0.25rem 0.6rem; color: var(--text-muted);
}
.features {
  display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;
  margin: 1.5rem 0;
}
@media (max-width: 560px) { .features { grid-template-columns: 1fr; } }
.feature {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px; padding: 0.75rem 1rem;
}
.feature-title {
  font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-bright);
  font-weight: 600; margin-bottom: 0.25rem;
}
.feature-desc { font-size: 0.8rem; color: var(--text-muted); }

/* Content pages */
.content-page { max-width: 640px; }
.content-page h2 {
  font-family: var(--font-mono); font-size: 1.1rem; color: var(--text-bright);
  margin: 2rem 0 0.75rem; padding-bottom: 0.25rem; border-bottom: 1px solid var(--border);
}
.content-page h3 {
  font-family: var(--font-mono); font-size: 0.9rem; color: var(--text-bright);
  margin: 1.5rem 0 0.5rem;
}
.content-page p { margin-bottom: 0.75rem; font-size: 0.9rem; line-height: 1.6; }
.content-page ul { margin: 0.5rem 0 1rem 1.5rem; font-size: 0.9rem; }
.content-page li { margin-bottom: 0.35rem; }
.content-page code {
  font-family: var(--font-mono); font-size: 0.8rem;
  background: var(--surface); border: 1px solid var(--border);
  padding: 0.1rem 0.35rem; border-radius: 3px;
}
.content-page pre {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px; padding: 1rem; margin: 0.75rem 0;
  font-family: var(--font-mono); font-size: 0.8rem;
  overflow-x: auto; white-space: pre-wrap; word-break: break-all;
}
.content-page a { color: var(--accent); text-decoration: none; }
.content-page a:hover { text-decoration: underline; }
.content-page table {
  width: 100%; border-collapse: collapse; margin: 0.75rem 0;
  font-size: 0.85rem;
}
.content-page th, .content-page td {
  text-align: left; padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border);
}
.content-page th {
  font-family: var(--font-mono); font-size: 0.75rem;
  color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;
}

/* Footer */
.footer {
  margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--border);
  text-align: center; font-size: 0.8rem;
}
.footer-links {
  display: flex; justify-content: center; gap: 1.25rem; flex-wrap: wrap;
  margin-bottom: 0.75rem;
}
.footer-links a { color: var(--text-muted); text-decoration: none; }
.footer-links a:hover { color: var(--accent); }
.footer-tagline {
  color: var(--text-muted); font-size: 0.75rem; margin-bottom: 0.5rem;
}
.footer-tagline a { color: var(--accent); text-decoration: none; }
.footer-tagline a:hover { text-decoration: underline; }
.footer-family {
  display: flex; justify-content: center; gap: 1rem; flex-wrap: wrap;
  font-family: var(--font-mono); font-size: 0.75rem; margin-bottom: 0.75rem;
}
.footer-family a { color: var(--text-muted); text-decoration: none; }
.footer-family a:hover { color: var(--accent); }
.yoke-badge { display: inline-block; margin-top: 0.25rem; }
</style>`;
}

/* ── Scripts ────────────────────────────────────────────────────────── */

function scripts(nonce: string): string {
  return `<script nonce="${nonce}">
(function(){
  // Theme toggle
  const saved = localStorage.getItem('vrfy-theme');
  if (saved) document.body.setAttribute('data-theme', saved);
  document.querySelectorAll('.theme-opt').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.t === (saved || 'dark'));
    btn.addEventListener('click', function() {
      document.body.setAttribute('data-theme', this.dataset.t);
      localStorage.setItem('vrfy-theme', this.dataset.t);
      document.querySelectorAll('.theme-opt').forEach(function(b) {
        b.classList.toggle('active', b.dataset.t === btn.dataset.t);
      });
    });
  });

  // Client-side nav for static pages
  var vrfyMode = localStorage.getItem('vrfy-mode') || 'full';
  document.querySelectorAll('.mode-opt').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.m === vrfyMode);
    btn.addEventListener('click', function() {
      vrfyMode = this.dataset.m;
      localStorage.setItem('vrfy-mode', vrfyMode);
      document.querySelectorAll('.mode-opt').forEach(function(b) {
        b.classList.toggle('active', b.dataset.m === vrfyMode);
      });
    });
  });

  // Client-side nav for static pages
  document.addEventListener('click', function(e) {
    var a = e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (href && href.startsWith('/') && !href.startsWith('//')) {
      e.preventDefault();
      history.pushState(null, '', href);
      loadPage(href);
    }
  });
  window.addEventListener('popstate', function() { loadPage(location.pathname); });

  function loadPage(path) {
    fetch(path, { headers: { 'Accept': 'text/html' } })
      .then(function(r) { return r.text(); })
      .then(function(html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var main = doc.getElementById('main');
        if (main) document.getElementById('main').innerHTML = main.innerHTML;
        document.title = doc.title || 'vrfy.lol';
        window.scrollTo(0, 0);
        runStatusCheck();
        initUsagePage();
      });
  }

  // ── Usage page ──
  function initUsagePage() {
    if (!document.getElementById('usageContent')) return;
    loadUsageData();
  }

  function loadUsageData() {
    fetch('/api/usage', { cache: 'no-store' })
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + (r.status === 401 ? ' — invalid admin key' : ''));
        return r.json();
      })
      .then(function(data) {
        document.getElementById('usageContent').style.display = '';
        document.getElementById('usageError').style.display = 'none';
        renderUsage(data);
      })
      .catch(function(err) {
        document.getElementById('usageContent').style.display = 'none';
        document.getElementById('usageError').style.display = '';
        document.getElementById('usageErrorMsg').textContent = err.message || 'Failed to load';
      });
  }

  function renderUsage(data) {
    var xon = data.xon || {};
    var today = xon.today || {};
    var calls = today.calls || 0;
    var hits = today.hits || 0;
    var errors = today.errors || 0;
    var skipped = today.skipped || 0;

    setCheck('xonCalls', String(calls), calls > 0 ? 'pass' : '');
    setCheck('xonHits', String(hits), hits > 0 ? 'pass' : '');
    setCheck('xonErrors', String(errors), errors > 0 ? 'fail' : 'pass');
    setCheck('xonSkipped', String(skipped), skipped > 0 ? 'warn' : 'pass');
    var rate = calls > 0 ? ((hits / calls) * 100).toFixed(1) + '%' : '—';
    setCheck('xonHitRate', rate, calls > 0 ? 'pass' : '');

    // History table
    var rows = document.getElementById('historyRows');
    if (rows && xon.history) {
      rows.innerHTML = '';
      xon.history.forEach(function(day) {
        var row = document.createElement('div');
        row.className = 'status-info-row';
        row.innerHTML = '<span style="flex:1;">' + day.date + '</span>' +
          '<span style="flex:0.6;text-align:right;">' + (day.calls || 0) + '</span>' +
          '<span style="flex:0.6;text-align:right;">' + (day.hits || 0) + '</span>' +
          '<span style="flex:0.6;text-align:right;">' + (day.errors || 0) + '</span>' +
          '<span style="flex:0.6;text-align:right;">' + (day.skipped || 0) + '</span>';
        rows.appendChild(row);
      });
    }

    // Rate limits
    var rlInfo = document.getElementById('rateLimitText');
    if (rlInfo) {
      if (xon.rate_limits && Object.keys(xon.rate_limits).length > 0) {
        var parts = [];
        for (var k in xon.rate_limits) { parts.push(k + ': ' + xon.rate_limits[k]); }
        rlInfo.textContent = parts.join(' · ');
      } else {
        rlInfo.textContent = 'No rate limit headers returned by upstream (XON does not currently send them)';
      }
    }

    // Signals list
    var list = document.getElementById('signalsList');
    if (list && data.signals) {
      list.innerHTML = '';
      data.signals.forEach(function(sig) {
        var el = document.createElement('div');
        el.className = 'status-check pass';
        el.innerHTML = '<span class="check-name">' + sig.name + ' <span style="color:var(--text-muted);font-weight:400;">— ' +
          sig.description + '</span></span><span class="check-status">w=' + sig.weight + '</span>';
        list.appendChild(el);
      });
    }
  }

  function setCheck(id, text, cls) {
    var el = document.getElementById(id);
    if (!el) return;
    el.querySelector('.check-status').textContent = text;
    if (cls) el.className = 'status-check ' + cls;
  }

  // ── Status page live check ──
  function runStatusCheck() {
    if (!document.getElementById('statusHero')) return;
    var hero = document.getElementById('statusHero');
    var indicator = hero.querySelector('.status-indicator');
    var statusText = hero.querySelector('.status-text');
    var meta = document.getElementById('statusMeta');
    var checkApi = document.getElementById('checkApi');
    var checkHealth = document.getElementById('checkHealth');
    var checkLatency = document.getElementById('checkLatency');
    var versionEl = document.getElementById('statusVersion');
    var timeEl = document.getElementById('statusTime');

    timeEl.textContent = new Date().toLocaleString();

    var t0 = performance.now();
    fetch('/health', { cache: 'no-store' })
      .then(function(r) {
        var latency = Math.round(performance.now() - t0);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json().then(function(data) {
          // API endpoint: reachable
          checkApi.className = 'status-check pass';
          checkApi.querySelector('.check-status').textContent = '✓ Reachable';

          // Health check: ok
          var healthy = data.status === 'ok';
          checkHealth.className = 'status-check ' + (healthy ? 'pass' : 'fail');
          checkHealth.querySelector('.check-status').textContent = healthy ? '✓ OK' : '✗ ' + (data.status || 'Unknown');

          // Latency
          var latCls = latency < 300 ? 'pass' : latency < 1000 ? 'warn' : 'fail';
          checkLatency.className = 'status-check ' + latCls;
          checkLatency.querySelector('.check-status').textContent = latency + 'ms';

          // Version
          versionEl.textContent = data.version || '—';

          // Overall
          if (healthy && latency < 1000) {
            indicator.className = 'status-indicator operational';
            statusText.textContent = 'All Systems Operational';
            meta.textContent = 'Responded in ' + latency + 'ms';
          } else if (healthy) {
            indicator.className = 'status-indicator degraded';
            statusText.textContent = 'Degraded Performance';
            meta.textContent = 'Responded in ' + latency + 'ms (slow)';
          } else {
            indicator.className = 'status-indicator down';
            statusText.textContent = 'Service Issue Detected';
            meta.textContent = 'Health check returned: ' + (data.status || 'unknown');
          }
        });
      })
      .catch(function(err) {
        checkApi.className = 'status-check fail';
        checkApi.querySelector('.check-status').textContent = '✗ Unreachable';
        checkHealth.className = 'status-check fail';
        checkHealth.querySelector('.check-status').textContent = '✗ Failed';
        checkLatency.className = 'status-check fail';
        checkLatency.querySelector('.check-status').textContent = '—';
        indicator.className = 'status-indicator down';
        statusText.textContent = 'Service Unavailable';
        meta.textContent = err.message || 'Could not reach API';
      });
  }
  runStatusCheck();

  // Form submission
  var form = document.getElementById('vrfyForm');
  var input = document.getElementById('emailInput');
  if (form && input) {
    form.addEventListener('submit', function(e) { e.preventDefault(); doValidate(); });
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); doValidate(); }
    });
  }

  function doValidate() {
    var email = input.value.trim();
    if (!email) return;

    var main = document.getElementById('main');
    var isQuick = vrfyMode === 'quick';

    if (!isQuick) {
      // SSE streaming for full mode
      main.innerHTML = progressHtml('syntax') + '<div class="result-loading">validating ' + escHtml(email) + '…</div>';
      var es = new EventSource('about:blank'); // placeholder, we use fetch
      var resultData = null;

      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, mode: 'full', stream: true })
      }).then(function(r) {
        if (!r.ok) return r.text().then(function(t) { try { throw JSON.parse(t); } catch(e) { throw e; } });
        var reader = r.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';

        function pump() {
          return reader.read().then(function(chunk) {
            if (chunk.done) {
              if (resultData) {
                main.innerHTML = renderResult(resultData);
                bindResultEvents(resultData);
              }
              return;
            }
            buffer += decoder.decode(chunk.value, { stream: true });
            var lines = buffer.split('\\n');
            buffer = lines.pop();
            var eventType = '';
            for (var i = 0; i < lines.length; i++) {
              var line = lines[i];
              if (line.startsWith('event: ')) eventType = line.slice(7);
              else if (line.startsWith('data: ')) {
                var payload = JSON.parse(line.slice(6));
                if (eventType === 'progress') {
                  updateProgress(main, payload);
                } else if (eventType === 'result') {
                  resultData = payload;
                } else if (eventType === 'error') {
                  main.innerHTML = '<div class="result-error">' + escHtml(payload.message || 'Error') + '</div>';
                  return;
                }
              }
            }
            return pump();
          });
        }
        return pump();
      }).catch(function(err) {
        var msg = err.message || err.error || 'Something went wrong';
        main.innerHTML = '<div class="result-error">' + escHtml(msg) + '</div>';
      });
      return;
    }

    // Quick mode — standard JSON
    main.innerHTML = '<div class="result-loading">validating ' + escHtml(email) + '…</div>';

    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ email: email, mode: 'quick' })
    })
    .then(function(r) {
      if (!r.ok) return r.json().then(function(e) { throw e; });
      return r.json();
    })
    .then(function(data) {
      main.innerHTML = renderResult(data);
      bindResultEvents(data);
    })
    .catch(function(err) {
      var msg = err.message || err.error || 'Something went wrong';
      main.innerHTML = '<div class="result-error">' + escHtml(msg) + '</div>';
    });
  }

  var STAGE_ORDER = ['syntax', 'dns', 'security', 'extended'];
  var STAGE_LABELS = { syntax: 'Syntax', dns: 'DNS', security: 'Security', extended: 'Extended' };

  function progressHtml(activeStage) {
    var html = '<div class="progress-bar"><div class="progress-stages">';
    for (var i = 0; i < STAGE_ORDER.length; i++) {
      var s = STAGE_ORDER[i];
      var cls = s === activeStage ? 'active' : '';
      html += '<div class="progress-stage ' + cls + '" data-stage="' + s + '"></div>';
    }
    html += '</div><div class="progress-label" id="progressLabel">' + escHtml(STAGE_LABELS[activeStage] || activeStage) + '…</div></div>';
    return html;
  }

  function updateProgress(main, ev) {
    var label = document.getElementById('progressLabel');
    var stageIdx = STAGE_ORDER.indexOf(ev.stage);
    // Mark completed/skipped stages
    for (var i = 0; i <= stageIdx; i++) {
      var el = main.querySelector('[data-stage="' + STAGE_ORDER[i] + '"]');
      if (el) {
        el.className = 'progress-stage ' + (i < stageIdx ? 'done' : (ev.status === 'complete' || ev.status === 'skipped' ? 'done' : 'active'));
      }
    }
    if (label) {
      var detail = ev.detail ? ' (' + ev.detail + ')' : '';
      if (ev.status === 'running') {
        label.textContent = (STAGE_LABELS[ev.stage] || ev.stage) + '…';
      } else if (ev.status === 'skipped') {
        label.textContent = (STAGE_LABELS[ev.stage] || ev.stage) + ' skipped';
      } else {
        var nextIdx = stageIdx + 1;
        if (nextIdx < STAGE_ORDER.length) {
          label.textContent = (STAGE_LABELS[STAGE_ORDER[nextIdx]] || STAGE_ORDER[nextIdx]) + '…';
        } else {
          label.textContent = 'Assembling results…';
        }
      }
    }
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function renderResult(d) {
    var v = d.validation || {};
    var actionCls = 'action-' + d.action;
    var html = '';

    // Action hero
    html += '<div class="action-hero">';
    html += '<span class="action-badge ' + actionCls + '">' + escHtml(d.action) + '</span>';
    html += '<span class="action-email">' + escHtml(d.email) + '</span>';
    html += '<span class="action-confidence">' + escHtml(d.confidence.replace(/_/g, ' ')) + '</span>';
    html += '</div>';

    // Typo suggestion
    if (v.has_typo && v.typo_suggestion) {
      html += '<div class="typo-suggestion">💡 Did you mean <a data-typo="' + escHtml(v.typo_suggestion) + '">' + escHtml(v.typo_suggestion) + '</a>?</div>';
    }

    // Signal grid
    html += '<div class="signal-grid">';
    html += signalCard(v.syntax_valid, 'Syntax', v.syntax_valid ? 'Valid' : 'Invalid', v.syntax_valid ? 'good' : 'bad');
    html += signalCard(v.mx_found, 'MX Records', v.null_mx ? 'Null MX' : (v.mx_found ? 'Found' : 'Not found'), v.null_mx ? 'bad' : (v.mx_found ? 'good' : 'bad'));
    html += signalCard(!v.disposable, 'Disposable', v.disposable ? 'Yes' : 'No', v.disposable ? 'bad' : 'good');
    html += signalCard(null, 'Privacy Relay', v.privacy_relay ? (v.privacy_relay_service || 'Yes') : 'No', v.privacy_relay ? 'info' : 'good');
    html += signalCard(!v.free_provider, 'Free Provider', v.free_provider ? 'Yes' : 'No', v.free_provider ? 'info' : 'good');
    html += signalCard(!v.role_account, 'Role Account', v.role_account ? 'Yes' : 'No', v.role_account ? 'warn' : 'good');
    html += signalCard(null, 'Subaddress', v.subaddressed ? ('+' + escHtml(v.subaddress_tag || '')) : 'No', v.subaddressed ? 'info' : 'good');
    html += signalCard(!v.has_typo, 'Typo Detected', v.has_typo ? 'Yes' : 'No', v.has_typo ? 'warn' : 'good');
    if (v.is_ip_literal) html += signalCard(null, 'IP Literal', 'Yes', 'warn');
    if (v.is_internationalized) html += signalCard(null, 'Internationalized', 'EAI/IDN', 'info');
    if (v.is_punycode) html += signalCard(null, 'Punycode', 'Yes', 'warn');
    html += '</div>';

    // Provider
    if (v.provider) {
      html += '<div class="provider-card">';
      html += '<div class="provider-name">📧 ' + escHtml(v.provider.name) + '</div>';
      html += '<div class="provider-detail">';
      if (v.provider.catch_all_default) html += 'Catch-all · ';
      html += 'SMTP verification: ' + escHtml(v.provider.smtp_verification);
      if (v.provider.note) html += ' · ' + escHtml(v.provider.note);
      html += '</div></div>';
    }

    // Security posture (Tier 3 — only present in full mode, not quick)
    if (d.security) {
      var sec = d.security;
      var gradeClass = 'grade-' + (sec.grade === 'A+' ? 'Ap' : sec.grade);
      html += '<div class="section-header">🛡 Email Security</div>';
      html += '<div style="margin-bottom:0.5rem"><span class="grade-badge ' + gradeClass + '">' + escHtml(sec.grade) + '</span></div>';
      html += '<div class="detail-grid">';
      html += detailCard('SPF', sec.spf ? 'Present' : 'Missing', sec.spf ? 'good' : 'bad');
      html += detailCard('DMARC', sec.dmarc.found ? (sec.dmarc.policy || 'Present') : 'Missing', sec.dmarc.found ? (sec.dmarc.policy === 'reject' ? 'good' : 'warn') : 'bad');
      html += detailCard('BIMI', sec.bimi ? 'Present' : 'None', sec.bimi ? 'good' : 'info');
      html += detailCard('MTA-STS', sec.mta_sts ? 'Present' : 'None', sec.mta_sts ? 'good' : 'info');
      html += detailCard('TLS-RPT', sec.tls_rpt ? 'Present' : 'None', sec.tls_rpt ? 'good' : 'info');
      html += '</div>';
    }

    // Heuristics (Phase 1 — local computation signals)
    if (d.heuristics) {
      var h = d.heuristics;
      html += '<div class="section-header">🔍 Heuristics</div>';
      html += '<div class="detail-grid">';
      html += detailCard('TLD', escHtml(h.tld), h.risky_tld ? 'bad' : 'good');
      if (h.risky_tld) html += detailCard('Risky TLD', 'Yes', 'bad');
      html += detailCard('MX Class', escHtml(h.mx_provider_class), h.mx_provider_class === 'unknown' ? 'warn' : 'info');
      if (h.mx_security_gateway) html += detailCard('Security Gateway', escHtml(h.mx_security_gateway), 'info');
      html += detailCard('Domain Entropy', h.domain_entropy.toFixed(2), h.entropy_suspicious ? 'bad' : 'good');
      if (h.entropy_suspicious) html += detailCard('Suspicious Entropy', 'Yes', 'bad');
      if (h.spam_trap) html += detailCard('Spam Trap', escHtml(h.spam_trap_pattern || 'Detected'), 'bad');
      html += '</div>';
    }

    // Raw JSON
    html += '<button class="raw-toggle" id="rawToggle">{ } Raw JSON</button>';
    html += '<pre class="raw-json" id="rawJson">' + escHtml(JSON.stringify(d, null, 2)) + '</pre>';

    // Meta bar
    html += '<div class="meta-bar">';
    html += '<span>⏱ ' + d._meta.query_ms + 'ms</span>';
    html += '<span>' + d._meta.signals_positive + '/' + d._meta.signals + ' signals positive</span>';
    html += '<span>v' + escHtml(d._meta.version) + '</span>';
    html += '</div>';

    return '<div id="result">' + html + '</div>';
  }

  function signalCard(good, label, value, cls) {
    var icon = cls === 'good' ? '✓' : cls === 'bad' ? '✗' : cls === 'warn' ? '⚠' : 'ℹ';
    return '<div class="signal-card ' + cls + '">'
      + '<span class="signal-icon">' + icon + '</span>'
      + '<span class="signal-label">' + escHtml(label) + '</span>'
      + '<span class="signal-value">' + escHtml(value) + '</span>'
      + '</div>';
  }

  function detailCard(label, value, cls) {
    return '<div class="detail-card detail-' + cls + '">'
      + '<div class="detail-label">' + escHtml(label) + '</div>'
      + '<div class="detail-value">' + value + '</div>'
      + '</div>';
  }

  function bindResultEvents(data) {
    var toggle = document.getElementById('rawToggle');
    var raw = document.getElementById('rawJson');
    if (toggle && raw) {
      toggle.addEventListener('click', function() { raw.classList.toggle('open'); });
    }
    // Typo link — click to re-validate with the suggestion
    document.querySelectorAll('[data-typo]').forEach(function(a) {
      a.addEventListener('click', function(e) {
        e.preventDefault();
        input.value = this.dataset.typo;
        doValidate();
      });
    });
  }
})();
</script>`;
}

/* ── Page content ───────────────────────────────────────────────────── */

function landingPage(): string {
  const curl = `<span class="prompt">$</span> curl -s -X POST https://vrfy.lol/ \\
  -H <span class="str">"Content-Type: application/json"</span> \\
  -d <span class="str">'{"email":"user@example.com"}'</span> | jq .action`;

  return `<div class="landing-curl"><button class="copy-btn" onclick="navigator.clipboard.writeText('curl -s -X POST https://vrfy.lol/ -H &quot;Content-Type: application/json&quot; -d \\'{&quot;email&quot;:&quot;user@example.com&quot;}\\' | jq .action')">copy</button>${curl}</div>
<div class="badges">
  <span class="badge">POST-only</span>
  <span class="badge">No SMTP</span>
  <span class="badge">No tracking</span>
  <span class="badge"><a href="/pow" style="color:inherit;text-decoration:none;">PoW anti-abuse</a></span>
  <span class="badge">Open source</span>
  <span class="badge">$0 forever</span>
</div>
<div class="features">
  <div class="feature">
    <div class="feature-title">RFC 5321 Syntax</div>
    <div class="feature-desc">Full spec compliance including EAI, IP literals, quoted local parts.</div>
  </div>
  <div class="feature">
    <div class="feature-title">MX &amp; DNS</div>
    <div class="feature-desc">MX records, null MX detection, A/AAAA fallback, domain existence.</div>
  </div>
  <div class="feature">
    <div class="feature-title">Disposable Detection</div>
    <div class="feature-desc">141K+ disposable domains bundled. Wildcard + MX-based detection.</div>
  </div>
  <div class="feature">
    <div class="feature-title">Privacy Relays</div>
    <div class="feature-desc">Apple HME, SimpleLogin, Addy.io, Firefox Relay, DuckDuckGo — classified separately.</div>
  </div>
  <div class="feature">
    <div class="feature-title">Typo Correction</div>
    <div class="feature-desc">Levenshtein + curated map. Suggestions verified against live MX.</div>
  </div>
  <div class="feature">
    <div class="feature-title">Provider ID</div>
    <div class="feature-desc">Google, Microsoft, Proton, Fastmail, and 20+ providers from MX patterns.</div>
  </div>
</div>`;
}

function aboutPage(): string {
  return `<div class="content-page">
<h2>What vrfy.lol is</h2>
<p>vrfy.lol is a free, open-source email address validation API. It tells you everything DNS can reveal about an email address — syntax, deliverability signals, disposable detection, typo correction, provider identification — without ever touching SMTP.</p>

<h2>Why no SMTP?</h2>
<p>Most email validation services charge per-verification for something that's 80% DNS lookups and 20% SMTP <code>RCPT TO</code> — a technique that most modern providers reject. Gmail returns <code>250 OK</code> for everything. Microsoft rate-limits you into oblivion. Yahoo blocks you outright.</p>
<p>vrfy.lol does everything DNS can tell you and is honest about the rest. For most sign-up flows, that's enough. For "does this specific mailbox exist?" — send a verification email. That's always been the only reliable answer.</p>

<h2>Privacy</h2>
<p>Email validation uses <code>POST /</code> exclusively. Email addresses never appear in URLs, server logs, CDN analytics, or browser history. Domain-level results are cached by domain name — no email addresses stored. No analytics, no cookies, no accounts.</p>

<h2>Self-hosting</h2>
<p>Fork the repo and run your own: <code>wrangler deploy</code>. Zero external dependencies for core validation.</p>
<p><a href="https://github.com/yokedotlol/vrfy-lol">github.com/yokedotlol/vrfy-lol</a></p>

<h2>Contact</h2>
<p><a href="mailto:hello@yoke.lol">hello@yoke.lol</a></p>
</div>`;
}

function docsPage(): string {
  return `<div class="content-page">
<h2>API Reference</h2>
<p>All endpoints. No authentication required.</p>

<h3>POST /</h3>
<p>Validate a single email address.</p>
<pre>{
  "email": "user@example.com",
  "quick": false,
  "force": false
}</pre>

<table>
<tr><th>Field</th><th>Type</th><th>Description</th></tr>
<tr><td><code>email</code></td><td>string</td><td>Required. Email address to validate.</td></tr>
<tr><td><code>quick</code></td><td>boolean</td><td>Skip enrichment/security (Tier 1 only). Default false.</td></tr>
<tr><td><code>force</code></td><td>boolean</td><td>Bypass cache. Default false.</td></tr>
<tr><td><code>pow</code></td><td>object</td><td>Proof-of-work solution (for unlimited access). <a href="/pow">See protocol →</a></td></tr>
</table>

<h3>POST /batch</h3>
<p>Validate up to 20 emails in one request.</p>
<pre>{
  "emails": ["user@example.com", "admin@test.org"],
  "quick": false
}</pre>

<h3>GET /health</h3>
<p>Health check. Returns <code>{"status":"ok","version":"1.0.0"}</code>.</p>

<h2>Response</h2>
<p>The response has three top-level fields you care about:</p>
<pre>{
  "email": "user@gmail.com",
  "action": "allow",       // allow | verify | block
  "confidence": "valid",   // valid | likely_valid | risky | invalid | unknown
  "validation": { ... },   // detailed signals
  "_meta": { ... }          // timing, cache status, version
}</pre>

<h3>The action field</h3>
<p>This is the product. One field, three values:</p>
<ul>
<li><strong>allow</strong> — safe to accept. Good syntax, valid MX, not disposable.</li>
<li><strong>verify</strong> — probably fine, but send a confirmation email. Catch-all provider, role account, etc.</li>
<li><strong>block</strong> — reject at signup. Invalid syntax, no MX, disposable, or domain doesn't exist.</li>
</ul>

<h3>Validation signals</h3>
<table>
<tr><th>Signal</th><th>Type</th><th>Description</th></tr>
<tr><td><code>syntax_valid</code></td><td>boolean</td><td>RFC 5321 compliance</td></tr>
<tr><td><code>mx_found</code></td><td>boolean</td><td>Domain has MX records</td></tr>
<tr><td><code>null_mx</code></td><td>boolean</td><td>Domain explicitly refuses email (RFC 7505)</td></tr>
<tr><td><code>disposable</code></td><td>boolean</td><td>Known disposable/temporary domain</td></tr>
<tr><td><code>privacy_relay</code></td><td>boolean</td><td>Apple HME, SimpleLogin, etc. (not disposable)</td></tr>
<tr><td><code>free_provider</code></td><td>boolean</td><td>Gmail, Yahoo, Outlook, etc.</td></tr>
<tr><td><code>role_account</code></td><td>boolean</td><td>admin@, info@, support@, etc.</td></tr>
<tr><td><code>has_typo</code></td><td>boolean</td><td>Domain looks like a typo</td></tr>
<tr><td><code>typo_suggestion</code></td><td>string|null</td><td>Corrected email if typo detected</td></tr>
<tr><td><code>provider</code></td><td>object|null</td><td>Identified email provider with behavior hints</td></tr>
<tr><td><code>subaddressed</code></td><td>boolean</td><td>Contains + tag (e.g. user+tag@)</td></tr>
<tr><td><code>is_ip_literal</code></td><td>boolean</td><td>Domain is an IP literal ([1.1.1.1])</td></tr>
<tr><td><code>is_internationalized</code></td><td>boolean</td><td>Uses internationalized characters (EAI/IDN)</td></tr>
<tr><td><code>is_punycode</code></td><td>boolean</td><td>Domain contains punycode labels (xn--)</td></tr>
<tr><td><code>domain_type</code></td><td>string|null</td><td>&quot;domain&quot; or &quot;ip_literal&quot;</td></tr>
</table>

<h2>Rate Limits</h2>
<p>Free tier: 10 requests/hour + 50/day per IP.</p>
<p>Need more? Solve a proof-of-work challenge (SHA-256 hashcash, difficulty 20, ~2–8s CPU) and include the solution in your request. Unlimited with valid PoW. <a href="/pow">Full PoW protocol docs →</a></p>

<h2>Cross-origin</h2>
<p>Full CORS support. <code>Access-Control-Allow-Origin: *</code> on all responses.</p>

<h2>Family links</h2>
<ul>
<li><a href="https://yoke.lol">yoke.lol</a> — domain intelligence</li>
<li><a href="https://certs.lol">certs.lol</a> — TLS certificate analysis</li>
<li><a href="https://ns.lol">ns.lol</a> — DNS toolkit</li>
<li><a href="https://xhttp.lol">xhttp.lol</a> — HTTP response debugger</li>
</ul>
</div>`;
}

function privacyPage(): string {
  return `<div class="content-page">
<h2>Privacy Policy</h2>
<p>vrfy.lol is a free, open-source email validation API. Here's exactly what happens with your data.</p>

<h3>POST-only by design</h3>
<p>Email validation uses <code>POST /</code> exclusively. Email addresses never appear in URLs, server logs, CDN analytics, or browser history.</p>

<h3>What we store</h3>
<ul>
<li><strong>Domain-level cache:</strong> DNS results (MX, provider, etc.) cached by domain name for 7 days. No email addresses stored.</li>
<li><strong>Extended validation cache:</strong> Results cached by pseudonymized key (<code>HMAC-SHA256</code>) for 30 days. Raw email addresses are never stored.</li>
<li><strong>No analytics, no cookies, no accounts.</strong></li>
</ul>

<h3>Third-party lookups</h3>
<p>Extended validation checks whether an email address has a public presence on third-party services. When extended validation is requested, the email address may be sent to:</p>
<ul>
<li><strong>Gravatar</strong> (gravatar.com) — MD5 hash of the email only</li>
<li><strong>Have I Been Pwned</strong> (haveibeenpwned.com) — email address sent to breach lookup API</li>
<li><strong>Webfinger</strong> (target domain) — RFC 7033 discovery query to the email's domain</li>
<li><strong>OpenPGP</strong> (keys.openpgp.org) — email address sent to key lookup API</li>
</ul>
<p>These lookups happen server-side and responses are cached. No data is shared with advertising or analytics services.</p>

<h3>IP addresses</h3>
<p>IP addresses are used solely for rate limiting and proof-of-work challenge generation. No IP address logs are retained beyond the active rate limiting window.</p>

<h3>Self-hosting</h3>
<p>For full control, fork the repo and run your own instance: <code>wrangler deploy</code>.</p>

<h3>Contact</h3>
<p><a href="mailto:hello@yoke.lol">hello@yoke.lol</a></p>
</div>`;
}

function termsPage(): string {
  return `<div class="content-page">
<h2>Terms of Use</h2>
<p>vrfy.lol is a free email validation API. By using it, you agree to the following terms.</p>

<h3>Acceptable use</h3>
<p>Use the API for legitimate email validation purposes: form submission checks, list hygiene, deliverability assessment. Do not use it to:</p>
<ul>
<li>Harvest or enumerate email addresses</li>
<li>Probe addresses without a legitimate reason to validate them</li>
<li>Circumvent rate limits or proof-of-work requirements</li>
<li>Resell raw API output as a competing service</li>
</ul>

<h3>Rate limits</h3>
<p>Requests are rate-limited per IP. Proof-of-work challenges may be issued during high traffic. Attempting to bypass these mechanisms may result in temporary or permanent blocking.</p>

<h3>No warranty</h3>
<p>The service is provided as-is, with no guarantees of accuracy, availability, or fitness for any particular purpose. Email validation is inherently probabilistic — results should inform decisions, not replace them.</p>

<h3>Data handling</h3>
<p>See our <a href="/privacy">Privacy Policy</a> for details on what data is processed and retained.</p>

<h3>Availability</h3>
<p>We may modify, rate-limit, or discontinue the service at any time without notice. For guaranteed availability, self-host from the <a href="https://github.com/yokedotlol/vrfy-lol">open-source repo</a>.</p>

<h3>License</h3>
<p>The vrfy.lol source code is available under the <a href="https://opensource.org/licenses/MIT">MIT License</a>. The service itself (hosted at vrfy.lol) is subject to these terms.</p>

<h3>Contact</h3>
<p><a href="mailto:hello@yoke.lol">hello@yoke.lol</a></p>
</div>`;
}

function statusPage(): string {
  return `<div class="content-page">
<h2>Service Status</h2>

<div class="status-hero" id="statusHero">
  <div class="status-indicator checking">
    <span class="status-dot"></span>
    <span class="status-text">Checking…</span>
  </div>
  <div class="status-meta" id="statusMeta"></div>
</div>

<div class="status-checks" id="statusChecks">
  <div class="status-check" id="checkApi">
    <span class="check-name">API endpoint</span>
    <span class="check-status">—</span>
  </div>
  <div class="status-check" id="checkHealth">
    <span class="check-name">Health check</span>
    <span class="check-status">—</span>
  </div>
  <div class="status-check" id="checkLatency">
    <span class="check-name">Response latency</span>
    <span class="check-status">—</span>
  </div>
</div>

<div class="status-info">
  <div class="status-info-row">
    <span class="info-label">Service</span>
    <span class="info-value">vrfy.lol</span>
  </div>
  <div class="status-info-row">
    <span class="info-label">Version</span>
    <span class="info-value" id="statusVersion">—</span>
  </div>
  <div class="status-info-row">
    <span class="info-label">Checked at</span>
    <span class="info-value" id="statusTime">—</span>
  </div>
</div>

<p class="status-note">Live check from your browser to the API edge. No uptime history is stored — this page tests current reachability in real time.</p>
</div>

<style>
.status-hero {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; padding: 1.25rem 1.5rem; margin: 1.5rem 0 1rem;
  text-align: center;
}
.status-indicator {
  display: flex; align-items: center; justify-content: center; gap: 0.6rem;
}
.status-dot {
  width: 12px; height: 12px; border-radius: 50%;
  display: inline-block; flex-shrink: 0;
}
.status-indicator.checking .status-dot { background: var(--text-muted); }
.status-indicator.operational .status-dot { background: var(--green); box-shadow: 0 0 8px rgba(63,185,80,0.5); }
.status-indicator.degraded .status-dot { background: var(--yellow); box-shadow: 0 0 8px rgba(210,153,34,0.5); }
.status-indicator.down .status-dot { background: var(--red); box-shadow: 0 0 8px rgba(248,81,73,0.5); }
.status-text {
  font-family: var(--font-mono); font-size: 1.1rem; font-weight: 600;
  color: var(--text-bright);
}
.status-meta {
  font-family: var(--font-mono); font-size: 0.75rem;
  color: var(--text-muted); margin-top: 0.5rem;
}
.status-checks {
  display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.5rem;
}
.status-check {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px; padding: 0.6rem 1rem;
  border-left: 3px solid var(--text-muted);
}
.status-check.pass { border-left-color: var(--green); }
.status-check.warn { border-left-color: var(--yellow); }
.status-check.fail { border-left-color: var(--red); }
.check-name {
  font-family: var(--font-mono); font-size: 0.85rem; color: var(--text);
}
.check-status {
  font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted);
}
.status-check.pass .check-status { color: var(--green); }
.status-check.warn .check-status { color: var(--yellow); }
.status-check.fail .check-status { color: var(--red); }
.status-info {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px; padding: 0.75rem 1rem; margin-bottom: 1.5rem;
}
.status-info-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.35rem 0; font-family: var(--font-mono); font-size: 0.8rem;
}
.status-info-row + .status-info-row { border-top: 1px solid var(--border); }
.info-label { color: var(--text-muted); }
.info-value { color: var(--text-bright); }
.status-note {
  font-size: 0.8rem; color: var(--text-muted); font-style: italic;
  text-align: center;
}
</style>`;
}

/* ── Usage (admin) ──────────────────────────────────────────────────── */

function usagePage(): string {
  return `<div class="content-page">
<h2>Usage Dashboard</h2>

<div id="usageContent" style="display: none;">

<h3 style="font-family: var(--font-mono); font-size: 0.95rem; color: var(--text-bright); margin: 1.5rem 0 0.75rem;">
  XON Breach Intelligence
</h3>

<div class="status-checks" id="xonToday">
  <div class="status-check" id="xonCalls">
    <span class="check-name">API calls today</span>
    <span class="check-status">—</span>
  </div>
  <div class="status-check" id="xonHits">
    <span class="check-name">Breach hits</span>
    <span class="check-status">—</span>
  </div>
  <div class="status-check" id="xonErrors">
    <span class="check-name">Errors</span>
    <span class="check-status">—</span>
  </div>
  <div class="status-check" id="xonSkipped">
    <span class="check-name">Rate-limited / skipped</span>
    <span class="check-status">—</span>
  </div>
  <div class="status-check" id="xonHitRate">
    <span class="check-name">Hit rate</span>
    <span class="check-status">—</span>
  </div>
</div>

<h3 style="font-family: var(--font-mono); font-size: 0.95rem; color: var(--text-bright); margin: 1.5rem 0 0.75rem;">
  7-Day History
</h3>

<div class="status-info" id="xonHistory">
  <div class="status-info-row" style="font-weight: 600; color: var(--accent);">
    <span style="flex: 1;">Date</span>
    <span style="flex: 0.6; text-align: right;">Calls</span>
    <span style="flex: 0.6; text-align: right;">Hits</span>
    <span style="flex: 0.6; text-align: right;">Errors</span>
    <span style="flex: 0.6; text-align: right;">Skipped</span>
  </div>
  <div id="historyRows"></div>
</div>

<h3 style="font-family: var(--font-mono); font-size: 0.95rem; color: var(--text-bright); margin: 1.5rem 0 0.75rem;">
  Rate Limit Status
</h3>

<div class="status-info" id="rateLimitInfo">
  <div class="status-info-row">
    <span class="info-label" id="rateLimitText">Loading…</span>
  </div>
</div>

<h3 style="font-family: var(--font-mono); font-size: 0.95rem; color: var(--text-bright); margin: 1.5rem 0 0.75rem;">
  Extended Signals
</h3>

<div class="status-checks" id="signalsList"></div>

</div>

<div id="usageError" style="display: none; margin: 1.5rem 0;">
  <div class="status-check fail">
    <span class="check-name" id="usageErrorMsg">Failed to load usage data</span>
    <span class="check-status">✗</span>
  </div>
</div>

<p class="status-note" style="margin-top: 1.5rem;">
  Stats are tracked via shared KV. Counters use UTC dates with 48h auto-expiry. XON self-limits at 90 calls/day per worker IP.
</p>
</div>`;
}

/* ── Proof of Work ─────────────────────────────────────────────────── */

function powPage(): string {
  return `<div class="content-page">
<h2>Proof of Work</h2>
<p>vrfy.lol uses proof-of-work instead of API keys for abuse prevention. When you hit the free tier limit, solve a SHA-256 challenge and include the solution in your request. No accounts. No signup. No tokens.</p>

<h3>How it works</h3>
<ol>
<li>Make a request to <code>POST /</code> or <code>POST /batch</code> as normal.</li>
<li>If you exceed the free tier (10/hour or 50/day per IP), you get a <code>429</code> response with a <code>pow</code> challenge object.</li>
<li>Find a nonce where <code>SHA-256(challenge + ":" + nonce)</code> has N leading zero bits.</li>
<li>Resubmit your request with the <code>pow</code> field containing the challenge and nonce.</li>
<li>Server verifies in microseconds. Request proceeds with no rate limit.</li>
</ol>

<h3>The challenge object</h3>
<p>When rate-limited, the response body includes:</p>
<pre>{
  "error": "rate_limited",
  "pow": {
    "algorithm": "sha256",
    "challenge": "a9f3...hex string...",
    "difficulty": 20,
    "expires": 1719403500
  }
}</pre>

<table>
<tr><th>Field</th><th>Description</th></tr>
<tr><td><code>algorithm</code></td><td>Always <code>sha256</code></td></tr>
<tr><td><code>challenge</code></td><td>Hex-encoded HMAC — unique to your IP + 5-minute window</td></tr>
<tr><td><code>difficulty</code></td><td>Number of leading zero bits required (default 20 for single, higher for batch)</td></tr>
<tr><td><code>expires</code></td><td>Unix timestamp — challenge is valid until this time</td></tr>
</table>

<h3>Submitting a solution</h3>
<p>Include the <code>pow</code> object in your request body alongside <code>email</code>:</p>
<pre>{
  "email": "user@example.com",
  "pow": {
    "challenge": "a9f3...the challenge you received...",
    "nonce": "your solution nonce"
  }
}</pre>

<h3>Solving the challenge</h3>
<p>Find a <code>nonce</code> string where <code>SHA-256(challenge + ":" + nonce)</code> starts with <code>difficulty</code> leading zero bits. This is the Hashcash algorithm — brute-force incrementing a counter until the hash matches.</p>

<p>With difficulty 20, expect ~1 million iterations (~2–8 seconds on modern hardware). Each extra bit doubles the work.</p>

<h4>JavaScript (Web Crypto)</h4>
<pre>async function solvePow(challenge, difficulty) {
  const encoder = new TextEncoder();
  let nonce = 0;
  while (true) {
    const input = challenge + ':' + nonce;
    const hash = new Uint8Array(
      await crypto.subtle.digest('SHA-256', encoder.encode(input))
    );
    if (countLeadingZeroBits(hash) >= difficulty) {
      return String(nonce);
    }
    nonce++;
  }
}

function countLeadingZeroBits(hash) {
  let bits = 0;
  for (const byte of hash) {
    if (byte === 0) { bits += 8; continue; }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}</pre>

<h4>Bash (openssl)</h4>
<pre>solve_pow() {
  local challenge="$1" difficulty="$2" nonce=0
  local target=$((difficulty / 4))  # hex chars
  local zeros=$(printf '%0*d' "$target" 0)
  while true; do
    hash=$(printf '%s:%d' "$challenge" "$nonce" \\
      | openssl dgst -sha256 -binary | xxd -p -c 64)
    if [ "\${hash:0:$target}" = "$zeros" ]; then
      echo "$nonce"; return
    fi
    nonce=$((nonce + 1))
  done
}</pre>

<h3>Batch difficulty scaling</h3>
<p>For <code>POST /batch</code>, difficulty scales with batch size:</p>
<pre>difficulty = 20 + floor(log2(batch_size))</pre>
<p>2 emails = 21 bits. 10 emails = 23 bits. 20 emails = 24 bits. This keeps the cost proportional to the work the server does.</p>

<h3>Design notes</h3>
<ul>
<li><strong>Stateless.</strong> Challenges are deterministic — derived from your IP + a 5-minute time bucket. The server never stores them.</li>
<li><strong>Clock-edge tolerance.</strong> The server accepts solutions for the current AND previous time bucket, so challenges don't expire at the boundary.</li>
<li><strong>Nonce replay protection.</strong> Each nonce can only be used once within its challenge window.</li>
<li><strong>No accounts.</strong> PoW replaces API keys entirely. Compute is the credential.</li>
</ul>

<h3>Rate limits</h3>
<table>
<tr><th>Tier</th><th>Limit</th></tr>
<tr><td>Free</td><td>10 requests/hour + 50/day per IP</td></tr>
<tr><td>With PoW</td><td>Unlimited</td></tr>
</table>

<h3>Client libraries</h3>
<p>All official clients solve PoW transparently — you never need to implement this yourself unless you're calling the API directly.</p>
<ul>
<li><a href="/cli">CLI & Libraries</a> — Go, Node, Python, and bash clients with built-in PoW</li>
<li><a href="/api/docs">API Reference</a></li>
</ul>
</div>`;
}

/* ── CLI & Libraries ───────────────────────────────────────────────── */

function cliPage(): string {
  return `<div class="content-page">
<h2>CLI &amp; Libraries</h2>
<p>Official clients for vrfy.lol. All handle proof-of-work transparently — just call the function and results come back.</p>

<h3>Quick start (curl)</h3>
<p>No install required:</p>
<pre>curl -s -X POST https://vrfy.lol/ \\
  -H "Content-Type: application/json" \\
  -d '{"email":"user@example.com"}' | jq .action</pre>

<h3>Shell script</h3>
<p>Zero dependencies beyond <code>curl</code> + <code>openssl</code>. Handles PoW, batch files, colored output, and pipe-friendly exit codes.</p>
<pre># Run directly
curl -sL vrfy.lol/vrfy.sh | bash -s -- user@example.com

# Or download and use
curl -sLO vrfy.lol/vrfy.sh &amp;&amp; chmod +x vrfy.sh
./vrfy.sh user@example.com
./vrfy.sh user@example.com admin@company.com
./vrfy.sh --batch emails.txt
echo "user@example.com" | ./vrfy.sh -
./vrfy.sh --json user@example.com</pre>

<p>Exit codes: <code>0</code> = allow, <code>1</code> = block, <code>2</code> = verify.</p>

<h3>Go CLI</h3>
<p>Built with <a href="https://github.com/spf13/cobra">Cobra</a> + <a href="https://github.com/charmbracelet/lipgloss">Lipgloss</a>. Rich terminal output with color.</p>
<pre># From source
go install github.com/yokedotlol/vrfy/cmd/vrfy@latest

# Usage
vrfy check user@example.com
vrfy check --json user@example.com
vrfy check --batch emails.txt
vrfy check --quick user@example.com
echo "user@example.com" | vrfy check -</pre>

<table>
<tr><th>Flag</th><th>Description</th></tr>
<tr><td><code>--json</code></td><td>Output raw JSON</td></tr>
<tr><td><code>--quick</code></td><td>Quick mode (Tier 1 signals only)</td></tr>
<tr><td><code>--batch &lt;file&gt;</code></td><td>Read emails from file, one per line</td></tr>
<tr><td><code>--url &lt;base&gt;</code></td><td>Override API base URL</td></tr>
</table>

<h4>Go library</h4>
<pre>import vrfy "github.com/yokedotlol/vrfy"

client := vrfy.NewClient()
result, err := client.Validate("user@example.com")
fmt.Println(result.Action) // "allow", "verify", "block"

// Batch
batch, err := client.ValidateBatch([]string{
  "alice@gmail.com", "bob@company.com",
})</pre>

<h3>Node.js / TypeScript</h3>
<pre>import { validate, validateBatch } from '@yokedotlol/vrfy';

const result = await validate('user@example.com');
console.log(result.action); // 'allow' | 'verify' | 'block'

if (result.validation.has_typo) {
  console.log('Did you mean:', result.validation.typo_suggestion);
}

// Batch (up to 20)
const batch = await validateBatch([
  'alice@gmail.com', 'bob@company.com'
]);</pre>

<h3>Python</h3>
<pre>from vrfy import validate, validate_batch

result = validate("user@example.com")
print(result["action"])  # "allow", "verify", or "block"

# Batch
batch = validate_batch(["alice@gmail.com", "bob@company.com"])
for r in batch["results"]:
    print(f"{r['email']} → {r['action']}")</pre>

<h3>All clients support</h3>
<ul>
<li>Transparent PoW — rate limits are handled automatically</li>
<li>Single and batch validation</li>
<li>Typed responses with full signal access</li>
<li>Zero configuration — no API keys, no signup</li>
</ul>

<h3>Source</h3>
<p>All clients live in <a href="https://github.com/yokedotlol/vrfy-lol/tree/main/clients">github.com/yokedotlol/vrfy-lol/clients</a>.</p>
<ul>
<li><a href="https://github.com/yokedotlol/vrfy-lol/tree/main/clients/bash">clients/bash</a> — Shell script</li>
<li><a href="https://github.com/yokedotlol/vrfy-lol/tree/main/clients/go">clients/go</a> — Go CLI + library</li>
<li><a href="https://github.com/yokedotlol/vrfy-lol/tree/main/clients/node">clients/node</a> — Node.js/TypeScript</li>
<li><a href="https://github.com/yokedotlol/vrfy-lol/tree/main/clients/python">clients/python</a> — Python</li>
</ul>
</div>`;
}

/* ── Footer ────────────────────────────────────────────────────────── */

function footer(): string {
  return `<footer class="footer">
  <div class="footer-links">
    <a href="https://github.com/yokedotlol/vrfy-lol">GitHub</a>
    <a href="/api/docs">API</a>
    <a href="/cli">CLI</a>
    <a href="/pow">PoW</a>
    <a href="/about">About</a>
    <a href="/status">Status</a>
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms</a>
  </div>
  <div class="footer-tagline">Part of the <a href="https://yoke.lol/tools">.lol tools</a></div>
  <div class="footer-family">
    <a href="https://yoke.lol">yoke</a>
    <a href="https://certs.lol">certs</a>
    <a href="https://ns.lol">ns</a>
    <a href="https://xhttp.lol">xhttp</a>
  </div>
  <a href="https://yoke.lol/vrfy.lol" class="yoke-badge"><img src="https://yoke.lol/badge/vrfy.lol.svg" alt="Yoke score for vrfy.lol" height="20"></a>
</footer>`;
}
