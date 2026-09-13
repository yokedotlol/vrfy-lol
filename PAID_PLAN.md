# vrfy.lol — Paid Plan Design (Approved Aug 19 2026)

Status: Meta-approved for paid launch. Pending implementation.
Supersedes: CONSTITUTION.md "$0 forever" / "No accounts / API keys"

## Decision record

- Dec 2026 (actual Aug 19 2026): Meta CoI / legal approved monetization for .lol family
- Original constitution: free-only, PoW-only abuse prevention
- New constitution: **Free tier forever**, paid optional for high volume / programmatic

This is a file to capture the decision before code lands.

## Pricing model — prepaid credits, no subscriptions

Memory bank preference: no subscriptions (Kurt dislikes recurring billing management). Prepaid = clean offline cold revenue.

### Draft tiers (matches memory: ~2% ZeroBounce)
- ZeroBounce ~ $10 / 1k = $0.01/email
- vrfy target ~ 2% of that = $0.00020

| Tier | Price | Credits | Effective $/1k | Notes |
|------|-------|---------|----------------|-------|
| Starter | $2 | 10,000 | $0.20 | 2% ZB |
| Growth | $8 | 50,000 | $0.16 | ~20% discount |
| Scale | $30 | 250,000 | $0.12 | ~40% discount |

- All + tax where applicable (Stripe Tax)
- Credits never expire (or 24mo rolling to prevent balance-sheet indefinite liability — decide: Stripe allows non-expiring; easiest is never expire for v1)
- No subscriptions, no auto-reload (v1). Auto-reload opt-in for v2.

### Why not per-request billing?
- Predictable CF Workers costs, avoids metered-billing complexity
- Keeps $5/mo cost target realistic — 250k validations ~ < $2 in KV/DO costs if cached

## Auth — API keys

Free path unchanged:
- 10/hr + 50/day per IP
- PoW bypass unlimited
- Cache hits do NOT skip rate limits (vrfy exception — would be free ride on other's PoW)

Paid path:
- Header: `X-API-Key: vk_live_xxxxxxxx` or `Authorization: Bearer vk_live_...`
- Never query param (POST-only PII invariant)
- Key format: `vk_live_` + 32 hex chars (192 bits)
- Storage: new KV `API_KEYS` or prefix `apikey:{hmac(apiKey)}` in existing CACHE KV (isolated KV cleaner)
- Fields:
  ```json
  {
    "key_id": "vk_abc123",
    "hash": "sha256(key)",
    "created_at": 1724120000,
    "stripe_customer_id": "cus_xxx",
    "stripe_payment_intent": "pi_xxx",
    "credits_total": 10000,
    "credits_used": 0,
    "credits_remaining": 10000,
    "last_used_at": 0
  }
  ```

- Increment used on every 2xx validation (including cached? Decision: charge on request, not unique domain, simplest. Could discount cached to 0 but complicates accounting. v1: charge per request, even if `cached:true` domain hit — compute still done.)
- Batch: deduct by emails length
- Return headers: `X-Credits-Remaining`, `X-Credits-Used`

## Stripe integration

### Checkout
- Product: vrfy.lol email validation credits
- Use Stripe Checkout (hosted, no SAQ)
- `mode: payment` (one-time, not subscription)
- Success URL: `https://vrfy.lol/success?session_id={CHECKOUT_SESSION_ID}`
- Cancel URL: `https://vrfy.lol/pricing`

### Webhooks (POST /api/stripe/webhook)
- Event: `checkout.session.completed`
- Verify signature with `STRIPE_WEBHOOK_SECRET` (wrangler secret)
- Validate line_items → credits based on price_id map:
  ```
  price_xxx_10k  -> 10000
  price_yyy_50k  -> 50000
  price_zzz_250k -> 250000
  ```
- Generation:
  1. Generate API key
  2. Create KV record with credits
  3. Email key to customer via Resend (hello@vrfy.lol)
  4. Return key in success page API call (poll session → key, requires webhook completion)

### Secrets needed (wrangler secret put)
- `STRIPE_SECRET_KEY` - sk_live_
- `STRIPE_WEBHOOK_SECRET` - whsec_
- `STRIPE_PRICE_STARTER`, `_GROWTH`, `_SCALE` (or lookup via API)
- `RESEND_API_KEY` (existing? Check yoke has it — yoke uses hello@yoke.lol via Resend)
- `API_KEYS` KV namespace id

### Wrangler changes
```toml
[[kv_namespaces]]
binding = "API_KEYS"
id = "NEW_ID_HERE"

# secrets:
# STRIPE_SECRET_KEY
# STRIPE_WEBHOOK_SECRET
# ADMIN_KEY (exists)
# CACHE_SECRET (exists)
# POW_SECRET (exists)
```

## Worker code changes

### `src/types.ts`
Extend Env:
```ts
API_KEYS: KVNamespace;
STRIPE_SECRET_KEY?: string;
STRIPE_WEBHOOK_SECRET?: string;
```

### New file `src/paid/auth.ts`
- `extractApiKey(request): string|null` — X-API-Key or Bearer
- `lookupApiKey(env, rawKey): Promise<ApiKeyRecord|null>` — hash comparison
- `deductCredits(env, keyRecord, count): Promise<boolean>`
- `hashKey(key): Promise<string>` — SHA-256, not reversible

### `src/index.ts` modification points
1. Before existing PoW/rate limit block in handlePost/handleBatch:
   ```ts
   const apiKey = extractApiKey(request);
   if (apiKey) {
     const record = await lookupApiKey(env, apiKey);
     if (!record) return 401 invalid_api_key;
     if (record.credits_remaining < needed) return 402 payment_required;
     const ok = await deductCredits(...);
     // proceed, add credit headers to response
   } else {
     // existing free tier logic unchanged
   }
   ```

2. Add routes:
   - GET  /pricing → SPA pricing page (Stripe buy buttons)
   - GET  /success  → poll Checkout session, display API key once
   - GET  /api/docs update with paid section
   - POST /api/stripe/webhook → Stripe webhook handler (raw body read, signature verify)
   - POST /api/key/verify → verify key + remaining (no deduction)

3. Keep POST-only invariant: no email in URL, no API key in URL. Webhook is POST (Stripe required).

### Billing accounting
- Do not store raw email + API key linkage ever
- Count per-request only, no per-email log
- Admin `/api/usage` extended to show API key usage aggregated (counts, not keys)

## SPA changes (`src/spa.ts`)

### `landingPage()`
- Remove `<span class="badge">$0 forever</span>`
- Replace with: `<span class="badge">Free 10/hr</span>` + `<span class="badge"><a href="/pricing">Paid $2+</a></span>`

### New `pricingPage()`
- Three cards: Starter/Growth/Scale
- Each has: price, credits, effective $/1k, "Buy" button → Stripe Checkout URL
- Copy: "Prepaid credits, no subscription. Same full validation (41 signals + 13 extended when bound). No expiry."
- FAQ: What happens when credits run out? (Buy more, stack keys). Does free tier still exist? (Yes, forever).

### `docsPage()`
- Add section:
  ```md
  ## Paid API (optional)

  For high volume or programmatic use, get an API key. No rate limits.

  curl -s -X POST https://vrfy.lol/ \
    -H "X-API-Key: vk_live_..." \
    -H "Content-Type: application/json" \
    -d '{"email": "user@example.com"}' | jq .

  Keys are sent via Bearer or X-API-Key. Never in URL. Credits deduct per request.
  ```

### `aboutPage()`
- Update privacy copy: mention optional account / API key stored only as hash, not reversible, no email retention.

## Privacy + MIT + CONSTITUTION updates

New file (or update README):
`CONSTITUTION.md` v2 draft:
```
vrfy.lol Constitution v2 (Aug 20 2026)

- Free tier forever: 10/hr + 50/day + PoW unlimited, no account required
- Paid optional: prepaid credits, no subscription
- Privacy invariant: POST-only, raw email never stored, HMAC CACHE_SECRET for extended cache, domain cache 7d, extended 30d, hashed IP only for rate limiting, no email + API key join log
- MIT licensed: core validation engine MIT, paid billing wrapper + extended validation are deployment config / service bindings, not part of MIT artifact distinction needed
- Operational: aggregate counters only, no per-request PII in logs
```

README: update badge $0 forever → Free tier forever, optional paid.

## Deployment steps

1. Create Stripe product + 3 prices in dashboard
2. Create KV API_KEYS via `wrangler kv:namespace create API_KEYS`
3. Set wrangler secrets (see above)
4. Deploy code (GH Action deploy.yml does it)
5. Configure Stripe webhook endpoint `https://vrfy.lol/api/stripe/webhook`
6. Test with Stripe test mode keys first, then live
7. Add pricing page to footer cross-links — all .lol family footers should list /pricing when present

## Open questions

- Credit expiry: 24mo vs never? Stripe docs prefer expiry to avoid liability. v1: never, simple.
- Stacking keys: allow multiple active keys per customer, or one key topped off? Simplest: one key per checkout (stacking via multiple keys accepted).
- Refunds: webhook handles `charge.refunded` → zero out credits? Or hold? v1: manual review via hello@yoke.lol.
- Resend key: does yoke already have RESEND_API_KEY set? Check yoke wrangler — likely same CF account, we can reuse via secret.

## Minimal v1 checklist

- [ ] KV namespace created
- [ ] Stripe product/prices created (test + live)
- [ ] `src/paid/` files written
- [ ] `src/index.ts` fork main logic to check API key first
- [ ] SPA: pricing page + landing badge update + docs update
- [ ] Webhook signature verification via `stripe` npm (use lightweight SubtleCrypto verify to avoid bundling whole SDK — edge friendly)
- [ ] GH action deploy passes `bun test` + `typecheck`
- [ ] Manual test: free 10/hr still works, PoW still works, api key $2 test key works, headers show credits
- [ ] Update README + CONSTITUTION.md
- [ ] Push to main → deploy

## Security notes

- Never log raw API key server-side
- Hash is SHA-256 of key with optional pepper (reuse CACHE_SECRET if needed, but dedicated prefix cleaner)
- Timing-safe comparison for hash lookup (using SubtleCrypto constant-time)
- Webhook must read raw body before JSON parse (Stripe signature)
- Keep POST-only: webhook is POST only, checkout session GET is polling by session_id, not email
