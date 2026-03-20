# TODOs — Gmail Filter Cleanup

Items marked with [design-review] were surfaced by /plan-design-review on 2026-03-19.

---

## MEDIUM — Worth doing

### Claude Code CLI as alternative to Anthropic API key
**What:** Detect if the `claude` CLI is available and authenticated; offer it as a zero-config option in the KeyEntry step alongside the manual API key flow.

**Why:** This app runs locally. Many users already have Claude Code installed and authenticated (CC Free, Pro, or Max). They shouldn't need a separate Anthropic API key just to run consolidation.

**How:** In `lib/consolidate.ts`, add a `consolidateFiltersViaCLI()` path that calls `claude -p "..."` as a subprocess. In `AuditClient`'s KeyEntry step, auto-detect `claude` CLI availability (e.g., `which claude && claude --version`) and show an "Use local Claude Code" option above the API key input when detected.

**Pros:** Removes the biggest friction point (API key) for users who already pay for Claude. Makes the tool usable day-one for CC users with no additional billing.

**Cons:** Adds a subprocess dependency; `claude -p` output format may change across CC versions; needs graceful fallback to API key if CLI call fails.

**Estimate:** human: ~1 day / CC: ~30 min

**Depends on:** Nothing blocking. Can be a standalone PR.

---

### Unit tests for API route 403 / error paths
**What:** Add unit tests for `/api/consolidate` (403 → 401 JSON, non-403 re-throw) and `/api/apply` error handling.

**Why:** The 403 fix in `/api/consolidate` is untested. If the error handling regresses, the API would silently return a 500 instead of a helpful 401.

**How:** Set up a minimal Next.js API route test harness using `@testing-library/next` or direct handler invocation with mocked request/response objects. Mock the `googleapis` client to throw GaxiosError with status 403.

**Pros:** Closes the last untested critical path. Completes the test coverage push started by `normalizeFilters` regression tests.

**Cons:** Requires a small amount of test scaffolding (NextRequest mock) not yet in the project.

**Estimate:** human: ~2 hours / CC: ~15 min

**Depends on:** Nothing blocking.

---

## LOW — Nice to have

### [design-review] Verify touch target sizes on mobile
**What:** Check that all buttons meet the 44×44px minimum touch target size on mobile
viewports, particularly the "Back" buttons and small "Sign out" link in the nav.

**Why:** Sub-44px touch targets are a common mobile a11y failure.

**Estimate:** human: 30 min / CC: 5 min

**Depends on:** Dark mode migration (verify in the final dark UI).

---

## Completed

### [design-review] Dark mode implementation
**Completed:** v0.1.1.0 (2026-03-19)
Migrated entire UI to dark palette: gray-950 base, gray-800 cards, gray-700 borders,
blue-500 accent. Replaced Inter with Geist + Geist Mono. Covers `app/layout.tsx`,
`app/page.tsx`, `app/audit/audit-client.tsx`.

### [design-review] Step progress dots in nav
**Completed:** v0.1.1.0 (2026-03-19)
Added 4-step progress indicator (Audit → Enter Key → Review → Apply) to the nav bar.
6 internal steps map to 4 visible nav steps per DESIGN.md spec. Filled dot = completed
(blue-500), active dot = gray-100, empty dot = gray-600.

### [design-review] Copy + UX improvements
**Completed:** v0.1.1.0 (2026-03-19)
All 6 items implemented: landing page API key note with console.anthropic.com link,
before/after example (47 → 12, placeholder — update after first real run),
empty state copy ("You have no Gmail filters yet — looks like you're all set."),
API key error console link, done state empowerment redesign
("Your filters have been reviewed and simplified."), badge icons (⚠ dead label, = duplicate).

### [design-review] aria-label on API key input
**Completed:** v0.1.1.0 (2026-03-19)
Added `aria-label="Anthropic API key"` to the password input in `KeyEntry`.
