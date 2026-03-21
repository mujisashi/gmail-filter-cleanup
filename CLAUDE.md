# gmail-filter-cleanup

Teammates: run `.claude/skills/gstack/setup` after cloning (requires `bun`).

## Design System
Always read `DESIGN.md` before making any visual or UI decisions.
All font choices (Geist + Geist Mono), colors (dark by default), spacing (4px base unit),
and aesthetic direction (Industrial/Utilitarian) are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Testing

Run: `npx vitest run` — tests live in `__tests__/`.

- When writing new functions, write a corresponding test
- When fixing a bug, write a regression test
- When adding a conditional (if/else), write tests for BOTH paths
- Never commit code that makes existing tests fail
