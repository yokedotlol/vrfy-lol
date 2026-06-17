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
**Why:** Kurt's reaction: "Gross."
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
