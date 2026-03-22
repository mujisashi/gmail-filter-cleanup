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
      reject(new Error(`Claude CLI timed out after ${timeoutMs / 1000}s`))
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
    stdout = await spawnWithStdin("claude", ["-p"], fullPrompt, 60_000)
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new Error("Claude CLI not found — install Claude Code to use this option")
    }
    const msg = err.stderr?.trim() || err.message || "Claude CLI exited with non-zero status"
    throw new Error(`Claude CLI error: ${msg}`)
  }

  return parseConsolidationResponse(stdout)
}
