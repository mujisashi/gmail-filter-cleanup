# Changelog

All notable changes to this project will be documented in this file.

## [0.1.2.0] - 2026-03-20

### Fixed
- Gmail accounts with filters that have no action no longer crash the app on load. These are valid filters (e.g., "mark as read" with no other action) that Google returns without an `action` field.
- The consolidation step now correctly shows "Your session has expired — please sign in again" instead of a server error when your Google session is missing the required scope.
- Sign-in now requests the Gmail labels permission, enabling label names to resolve correctly. **Action required:** existing sessions need to re-authenticate to pick up the new scope.

### For contributors
- `normalizeFilters()` extracted as an exported pure function in `lib/gmail.ts` for testability.
- 4 regression tests for `normalizeFilters` (missing action, preserved action, empty list, field preservation).
- TODOs added: CC CLI integration (zero-config auth for Claude Pro users) and API route 403 unit tests.
- gstack skills vendored: `/careful`, `/freeze`, `/guard`, `/investigate`, `/unfreeze`, `/codex`.

## [0.1.1.0] - 2026-03-19

### Added
- Step progress dots in nav bar: 4-step indicator (Audit → Enter Key → Review → Apply) visible throughout the audit flow, with dot states mapping all 6 internal steps per DESIGN.md
- Before/after filter count example on landing page (47 → 12 placeholder)
- Anthropic API key note on landing page with link to console.anthropic.com (sets expectations before sign-in)
- API key error links to console.anthropic.com/keys when auth failure detected
- `aria-label="Anthropic API key"` on the key input for screen reader accessibility
- `geist` npm package for Geist + Geist Mono font family

### Changed
- **Dark mode:** Migrated entire UI from light palette to dark — gray-950 base, gray-800 cards, gray-700 borders, blue-500 accent throughout
- **Typography:** Replaced Inter with Geist (body/UI) + Geist Mono (filter criteria) per DESIGN.md
- Done state copy: empowerment tone — "Your filters have been reviewed and simplified. You consolidated N rules into M — you know exactly what's in your inbox now."
- Empty state copy: "You have no Gmail filters yet — looks like you're all set."
- Badge icons: added ⚠ prefix to dead label badges, = prefix to duplicate badges for colorblind accessibility
- Semantic dark color tokens throughout: `bg-red-950/60`, `bg-green-950/40`, `bg-amber-950/60` etc. per DESIGN.md spec
- Diff view colors updated: replacing rules use `bg-red-950/40 text-red-300`, new rules use `bg-green-950/40 text-green-300`
- Loading spinner border updated to `border-blue-500` per DESIGN.md
- Loading note text updated to italic style per DESIGN.md
