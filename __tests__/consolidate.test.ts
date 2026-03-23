import { describe, expect, it, vi, beforeEach } from "vitest"
import { EventEmitter } from "events"
import {
  buildConsolidationPayload,
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
    expect(payload).toHaveProperty("requiredResponseSchema.unchangedFilterIds")
  })

  it("produces empty filterGroups for audit with no filters", () => {
    const empty: AuditResult = { ...makeAuditResult(), groupedByAction: {}, filters: [] }
    const payload = JSON.parse(buildConsolidationPayload(empty))
    expect(Object.keys(payload.filterGroups)).toHaveLength(0)
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

    // stdin receives only the user message (filter JSON), not the system prompt
    const writtenInput = (fakeChild.stdin.write as any).mock.calls[0][0] as string
    expect(writtenInput).toContain("filterGroups")
    expect(writtenInput).not.toContain("Gmail filter management") // system prompt is in --system-prompt arg

    // system prompt passed as a CLI arg, not via stdin
    const spawnArgs = vi.mocked(spawn).mock.calls[0][1] as string[]
    expect(spawnArgs).toContain("--system-prompt")
    expect(spawnArgs).toContain("--tools")
    expect(spawnArgs).toContain("--output-format")
  })
})
