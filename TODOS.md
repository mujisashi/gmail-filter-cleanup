# TODOs — Gmail Filter Cleanup

Items marked with [design-review] were surfaced by /plan-design-review on 2026-03-19.

---

## HIGH — Ship before sharing widely

### [design-review] Dark mode implementation
**What:** Migrate the entire UI from light (gray-50 background, white cards) to dark
(gray-950 background, gray-800 cards) per the color system in DESIGN.md.

**Why:** The current light UI is indistinguishable from generic AI-generated SaaS tools.
Dark-by-default is the deliberate aesthetic choice that gives this app a specific identity.

**Pros:** Immediate visual differentiation; aligns with the design spec; makes the app feel
intentional, not generated.

**Cons:** Touches every component — ~30 Tailwind class replacements across `app/page.tsx`,
`app/audit/audit-client.tsx`, `app/layout.tsx`.

**Context:** Decision made in /plan-design-review. Spec is fully defined in DESIGN.md under
"Color System — Dark by Default." All semantic color variants are listed there.

**Estimate:** human: ~4 hours / CC: ~15 min

**Depends on:** Nothing. Can be done standalone.

---

### [design-review] Step progress dots in nav
**What:** Add 4-step progress indicator to the `<nav>` in `AuditClient`:
`Audit → Enter Key → Review → Apply` — filled dot for current/completed, empty for upcoming.

**Why:** The 6-step audit flow currently has no orientation cues. Users can't tell how many
steps are left or that a review step comes before anything is applied. This is a trust issue —
users modifying email settings need to feel in control of where they are.

**Pros:** Directly addresses the biggest IA gap. Makes the "review before apply" contract
visible at all times.

**Cons:** Adds ~20 lines to `audit-client.tsx`. The step mapping (the two loading states
"consolidating" and "applying" are not shown as separate steps — they animate within their
adjacent named steps) needs care.

**Context:** Decision made in /plan-design-review. Spec is in DESIGN.md under
"Step Navigation." The 4 visible steps are: Audit, Enter Key, Review, Apply.

**Estimate:** human: ~1 hour / CC: ~5 min

**Depends on:** Ideally done after dark mode migration so you're not updating the same file twice.

---

## MEDIUM — Ship before promoting

### [design-review] Copy + UX improvements
**What:** Implement all copy and UX decisions from /plan-design-review:

1. **Landing page — Anthropic API key note:** Add below the "What it does" card:
   "AI consolidation uses Claude — you'll need an Anthropic API key. Get one free at
   console.anthropic.com." (`text-xs text-gray-500`, linked)

2. **Landing page — before/after example:** Add above the sign-in button:
   `47 filters → 12 filters` using real anonymized data from your own account run.
   Labeled with `(example from a real cleanup)` in `text-xs italic`.
   **Note:** Fill in the real numbers once you've run the tool on your own account.

3. **Empty state copy:** Change "No filters found in your Gmail account." to
   "You have no Gmail filters yet — looks like you're all set."

4. **API key error — console link:** When the error message from `/api/consolidate`
   indicates an auth/API key failure, append a line:
   "Get your API key at [console.anthropic.com/keys](https://console.anthropic.com/keys)"

5. **Done state redesign:** Replace the current flat "✓ Changes applied" with the
   empowerment-focused layout from DESIGN.md:
   - Headline: "Your filters have been reviewed and simplified."
   - Subhead: "You consolidated N rules into M — you know exactly what's in your inbox now."
   - Counts: "M filters created · N deleted"
   - Undo button: make it more prominent (not a small ghost button)

6. **Badge icons:** Add icon prefix to dead label badge (`⚠ dead label`) and duplicate
   badge (`= duplicate`) for colorblind accessibility. Update in the `Badge` component.

**Why:** Each item either reduces friction, sets clearer expectations, or makes the
emotional payoff match the experience. The done state in particular is the moment the
whole flow has been building toward — it should feel earned.

**Estimate:** human: ~2 hours / CC: ~10 min

**Depends on:** Dark mode migration (do this after so you're not touching the same files twice).

---

## LOW — Nice to have

### [design-review] aria-label on API key input
**What:** Add `aria-label="Anthropic API key"` to the `<input>` in `KeyEntry`. The placeholder
"sk-ant-..." communicates to sighted users but is not reliable for screen readers.

**Why:** Basic a11y hygiene. Placeholder text is not a substitute for a label.

**Estimate:** human: 5 min / CC: 1 min

**Depends on:** Nothing.

---

### [design-review] Verify touch target sizes on mobile
**What:** Check that all buttons meet the 44×44px minimum touch target size on mobile
viewports, particularly the "Back" buttons and small "Sign out" link in the nav.

**Why:** Sub-44px touch targets are a common mobile a11y failure.

**Estimate:** human: 30 min / CC: 5 min

**Depends on:** Dark mode migration (verify in the final dark UI).
