# Changelog

All notable changes to this project will be documented in this file.

## [0.1.5.0] - 2026-03-23

### Fixed
- **Claude CLI tool-use hang** — `claude -p` has tools (Bash, Read, etc.) enabled by default. In a project with `CLAUDE.md` loading gstack skills, Claude may attempt tool use instead of returning JSON, causing a silent hang with no output. Fixed by passing `--tools ""` to disable all tools, and `--system-prompt` as a CLI flag (separating system prompt from user message). Also adds `--output-format json` for structured output with `.result` field extraction.
- **Bare 500 crashes the client** — when `consolidateFiltersViaCLI` threw an error, Next.js returned an empty 500 body. The client's `res.json()` call then failed with "Unexpected end of JSON input". Wrapped the consolidation call in a try/catch that returns `{ error: "..." }` JSON regardless of failure mode.
- **Timeout message improved** — timeout error now reads "try again or use the API key option" to give users actionable next steps.

### Changed
- CLI timeout increased from 60s to 120s to account for longer LLM response times at high context.

### For contributors
- 1 new unit test in `__tests__/consolidate.test.ts` covering the `--output-format json` wrapper extraction (the `.result` field path that is actually used in production).

## [0.1.4.0] - 2026-03-22

### Fixed
- **Claude CLI stdin not delivered** — `execFile` silently ignores the `input` option, so the prompt was never reaching `claude -p`. The CLI would hang waiting for stdin, causing the request to time out and the client to show "Unexpected end of JSON input". Replaced with a `spawn`-based helper (`spawnWithStdin`) that explicitly pipes stdin via `child.stdin.write/end`, matching how `spawnSync` handled it before the async refactor.

### For contributors
- Updated `consolidateFiltersViaCLI` tests to mock `spawn` (via EventEmitter-based `makeFakeChild`) instead of the removed `execFile` import.

## [0.1.3.0] - 2026-03-21

### Added
- **Claude Code CLI integration** — users with Claude Code installed can now run consolidation without an Anthropic API key. The "Enter Key" step auto-detects the local `claude` CLI on mount and shows an "Analyze with Claude Code →" button as the primary option when available. The API key path remains fully functional as a fallback.
- `GET /api/check-claude-cli` — new authenticated endpoint that detects whether the `claude` CLI is installed and returns its version. Used by the client on mount to show/hide the CLI option.
- `consolidateFiltersViaCLI()` in `lib/consolidate.ts` — runs `claude -p` as a subprocess to perform consolidation using the local Claude Code session. Shares the same prompt-building and response-parsing logic as the API key path.

### Changed
- CLI invocation uses async `execFile` (non-blocking) instead of `spawnSync`, so the server remains responsive during consolidation.
- `parseConsolidationResponse` now extracts JSON via regex before parsing, handling any ANSI codes or status lines the CLI may prepend to output.
- The "Enter Key" heading now renders only after CLI detection resolves (`null` loading state shows nothing, avoiding a flicker for CLI users).
- Landing page copy updated to mention both options: "Use your local Claude Code (if installed) or enter an Anthropic API key."
- Divider label "or use an API key" uses `text-gray-400` for WCAG AA compliance (was `text-gray-500`).

### For contributors
- 16 new unit tests in `__tests__/consolidate.test.ts` covering `buildConsolidationPayload`, `parseConsolidationResponse` (including prefix/suffix noise, invalid JSON, wrong schema), and `consolidateFiltersViaCLI` (success, ENOENT, non-zero exit, prompt passthrough).

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
