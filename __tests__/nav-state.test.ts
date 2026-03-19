import { describe, expect, it } from "vitest"
import { getNavState } from "@/app/audit/audit-client"

describe("getNavState", () => {
  it("audit step: Audit active, nothing completed", () => {
    const { active, completed } = getNavState("audit")
    expect(active).toBe("Audit")
    expect(completed.size).toBe(0)
  })

  it("enter-key step: Enter Key active, Audit completed", () => {
    const { active, completed } = getNavState("enter-key")
    expect(active).toBe("Enter Key")
    expect(completed.has("Audit")).toBe(true)
    expect(completed.size).toBe(1)
  })

  it("consolidating step: Enter Key active (loading within Enter Key), Audit completed", () => {
    const { active, completed } = getNavState("consolidating")
    expect(active).toBe("Enter Key")
    expect(completed.has("Audit")).toBe(true)
    expect(completed.size).toBe(1)
  })

  it("review step: Review active, Audit + Enter Key completed", () => {
    const { active, completed } = getNavState("review")
    expect(active).toBe("Review")
    expect(completed.has("Audit")).toBe(true)
    expect(completed.has("Enter Key")).toBe(true)
    expect(completed.size).toBe(2)
  })

  it("applying step: Apply active, Audit + Enter Key + Review completed", () => {
    const { active, completed } = getNavState("applying")
    expect(active).toBe("Apply")
    expect(completed.has("Audit")).toBe(true)
    expect(completed.has("Enter Key")).toBe(true)
    expect(completed.has("Review")).toBe(true)
    expect(completed.size).toBe(3)
  })

  it("done step: Apply active, all 4 steps completed", () => {
    const { active, completed } = getNavState("done")
    expect(active).toBe("Apply")
    expect(completed.has("Audit")).toBe(true)
    expect(completed.has("Enter Key")).toBe(true)
    expect(completed.has("Review")).toBe(true)
    expect(completed.has("Apply")).toBe(true)
    expect(completed.size).toBe(4)
  })
})
