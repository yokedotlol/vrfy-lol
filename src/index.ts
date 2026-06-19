// ─── vrfy.lol Worker entry point (v1.0) ───
// POST-only for email validation. No emails in URLs.
//
// Routes:
//   POST /           — Validate an email (body: {email, pow?, force?, quick?, mode?, stream?})
//   POST /batch      — Validate up to 20 emails
//   GET  /           — API root (JSON) / SPA landing (HTML)
//   GET  /about      — About page
//   GET  /api/docs   — API documentation
//   GET  /api/usage  — Admin usage stats (requires HTTP Basic Auth)
//   GET  /privacy    — Privacy policy
//   GET  /status     — Service status page
//   GET  /usage      — Usage dashboard (admin SPA)
//   GET  /health     — Health check

import type { Env, ValidateRequest, BatchRequest } from './types';
import { validateEmail, validateBatch, type ValidateOptions } from './validate';
import { generateChallenge, verifyPow } from './pow';
import { checkRateLimit, checkNonceFresh } from './rate-limiter';
import { ERRORS, errorStatus, type ErrorResponse } from './errors';
import { renderPage } from './spa';

export { RateLimiterDO } from './rate-limiter';

const VERSION = '1.0.0';
const MAX_BATCH_SIZE = 20;

// SPA page paths (GET → HTML)
const SPA_PATHS = new Set(['/', '/about', '/api/docs', '/cli', '/pow', '/privacy', '/status', '/terms', '/usage']);

// Security headers applied to ALL responses
const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Content-Security-Policy': "default-src 'none'",
};

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    // ── HTTP → HTTPS redirect (required for HSTS preload eligibility) ──
    const cfVisitor = request.headers.get('CF-Visitor');
    if (cfVisitor) {
      try {
        const { scheme } = JSON.parse(cfVisitor) as { scheme: string };
        if (scheme === 'http') {
          const httpsUrl = new URL(request.url);
          httpsUrl.protocol = 'https:';
          return Response.redirect(httpsUrl.toString(), 301);
        }
      } catch { /* malformed header, continue */ }
    }

    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...SECURITY_HEADERS, ...corsHeaders } });
    }

    if (method === 'HEAD') {
      return new Response(null, { status: 200, headers: { ...SECURITY_HEADERS, ...corsHeaders } });
    }

    try {
      const path = url.pathname;

      // ── Favicon ──

      if (path === '/favicon.svg') {
        return new Response(faviconSvg(), {
          headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400', ...SECURITY_HEADERS, ...corsHeaders },
        });
      }

      // ── Static routes (no rate limit) ──

      if (path === '/health') {
        return json({ status: 'ok', service: 'vrfy.lol', version: VERSION }, 200, corsHeaders);
      }

      if (path === '/.well-known/security.txt') {
        return new Response(securityTxt(), {
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400', ...SECURITY_HEADERS, ...corsHeaders },
        });
      }

      if (path === '/robots.txt') {
        return new Response('User-agent: *\nAllow: /\n\nSitemap: https://vrfy.lol/sitemap.xml\n', {
          headers: { 'Content-Type': 'text/plain', ...SECURITY_HEADERS, ...corsHeaders },
        });
      }

      if (path === '/sitemap.xml') {
        return new Response(sitemap(), {
          headers: { 'Content-Type': 'application/xml', ...SECURITY_HEADERS, ...corsHeaders },
        });
      }

      // ── SPA pages (GET, wants HTML) ──

      if (method === 'GET' && SPA_PATHS.has(path)) {
        const wantsHtml = (request.headers.get('accept') || '').includes('text/html');

        if (path === '/' && !wantsHtml) {
          // JSON root for API clients (curl without Accept header)
          return json({
            name: 'vrfy.lol',
            version: VERSION,
            description: 'Email address validation API. No SMTP probes. No API keys. POST-only.',
            endpoints: {
              'POST /': 'Validate an email address (body: {"email": "..."})',
              'POST /batch': 'Validate up to 20 emails (body: {"emails": [...]})',
              'GET /health': 'Health check',
            },
            rate_limit: {
              free: '10/hour + 50/day per IP',
              pow: 'Unlimited with proof-of-work',
            },
            example: 'curl -s -X POST https://vrfy.lol/ -H "Content-Type: application/json" -d \'{"email":"user@example.com"}\' | jq .action',
            source: 'https://github.com/yokedotlol/vrfy-lol',
            license: 'MIT',
            _meta: {
              family: {
                domain: 'https://yoke.lol',
                tls: 'https://certs.lol',
                dns: 'https://ns.lol',
                headers: 'https://xhttp.lol',
              },
              docs: 'https://vrfy.lol/api/docs',
            },
          }, 200, corsHeaders);
        }

        // Auth gate for /usage — HTTP Basic Auth
        if (path === '/usage' && env.ADMIN_KEY) {
          const authHeader = request.headers.get('Authorization');
          const expected = `Basic ${btoa(`admin:${env.ADMIN_KEY}`)}`;
          if (!authHeader || authHeader !== expected) {
            return new Response('Unauthorized', {
              status: 401,
              headers: { ...corsHeaders, 'WWW-Authenticate': 'Basic realm="vrfy.lol admin"' },
            });
          }
        }

        // Generate a nonce for CSP
        const nonce = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        return new Response(renderPage(path, nonce), {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Security-Policy': `default-src 'self'; script-src 'nonce-${nonce}'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' https://yoke.lol; connect-src 'self'`,
            ...SECURITY_HEADERS,
            ...corsHeaders,
          },
        });
      }

      // ── GET /api/usage — Admin usage stats ──

      if (path === '/api/usage' && method === 'GET') {
        return handleUsageApi(request, env, corsHeaders);
      }

      // ── POST / — Primary email validation ──

      if (path === '/' && method === 'POST') {
        return handlePost(request, env, corsHeaders, _ctx);
      }

      // ── POST /batch — Batch validation ──

      if (path === '/batch' && method === 'POST') {
        return handleBatch(request, env, corsHeaders);
      }

      // ── GET /:path — check if it's an email (405) or unknown (404) ──

      if (method === 'GET' && path.length > 1) {
        const segment = decodeURIComponent(path.substring(1));

        if (segment.includes('@')) {
          return json({
            error: 'method_not_allowed',
            message: 'Email validation is POST-only. Use POST / with {"email": "..."} in the request body.',
            docs: 'https://vrfy.lol/api/docs',
          }, 405, {
            ...corsHeaders,
            'Allow': 'POST',
          });
        }
      }

      return json({ error: 'not_found', message: 'Not found' }, 404, corsHeaders);

    } catch (err) {
      console.error('Unhandled error:', err);
      return errorJson(ERRORS.internal(), corsHeaders);
    }
  },
};

// ─── Route handlers ───

async function handlePost(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
  ctx: ExecutionContext,
): Promise<Response> {
  let body: ValidateRequest;
  try {
    body = await request.json() as ValidateRequest;
  } catch {
    return errorJson(ERRORS.missingEmail(), corsHeaders);
  }

  if (!body.email || typeof body.email !== 'string') {
    return errorJson(ERRORS.missingEmail(), corsHeaders);
  }

  const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
  const adminKey = request.headers.get('x-admin-key') || undefined;
  const quick = body.quick ?? (body.mode === 'quick');

  // ── SSE streaming mode ──
  if (body.stream) {
    return handleStreamingValidation(body, ip, adminKey, quick, env, corsHeaders, ctx);
  }

  const options: ValidateOptions = {
    quick,
    force: body.force ?? false,
    adminKey,
  };

  const result = await validateEmail(body.email, env, options);

  if (body.pow) {
    const powValid = await verifyPow(body.pow, ip, env.POW_SECRET);
    if (!powValid) {
      const challenge = await generateChallenge(ip, env.POW_SECRET);
      return errorJson(ERRORS.powInvalid(challenge), corsHeaders, {
        'Retry-After': '0',
        'X-Pow-Required': 'true',
      });
    }

    const nonceFresh = await checkNonceFresh(
      env.RATE_LIMITER, ip, body.pow.challenge, body.pow.nonce,
    );
    if (!nonceFresh) {
      const challenge = await generateChallenge(ip, env.POW_SECRET);
      return errorJson(ERRORS.powInvalid(challenge), corsHeaders, {
        'Retry-After': '0',
        'X-Pow-Required': 'true',
      });
    }

    return json(result, 200, {
      ...corsHeaders,
      'X-Vrfy-Version': VERSION,
    });
  }

  const rateLimit = await checkRateLimit(env.RATE_LIMITER, ip);
  if (!rateLimit.allowed) {
    const challenge = await generateChallenge(ip, env.POW_SECRET);
    return errorJson(ERRORS.rateLimited(challenge), corsHeaders, {
      'Retry-After': '0',
      'X-Pow-Required': 'true',
      'X-RateLimit-Remaining-Hourly': String(rateLimit.remaining_hourly),
      'X-RateLimit-Remaining-Daily': String(rateLimit.remaining_daily),
    });
  }

  return json(result, 200, {
    ...corsHeaders,
    'X-Vrfy-Version': VERSION,
    'X-RateLimit-Remaining-Hourly': String(rateLimit.remaining_hourly),
    'X-RateLimit-Remaining-Daily': String(rateLimit.remaining_daily),
  });
}

async function handleBatch(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  let body: BatchRequest;
  try {
    body = await request.json() as BatchRequest;
  } catch {
    return errorJson(ERRORS.missingEmails(), corsHeaders);
  }

  if (!body.emails || !Array.isArray(body.emails)) {
    return errorJson(ERRORS.missingEmails(), corsHeaders);
  }

  if (body.emails.length === 0) {
    return errorJson(ERRORS.emptyEmails(), corsHeaders);
  }

  if (body.emails.length > MAX_BATCH_SIZE) {
    return errorJson(
      ERRORS.batchTooLarge(MAX_BATCH_SIZE, body.emails.length),
      corsHeaders,
    );
  }

  const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';

  if (body.pow) {
    const batchDifficulty = 20 + Math.floor(Math.log2(body.emails.length));
    const powValid = await verifyPow(body.pow, ip, env.POW_SECRET, batchDifficulty);
    if (!powValid) {
      const challenge = await generateChallenge(ip, env.POW_SECRET, batchDifficulty);
      return errorJson(ERRORS.powInvalid(challenge), corsHeaders, {
        'Retry-After': '0',
        'X-Pow-Required': 'true',
      });
    }

    const nonceFresh = await checkNonceFresh(
      env.RATE_LIMITER, ip, body.pow.challenge, body.pow.nonce,
    );
    if (!nonceFresh) {
      const challenge = await generateChallenge(ip, env.POW_SECRET, batchDifficulty);
      return errorJson(ERRORS.powInvalid(challenge), corsHeaders, {
        'Retry-After': '0',
        'X-Pow-Required': 'true',
      });
    }
  } else {
    const rateLimit = await checkRateLimit(env.RATE_LIMITER, ip);
    if (!rateLimit.allowed) {
      const batchDifficulty = 20 + Math.floor(Math.log2(body.emails.length));
      const challenge = await generateChallenge(ip, env.POW_SECRET, batchDifficulty);
      return errorJson(ERRORS.rateLimited(challenge), corsHeaders, {
        'Retry-After': '0',
        'X-Pow-Required': 'true',
      });
    }
  }

  const adminKey = request.headers.get('x-admin-key') || undefined;
  const options: ValidateOptions = {
    quick: body.quick ?? (body.mode === 'quick'),
    force: body.force ?? false,
    adminKey,
  };
  const result = await validateBatch(body.emails, env, options);

  return json(result, 200, {
    ...corsHeaders,
    'X-Vrfy-Version': VERSION,
  });
}

// ─── SSE streaming handler ───

async function handleStreamingValidation(
  body: ValidateRequest,
  ip: string,
  adminKey: string | undefined,
  quick: boolean,
  env: Env,
  corsHeaders: Record<string, string>,
  ctx: ExecutionContext,
): Promise<Response> {
  // Rate limit / PoW check BEFORE starting the stream
  if (body.pow) {
    const powValid = await verifyPow(body.pow, ip, env.POW_SECRET);
    if (!powValid) {
      const challenge = await generateChallenge(ip, env.POW_SECRET);
      return errorJson(ERRORS.powInvalid(challenge), corsHeaders, {
        'Retry-After': '0',
        'X-Pow-Required': 'true',
      });
    }
    const nonceFresh = await checkNonceFresh(
      env.RATE_LIMITER, ip, body.pow.challenge, body.pow.nonce,
    );
    if (!nonceFresh) {
      const challenge = await generateChallenge(ip, env.POW_SECRET);
      return errorJson(ERRORS.powInvalid(challenge), corsHeaders, {
        'Retry-After': '0',
        'X-Pow-Required': 'true',
      });
    }
  } else {
    const rateLimit = await checkRateLimit(env.RATE_LIMITER, ip);
    if (!rateLimit.allowed) {
      const challenge = await generateChallenge(ip, env.POW_SECRET);
      return errorJson(ERRORS.rateLimited(challenge), corsHeaders, {
        'Retry-After': '0',
        'X-Pow-Required': 'true',
      });
    }
  }

  // Set up SSE stream
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const sendEvent = async (event: string, data: unknown) => {
    try {
      await writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    } catch {
      // Client disconnected — swallow
    }
  };

  const options: ValidateOptions = {
    quick,
    force: body.force ?? false,
    adminKey,
    onProgress: (event) => sendEvent('progress', event),
  };

  // Run validation asynchronously, streaming progress
  const streamWork = (async () => {
    try {
      const result = await validateEmail(body.email, env, options);
      await sendEvent('result', result);
    } catch {
      await sendEvent('error', { message: 'Internal validation error' });
    } finally {
      try { await writer.close(); } catch { /* already closed */ }
    }
  })();

  ctx.waitUntil(streamWork);

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
      'X-Vrfy-Version': VERSION,
      ...SECURITY_HEADERS,
      ...corsHeaders,
    },
  });
}

async function handleUsageApi(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  // Auth: HTTP Basic Auth (user=admin, pass=ADMIN_KEY)
  const authHeader = request.headers.get('Authorization');
  if (env.ADMIN_KEY) {
    const expected = `Basic ${btoa(`admin:${env.ADMIN_KEY}`)}`;
    if (!authHeader || authHeader !== expected) {
      return new Response('Unauthorized', {
        status: 401,
        headers: { ...corsHeaders, 'WWW-Authenticate': 'Basic realm="vrfy.lol admin"' },
      });
    }
  }

  // Read XON stats from shared KV for today + last 7 days
  const today = new Date();
  const history: Array<{ date: string; calls: number; hits: number; errors: number; skipped: number }> = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().slice(0, 10);

    const [calls, hits, errors, skipped] = await Promise.all([
      kvCounter(env.CACHE, `xon:calls:${dateStr}`),
      kvCounter(env.CACHE, `xon:hits:${dateStr}`),
      kvCounter(env.CACHE, `xon:errors:${dateStr}`),
      kvCounter(env.CACHE, `xon:skipped:${dateStr}`),
    ]);

    history.push({ date: dateStr, calls, hits, errors, skipped });
  }

  // Read any cached rate limit headers from XON
  const rateLimitHeaders = ['x-ratelimit-remaining', 'x-ratelimit-limit', 'retry-after', 'x-ratelimit-reset'];
  const rateLimits: Record<string, string> = {};
  for (const header of rateLimitHeaders) {
    try {
      const val = await env.CACHE.get(`xon:ratelimit:${header}`);
      if (val !== null) rateLimits[header] = val;
    } catch { /* best-effort */ }
  }

  const todayData = history[0] || { calls: 0, hits: 0, errors: 0, skipped: 0 };

  return json({
    xon: {
      today: {
        calls: todayData.calls,
        hits: todayData.hits,
        errors: todayData.errors,
        skipped: todayData.skipped,
      },
      history,
      rate_limits: Object.keys(rateLimits).length > 0 ? rateLimits : null,
    },
    signals: [
      { name: 'gravatar', weight: 0.35, description: 'Gravatar profile lookup (~260M profiles)' },
      { name: 'github', weight: 0.30, description: 'GitHub public commit email search' },
      { name: 'xon', weight: 0.25, description: 'XposedOrNot breach database (free, no API key)' },
      { name: 'webfinger', weight: 0.25, description: 'RFC 7033 Webfinger account discovery' },
      { name: 'gitlab', weight: 0.20, description: 'GitLab public account search' },
      { name: 'pgp', weight: 0.20, description: 'OpenPGP key server lookup' },
      { name: 'keybase', weight: 0.20, description: 'Keybase identity graph (~400K users)' },
      { name: 'libravatar', weight: 0.15, description: 'Libravatar federated avatar (FOSS/privacy users)' },
    ],
  }, 200, { ...corsHeaders, 'Cache-Control': 'no-cache' });
}

async function kvCounter(kv: KVNamespace, key: string): Promise<number> {
  try {
    const raw = await kv.get(key);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

// ─── Response helpers ───

function json(data: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data, null, 2) + '\n', {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
      'Content-Security-Policy': "default-src 'none'",
      ...SECURITY_HEADERS,
      ...headers,
    },
  });
}

function errorJson(
  error: ErrorResponse,
  corsHeaders: Record<string, string>,
  extraHeaders: Record<string, string> = {},
): Response {
  return json(error, errorStatus(error.error), {
    ...corsHeaders,
    ...extraHeaders,
  });
}

// ─── Static assets ───

function faviconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="16" fill="#0d1117"/>
  <text x="50" y="68" font-family="monospace" font-size="48" font-weight="700" fill="#38d9a9" text-anchor="middle">✓</text>
</svg>`;
}

function sitemap(): string {
  const now = new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://vrfy.lol/</loc><lastmod>${now}</lastmod><priority>1.0</priority></url>
  <url><loc>https://vrfy.lol/about</loc><lastmod>${now}</lastmod><priority>0.6</priority></url>
  <url><loc>https://vrfy.lol/api/docs</loc><lastmod>${now}</lastmod><priority>0.8</priority></url>
  <url><loc>https://vrfy.lol/privacy</loc><lastmod>${now}</lastmod><priority>0.4</priority></url>
  <url><loc>https://vrfy.lol/status</loc><lastmod>${now}</lastmod><priority>0.5</priority></url>
</urlset>`;
}

function securityTxt(): string {
  return `Contact: https://github.com/yokedotlol/vrfy-lol/issues
Expires: 2027-06-18T00:00:00Z
Preferred-Languages: en
Canonical: https://vrfy.lol/.well-known/security.txt
`;
}
