"use client"

import { signOut } from "next-auth/react"
import { useState, useEffect } from "react"
import type {
  ApplyResult,
  AuditResult,
  ConsolidationProposal,
  ConsolidationResult,
  GmailFilter,
  GmailLabel,
  UndoResult,
} from "@/lib/types"

type Step =
  | "audit"
  | "enter-key"
  | "consolidating"
  | "review"
  | "applying"
  | "done"

// Maps the 6 internal steps to 4 nav steps
// consolidating shows inside "Enter Key", applying shows inside "Apply"
type NavStep = "Audit" | "Enter Key" | "Review" | "Apply"

const NAV_STEPS: NavStep[] = ["Audit", "Enter Key", "Review", "Apply"]

export function getNavState(step: Step): { active: NavStep; completed: Set<NavStep> } {
  switch (step) {
    case "audit":
      return { active: "Audit", completed: new Set() }
    case "enter-key":
    case "consolidating":
      return { active: "Enter Key", completed: new Set(["Audit"]) }
    case "review":
      return { active: "Review", completed: new Set(["Audit", "Enter Key"]) }
    case "applying":
      return { active: "Apply", completed: new Set(["Audit", "Enter Key", "Review"]) }
    case "done":
      return { active: "Apply", completed: new Set(["Audit", "Enter Key", "Review", "Apply"]) }
  }
}

export function AuditClient({ auditResult }: { auditResult: AuditResult }) {
  const [step, setStep] = useState<Step>("audit")
  const [apiKey, setApiKey] = useState("")
  const [claudeAvailable, setClaudeAvailable] = useState<boolean | null>(null)
  const [consolidationResult, setConsolidationResult] =
    useState<ConsolidationResult | null>(null)
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set())
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null)
  const [undoResult, setUndoResult] = useState<UndoResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/check-claude-cli")
      .then((r) => r.json())
      .then((d) => setClaudeAvailable(d.available === true))
      .catch(() => setClaudeAvailable(false))
  }, [])

  async function runConsolidation(useLocalClaude = false) {
    setStep("consolidating")
    setError(null)
    try {
      const res = await fetch("/api/consolidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(useLocalClaude ? { useLocalClaude: true } : { apiKey }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Consolidation failed")
      setConsolidationResult(data)
      setApprovedIds(new Set(data.proposals.map((p: ConsolidationProposal) => p.id)))
      setStep("review")
    } catch (err: any) {
      setError(err.message)
      setStep("enter-key")
    }
  }

  async function applyChanges() {
    if (!consolidationResult) return
    setStep("applying")
    setError(null)
    const approved = consolidationResult.proposals.filter((p) =>
      approvedIds.has(p.id)
    )
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposals: approved }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Apply failed")
      setApplyResult(data)
      setStep("done")
    } catch (err: any) {
      setError(err.message)
      setStep("review")
    }
  }

  async function undoChanges() {
    if (!applyResult?.undoToken) return
    setError(null)
    try {
      const res = await fetch("/api/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ undoToken: applyResult.undoToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Undo failed")
      setUndoResult(data)
    } catch (err: any) {
      setError(err.message)
    }
  }

  const { active, completed } = getNavState(step)

  return (
    <div className="min-h-screen bg-gray-950">
      <nav className="bg-gray-900 border-b border-gray-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <span className="font-semibold text-gray-100">Gmail Filter Cleanup</span>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Sign out
          </button>
        </div>
        <div className="max-w-2xl mx-auto mt-3 flex items-center gap-4">
          {NAV_STEPS.map((navStep, i) => {
            const isDone = completed.has(navStep)
            const isActive = active === navStep && !isDone
            return (
              <div key={navStep} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-gray-700 text-xs">—</span>}
                <span
                  className={`w-2 h-2 rounded-full transition-colors duration-100 ${
                    isDone
                      ? "bg-blue-500"
                      : isActive
                      ? "bg-gray-100"
                      : "bg-gray-600"
                  }`}
                />
                <span
                  className={`text-[13px] transition-colors duration-100 ${
                    isActive
                      ? "text-gray-100 font-medium"
                      : isDone
                      ? "text-gray-400"
                      : "text-gray-600"
                  }`}
                >
                  {navStep}
                </span>
              </div>
            )
          })}
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {step === "audit" && (
          <AuditView
            auditResult={auditResult}
            onConsolidate={() => setStep("enter-key")}
          />
        )}

        {step === "enter-key" && (
          <KeyEntry
            apiKey={apiKey}
            onChange={setApiKey}
            onSubmit={() => runConsolidation(false)}
            onUseLocalClaude={() => runConsolidation(true)}
            onBack={() => setStep("audit")}
            error={error}
            claudeAvailable={claudeAvailable}
          />
        )}

        {step === "consolidating" && (
          <Loading message="Analyzing your filters with Claude…" note="This may take up to 2 minutes for large filter sets." />
        )}

        {step === "review" && consolidationResult && (
          <ReviewView
            auditResult={auditResult}
            result={consolidationResult}
            approvedIds={approvedIds}
            onToggle={(id) => {
              const next = new Set(approvedIds)
              next.has(id) ? next.delete(id) : next.add(id)
              setApprovedIds(next)
            }}
            onApply={applyChanges}
            onBack={() => setStep("audit")}
            error={error}
          />
        )}

        {step === "applying" && (
          <Loading message="Applying changes to Gmail…" />
        )}

        {step === "done" && applyResult && (
          <DoneView
            applyResult={applyResult}
            undoResult={undoResult}
            onUndo={undoChanges}
            error={error}
          />
        )}
      </main>
    </div>
  )
}

function AuditView({
  auditResult,
  onConsolidate,
}: {
  auditResult: AuditResult
  onConsolidate: () => void
}) {
  const { stats, filters, labels, deadLabelFilterIds, duplicateGroups, groupedByAction } =
    auditResult
  const deadSet = new Set(deadLabelFilterIds)
  const dupeSet = new Set(duplicateGroups.flat())
  const hasIssues = stats.deadLabels > 0 || stats.duplicates > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Filter Audit</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {stats.total} filter{stats.total !== 1 ? "s" : ""} found
          </p>
        </div>
        <button
          onClick={onConsolidate}
          disabled={stats.total === 0}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
        >
          Consolidate with AI →
        </button>
      </div>

      {hasIssues && (
        <div className="flex gap-3">
          {stats.deadLabels > 0 && (
            <Badge variant="red">
              ⚠ {stats.deadLabels} dead label{stats.deadLabels !== 1 ? "s" : ""}
            </Badge>
          )}
          {stats.duplicates > 0 && (
            <Badge variant="yellow">
              = {stats.duplicates} duplicate{stats.duplicates !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      )}

      {stats.total === 0 ? (
        <EmptyState message="You have no Gmail filters yet — looks like you're all set." />
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedByAction).map(([actionType, groupFilters]) => (
            <FilterGroup
              key={actionType}
              actionType={actionType}
              filters={groupFilters}
              labels={labels}
              deadSet={deadSet}
              dupeSet={dupeSet}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterGroup({
  actionType,
  filters,
  labels,
  deadSet,
  dupeSet,
}: {
  actionType: string
  filters: GmailFilter[]
  labels: GmailLabel[]
  deadSet: Set<string>
  dupeSet: Set<string>
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-700/50 transition-colors"
      >
        <span className="font-medium text-sm text-gray-100">
          {labelForActionType(actionType, labels)}
        </span>
        <span className="text-sm text-gray-400">
          {filters.length} filter{filters.length !== 1 ? "s" : ""}{" "}
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="divide-y divide-gray-700">
          {filters.map((f) => (
            <FilterRow
              key={f.id}
              filter={f}
              labels={labels}
              isDead={deadSet.has(f.id)}
              isDupe={dupeSet.has(f.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterRow({
  filter,
  labels,
  isDead,
  isDupe,
}: {
  filter: GmailFilter
  labels: GmailLabel[]
  isDead: boolean
  isDupe: boolean
}) {
  return (
    <div className="px-4 py-2.5 flex items-start justify-between gap-3">
      <div className="text-sm text-gray-300 flex-1 min-w-0">
        <span className="font-mono text-[11px] bg-gray-700 text-gray-200 px-1.5 py-0.5 rounded">
          {describeCriteria(filter.criteria)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {isDead && <Badge variant="red">⚠ dead label</Badge>}
        {isDupe && <Badge variant="yellow">= duplicate</Badge>}
      </div>
    </div>
  )
}

function KeyEntry({
  apiKey,
  onChange,
  onSubmit,
  onUseLocalClaude,
  onBack,
  error,
  claudeAvailable,
}: {
  apiKey: string
  onChange: (v: string) => void
  onSubmit: () => void
  onUseLocalClaude: () => void
  onBack: () => void
  error: string | null
  claudeAvailable: boolean | null
}) {
  const isAuthError = error && (
    error.toLowerCase().includes("api key") ||
    error.toLowerCase().includes("auth") ||
    error.toLowerCase().includes("invalid") ||
    error.toLowerCase().includes("unauthorized")
  )

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4 max-w-md mx-auto">

      {claudeAvailable === true && (
        <>
          <div>
            <h2 className="font-semibold text-gray-100">Use your local Claude Code</h2>
            <p className="text-sm text-gray-400 mt-1">
              Claude Code is installed and authenticated — no API key needed.
            </p>
          </div>
          <button
            onClick={onUseLocalClaude}
            className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors"
          >
            Analyze with Claude Code →
          </button>
          <div className="relative flex items-center gap-3">
            <div className="flex-1 border-t border-gray-700" />
            <span className="text-xs text-gray-400">or use an API key</span>
            <div className="flex-1 border-t border-gray-700" />
          </div>
        </>
      )}

      {claudeAvailable === false && (
        <div>
          <h2 className="font-semibold text-gray-100">Enter your Anthropic API key</h2>
          <p className="text-sm text-gray-400 mt-1">
            Your key is sent directly to the Claude API and is never stored on our
            servers.
          </p>
        </div>
      )}

      <div className="space-y-1">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => onChange(e.target.value)}
          placeholder="sk-ant-..."
          aria-label="Anthropic API key"
          className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-md text-sm font-mono text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          onKeyDown={(e) => e.key === "Enter" && apiKey.trim() && onSubmit()}
        />
        {error && (
          <div className="space-y-1">
            <p className="text-sm text-red-400">{error}</p>
            {isAuthError && (
              <p className="text-xs text-gray-500">
                Get your API key at{" "}
                <a
                  href="https://console.anthropic.com/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300"
                >
                  console.anthropic.com/keys
                </a>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 border border-gray-600 rounded-lg transition-colors"
        >
          Back
        </button>
        <button
          onClick={onSubmit}
          disabled={!apiKey.trim()}
          className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
        >
          Analyze filters →
        </button>
      </div>
    </div>
  )
}

function ReviewView({
  auditResult,
  result,
  approvedIds,
  onToggle,
  onApply,
  onBack,
  error,
}: {
  auditResult: AuditResult
  result: ConsolidationResult
  approvedIds: Set<string>
  onToggle: (id: string) => void
  onApply: () => void
  onBack: () => void
  error: string | null
}) {
  const filterById = new Map(auditResult.filters.map((f) => [f.id, f]))
  const approvedCount = approvedIds.size

  if (result.proposals.length === 0) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-gray-100 font-medium">No consolidations needed</p>
        <p className="text-sm text-gray-400">
          Your filters are already clean — no redundancies found.
        </p>
        <button onClick={onBack} className="text-sm text-blue-400 hover:text-blue-300">
          Back to audit
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-100">Review Proposals</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {result.proposals.length} consolidation
            {result.proposals.length !== 1 ? "s" : ""} proposed
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onBack}
            className="px-3 py-2 text-sm text-gray-400 border border-gray-600 rounded-lg hover:bg-gray-700/50 transition-colors"
          >
            Back
          </button>
          <button
            onClick={onApply}
            disabled={approvedCount === 0}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
          >
            Apply {approvedCount} change{approvedCount !== 1 ? "s" : ""} →
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {result.proposals.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            originalFilters={proposal.originalFilterIds
              .map((id) => filterById.get(id))
              .filter((f): f is GmailFilter => !!f)}
            labels={auditResult.labels}
            approved={approvedIds.has(proposal.id)}
            onToggle={() => onToggle(proposal.id)}
          />
        ))}
      </div>
    </div>
  )
}

function ProposalCard({
  proposal,
  originalFilters,
  labels,
  approved,
  onToggle,
}: {
  proposal: ConsolidationProposal
  originalFilters: GmailFilter[]
  labels: GmailLabel[]
  approved: boolean
  onToggle: () => void
}) {
  const confidenceBadge = {
    high: "bg-green-950/60 text-green-400 border border-green-800",
    medium: "bg-yellow-950/60 text-yellow-400 border border-yellow-800",
    low: "bg-orange-950/60 text-orange-400 border border-orange-800",
  }[proposal.confidence]

  return (
    <div
      className={`bg-gray-800 border rounded-lg overflow-hidden transition-colors duration-150 ${
        approved ? "border-blue-500" : "border-gray-700"
      }`}
    >
      <div className="px-4 py-3 flex items-start gap-3">
        <input
          type="checkbox"
          checked={approved}
          onChange={onToggle}
          className="mt-0.5 h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-500 cursor-pointer"
        />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-100">
              {proposal.explanation}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${confidenceBadge}`}>
              {proposal.confidence}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">
                Replacing ({originalFilters.length})
              </p>
              {originalFilters.map((f) => (
                <div
                  key={f.id}
                  className="font-mono bg-red-950/40 text-red-300 px-2 py-1 rounded"
                >
                  {describeCriteria(f.criteria)}
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">
                New rule
              </p>
              <div className="font-mono bg-green-950/40 text-green-300 px-2 py-1 rounded">
                {describeCriteria(proposal.proposedCriteria)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DoneView({
  applyResult,
  undoResult,
  onUndo,
  error,
}: {
  applyResult: ApplyResult
  undoResult: UndoResult | null
  onUndo: () => void
  error: string | null
}) {
  const createdCount = applyResult.applied.filter((o) => o.type === "create").length
  const deletedCount = applyResult.applied.filter((o) => o.type === "delete").length
  const failedCount = applyResult.failed.length

  if (undoResult) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-green-400 font-medium text-lg">✔ Undo complete</p>
        <p className="text-sm text-gray-400">
          {undoResult.restored.length} filter
          {undoResult.restored.length !== 1 ? "s" : ""} restored.
        </p>
        {undoResult.notRestored.length > 0 && (
          <div className="text-left max-w-md mx-auto mt-4 space-y-2">
            <p className="text-sm font-medium text-red-400">
              {undoResult.notRestored.length} filter
              {undoResult.notRestored.length !== 1 ? "s" : ""} could not be
              restored:
            </p>
            {undoResult.notRestored.map((item, i) => (
              <div
                key={i}
                className="text-xs bg-red-950/60 border border-red-800 rounded p-2 space-y-1"
              >
                <p className="font-mono text-red-300">{describeCriteria(item.criteria)}</p>
                <p className="text-red-400">{item.error}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const originalCount = createdCount > 0 ? deletedCount : 0
  const consolidatedCount = createdCount

  return (
    <div className="space-y-6">
      <div className="text-center py-10 space-y-4">
        <p className="text-green-400 font-semibold text-lg">
          ✔ Your filters have been reviewed and simplified.
        </p>
        {consolidatedCount > 0 && originalCount > 0 && (
          <p className="text-gray-300 text-sm">
            You consolidated {originalCount} rule{originalCount !== 1 ? "s" : ""} into{" "}
            {consolidatedCount} — you know exactly what&apos;s in your inbox now.
          </p>
        )}
        <p className="text-gray-500 text-sm">
          {createdCount} filter{createdCount !== 1 ? "s" : ""} created · {deletedCount} deleted
          {failedCount > 0 && ` · ${failedCount} failed`}
        </p>
      </div>

      {failedCount > 0 && (
        <div className="bg-red-950/60 border border-red-800 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium text-red-400">
            {failedCount} operation{failedCount !== 1 ? "s" : ""} failed:
          </p>
          {applyResult.failed.map((op, i) => (
            <p key={i} className="text-xs text-red-300 font-mono">
              {op.type} {op.filterId ?? ""}: {op.error}
            </p>
          ))}
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      {applyResult.undoToken && !undoResult && (
        <div className="flex justify-center">
          <button
            onClick={onUndo}
            className="px-4 py-2 border border-gray-600 text-sm text-gray-300 hover:text-gray-100 hover:border-gray-500 rounded-lg transition-colors"
          >
            ↩ Undo all changes
          </button>
        </div>
      )}

      {!applyResult.undoToken && (
        <p className="text-center text-xs text-gray-600">
          Undo token unavailable — changes cannot be reversed automatically.
        </p>
      )}
    </div>
  )
}

function Loading({ message, note }: { message: string; note?: string }) {
  return (
    <div className="text-center py-16 space-y-3">
      <div className="inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-gray-300 font-medium">{message}</p>
      {note && <p className="text-sm text-gray-500 italic">{note}</p>}
    </div>
  )
}

function Badge({
  children,
  variant,
}: {
  children: React.ReactNode
  variant: "red" | "yellow" | "green"
}) {
  const colors = {
    red: "bg-red-950/60 text-red-400 border border-red-800",
    yellow: "bg-yellow-950/60 text-yellow-400 border border-yellow-800",
    green: "bg-green-950/60 text-green-400 border border-green-800",
  }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[variant]}`}
    >
      {children}
    </span>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12 text-gray-400 text-sm">{message}</div>
  )
}

function describeCriteria(criteria: GmailFilter["criteria"]): string {
  const parts: string[] = []
  if (criteria.from) parts.push(`from:${criteria.from}`)
  if (criteria.to) parts.push(`to:${criteria.to}`)
  if (criteria.subject) parts.push(`subject:${criteria.subject}`)
  if (criteria.query) parts.push(`query:${criteria.query}`)
  if (criteria.hasAttachment) parts.push("has:attachment")
  if (criteria.negatedQuery) parts.push(`-query:${criteria.negatedQuery}`)
  return parts.join(" ") || "(no criteria)"
}

function labelForActionType(actionType: string, labels: GmailLabel[]): string {
  const map: Record<string, string> = {
    skip_inbox: "Skip Inbox",
    delete: "Delete",
    mark_read: "Mark as Read",
    star: "Star",
    mark_important: "Mark Important",
    never_spam: "Never Spam",
    forward: "Forward",
    other: "Other",
  }
  if (map[actionType]) return map[actionType]
  if (actionType.startsWith("apply_label:")) {
    const labelId = actionType.slice("apply_label:".length)
    const label = labels.find((l) => l.id === labelId)
    return `Apply Label: ${label?.name ?? labelId}`
  }
  return actionType
}
