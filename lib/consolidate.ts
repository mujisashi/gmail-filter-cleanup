import Anthropic from "@anthropic-ai/sdk"
import { ConsolidationResultSchema } from "./schemas"
import type { AuditResult, ConsolidationResult } from "./types"

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

  const groupsPayload = Object.fromEntries(
    Object.entries(auditResult.groupedByAction).map(([type, filters]) => [
      type,
      filters.map((f) => ({ id: f.id, criteria: f.criteria, action: f.action })),
    ])
  )

  const userMessage = JSON.stringify(
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

  let parsed: unknown
  try {
    parsed = JSON.parse(content.text)
  } catch {
    throw new Error("Claude returned invalid JSON — could not parse response")
  }

  const result = ConsolidationResultSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(
      `Claude returned an invalid structure: ${result.error.message}`
    )
  }

  return result.data
}
