import { describe, expect, it } from "vitest"
import { normalizeFilters } from "@/lib/gmail"

// Regression: ISSUE — getFilters crashed when Gmail API returned filters without
// an action field (action is optional in Google's schema but typed as required in
// our GmailFilter interface). normalizeFilters guarantees action is always an object.
// Found by /qa on 2026-03-20
// Report: .gstack/qa-reports/qa-report-localhost-2026-03-19.md
describe("normalizeFilters", () => {
  it("sets action to {} when action is missing from API response", () => {
    const raw = [{ id: "f1", criteria: { from: "test@example.com" } }]
    const [filter] = normalizeFilters(raw)
    expect(filter.action).toEqual({})
  })

  it("preserves action when present", () => {
    const raw = [
      {
        id: "f2",
        criteria: { from: "news@example.com" },
        action: { addLabelIds: ["Label_1"] },
      },
    ]
    const [filter] = normalizeFilters(raw)
    expect(filter.action).toEqual({ addLabelIds: ["Label_1"] })
  })

  it("handles empty filter list", () => {
    expect(normalizeFilters([])).toEqual([])
  })

  it("preserves all other filter fields", () => {
    const raw = [{ id: "f3", criteria: { subject: "hello" } }]
    const [filter] = normalizeFilters(raw)
    expect(filter.id).toBe("f3")
    expect(filter.criteria).toEqual({ subject: "hello" })
  })
})
