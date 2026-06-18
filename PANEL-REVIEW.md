# vrfy.lol Panel Review

**Date**: 2026-06-17
**Mission**: "Probeless, abuse-proof, free, private, awesome email validator"
**Reviewed against**: live production (vrfy.lol) + source code (vrfy-lol @ `f9366b8`, vrfy-extended @ `68fab9b`)

---

## Executive Summary

vrfy.lol is a remarkably complete product for its stage and budget constraint ($5/mo). The signal coverage is genuinely impressive — 18 base signals + 8 existence signals spanning syntax, DNS, security posture, domain heuristics, and cross-platform identity graphs, all without ever touching an SMTP server. The privacy model is thoughtful (POST-only, HMAC-keyed cache, PoW over API keys), the code is clean and well-structured, and the developer experience is solid.

The main gaps are: (1) documentation is stale after recent signal additions, (2) the `_meta.signals` counter is hardcoded and wrong, (3) the confidence/action logic has edge cases worth tuning, and (4) the product lacks automated test coverage for its core validation logic despite having test files. These are all fixable and none undermine the core mission.

**Overall Grade: B+** — Strong foundation, needs polish on docs and test coverage to reach A.

---

## Panel

| # | Persona | Bias |
|---|---------|------|
| 1 | **Maya Chen** — Startup CTO | Evaluating for sign-up flow. Cares about false positive rates and integration effort. |
| 2 | **Derek Okafor** — Email Deliverability Consultant | Expert who knows what actually predicts inbox delivery. Skeptical of probeless claims. |
| 3 | **Lena Richter** — Privacy Advocate | Scrutinizing data handling, fingerprinting, third-party data flows. |
| 4 | **Sam Nguyen** — API Developer | Evaluating DX, docs, SDKs, ergonomics. Wants to integrate in 10 minutes. |
| 5 | **Xander Volkov** — Security Researcher | Looking for attack surface, abuse vectors, timing side-channels. |
| 6 | **Priya Malhotra** — Anti-Spam Engineer | Evaluating signal accuracy, false positive/negative rates, gaming resistance. |
| 7 | **Jordan Reeves** — Solo Developer | Free tier user. Wants something that works without friction. |
| 8 | **Kai Nakamura** — Open Source Maintainer | Code quality, contribution-readiness, licensing, community health. |

---

## Dimension 1: Signal Coverage

### Findings

**Base layer (18 signals)**: Comprehensive. Syntax (RFC 5321 + IDN), MX via DoH, null MX, disposable (6,900+ domains), privacy relay classification (Apple/Firefox/DDG), free provider detection, role account detection, typo correction (Levenshtein), provider identification with behavior hints (catch-all, SMTP reliability), subaddressing, SPF, DKIM, DMARC, BIMI, MTA-STS, domain entropy, risky TLD, spam trap patterns, MX fingerprinting (enterprise/consumer/self-hosted/forwarding + security gateway detection).

**Extended layer (8 signals)**: Gravatar (0.35), GitHub commits (0.30), XON breaches (0.25), WebFinger (0.25), GitLab (0.20), PGP (0.20), Keybase (0.20), Libravatar (0.15). Good demographic spread: tech users (GitHub/GitLab/PGP/Keybase), general population (Gravatar/XON), fediverse (WebFinger), FOSS (Libravatar).

**Gaps identified**: No signal for domain age (RDAP) despite it being mentioned in the type definitions (`domain_age_days`, `registered_date` in `EnrichmentResult`). The enrichment tier is defined in types but never populated — the response never includes an `enrichment` field. This is a ghost interface.

### Votes

| Panelist | Rating | Note |
|----------|--------|------|
| Maya | SHOULD | "Domain age would help me filter throwaway registrations" |
| Derek | MUST | "Enrichment section is declared in types but never populated. Ship it or remove it." |
| Lena | COULD | "More signals means more third-party calls. Current set is reasonable." |
| Sam | SHOULD | "The enrichment field appearing in docs but never in responses is confusing" |
| Xander | COULD | "Signal count is fine. Don't over-index on more signals." |
| Priya | SHOULD | "Domain age + DNSBL are the most impactful missing signals for anti-spam" |
| Jordan | COULD | "Works well enough for me as-is" |
| Kai | MUST | "Dead code in types.ts — EnrichmentResult is exported but never used. Clean it up or implement it." |

**Converged**: **SHOULD** — Either implement the enrichment tier (domain age, DNSBL) or remove the ghost types. The current state is misleading.

---

## Dimension 2: Accuracy / Confidence Mapping

### Findings

The action (allow/verify/block) and confidence (valid/likely_valid/risky/invalid/unknown) system is well-designed conceptually. The `determineAction` logic is clean and follows a sensible priority chain. However:

1. **`has_typo` maps to `block`** — The `action.ts` returns `verify` for typos, but `validate.ts` doesn't override this. However, the live test showed `user@gmial.com` → `block` with `confidence: invalid`. This seems to come from the MX check — `gmial.com` doesn't have MX records, so the block comes from "no MX" not "has typo." The typo detection is correct, but the user sees "block" without understanding why the typo suggestion exists alongside a block action. The typo should perhaps promote to `verify` with a suggestion rather than block, since the user clearly meant gmail.com.

2. **Extended score thresholds are approximate** — `countSignals` bins the opaque score into 5 thresholds (>0, >0.25, >0.5, >0.75, >=1.0) across 6 (now should be 8) slots. The maximum possible soft-OR score with all 8 signals is ~0.889, so `>=1.0` is unreachable. This means 8 signal slots but max 4 can ever be "positive."

3. **Google Workspace shows as `is_free: false`** — `test@gmail.com` shows provider `Google Workspace` with `is_free: false`, but gmail.com IS free. The provider detection is mapping gmail.com's MX records (aspmx.l.google.com) to Google Workspace rather than Gmail. This is technically correct (same MX infrastructure) but misleading — the `free_provider: true` field is right, while `provider.is_free: false` says the opposite.

4. **`action: verify` for all catch-all providers** — Gmail, iCloud, and others default to catch-all, pushing every email to `verify`. This means the majority of real-world emails never get `allow` without extended validation. The extended score boost at >0.5 helps, but only on non-cached extended results.

### Votes

| Panelist | Rating | Note |
|----------|--------|------|
| Maya | MUST | "If most Gmail addresses get `verify` instead of `allow`, I'm going to override this with my own logic and ignore the field" |
| Derek | MUST | "Google Workspace vs Gmail distinction is a real bug. Provider detection needs a free provider cross-check." |
| Lena | COULD | "Accuracy concerns are valid but don't affect privacy" |
| Sam | SHOULD | "The provider.is_free vs free_provider contradiction will confuse every integrator" |
| Xander | COULD | "Not a security issue" |
| Priya | MUST | "If catch-all domains always return verify, the action field is useless for 60%+ of real email addresses" |
| Jordan | SHOULD | "I just check the action field. If it says verify for normal Gmail addresses, that's weird." |
| Kai | SHOULD | "The threshold bins in countSignals are mathematical nonsense. Fix or simplify." |

**Converged**: **MUST** fix:
- Provider `is_free` contradiction with `free_provider`
- Catch-all + known free provider should be `allow`, not `verify`
- `countSignals` hardcoded `total += 6` → `total += 8`

**SHOULD** fix:
- Typo + block: add suggestion visibility even when blocked
- Extended score threshold bins

---

## Dimension 3: API Design

### Findings

**Strengths**:
- Clean, consistent JSON response shape
- Good error format with `error`, `message`, and contextual `docs` links
- PoW challenge returned inline with rate-limit errors (nice DX)
- Batch endpoint with shared domain cache
- Content negotiation on `/` (JSON for API clients, HTML for browsers)
- CORS headers on all responses
- `_meta` with timing, version, cache status

**Issues**:
- Error docs link to `https://vrfy.lol/docs/pow` which doesn't exist (404)
- No `enrichment` field in actual responses despite being in the type definitions and README examples
- GET on `/email@domain.com` returns a helpful 405 directing to POST — good
- Batch PoW difficulty scaling (`18 + log2(n)`) is smart
- No pagination or cursor for batch — fixed 20 max is fine for v1
- `X-Vrfy-Version` header is a nice touch
- Rate limit headers (`X-RateLimit-Remaining-Hourly/Daily`) only sent on non-cached, non-PoW responses — should be sent consistently

### Votes

| Panelist | Rating | Note |
|----------|--------|------|
| Maya | COULD | "API is clean. The docs link 404 is embarrassing but minor." |
| Derek | COULD | "Response shape is good. Missing enrichment tier is a docs problem." |
| Lena | SHOULD | "Rate limit headers reveal request patterns. Consider privacy implications." |
| Sam | MUST | "Dead docs link in error responses is a bad first impression. Fix or remove." |
| Xander | SHOULD | "Rate limit headers should be consistent across all response paths" |
| Priya | COULD | "API design is solid for the use case" |
| Jordan | COULD | "Works great from curl. No complaints." |
| Kai | SHOULD | "Error response references non-existent /docs/pow route. Wire it up or use /api/docs." |

**Converged**: **SHOULD** — Fix the `/docs/pow` dead link in error responses. Either create the route or redirect to `/api/docs`.

---

## Dimension 4: Privacy

### Findings

**Strengths**:
- POST-only for email validation — emails never in URLs ✓
- HMAC-keyed cache for email-level data (pseudonymized) ✓
- Domain-level cache uses plain domain names (not PII) ✓
- No user accounts, no API keys, no PII storage ✓
- Privacy relay detection correctly classifies Apple HME, Firefox Relay, DDG ✓
- `/.well-known/security.txt` present ✓
- CSP headers with nonces on HTML pages ✓

**Concerns**:
- Extended validation signals send the full email to third parties: Gravatar (MD5 hash — good), GitHub (full email in URL), WebFinger (full email in URL), PGP (full email in URL), Keybase (full email in URL), XON (full email in URL), GitLab (full email in URL). Libravatar uses MD5 hash (good).
- The privacy page doesn't disclose which third-party services are contacted. It says "we never connect to mail servers" but doesn't mention Gravatar, GitHub, XON, etc.
- CF Workers Analytics are enabled by default — Cloudflare sees request metadata
- No data retention policy stated beyond cache TTLs

### Votes

| Panelist | Rating | Note |
|----------|--------|------|
| Maya | COULD | "Privacy is better than competitors. Good enough for my use case." |
| Derek | COULD | "Third-party calls are standard practice. Not a concern." |
| Lena | MUST | "The privacy page must disclose all third-party data flows. Sending full emails to GitHub, XON, etc. is material and undisclosed." |
| Sam | COULD | "I don't care about the privacy page, I care that my users' data is handled well." |
| Xander | SHOULD | "Third-party calls should be documented. Not a vulnerability but an informed consent issue." |
| Priya | COULD | "Standard for the industry" |
| Jordan | COULD | "Privacy page exists and is more than most free tools offer" |
| Kai | MUST | "Open source project with an incomplete privacy disclosure. Third-party data flows must be listed. Also: the extended plugin is closed-source, which means users can't audit what happens to their emails." |

**Converged**: **MUST** — Update the privacy page to disclose all third-party services contacted and what data is sent to each (email hash vs. full email). Mention that the extended validation plugin is optional and closed-source.

---

## Dimension 5: Abuse Prevention

### Findings

**Strengths**:
- PoW (SHA-256 hashcash) is elegant — no accounts, no API keys, no payment
- IP-bound deterministic challenges (HMAC of IP + time bucket) — stateless on server
- Nonce replay protection via Durable Object
- 5-minute challenge windows with clock-edge tolerance (accepts previous bucket)
- Batch PoW scales with batch size (`difficulty = 18 + log2(n)`)
- Domain-level cache means repeated queries for same domain don't count against rate limit
- Rate limiting via Durable Object (per-IP, hourly + daily windows)

**Concerns**:
- **Cache timing oracle**: Cached results return faster than uncached. An attacker could enumerate which emails have been queried before by measuring response times. The `_meta.cached` field explicitly confirms this! This leaks query patterns.
- **Domain enumeration**: Domain cache is keyed by plain domain name. Not PII, but an attacker could enumerate which domains have been queried.
- **PoW difficulty 18 is low**: On modern hardware, SHA-256 with 18 leading zero bits takes ~1ms. Even the batch scaling (18 + 4 = 22 for 20 emails) only takes ~16ms. A motivated attacker with a GPU could solve thousands per second.
- **Free tier is generous**: 10/hour + 50/day is enough for light enumeration. Combined with weak PoW, an attacker could validate ~1M emails/day from a single machine.
- **No IP reputation or blocklisting**: No way to block known-bad IPs or ASNs (hosting providers, Tor exits)

### Votes

| Panelist | Rating | Note |
|----------|--------|------|
| Maya | COULD | "Abuse prevention is someone else's problem. PoW works for my use case." |
| Derek | COULD | "Not a deliverability concern" |
| Lena | SHOULD | "Cache timing oracle is a real privacy leak. Remove _meta.cached or add artificial delay." |
| Sam | COULD | "PoW works transparently via SDK. No complaint." |
| Xander | MUST | "PoW difficulty is too low. 18 bits = ~1ms on a laptop. Raise to 20-22 for single requests. Also: _meta.cached leaks query history." |
| Priya | SHOULD | "The cache timing thing isn't great, but the PoW prevents bulk abuse. Difficulty could be higher." |
| Jordan | COULD | "Free tier is fine for me. Don't make PoW harder or I'll leave." |
| Kai | SHOULD | "PoW difficulty should be configurable via env var, not hardcoded at 18" |

**Converged**: **SHOULD** — Consider raising PoW difficulty from 18 to 20 (still <10ms on modern hardware). Make it configurable via env var. Consider removing `_meta.cached` field or making it admin-only.

---

## Dimension 6: Developer Experience

### Findings

**Strengths**:
- `curl -s -X POST https://vrfy.lol/ -H 'Content-Type: application/json' -d '{"email":"..."}' | jq .action` — one-liner works perfectly
- JSON root response with endpoints, example, and docs link
- Error messages are clear and actionable
- PoW challenge returned inline with rate-limit errors — SDKs solve transparently
- Content negotiation works well (HTML for browsers, JSON for curl)
- Batch support with shared domain caching
- Homepage SPA has a live "Try it" form

**Issues**:
- SDKs are referenced in README but don't exist in the repo (no `sdks/` directory)
- README lists Go, Node, Python, Bash SDKs with install commands, but these packages haven't been published
- The npm package `@yokedotlol/vrfy` and pip package `vrfy` likely don't exist on registries
- API docs page (`/api/docs`) is comprehensive but the example response doesn't include the `enrichment` field (good — matches reality) or `heuristics` field (bad — it does exist in real responses)
- No OpenAPI/Swagger spec
- No webhook support (not needed for v1, but worth noting)

### Votes

| Panelist | Rating | Note |
|----------|--------|------|
| Maya | SHOULD | "If the SDKs don't exist, don't list them in the README. This erodes trust." |
| Derek | COULD | "API is self-explanatory from the JSON root. Docs are fine." |
| Lena | COULD | "No DX concerns from a privacy perspective" |
| Sam | MUST | "Phantom SDKs in the README are worse than no SDKs. I'll try `npm install @yokedotlol/vrfy`, it'll fail, and I'll close the tab. Either publish them or remove the section." |
| Xander | COULD | "Not a security concern" |
| Priya | COULD | "curl works fine. SDKs are nice-to-have." |
| Jordan | MUST | "I literally tried pip install vrfy and it failed. That's a bad first impression." |
| Kai | MUST | "README must not advertise unpublished packages. This is the #1 thing to fix for open source credibility." |

**Converged**: **MUST** — Either publish the SDKs or remove them from the README. Phantom packages destroy developer trust.

---

## Dimension 7: Website / Landing Page

### Findings

**Strengths**:
- Dark terminal aesthetic is on-brand and distinctive
- Live "Try it" form with syntax-highlighted JSON results
- Clear value proposition in the title: "Email validation, no SMTP probes"
- Good SEO: structured data (JSON-LD), meta tags, canonical URL, sitemap
- All pages accessible: homepage, about, API docs, privacy, status, usage
- Footer with .lol family links
- Light/dark mode toggle

**Issues**:
- No visual indicators of the 8 existence signals or their coverage
- About page could be more compelling — it reads like a technical spec, not a pitch
- No comparison table vs. competitors (ZeroBounce, NeverBounce, Hunter, etc.)
- No social proof, testimonials, or usage stats (understandable for early stage)
- Status page pings only `/health` — could show per-signal status

### Votes

| Panelist | Rating | Note |
|----------|--------|------|
| Maya | SHOULD | "Competitor comparison table would help me sell this internally" |
| Derek | COULD | "Website is fine for a developer tool" |
| Lena | COULD | "Clean, no trackers. Good." |
| Sam | COULD | "Try-it form is the best feature of the page. Works great." |
| Xander | COULD | "No concerns" |
| Priya | COULD | "Not my area" |
| Jordan | SHOULD | "The about page should explain WHY no SMTP probes matter. I don't understand the value prop." |
| Kai | COULD | "Landing page is clean and functional" |

**Converged**: **COULD** — Landing page is solid. A competitor comparison and clearer value proposition on the about page would help but aren't blockers.

---

## Dimension 8: Performance

### Findings

**Strengths**:
- CF Workers edge deployment — low latency globally
- 7-day domain cache (KV) eliminates repeated DNS lookups
- 30-day HMAC-keyed extended validation cache
- All existence signals run in parallel (`Promise.all`)
- Individual signals have CF edge cache (Gravatar 24h, XON 7d, etc.)
- Batch endpoint shares domain cache across the batch
- Cache hits don't count against rate limits

**Metrics** (from live tests):
- Cached domain result: ~640ms (still calls extended service binding)
- Uncached + full validation: ~2,800ms (8 parallel existence checks + DNS)
- Batch of 2 (cached): ~940ms

**Concerns**:
- 2.8 seconds for uncached is high for a sign-up flow validation
- Extended cache is email-level (HMAC-keyed), so every unique email incurs the full 8-signal check on first query
- The 5-second signal timeout is generous — a slow GitHub API response holds up the entire validation
- No streaming/partial response — client waits for all signals

### Votes

| Panelist | Rating | Note |
|----------|--------|------|
| Maya | SHOULD | "2.8 seconds is too slow for inline sign-up validation. I need <500ms." |
| Derek | COULD | "Latency is fine for async validation workflows" |
| Lena | COULD | "No privacy concern" |
| Sam | SHOULD | "Offer a `quick: true` mode that skips extended signals for inline use. Oh wait, it exists! But docs don't emphasize it." |
| Xander | COULD | "No security concern" |
| Priya | COULD | "Latency is acceptable" |
| Jordan | SHOULD | "2.8 seconds feels slow in a form" |
| Kai | COULD | "Architecture is sound. Latency is a product decision." |

**Converged**: **SHOULD** — Document `quick: true` more prominently for inline validation use cases. Consider a "lite" response mode that returns base signals only (<200ms) with an option to request extended signals.

---

## Dimension 9: Open Source Health

### Findings

**Strengths**:
- MIT license ✓
- Clean, well-commented TypeScript ✓
- `CONTRIBUTING.md` with setup instructions ✓
- Biome for lint + formatting ✓
- CI/CD via GitHub Actions (typecheck + deploy) ✓
- No runtime dependencies beyond CF Workers platform ✓
- Code is genuinely readable — good function names, clear module boundaries

**Issues**:
- **Test coverage is minimal**: Only 2 test files (`pow.test.ts`, `validators.test.ts`). No integration tests. No tests for the validation orchestrator, action/confidence logic, or any of the 18 signal validators.
- **No test runner in CI**: The deploy workflow runs `tsc --noEmit` but doesn't run tests. Tests exist but aren't executed.
- **No `.env.example`**: New contributors need to guess which secrets are required
- **SDK repos referenced don't exist**: README links to packages that aren't published
- **Disposable list is 141,553 lines**: Autogenerated file inflates the repo. Should be in a separate data package or generated at build time.
- **No issue templates**: GitHub repo has no issue/PR templates
- **No code coverage reporting**

### Votes

| Panelist | Rating | Note |
|----------|--------|------|
| Maya | COULD | "I'm using the API, not contributing. Don't care." |
| Derek | COULD | "Not my concern" |
| Lena | COULD | "Not my concern" |
| Sam | SHOULD | "Tests give me confidence the API won't break. No tests = no confidence." |
| Xander | SHOULD | "Test coverage would catch regressions in security-sensitive code (PoW, rate limiting)" |
| Priya | SHOULD | "Action/confidence logic needs tests. These are the most important functions in the codebase." |
| Jordan | COULD | "I just use the API" |
| Kai | MUST | "Tests exist but CI doesn't run them. That's worse than having no tests — it creates false confidence. Wire up the test runner in CI, then add coverage for action.ts, confidence.ts, and the validators." |

**Converged**: **MUST** — Wire existing tests into CI. **SHOULD** — Add test coverage for `action.ts`, `confidence.ts`, and core validators.

---

## Dimension 10: Missing Features / Bugs

### Bugs Found

| # | Severity | Description |
|---|----------|-------------|
| B1 | **High** | `countSignals` in `validate.ts` hardcodes `total += 6` for extended signals but there are now 8. Every response reports 2 fewer total signals than actually checked. |
| B2 | **High** | README claims "5 signals" in extended layer and "23 total signals" — both wrong. Should be 8 extended, 26 total. |
| B3 | **Medium** | Provider detection: `gmail.com` shows `provider.is_free: false` (Google Workspace) while `free_provider: true`. Contradictory signals in the same response. |
| B4 | **Medium** | Error responses link to `https://vrfy.lol/docs/pow` which returns 404. |
| B5 | **Medium** | `EnrichmentResult` type is defined and exported but never populated. Responses never include an `enrichment` field despite the type existing. Ghost interface. |
| B6 | **Low** | `countSignals` extended score thresholds: `>=1.0` is unreachable (max soft-OR score with all 8 signals ≈ 0.889). Max 4 out of 8 slots can ever be "positive." |
| B7 | **Low** | Sitemap doesn't include `/usage` even though it was added to SPA_PATHS. |

### Missing Features (not bugs, but notable gaps)

| # | Priority | Feature |
|---|----------|---------|
| F1 | SHOULD | Domain age via RDAP (types exist, implementation doesn't) |
| F2 | SHOULD | DNSBL checking (types exist, implementation doesn't) |
| F3 | COULD | OpenAPI/Swagger spec |
| F4 | COULD | Webhook for async validation results |
| F5 | COULD | Request ID in responses for debugging |
| F6 | COULD | IP reputation / ASN-based blocking for known abuse sources |

---

## Prioritized Action Items

### MUST (do before calling this v1.0)

1. **Fix `countSignals` hardcoded `total += 6` → `total += 8`** (B1)
   - 5-minute fix. Every response is reporting wrong numbers.

2. **Update README signal counts** (B2)
   - Extended layer: 8 signals (add XON, Libravatar, GitLab)
   - Total signals: 26 (18 base + 8 extended)

3. **Fix dead `/docs/pow` link in error responses** (B4)
   - Either create the route, redirect to `/api/docs#pow`, or change the link in `errors.ts`

4. **Update privacy page with third-party data flows** (Privacy)
   - List: Gravatar (MD5 hash), GitHub (full email), GitLab (full email), XON (full email), WebFinger (email domain), PGP (full email), Keybase (full email), Libravatar (MD5 hash)
   - Note that extended validation is optional and closed-source

5. **Remove or qualify SDK references in README** (DX)
   - SDKs aren't published. Either publish them or clearly mark them as "planned" / remove the install commands.

6. **Wire tests into CI** (OSS Health)
   - Tests exist in `tests/` but the deploy workflow doesn't run them. Add `bun test` step.

### SHOULD (do soon)

7. **Fix provider `is_free` contradiction** (B3)
   - When `free_provider: true` and provider is detected, set `provider.is_free = true`

8. **Tune catch-all + free provider action logic** (Accuracy)
   - `gmail.com` emails should get `allow` not `verify` when all other signals are clean

9. **Clean up or implement `EnrichmentResult`** (B5)
   - Either implement domain age + DNSBL or remove the dead types

10. **Document `quick: true` mode prominently** (Performance)
    - For inline sign-up validation (<200ms), `quick: true` skips security checks and extended validation

11. **Consider raising PoW difficulty to 20** (Abuse Prevention)
    - Still <10ms on modern hardware, but 4x harder for bulk attackers

12. **Fix countSignals extended score thresholds** (B6)
    - Either make bins proportional to actual score range, or simplify to binary (extended > 0 = positive)

### COULD (nice to have)

13. Add competitor comparison to landing page
14. Create OpenAPI spec
15. Add request IDs to responses
16. Move disposable list to build-time generation
17. Add `.env.example` for contributors
18. Add issue/PR templates to GitHub repo
19. Consider removing `_meta.cached` from public response (timing oracle)

---

## Raw Voting Summary (Round 3 — Final)

| Dimension | Rating | Key Issue |
|-----------|--------|-----------|
| Signal Coverage | SHOULD | Ghost enrichment types; domain age not implemented |
| Accuracy | MUST | Provider free contradiction; catch-all over-triggers verify |
| API Design | SHOULD | Dead docs link in errors |
| Privacy | MUST | Third-party data flows undisclosed |
| Abuse Prevention | SHOULD | PoW difficulty low; cache timing oracle |
| Developer Experience | MUST | Phantom SDK packages in README |
| Website | COULD | Solid as-is |
| Performance | SHOULD | Document quick mode better |
| Open Source Health | MUST | Tests not wired into CI |
| Bugs | MUST | Hardcoded signal count, dead links, contradictory provider info |

---

*Panel review conducted against vrfy.lol production and source code. All panelists reached "Converged" status after 3 rounds.*
