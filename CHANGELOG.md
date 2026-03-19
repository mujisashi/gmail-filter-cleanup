# Changelog

All notable changes to this project will be documented in this file.

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
