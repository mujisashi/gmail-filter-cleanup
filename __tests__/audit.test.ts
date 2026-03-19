import { describe, expect, it } from "vitest"
import {
  detectDeadLabels,
  detectDuplicates,
  getActionType,
  groupByAction,
  runAudit,
} from "@/lib/audit"
import type { GmailFilter, GmailLabel } from "@/lib/types"

const labels: GmailLabel[] = [
  { id: "Label_1", name: "Work", type: "user" },
  { id: "Label_2", name: "Newsletters", type: "user" },
]

const makeFilter = (
  id: string,
  criteria: GmailFilter["criteria"],
  action: GmailFilter["action"]
): GmailFilter => ({ id, criteria, action })

describe("detectDeadLabels", () => {
  it("flags filters referencing non-existent user labels", () => {
    const filters = [
      makeFilter("f1", { from: "a@b.com" }, { addLabelIds: ["Label_99"] }),
    ]
    expect(detectDeadLabels(filters, labels)).toEqual(["f1"])
  })

  it("does not flag system labels", () => {
    const filters = [
      makeFilter("f1", { from: "a@b.com" }, { removeLabelIds: ["INBOX"] }),
      makeFilter("f2", { from: "b@b.com" }, { addLabelIds: ["TRASH"] }),
    ]
    expect(detectDeadLabels(filters, labels)).toEqual([])
  })

  it("does not flag existing user labels", () => {
    const filters = [
      makeFilter("f1", { from: "a@b.com" }, { addLabelIds: ["Label_1"] }),
    ]
    expect(detectDeadLabels(filters, labels)).toEqual([])
  })

  it("returns empty for filters with no addLabelIds", () => {
    const filters = [
      makeFilter("f1", { from: "a@b.com" }, { removeLabelIds: ["INBOX"] }),
    ]
    expect(detectDeadLabels(filters, labels)).toEqual([])
  })
})

describe("detectDuplicates", () => {
  it("groups filters with identical criteria", () => {
    const criteria = { from: "spam@example.com" }
    const filters = [
      makeFilter("f1", criteria, { removeLabelIds: ["INBOX"] }),
      makeFilter("f2", criteria, { addLabelIds: ["TRASH"] }),
    ]
    const groups = detectDuplicates(filters)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toEqual(expect.arrayContaining(["f1", "f2"]))
  })

  it("returns empty when no duplicates exist", () => {
    const filters = [
      makeFilter("f1", { from: "a@example.com" }, { removeLabelIds: ["INBOX"] }),
      makeFilter("f2", { from: "b@example.com" }, { removeLabelIds: ["INBOX"] }),
    ]
    expect(detectDuplicates(filters)).toEqual([])
  })

  it("ignores key order when comparing criteria", () => {
    const filters = [
      makeFilter("f1", { from: "a@b.com", subject: "hello" }, { removeLabelIds: ["INBOX"] }),
      makeFilter("f2", { subject: "hello", from: "a@b.com" }, { removeLabelIds: ["INBOX"] }),
    ]
    const groups = detectDuplicates(filters)
    expect(groups).toHaveLength(1)
  })
})

describe("getActionType", () => {
  it("returns skip_inbox when INBOX is removed", () => {
    const f = makeFilter("f1", {}, { removeLabelIds: ["INBOX"] })
    expect(getActionType(f)).toBe("skip_inbox")
  })

  it("returns delete when TRASH is added", () => {
    const f = makeFilter("f1", {}, { addLabelIds: ["TRASH"] })
    expect(getActionType(f)).toBe("delete")
  })

  it("returns mark_read when UNREAD is removed", () => {
    const f = makeFilter("f1", {}, { removeLabelIds: ["UNREAD"] })
    expect(getActionType(f)).toBe("mark_read")
  })

  it("returns star when STARRED is added", () => {
    const f = makeFilter("f1", {}, { addLabelIds: ["STARRED"] })
    expect(getActionType(f)).toBe("star")
  })

  it("returns mark_important when IMPORTANT is added", () => {
    const f = makeFilter("f1", {}, { addLabelIds: ["IMPORTANT"] })
    expect(getActionType(f)).toBe("mark_important")
  })

  it("returns never_spam when SPAM is removed", () => {
    const f = makeFilter("f1", {}, { removeLabelIds: ["SPAM"] })
    expect(getActionType(f)).toBe("never_spam")
  })

  it("returns apply_label:<id> for user labels", () => {
    const f = makeFilter("f1", {}, { addLabelIds: ["Label_1"] })
    expect(getActionType(f)).toBe("apply_label:Label_1")
  })

  it("returns forward for forward actions", () => {
    const f = makeFilter("f1", {}, { forward: "alias@example.com" })
    expect(getActionType(f)).toBe("forward")
  })

  it("returns other for unrecognized actions", () => {
    const f = makeFilter("f1", {}, {})
    expect(getActionType(f)).toBe("other")
  })
})

describe("groupByAction", () => {
  it("groups filters by their action type", () => {
    const filters = [
      makeFilter("f1", { from: "a@b.com" }, { removeLabelIds: ["INBOX"] }),
      makeFilter("f2", { from: "b@b.com" }, { removeLabelIds: ["INBOX"] }),
      makeFilter("f3", { from: "c@b.com" }, { addLabelIds: ["TRASH"] }),
    ]
    const groups = groupByAction(filters)
    expect(groups["skip_inbox"]).toHaveLength(2)
    expect(groups["delete"]).toHaveLength(1)
  })
})

describe("runAudit", () => {
  it("returns a complete audit result", () => {
    const filters = [
      makeFilter("f1", { from: "a@b.com" }, { removeLabelIds: ["INBOX"] }),
      makeFilter("f2", { from: "a@b.com" }, { addLabelIds: ["Label_99"] }),
    ]
    const result = runAudit(filters, labels)
    expect(result.stats.total).toBe(2)
    expect(result.stats.deadLabels).toBe(1)
    expect(result.deadLabelFilterIds).toContain("f2")
  })

  it("handles empty filter list", () => {
    const result = runAudit([], labels)
    expect(result.stats.total).toBe(0)
    expect(result.stats.deadLabels).toBe(0)
    expect(result.stats.duplicates).toBe(0)
  })
})
