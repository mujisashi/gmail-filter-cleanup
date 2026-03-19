# TODOs — Gmail Filter Cleanup

Items marked with [design-review] were surfaced by /plan-design-review on 2026-03-19.

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
