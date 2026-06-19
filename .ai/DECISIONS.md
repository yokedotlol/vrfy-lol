# vrfy.lol — Decision Log

> Append-only record of significant decisions. Never edit or remove entries.

---

### 2026-06-13 — Project created

vrfy.lol registered. Email validation API, part of the .lol family. No SMTP probes by design.

---

### 2026-06-13 — No CLI

**What changed:** Removed CLI from scope entirely.
**Why:** Domain security audit is Yoke's job. Nobody runs email validation assertions in CI. No real user constituency for terminal email validation.
**Directive:** Do not add a CLI. The product is a hosted API + SPA.

---

### 2026-06-13 — No MCP server

**What changed:** MCP server removed from scope.
**Why:** The maintainer's reaction: "Gross."
**Directive:** Do not add MCP.

---

### 2026-06-13 — No bulk mode

**What changed:** Removed bulk list cleaning.
**Why:** Can't compete with SMTP-based validators on list cleaning. Batch endpoint (20 emails) serves the sign-up batch use case.
**Directive:** `POST /batch` is the ceiling. No bulk endpoints.

---

### 2026-06-13 — vrfy.lol stands alone

**What changed:** Removed all cross-linking to yoke.lol and certs.lol. No `_meta.full_report` link. No funnel.
**Why:** "Sally in accounting is probably a valid email" → "do you want to know more about Sally's company" is an unnatural context switch. certs → yoke works (TLS → domain), but vrfy → yoke doesn't.
**Directive:** No cross-links to other .lol tools in API responses or SPA. Same family brand, independent products.

---

### 2026-06-13 — FakeFilter: API only, no bundling

**What changed:** Use FakeFilter API at runtime as supplementary data. Do not bundle their dataset.
**Why:** No license on FakeFilter repo. CC0 disposable-email-domains list (35K+ domains) is the primary bundled dataset.
**Directive:** Only CC0/MIT-compatible data gets bundled. Unlicensed sources accessed via API only.

---

### 2026-06-13 — Rate limit: 10/min per IP

**What changed:** Set rate limit to 10 requests/min (conservative).
**Why:** Lighter than certs.lol but want to protect against abuse. Batch endpoint makes it effectively 200 validations/min.
**Directive:** 10/min per IP. Batch = 1 request.

---

### 2026-06-13 — Repo private until launch

**What changed:** GitHub repo stays private until launch.
**Why:** Cleaner reveal, no half-built code visible.
**Directive:** Flip to public at launch, not before.

---

### 2026-06-13 — Separate vrfy-probe on Fly

**What changed:** New `vrfy-probe` service on Fly.io, separate from yoke-probe.
**Why:** Different workloads (DNS lookups vs TLS handshakes). Independent scaling and deploys. Extra $1.94/mo is worth the clean separation.
**Directive:** vrfy-probe is its own Fly service.

---

### 2026-06-13 — hello@vrfy.lol email

**What changed:** Set up vrfy.lol with its own email via CF Email Routing → Gmail.
**Why:** An email validation tool should have email on its own domain.

---

### 2026-06-13 — Staggered launch

**What changed:** Soft launch first, Show HN later.
**Why:** Lower risk. Let people kick the tires, fix what breaks, then announce.
**Directive:** No big-bang launch.

---

### 2026-06-17 — Rate limit relaxed to 10/hour + 50/day

**What changed:** Rate limit updated from 10/min to 10 requests/hour + 50 requests/day per IP.
**Why:** 10/min was the initial conservative target. Actual implementation uses hourly + daily sliding windows for smoother ergonomics. Batch (20 emails) still counts as 1 request. Cache hits exempt.
**Directive:** 10/hour + 50/day per IP. INVARIANTS.md updated to match.

---

### 2026-06-17 — Contact email uses hello@yoke.lol

**What changed:** All contact references point to `hello@yoke.lol` instead of `hello@vrfy.lol`.
**Why:** vrfy.lol email routing via CF was planned but never configured. yoke.lol already has working email via Resend → Gmail. Using the parent project's email is simpler than maintaining separate routing per tool. security.txt already used `hello@yoke.lol`.
**Directive:** `hello@yoke.lol` is the contact email for all .lol family tools. Revisit if a tool needs its own inbox.

---

### 2026-06-17 — vrfy-probe deferred to Phase 2

**What changed:** Removed vrfy-probe from current architecture description. DNSBL queries remain Phase 2 scope.
**Why:** Phase 1 is DNS-only via DoH from the Worker. The Fly.io probe service was specced for DNSBL lookups which require direct DNS (not DoH). No DNSBL signals are implemented yet.
**Directive:** Constitution architecture table reflects current state. Probe service is Phase 2 work.

---

### 2026-06-18 — Microsoft GetCredentialType: use directly

**What changed:** Added Microsoft GetCredentialType as an extended signal. No opt-in flag.
**Why:** It's our backend making individual lookups, not bulk enumeration. Microsoft has called this behavior "by design." Gracefully degrades on throttle (checks ThrottleStatus field). Weight 0.35 — enormous reach (M365 + Outlook/Hotmail/Live).
**Directive:** Use directly. If Microsoft starts blocking CF Worker IPs, fail open.

---

### 2026-06-18 — EmailRep.io: cache smart, BYO key

**What changed:** Added EmailRep.io as an extended signal with adaptive caching.
**Why:** Rich aggregated data — reputation, platform profiles, temporal signals. Free tier is 250/month, 10/day. Self-imposed 8/day limit on platform key. Cache TTL scales with data quality (high rep + many profiles = 30 days, low/none = 3 days). BYO key via EMAILREP_KEY env var bypasses daily cap.
**Directive:** Platform key for basic coverage. BYO key for heavy users. Smart cache TTL.

---

### 2026-06-18 — Spamhaus DBL: deferred, usage tracking ready

**What changed:** Deferred Spamhaus DBL implementation. Usage page must track metrics needed to decide when to switch from free DQS to paid tier (~$250/yr).
**Why:** No DNSBL signals implemented yet (Phase 2, requires Go probe on Fly). Usage tracking comes first so we have data to justify the spend.
**Directive:** Don't implement yet. Ensure usage dashboard surfaces API call volume, error rates, and estimated DNSBL query projections.

---

### 2026-06-18 — Holehe-style probing: permanently out of scope

**What changed:** Holehe-style auth flow probing (password-reset/registration endpoint enumeration) confirmed permanently out of scope.
**Why:** Violates platform ToS, may notify targets, contradicts vrfy's probeless constraint and product identity. The differentiator IS the probeless approach.
**Directive:** Never add. This is a red line.
