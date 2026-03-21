import Anthropic from "@anthropic-ai/sdk"
import { execFile } from "child_process"
import { promisify } from "util"
import { ConsolidationResultSchema } from "./schemas"
import type { AuditResult, ConsolidationResult } from "./types"

const execFileAsync = promisify(execFile)

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

export function buildConsolidationPayload(auditResult: AuditResult): string {
  const groupsPayload = Object.fromEntries(
    Object.entries(auditResult.groupedByAction).map(([type, filters]) => [
      type,
      filters.map((f) => ({ id: f.id, criteria: f.criteria, action: f.action })),
    ])
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
        unchangedFilterIds: ["ids of filters that do not need consolidation"],
      },
    },
    null,
    2
  )
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

export async function consolidateFiltersViaCLI(
  auditResult: AuditResult
): Promise<ConsolidationResult> {
  const userMessage = buildConsolidationPayload(auditResult)
  const fullPrompt = `${SYSTEM_PROMPT}\n\n${userMessage}`

  let stdout: string
  try {
    const result = await execFileAsync("claude", ["-p"], {
      input: fullPrompt,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: 60_000,
    })
    stdout = result.stdout
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new Error("Claude CLI not found — install Claude Code to use this option")
    }
    const msg = err.stderr?.trim() || err.message || "Claude CLI exited with non-zero status"
    throw new Error(`Claude CLI error: ${msg}`)
  }

  return parseConsolidationResponse(stdout)
}
