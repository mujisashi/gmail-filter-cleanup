import { describe, expect, it, vi, beforeEach } from "vitest"
import { EventEmitter } from "events"
import {
  buildConsolidationPayload,
  buildSubGroupPayload,
  getConsolidatableSubGroups,
  parseConsolidationResponse,
  consolidateFiltersViaCLI,
} from "@/lib/consolidate"
import type { AuditResult } from "@/lib/types"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_PROPOSAL = {
  id: "p1",
  groupType: "skip_inbox",
  explanation: "Merge two newsletter filters",
  originalFilterIds: ["f1", "f2"],
  proposedCriteria: { query: "from:a@x.com OR from:b@x.com" },
  proposedAction: { addLabelIds: ["INBOX"] },
  confidence: "high" as const,
}

const VALID_RESPONSE_JSON = JSON.stringify({
  proposals: [VALID_PROPOSAL],
  unchangedFilterIds: ["f3"],
})

const makeAuditResult = (): AuditResult => ({
  stats: { total: 2, deadLabels: 0, duplicates: 0 },
  filters: [
    { id: "f1", criteria: { from: "a@x.com" }, action: { addLabelIds: ["INBOX"] } },
    { id: "f2", criteria: { from: "b@x.com" }, action: { addLabelIds: ["INBOX"] } },
  ],
  labels: [],
  deadLabelFilterIds: [],
  duplicateGroups: [],
  groupedByAction: {
    skip_inbox: [
      { id: "f1", criteria: { from: "a@x.com" }, action: { addLabelIds: ["INBOX"] } },
      { id: "f2", criteria: { from: "b@x.com" }, action: { addLabelIds: ["INBOX"] } },
    ],
  },
})

// Audit result with two independent action sub-groups for parallel processing tests
const makeMultiSubGroupAuditResult = (): AuditResult => ({
  stats: { total: 4, deadLabels: 0, duplicates: 0 },
  filters: [
    { id: "f1", criteria: { from: "a@x.com" }, action: { addLabelIds: ["INBOX"] } },
    { id: "f2", criteria: { from: "b@x.com" }, action: { addLabelIds: ["INBOX"] } },
    { id: "f3", criteria: { from: "c@x.com" }, action: { removeLabelIds: ["SPAM"] } },
    { id: "f4", criteria: { from: "d@x.com" }, action: { removeLabelIds: ["SPAM"] } },
  ],
  labels: [],
  deadLabelFilterIds: [],
  duplicateGroups: [],
  groupedByAction: {
    skip_inbox: [
      { id: "f1", criteria: { from: "a@x.com" }, action: { addLabelIds: ["INBOX"] } },
      { id: "f2", criteria: { from: "b@x.com" }, action: { addLabelIds: ["INBOX"] } },
    ],
    never_spam: [
      { id: "f3", criteria: { from: "c@x.com" }, action: { removeLabelIds: ["SPAM"] } },
      { id: "f4", criteria: { from: "d@x.com" }, action: { removeLabelIds: ["SPAM"] } },
    ],
  },
})

// ---------------------------------------------------------------------------
// buildConsolidationPayload
// ---------------------------------------------------------------------------

describe("buildConsolidationPayload", () => {
  it("returns valid JSON string", () => {
    const payload = buildConsolidationPayload(makeAuditResult())
    expect(() => JSON.parse(payload)).not.toThrow()
  })

  it("includes filterGroups with the correct action group key", () => {
    const payload = JSON.parse(buildConsolidationPayload(makeAuditResult()))
    expect(payload.filterGroups).toHaveProperty("skip_inbox")
    expect(payload.filterGroups.skip_inbox).toHaveLength(2)
  })

  it("includes each filter's id, criteria, and action", () => {
    const payload = JSON.parse(buildConsolidationPayload(makeAuditResult()))
    const filter = payload.filterGroups.skip_inbox[0]
    expect(filter).toHaveProperty("id", "f1")
    expect(filter).toHaveProperty("criteria")
    expect(filter).toHaveProperty("action")
  })

  it("includes requiredResponseSchema to guide the model", () => {
    const payload = JSON.parse(buildConsolidationPayload(makeAuditResult()))
    expect(payload).toHaveProperty("requiredResponseSchema.proposals")
    // unchangedFilterIds removed from schema — computed server-side, not by model
  })

  it("produces empty filterGroups for audit with no filters", () => {
    const empty: AuditResult = { ...makeAuditResult(), groupedByAction: {}, filters: [] }
    const payload = JSON.parse(buildConsolidationPayload(empty))
    expect(Object.keys(payload.filterGroups)).toHaveLength(0)
  })

  it("excludes singleton groups — groups with 1 filter cannot be consolidated", () => {
    const withSingleton: AuditResult = {
      ...makeAuditResult(),
      groupedByAction: {
        skip_inbox: [
          { id: "f1", criteria: { from: "a@x.com" }, action: { addLabelIds: ["INBOX"] } },
          { id: "f2", criteria: { from: "b@x.com" }, action: { addLabelIds: ["INBOX"] } },
        ],
        apply_label: [
          { id: "f3", criteria: { from: "c@x.com" }, action: { addLabelIds: ["Label_1"] } },
        ],
      },
    }
    const payload = JSON.parse(buildConsolidationPayload(withSingleton))
    expect(payload.filterGroups).toHaveProperty("skip_inbox")
    expect(payload.filterGroups).not.toHaveProperty("apply_label")
  })
})

// ---------------------------------------------------------------------------
// buildSubGroupPayload
// ---------------------------------------------------------------------------

describe("buildSubGroupPayload", () => {
  it("returns valid JSON string", () => {
    const filters = [
      { id: "f1", criteria: { from: "a@x.com" }, action: { addLabelIds: ["INBOX"] } },
      { id: "f2", criteria: { from: "b@x.com" }, action: { addLabelIds: ["INBOX"] } },
    ]
    expect(() => JSON.parse(buildSubGroupPayload("skip_inbox", filters))).not.toThrow()
  })

  it("scopes filterGroups to the given groupType only", () => {
    const filters = [
      { id: "f1", criteria: { from: "a@x.com" }, action: { addLabelIds: ["INBOX"] } },
      { id: "f2", criteria: { from: "b@x.com" }, action: { addLabelIds: ["INBOX"] } },
    ]
    const payload = JSON.parse(buildSubGroupPayload("skip_inbox", filters))
    expect(Object.keys(payload.filterGroups)).toEqual(["skip_inbox"])
    expect(payload.filterGroups.skip_inbox).toHaveLength(2)
  })

  it("includes requiredResponseSchema", () => {
    const filters = [
      { id: "f1", criteria: { from: "a@x.com" }, action: { addLabelIds: ["INBOX"] } },
      { id: "f2", criteria: { from: "b@x.com" }, action: { addLabelIds: ["INBOX"] } },
    ]
    const payload = JSON.parse(buildSubGroupPayload("skip_inbox", filters))
    expect(payload).toHaveProperty("requiredResponseSchema.proposals")
  })
})

// ---------------------------------------------------------------------------
// getConsolidatableSubGroups
// ---------------------------------------------------------------------------

describe("getConsolidatableSubGroups", () => {
  it("returns empty array when there are no filters", () => {
    const empty: AuditResult = { ...makeAuditResult(), groupedByAction: {}, filters: [] }
    expect(getConsolidatableSubGroups(empty)).toHaveLength(0)
  })

  it("returns one sub-group for a single group with 2 identical-action filters", () => {
    const result = getConsolidatableSubGroups(makeAuditResult())
    expect(result).toHaveLength(1)
    expect(result[0].groupType).toBe("skip_inbox")
    expect(result[0].filters).toHaveLength(2)
  })

  it("returns two sub-groups for two independent action groups", () => {
    const result = getConsolidatableSubGroups(makeMultiSubGroupAuditResult())
    expect(result).toHaveLength(2)
    const groupTypes = result.map((g) => g.groupType).sort()
    expect(groupTypes).toEqual(["never_spam", "skip_inbox"])
  })

  it("splits one groupType into separate sub-groups when actions differ", () => {
    const mixedActions: AuditResult = {
      ...makeAuditResult(),
      groupedByAction: {
        delete: [
          { id: "f1", criteria: { from: "a@x.com" }, action: { addLabelIds: ["TRASH"] } },
          { id: "f2", criteria: { from: "b@x.com" }, action: { addLabelIds: ["TRASH"] } },
          // different action fingerprint: also removes IMPORTANT
          { id: "f3", criteria: { from: "c@x.com" }, action: { addLabelIds: ["TRASH"], removeLabelIds: ["IMPORTANT"] } },
          { id: "f4", criteria: { from: "d@x.com" }, action: { addLabelIds: ["TRASH"], removeLabelIds: ["IMPORTANT"] } },
        ],
      },
    }
    const result = getConsolidatableSubGroups(mixedActions)
    expect(result).toHaveLength(2)
    expect(result.every((g) => g.groupType === "delete")).toBe(true)
    const sizes = result.map((g) => g.filters.length).sort()
    expect(sizes).toEqual([2, 2])
  })

  it("excludes singleton action sub-groups (cannot be consolidated)", () => {
    const withSingleton: AuditResult = {
      ...makeAuditResult(),
      groupedByAction: {
        skip_inbox: [
          { id: "f1", criteria: { from: "a@x.com" }, action: { addLabelIds: ["INBOX"] } },
          { id: "f2", criteria: { from: "b@x.com" }, action: { addLabelIds: ["INBOX"] } },
        ],
        apply_label: [
          { id: "f3", criteria: { from: "c@x.com" }, action: { addLabelIds: ["Label_1"] } },
        ],
      },
    }
    const result = getConsolidatableSubGroups(withSingleton)
    expect(result).toHaveLength(1)
    expect(result[0].groupType).toBe("skip_inbox")
  })
})

// ---------------------------------------------------------------------------
// parseConsolidationResponse
// ---------------------------------------------------------------------------

describe("parseConsolidationResponse", () => {
  it("parses a valid JSON response", () => {
    const result = parseConsolidationResponse(VALID_RESPONSE_JSON)
    expect(result.proposals).toHaveLength(1)
    expect(result.proposals[0].id).toBe("p1")
    expect(result.unchangedFilterIds).toEqual(["f3"])
  })

  it("extracts JSON even when output has prefix text (ANSI/status lines)", () => {
    const withPrefix = `Analyzing filters...\n\u001b[32m✓\u001b[0m Done\n${VALID_RESPONSE_JSON}`
    const result = parseConsolidationResponse(withPrefix)
    expect(result.proposals[0].id).toBe("p1")
  })

  it("extracts JSON even when output has trailing text", () => {
    const withSuffix = `${VALID_RESPONSE_JSON}\n\nSession complete.`
    const result = parseConsolidationResponse(withSuffix)
    expect(result.proposals[0].id).toBe("p1")
  })

  it("throws when output contains no JSON block", () => {
    expect(() => parseConsolidationResponse("No JSON here at all")).toThrow(
      "Claude returned no JSON"
    )
  })

  it("throws when JSON is syntactically invalid", () => {
    expect(() => parseConsolidationResponse("{invalid json}")).toThrow(
      "Claude returned invalid JSON"
    )
  })

  it("throws when JSON has wrong structure (missing proposals)", () => {
    expect(() =>
      parseConsolidationResponse(JSON.stringify({ wrong: "shape" }))
    ).toThrow("Claude returned an invalid structure")
  })

  it("accepts empty proposals array with valid unchangedFilterIds", () => {
    const empty = JSON.stringify({ proposals: [], unchangedFilterIds: ["f1"] })
    const result = parseConsolidationResponse(empty)
    expect(result.proposals).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// consolidateFiltersViaCLI
// ---------------------------------------------------------------------------

// Helper: create a fake child process that emits stdout, stderr, and close events
function makeFakeChild(stdout: string, stderr: string, exitCode: number, spawnError?: Error) {
  const child = new EventEmitter() as any
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdin = { write: vi.fn(), end: vi.fn() }
  child.kill = vi.fn()

  setImmediate(() => {
    if (spawnError) {
      child.emit("error", spawnError)
      return
    }
    if (stdout) child.stdout.emit("data", Buffer.from(stdout))
    if (stderr) child.stderr.emit("data", Buffer.from(stderr))
    child.emit("close", exitCode)
  })
  return child
}

vi.mock("child_process", () => ({ spawn: vi.fn() }))

describe("consolidateFiltersViaCLI", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns parsed result on successful CLI invocation", async () => {
    const { spawn } = await import("child_process")
    vi.mocked(spawn).mockReturnValue(makeFakeChild(VALID_RESPONSE_JSON, "", 0) as any)

    const result = await consolidateFiltersViaCLI(makeAuditResult())
    expect(result.proposals).toHaveLength(1)
    expect(result.proposals[0].confidence).toBe("high")
  })

  it("unwraps --output-format json envelope when CLI returns { result: '...' }", async () => {
    const { spawn } = await import("child_process")
    // Simulate the actual --output-format json output from the Claude CLI
    const wrapped = JSON.stringify({ type: "result", result: VALID_RESPONSE_JSON, session_id: "s1" })
    vi.mocked(spawn).mockReturnValue(makeFakeChild(wrapped, "", 0) as any)

    const result = await consolidateFiltersViaCLI(makeAuditResult())
    expect(result.proposals).toHaveLength(1)
    expect(result.proposals[0].id).toBe("p1")
  })

  it("throws when CLI is not found (ENOENT)", async () => {
    const { spawn } = await import("child_process")
    const err: any = new Error("spawn claude ENOENT")
    err.code = "ENOENT"
    vi.mocked(spawn).mockReturnValue(makeFakeChild("", "", 1, err) as any)

    await expect(consolidateFiltersViaCLI(makeAuditResult())).rejects.toThrow(
      "Claude CLI not found"
    )
  })

  it("throws with stderr message when CLI exits non-zero", async () => {
    const { spawn } = await import("child_process")
    vi.mocked(spawn).mockReturnValue(
      makeFakeChild("", "Authentication required", 1) as any
    )

    await expect(consolidateFiltersViaCLI(makeAuditResult())).rejects.toThrow(
      "Claude CLI error"
    )
  })

  it("passes only the user message via stdin and system prompt via --system-prompt arg", async () => {
    const { spawn } = await import("child_process")
    const fakeChild = makeFakeChild(VALID_RESPONSE_JSON, "", 0)
    vi.mocked(spawn).mockReturnValue(fakeChild as any)

    await consolidateFiltersViaCLI(makeAuditResult())

    // stdin receives a sub-group payload (filter JSON), not the system prompt
    const writtenInput = (fakeChild.stdin.write as any).mock.calls[0][0] as string
    expect(writtenInput).toContain("filterGroups")
    expect(writtenInput).not.toContain("Gmail filter management") // system prompt is in --system-prompt arg

    // system prompt passed as a CLI arg, not via stdin
    const spawnArgs = vi.mocked(spawn).mock.calls[0][1] as string[]
    expect(spawnArgs).toContain("--system-prompt")
    expect(spawnArgs).toContain("--tools")
    expect(spawnArgs).toContain("--output-format")
  })

  it("spawns one CLI process per action sub-group (parallel fan-out)", async () => {
    const { spawn } = await import("child_process")
    // Two sub-groups (skip_inbox + never_spam) → two spawn calls
    const proposal2 = {
      ...VALID_PROPOSAL,
      id: "p2",
      groupType: "never_spam",
      originalFilterIds: ["f3", "f4"],
      proposedAction: { removeLabelIds: ["SPAM"] },
    }
    vi.mocked(spawn)
      .mockReturnValueOnce(makeFakeChild(VALID_RESPONSE_JSON, "", 0) as any)
      .mockReturnValueOnce(makeFakeChild(JSON.stringify({ proposals: [proposal2] }), "", 0) as any)

    const result = await consolidateFiltersViaCLI(makeMultiSubGroupAuditResult())

    expect(vi.mocked(spawn)).toHaveBeenCalledTimes(2)
    expect(result.proposals).toHaveLength(2)
    expect(result.proposals.map((p) => p.id).sort()).toEqual(["p1", "p2"])
  })

  it("merges proposals from all sub-groups and computes unchangedFilterIds", async () => {
    const { spawn } = await import("child_process")
    const proposal2 = {
      ...VALID_PROPOSAL,
      id: "p2",
      groupType: "never_spam",
      originalFilterIds: ["f3", "f4"],
      proposedAction: { removeLabelIds: ["SPAM"] },
    }
    vi.mocked(spawn)
      .mockReturnValueOnce(makeFakeChild(VALID_RESPONSE_JSON, "", 0) as any)
      .mockReturnValueOnce(makeFakeChild(JSON.stringify({ proposals: [proposal2] }), "", 0) as any)

    const result = await consolidateFiltersViaCLI(makeMultiSubGroupAuditResult())

    // f1+f2 proposed, f3+f4 proposed → all 4 in proposals, none unchanged
    expect(result.unchangedFilterIds).toHaveLength(0)
  })

  it("returns empty result without spawning when there are no consolidatable sub-groups", async () => {
    const { spawn } = await import("child_process")
    const emptyAudit: AuditResult = { ...makeAuditResult(), groupedByAction: {}, filters: [] }

    const result = await consolidateFiltersViaCLI(emptyAudit)

    expect(vi.mocked(spawn)).not.toHaveBeenCalled()
    expect(result.proposals).toHaveLength(0)
    expect(result.unchangedFilterIds).toHaveLength(0)
  })

  it("fails fast if any sub-group CLI call fails", async () => {
    const { spawn } = await import("child_process")
    vi.mocked(spawn)
      .mockReturnValueOnce(makeFakeChild(VALID_RESPONSE_JSON, "", 0) as any)
      .mockReturnValueOnce(makeFakeChild("", "Auth error", 1) as any)

    await expect(consolidateFiltersViaCLI(makeMultiSubGroupAuditResult())).rejects.toThrow(
      "Claude CLI error"
    )
  })
})
