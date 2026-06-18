# vrfy.lol Panel Review #2

**Date:** 2026-06-17
**Scope:** Full codebase, documentation, SPA, CI/CD, client SDKs, issue templates
**Reviewer:** Post-fix comprehensive audit following Panel Review #1

---

## Panel

| # | Persona | Bias |
|---|---------|------|
| 1 | **Sage** — Security Researcher | Privacy, timing attacks, information leakage, supply chain |
| 2 | **Dev** — API Consumer | DX, docs accuracy, error messages, response consistency |
| 3 | **Kai** — Open Source Contributor | Repo quality, contributing guide, onboarding, issue templates |
| 4 | **Mel** — Email Deliverability Expert | RFC compliance, signal accuracy, edge cases |
| 5 | **Rio** — Cloudflare Workers Expert | Performance, limits, cost, platform edge cases |
| 6 | **Lex** — Privacy Advocate | Data handling, logging, PII exposure |
| 7 | **Ari** — Front-End Developer | SPA quality, accessibility, mobile, dark/light mode |
| 8 | **Sam** — Self-Hoster | Deployment docs, configuration, secrets, missing setup steps |

---

## Divergent Pass — All Findings

### F1. Privacy page says "Have I Been Pwned" but code uses XposedOrNot (XON)

**Location:** `src/spa.ts:863`, `src/index.ts:425-436`

The privacy page tells users their email may be sent to "Have I Been Pwned (haveibeenpwned.com)" — but the actual extended validation code and `/api/usage` dashboard reference XON (XposedOrNot), not HIBP. This is a material inaccuracy in a privacy disclosure.

The `/api/usage` endpoint explicitly names XON signals, and the usage dashboard labels it "XON Breach Intelligence."

### F2. Batch PoW difficulty uses base 18, but DEFAULT_DIFFICULTY is 20

**Location:** `src/index.ts:323,346`, `src/pow.ts:29`

Single-email PoW difficulty uses `DEFAULT_DIFFICULTY = 20`. But batch PoW calculates `18 + Math.floor(Math.log2(body.emails.length))`, hardcoding base 18 instead of `DEFAULT_DIFFICULTY`. This means a batch of 1 email is easier (difficulty 18) than a single email (difficulty 20), and a batch of 4 equals single (18+2=20). This is either an intentional decision or a bug from when difficulty was 18.

### F3. SPA result view doesn't render security or heuristic sections

**Location:** `src/spa.ts` `renderResult()` function

The API returns `security` (grade, SPF, DMARC, BIMI, MTA-STS) and `heuristics` (risky TLD, entropy, spam trap, MX class) in the response, but the SPA's `renderResult()` only renders the `validation` section signals. The security grade and heuristic warnings are invisible to website users unless they click "Raw JSON."

### F4. Sitemap includes /usage (admin-gated, noindex page)

**Location:** `src/index.ts` `sitemap()` function

The sitemap includes `https://vrfy.lol/usage` which is (a) behind HTTP Basic Auth, (b) tagged with `<meta name="robots" content="noindex, nofollow">`. Including it in the sitemap contradicts the noindex directive and leaks the existence of an admin endpoint.

### F5. README has phantom "Domain-only lookup (GET)" example

**Location:** `README.md` Usage section

The Usage section includes:
```bash
# Domain-only lookup (GET)
curl -s https://vrfy.lol/example.com | jq
```
But no GET domain-only endpoint exists. `GET /example.com` returns 404 (not found, since `example.com` doesn't contain `@`). This feature doesn't exist in the codebase.

### F6. CONTRIBUTING.md references Biome but it's not installed

**Location:** `CONTRIBUTING.md`, `package.json`

CONTRIBUTING.md tells contributors to run `npx @biomejs/biome check .` for linting, but Biome is not in `devDependencies` and `node_modules/@biomejs` doesn't exist. CI doesn't run a lint step either — only `bun run typecheck` and `bun test`.

### F7. Client SDKs reference phantom endpoints and unpublished packages

**Location:** `clients/go/README.md`, `clients/bash/README.md`, `clients/node/`, `clients/python/`

Multiple phantom references:
- `curl -sSL https://vrfy.lol/install.sh | bash` — no install.sh endpoint exists
- `curl -sL vrfy.lol/vrfy.sh` — no vrfy.sh endpoint exists
- `brew install yokedotlol/tap/vrfy` — no Homebrew tap exists
- `npm install @yokedotlol/vrfy` — package not published on npm
- `pip install vrfy` — package not published on PyPI

The client code exists but none of it is published or installable.

### F8. SPA disposable count says "100K+" but README says "141,000+"

**Location:** `src/spa.ts:721`, `README.md`

The landing page feature grid says "100K+ disposable domains" while the README (just updated) says "141,000+". The actual generated list has ~141,505 domains. The SPA is stale.

### F9. `dkim` request option accepted but never used

**Location:** `src/types.ts:91`, `src/validate.ts:52`

The `ValidateRequest` type accepts `dkim?: 'full'` and it's passed through to `ValidateOptions`, but nothing in the validation pipeline ever reads it. DKIM is hardcoded to `false` with a "Phase 2" comment. The API docs SPA page doesn't mention this option, but the types accept it silently.

### F10. `SecurityResult` includes `tls_rpt` always `false`

**Location:** `src/validators/dns-security.ts:193,197`

`dkim` and `tls_rpt` are always `false` in every response. They occupy space in the JSON and could mislead consumers into thinking the domain has no DKIM/TLS-RPT when it's just not checked. These are Phase 2 stubs.

### F11. SECURITY.md missing

**Location:** repo root

No `SECURITY.md` exists. `security.txt` points to `hello@yoke.lol`, but GitHub expects a `SECURITY.md` for its security advisory feature. For an email validation tool, having a clear security reporting path matters.

### F12. About page says contact is `hello@vrfy.lol` but security.txt says `hello@yoke.lol`

**Location:** `src/spa.ts` aboutPage(), privacyPage(), `src/index.ts` securityTxt()

The About and Privacy pages list `hello@vrfy.lol` as the contact email. The `security.txt` lists `hello@yoke.lol`. It's unclear if `hello@vrfy.lol` actually routes anywhere — per workspace conventions, vrfy.lol may not have email routing configured (only certs.lol and yoke.lol have documented routing).

### F13. `json()` helper sets `Cache-Control: public, max-age=60` on ALL JSON responses

**Location:** `src/index.ts` `json()` function

Every JSON response — including validation results, error responses, and rate-limit 429s — gets `Cache-Control: public, max-age=60`. This means:
- Rate-limit errors could be cached by CDN/browser, causing stale PoW challenges
- Validation results for different emails on the same URL could theoretically be cached (POST responses aren't cached by most CDNs, but the header is misleading)

### F14. No `Content-Length` or `Transfer-Encoding` on responses

**Location:** `src/index.ts`

Minor: Worker responses don't set `Content-Length`. Cloudflare Workers typically handle this transparently, but for API consumers that stream/parse, explicit content-length is nice-to-have.

### F15. SPA client-side navigation breaks on JS errors

**Location:** `src/spa.ts` scripts

The SPA uses client-side navigation with `history.pushState` + `fetch`. If the page fetch fails (network error, 500), there's no error handling in `loadPage()` — it would show a blank main section. The `then(function(html))` chain has no `.catch()`.

### F16. `pm.me` appears twice in `FREE_PROVIDERS` set

**Location:** `src/data/free-providers.ts`

`pm.me` appears both in the Proton group and again at the bottom of the file. Harmless because it's a Set, but indicates copy-paste oversight.

### F17. `dkim` field in API docs SPA not documented

**Location:** `src/spa.ts` docsPage()

The POST `/` docs page lists `email`, `quick`, `force`, and `pow` but not `dkim`. Since the types accept `dkim: 'full'`, either document it or remove it from the types.

### F18. README response example omits several validation fields

**Location:** `README.md` Response section

The example JSON response omits `null_mx`, `privacy_relay_service`, `typo_suggestion`, `subaddress_tag`, `subaddress_base`, and the full `provider` object (only shows name + is_free). This is acceptable for brevity but could surprise consumers who see more fields in real responses.

### F19. Extended signal "XON" described as "cross-origin name resolution" in README

**Location:** `README.md:94`

The README lists "XON (cross-origin name resolution)" as an extended signal. But XON in the codebase is XposedOrNot, a breach database. "Cross-origin name resolution" sounds like a DNS/CORS thing. The name is misleading.

### F20. `hello@vrfy.lol` contact in about/privacy pages may not work

**Location:** `src/spa.ts`

If vrfy.lol doesn't have email routing, `hello@vrfy.lol` is a dead address. The security.txt correctly uses `hello@yoke.lol` which has documented Resend routing, but the user-facing pages use an unverified address.

### F21. PoW test uses base difficulty 18 in assertions

**Location:** `tests/pow.test.ts:67`

The test asserts batch difficulty as `18 + Math.floor(Math.log2(N))`, matching the code. But since `DEFAULT_DIFFICULTY` was changed to 20, these tests document the inconsistency rather than catching it.

### F22. Rate limiter `alarm()` doesn't clean up nonces on full expiry

**Location:** `src/rate-limiter.ts`

In `alarm()`, when both hourly and daily windows expire, `this.state.storage.deleteAll()` is called. This clears everything including storage-backed state. But `spentNonces` is an in-memory `Map` that's cleared too — which is fine. However, if the DO is evicted and recreated between requests, `spentNonces` starts empty (no persistence), meaning nonce replay is theoretically possible after DO eviction. This is a known Workers limitation and acceptable for this use case, but worth noting.

### F23. CI doesn't run lint

**Location:** `.github/workflows/deploy.yml`

CI runs `bun run typecheck` and `bun test` but no lint step. CONTRIBUTING.md tells contributors to use Biome for linting, but CI doesn't enforce it. There's no Biome config file either.

---

## Voting

| # | Finding | Sage | Dev | Kai | Mel | Rio | Lex | Ari | Sam | Verdict |
|---|---------|------|-----|-----|-----|-----|-----|-----|-----|---------|
| F1 | Privacy page says HIBP, code uses XON | **MUST** | SHOULD | SHOULD | SHOULD | CUT | **MUST** | CUT | CUT | **MUST** |
| F2 | Batch PoW base 18 vs DEFAULT_DIFFICULTY 20 | **MUST** | **MUST** | CUT | CUT | **MUST** | CUT | CUT | CUT | SHOULD |
| F3 | SPA doesn't render security/heuristics | CUT | SHOULD | COULD | SHOULD | CUT | CUT | **MUST** | CUT | SHOULD |
| F4 | Sitemap includes noindex /usage | SHOULD | CUT | CUT | CUT | SHOULD | SHOULD | CUT | CUT | SHOULD |
| F5 | README phantom GET domain-only endpoint | CUT | **MUST** | **MUST** | CUT | CUT | CUT | CUT | **MUST** | **MUST** |
| F6 | CONTRIBUTING references non-existent Biome | CUT | CUT | **MUST** | CUT | CUT | CUT | CUT | **MUST** | SHOULD |
| F7 | Client SDKs phantom endpoints/packages | CUT | **MUST** | **MUST** | CUT | CUT | CUT | CUT | SHOULD | **MUST** |
| F8 | SPA disposable count "100K+" vs 141K+ | CUT | SHOULD | SHOULD | SHOULD | CUT | CUT | SHOULD | CUT | SHOULD |
| F9 | `dkim` request option accepted but unused | COULD | SHOULD | CUT | SHOULD | CUT | CUT | CUT | CUT | SHOULD |
| F10 | `dkim`/`tls_rpt` always false in response | COULD | SHOULD | CUT | SHOULD | CUT | CUT | CUT | CUT | COULD |
| F11 | SECURITY.md missing | **MUST** | CUT | SHOULD | CUT | CUT | SHOULD | CUT | SHOULD | SHOULD |
| F12 | Contact email mismatch (vrfy vs yoke) | COULD | CUT | CUT | CUT | CUT | SHOULD | CUT | CUT | COULD |
| F13 | `Cache-Control: public` on error/429 responses | SHOULD | SHOULD | CUT | CUT | SHOULD | CUT | CUT | CUT | SHOULD |
| F14 | No Content-Length on responses | CUT | CUT | CUT | CUT | CUT | CUT | CUT | CUT | **CUT** |
| F15 | SPA loadPage() missing error handling | CUT | CUT | CUT | CUT | CUT | CUT | SHOULD | CUT | COULD |
| F16 | `pm.me` duplicate in FREE_PROVIDERS | CUT | CUT | COULD | CUT | CUT | CUT | CUT | CUT | **CUT** |
| F17 | `dkim` option undocumented in API docs | CUT | SHOULD | COULD | CUT | CUT | CUT | CUT | CUT | COULD |
| F18 | README response example incomplete | CUT | COULD | COULD | CUT | CUT | CUT | CUT | CUT | **CUT** |
| F19 | XON described as "cross-origin name resolution" | CUT | SHOULD | SHOULD | CUT | CUT | CUT | CUT | CUT | SHOULD |
| F20 | `hello@vrfy.lol` may be dead | SHOULD | CUT | CUT | CUT | CUT | SHOULD | CUT | CUT | SHOULD |
| F21 | PoW test uses stale base difficulty | CUT | CUT | CUT | CUT | COULD | CUT | CUT | CUT | **CUT** |
| F22 | Nonce replay after DO eviction | COULD | CUT | CUT | CUT | COULD | COULD | CUT | CUT | **CUT** |
| F23 | CI doesn't run lint | CUT | CUT | SHOULD | CUT | CUT | CUT | CUT | CUT | COULD |

---

## Convergence — Final Priority

### MUST (fix before calling this clean)

| # | Finding | Action |
|---|---------|--------|
| **F1** | Privacy page says "Have I Been Pwned" but code uses XposedOrNot | Update privacy page to accurately name XposedOrNot (or remove if the plugin calls XON not HIBP). Material privacy disclosure error. |
| **F5** | README phantom "Domain-only lookup (GET)" | Remove the `curl -s https://vrfy.lol/example.com | jq` line. This endpoint returns 404. |
| **F7** | Client SDKs reference phantom endpoints/packages | Either (a) add a prominent "NOT YET PUBLISHED" banner to each client README, or (b) add a top-level `clients/README.md` noting none are published yet, or (c) delete the client directories entirely until they ship. `vrfy.lol/vrfy.sh`, `vrfy.lol/install.sh`, and `brew install` all 404. |

### SHOULD (address soon)

| # | Finding | Action |
|---|---------|--------|
| **F2** | Batch PoW base 18 vs DEFAULT_DIFFICULTY 20 | Either change batch formula to `DEFAULT_DIFFICULTY + Math.floor(Math.log2(N))` or document the intentional asymmetry. Currently single = 20, batch of 1 = 18. |
| **F3** | SPA doesn't render security/heuristics | Add security grade and notable heuristic warnings (risky TLD, entropy suspicious, spam trap) to the SPA result view. These are the most interesting signals for website visitors. |
| **F4** | Sitemap includes /usage | Remove `/usage` from `sitemap()`. It's noindex + auth-gated. |
| **F6** | CONTRIBUTING references Biome (not installed) | Either install Biome and add a config, or update CONTRIBUTING.md to reference just TypeScript strict mode + `bun run typecheck`. |
| **F8** | SPA disposable count stale | Update "100K+" to "141K+" in `landingPage()` in `src/spa.ts`. |
| **F9** | `dkim` option accepted but unused | Remove `dkim` from `ValidateRequest` and `ValidateOptions` until Phase 2 implementation exists. Accepting it silently is misleading. |
| **F11** | SECURITY.md missing | Add `SECURITY.md` referencing `hello@yoke.lol` (the working email from security.txt). |
| **F13** | Cache-Control: public on errors | Change `json()` helper to use `no-store` for error responses and `public, max-age=60` only for successful validation results. Or move cache control to the caller. |
| **F19** | XON described as "cross-origin name resolution" | Fix README to describe XON as "XposedOrNot breach database" instead of "cross-origin name resolution." |
| **F20** | `hello@vrfy.lol` may not route | Verify email routing works, or change to `hello@yoke.lol` to match security.txt. |

### COULD (nice to have)

| # | Finding | Action |
|---|---------|--------|
| **F10** | `dkim`/`tls_rpt` always false | Either remove these fields until implemented, or add a note to the response (e.g., "Phase 2 — not yet checked") to avoid misleading consumers. |
| **F12** | Contact email inconsistency | Decide on one canonical contact email and use it everywhere (security.txt, about, privacy). |
| **F15** | SPA loadPage() missing catch | Add `.catch()` to the client-side nav `fetch()` to show an error message instead of blank content. |
| **F17** | `dkim` option undocumented | If kept, document it; if removed per F9, this resolves itself. |
| **F23** | CI doesn't lint | Add a lint step to CI once a linter is configured (per F6). |

### CUT (not worth fixing)

| # | Finding | Rationale |
|---|---------|-----------|
| **F14** | No Content-Length | Workers handles this. No real impact. |
| **F16** | `pm.me` duplicate | Set dedupes automatically. Zero impact. |
| **F18** | README response example incomplete | Brevity is acceptable for examples. Fields are typed and discoverable. |
| **F21** | PoW test stale difficulty | Tests correctly document the current code behavior; the inconsistency is in F2. |
| **F22** | Nonce replay after DO eviction | Known Workers limitation, ephemeral nonce state is acceptable for anti-abuse (not security-critical). |

---

## Summary

**3 MUSTs** — all documentation accuracy issues (privacy disclosure error, phantom features in README and client docs).

**10 SHOULDs** — mostly stale references, missing hardening, and DX polish. The batch PoW difficulty inconsistency (F2) is the most technically interesting.

**5 COULDs** — minor DX and code quality improvements.

**5 CUTs** — harmless or platform-inherent.

### Regressions from Panel Review #1

None found. All previously identified issues appear resolved:
- ✅ Phantom SDK references removed from main README
- ✅ /usage auth-gated with HTTP Basic
- ✅ PoW difficulty raised from 18→20
- ✅ .env.example added
- ✅ Issue templates standardized
- ✅ Disposable list generated at build time
- ✅ Panel review bugs B1-B7 fixed

### New Issues Not in Review #1

The privacy page HIBP disclosure (F1) and the stale GET domain-only example in the README (F5) are new findings not covered by the first review.

---

## Panelist Status

| Panelist | Status |
|----------|--------|
| Sage | Converged |
| Dev | Converged |
| Kai | Converged |
| Mel | Converged |
| Rio | Converged |
| Lex | Converged |
| Ari | Converged |
| Sam | Converged |
