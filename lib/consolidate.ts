import Anthropic from "@anthropic-ai/sdk"
import { spawn } from "child_process"
import { ConsolidationResultSchema } from "./schemas"
import type { AuditResult, ConsolidationResult } from "./types"

function spawnWithStdin(
  cmd: string,
  args: string[],
  input: string,
  timeoutMs: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "pipe" })
    let stdout = ""
    let stderr = ""

    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`Claude CLI timed out after ${timeoutMs / 1000}s — try again or use the API key option`))
    }, timeoutMs)

    child.stdout.on("data", (d: Buffer) => { stdout += d.toString() })
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString() })
    child.on("error", (err: any) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on("close", (code: number | null) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve(stdout)
      } else {
        const msg = stderr.trim() || `Claude CLI exited with code ${code}`
        const err: any = new Error(msg)
        err.code = code
        err.stderr = stderr
        reject(err)
      }
    })

    child.stdin.write(input)
    child.stdin.end()
  })
}

const SYSTEM_PROMPT = `You are an expert at Gmail filter management. Analyze Gmail filters grouped by their action type and identify consolidation opportunities.

Gmail filter criteria fields:
- from: single sender email address only (no OR operators here)
- to: recipient email
- subject: subject text
- query: Gmail search syntax — use this for OR combinations, e.g. "from:a@example.com OR from:b@example.com"
- hasAttachment: boolean
- negatedQuery: terms to exclude

Rules:
1. Only consolidate filters within the same action group — never merge different action types
2. Only propose consolidation when it clearly reduces redundancy without changing behavior
3. If criteria serve meaningfully different purposes, keep them separate
4. Preserve the original action fields exactly — do not change addLabelIds or removeLabelIds
5. Respond ONLY with valid JSON — no markdown fences, no explanation outside the JSON object`

export async function consolidateFilters(
  apiKey: string,
  auditResult: AuditResult
): Promise<ConsolidationResult> {
  const client = new Anthropic({ apiKey })

  const userMessage = buildConsolidationPayload(auditResult)

  const message = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  })

  const content = message.content[0]
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude API")
  }

  return parseConsolidationResponse(content.text)
}

function actionFingerprint(action: AuditResult["filters"][number]["action"]): string {
  return JSON.stringify({
    addLabelIds: [...(action.addLabelIds ?? [])].sort(),
    removeLabelIds: [...(action.removeLabelIds ?? [])].sort(),
    forward: action.forward ?? null,
  })
}

export function buildConsolidationPayload(auditResult: AuditResult): string {
  const groupsPayload = Object.fromEntries(
    Object.entries(auditResult.groupedByAction)
      .map(([type, filters]) => {
        // Group by exact action fingerprint; only keep filters that share an action with 1+ other filter
        const byAction = new Map<string, typeof filters>()
        for (const f of filters) {
          const fp = actionFingerprint(f.action)
          if (!byAction.has(fp)) byAction.set(fp, [])
          byAction.get(fp)!.push(f)
        }
        const consolidatable = filters.filter(
          (f) => (byAction.get(actionFingerprint(f.action))?.length ?? 0) >= 2
        )
        return [type, consolidatable.map((f) => ({ id: f.id, criteria: f.criteria, action: f.action }))]
      })
      .filter(([, filters]) => (filters as unknown[]).length >= 2)
  )
  return JSON.stringify(
    {
      filterGroups: groupsPayload,
      requiredResponseSchema: {
        proposals: [
          {
            id: "unique string id",
            groupType: "the action group key from filterGroups",
            explanation: "human-readable description of what this consolidation does",
            originalFilterIds: ["ids of filters being replaced"],
            proposedCriteria: { "...gmail criteria object": "..." },
            proposedAction: {
              "...must exactly match the action of the original filters": "...",
            },
            confidence: "high | medium | low",
          },
        ],
      },
    },
    null,
    2
  )
}

type FilterEntry = { id: string; criteria: AuditResult["filters"][number]["criteria"]; action: AuditResult["filters"][number]["action"] }

// Build a minimal payload for a single action sub-group (2-4 filters, all with identical actions).
// Used by consolidateFiltersViaCLI to fan out one CLI call per sub-group.
export function buildSubGroupPayload(groupType: string, filters: FilterEntry[]): string {
  return JSON.stringify(
    {
      filterGroups: { [groupType]: filters },
      requiredResponseSchema: {
        proposals: [
          {
            id: "unique string id",
            groupType: "the action group key from filterGroups",
            explanation: "human-readable description of what this consolidation does",
            originalFilterIds: ["ids of filters being replaced"],
            proposedCriteria: { "...gmail criteria object": "..." },
            proposedAction: {
              "...must exactly match the action of the original filters": "...",
            },
            confidence: "high | medium | low",
          },
        ],
      },
    },
    null,
    2
  )
}

// Compute the list of consolidatable action sub-groups from an audit result.
// Each entry is one group of filters that share the exact same action fingerprint.
export function getConsolidatableSubGroups(
  auditResult: AuditResult
): Array<{ groupType: string; filters: FilterEntry[] }> {
  const result: Array<{ groupType: string; filters: FilterEntry[] }> = []
  for (const [groupType, filters] of Object.entries(auditResult.groupedByAction)) {
    const byAction = new Map<string, FilterEntry[]>()
    for (const f of filters) {
      const fp = actionFingerprint(f.action)
      if (!byAction.has(fp)) byAction.set(fp, [])
      byAction.get(fp)!.push({ id: f.id, criteria: f.criteria, action: f.action })
    }
    for (const subFilters of byAction.values()) {
      if (subFilters.length >= 2) {
        result.push({ groupType, filters: subFilters })
      }
    }
  }
  return result
}

export function parseConsolidationResponse(raw: string): ConsolidationResult {
  // Extract the JSON object — CLI output may contain ANSI codes or status lines
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error("Claude returned no JSON — check that claude is authenticated")
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    throw new Error("Claude returned invalid JSON — could not parse response")
  }
  const result = ConsolidationResultSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`Claude returned an invalid structure: ${result.error.message}`)
  }
  return result.data
}

async function runCLISubGroup(payload: string): Promise<ConsolidationResult> {
  let stdout: string
  try {
    stdout = await spawnWithStdin(
      "claude",
      ["-p", "--tools", "", "--system-prompt", SYSTEM_PROMPT, "--output-format", "json"],
      payload,
      60_000
    )
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new Error("Claude CLI not found — install Claude Code to use this option")
    }
    const msg = err.stderr?.trim() || err.message || "Claude CLI exited with non-zero status"
    throw new Error(`Claude CLI error: ${msg}`)
  }

  // --output-format json wraps the response: { result: "<text>", ... }
  let responseText = stdout
  try {
    const parsed = JSON.parse(stdout)
    if (typeof parsed?.result === "string") responseText = parsed.result
  } catch {
    // not JSON-wrapped — fall through to parseConsolidationResponse as-is
  }

  return parseConsolidationResponse(responseText)
}

export async function consolidateFiltersViaCLI(
  auditResult: AuditResult
): Promise<ConsolidationResult> {
  // Fan out one CLI call per action sub-group and run all in parallel.
  // Each sub-group has 2-4 filters with identical actions — trivial for the model,
  // completes in <20s each vs >120s for a single combined call.
  const subGroups = getConsolidatableSubGroups(auditResult)

  if (subGroups.length === 0) {
    return { proposals: [], unchangedFilterIds: auditResult.filters.map((f) => f.id) }
  }

  const subGroupResults = await Promise.all(
    subGroups.map(({ groupType, filters }) =>
      runCLISubGroup(buildSubGroupPayload(groupType, filters))
    )
  )

  // Merge proposals from all sub-groups and compute unchangedFilterIds server-side
  const allProposals = subGroupResults.flatMap((r) => r.proposals)
  const proposedIds = new Set(allProposals.flatMap((p) => p.originalFilterIds))
  const allIds = auditResult.filters.map((f) => f.id)

  return {
    proposals: allProposals,
    unchangedFilterIds: allIds.filter((id) => !proposedIds.has(id)),
  }
}
