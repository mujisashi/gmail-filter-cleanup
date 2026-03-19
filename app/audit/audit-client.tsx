"use client"

import { signOut } from "next-auth/react"
import { useState } from "react"
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

export function AuditClient({ auditResult }: { auditResult: AuditResult }) {
  const [step, setStep] = useState<Step>("audit")
  const [apiKey, setApiKey] = useState("")
  const [consolidationResult, setConsolidationResult] =
    useState<ConsolidationResult | null>(null)
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set())
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null)
  const [undoResult, setUndoResult] = useState<UndoResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runConsolidation() {
    setStep("consolidating")
    setError(null)
    try {
      const res = await fetch("/api/consolidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
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

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <span className="font-semibold text-gray-900">Gmail Filter Cleanup</span>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Sign out
        </button>
      </nav>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
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
            onSubmit={runConsolidation}
            onBack={() => setStep("audit")}
            error={error}
          />
        )}

        {step === "consolidating" && (
          <Loading message="Analyzing your filters with Claude…" note="This may take 15–30 seconds for large filter sets." />
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
          <h1 className="text-xl font-semibold">Filter Audit</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {stats.total} filter{stats.total !== 1 ? "s" : ""} found
          </p>
        </div>
        <button
          onClick={onConsolidate}
          disabled={stats.total === 0}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Consolidate with AI →
        </button>
      </div>

      {hasIssues && (
        <div className="flex gap-3">
          {stats.deadLabels > 0 && (
            <Badge variant="red">
              {stats.deadLabels} dead label{stats.deadLabels !== 1 ? "s" : ""}
            </Badge>
          )}
          {stats.duplicates > 0 && (
            <Badge variant="yellow">
              {stats.duplicates} duplicate{stats.duplicates !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      )}

      {stats.total === 0 ? (
        <EmptyState message="No filters found in your Gmail account." />
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
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <span className="font-medium text-sm">
          {labelForActionType(actionType, labels)}
        </span>
        <span className="text-sm text-gray-500">
          {filters.length} filter{filters.length !== 1 ? "s" : ""}{" "}
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="divide-y divide-gray-100">
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
      <div className="text-sm text-gray-700 flex-1 min-w-0">
        <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
          {describeCriteria(filter.criteria)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {isDead && <Badge variant="red">dead label</Badge>}
        {isDupe && <Badge variant="yellow">duplicate</Badge>}
      </div>
    </div>
  )
}

function KeyEntry({
  apiKey,
  onChange,
  onSubmit,
  onBack,
  error,
}: {
  apiKey: string
  onChange: (v: string) => void
  onSubmit: () => void
  onBack: () => void
  error: string | null
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4 max-w-md mx-auto">
      <div>
        <h2 className="font-semibold text-gray-900">Enter your Anthropic API key</h2>
        <p className="text-sm text-gray-500 mt-1">
          Your key is sent directly to the Claude API and is never stored on our
          servers.
        </p>
      </div>

      <div className="space-y-1">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => onChange(e.target.value)}
          placeholder="sk-ant-..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          onKeyDown={(e) => e.key === "Enter" && apiKey.trim() && onSubmit()}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg"
        >
          Back
        </button>
        <button
          onClick={onSubmit}
          disabled={!apiKey.trim()}
          className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
        <p className="text-gray-600 font-medium">No consolidations needed</p>
        <p className="text-sm text-gray-500">
          Your filters are already clean — no redundancies found.
        </p>
        <button onClick={onBack} className="text-sm text-blue-600 underline">
          Back to audit
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Review Proposals</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {result.proposals.length} consolidation
            {result.proposals.length !== 1 ? "s" : ""} proposed
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onBack}
            className="px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Back
          </button>
          <button
            onClick={onApply}
            disabled={approvedCount === 0}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Apply {approvedCount} change{approvedCount !== 1 ? "s" : ""} →
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
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
  const confidenceColor = {
    high: "text-green-700 bg-green-50",
    medium: "text-yellow-700 bg-yellow-50",
    low: "text-orange-700 bg-orange-50",
  }[proposal.confidence]

  return (
    <div
      className={`bg-white border rounded-lg overflow-hidden transition-colors ${
        approved ? "border-blue-300" : "border-gray-200"
      }`}
    >
      <div className="px-4 py-3 flex items-start gap-3">
        <input
          type="checkbox"
          checked={approved}
          onChange={onToggle}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
        />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">
              {proposal.explanation}
            </span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded font-medium ${confidenceColor}`}
            >
              {proposal.confidence}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="space-y-1">
              <p className="font-medium text-gray-500 uppercase tracking-wide text-[10px]">
                Replacing ({originalFilters.length})
              </p>
              {originalFilters.map((f) => (
                <div
                  key={f.id}
                  className="font-mono bg-red-50 text-red-800 px-2 py-1 rounded"
                >
                  {describeCriteria(f.criteria)}
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <p className="font-medium text-gray-500 uppercase tracking-wide text-[10px]">
                New rule
              </p>
              <div className="font-mono bg-green-50 text-green-800 px-2 py-1 rounded">
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
        <p className="text-green-700 font-medium text-lg">✓ Undo complete</p>
        <p className="text-sm text-gray-500">
          {undoResult.restored.length} filter
          {undoResult.restored.length !== 1 ? "s" : ""} restored.
        </p>
        {undoResult.notRestored.length > 0 && (
          <div className="text-left max-w-md mx-auto mt-4 space-y-2">
            <p className="text-sm font-medium text-red-700">
              {undoResult.notRestored.length} filter
              {undoResult.notRestored.length !== 1 ? "s" : ""} could not be
              restored:
            </p>
            {undoResult.notRestored.map((item, i) => (
              <div
                key={i}
                className="text-xs bg-red-50 border border-red-200 rounded p-2 space-y-1"
              >
                <p className="font-mono">{describeCriteria(item.criteria)}</p>
                <p className="text-red-600">{item.error}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center py-8 space-y-2">
        <p className="text-green-700 font-semibold text-lg">
          ✓ Changes applied
        </p>
        <p className="text-sm text-gray-500">
          {createdCount} filter{createdCount !== 1 ? "s" : ""} created,{" "}
          {deletedCount} deleted
          {failedCount > 0 && `, ${failedCount} failed`}
        </p>
      </div>

      {failedCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium text-red-800">
            {failedCount} operation{failedCount !== 1 ? "s" : ""} failed:
          </p>
          {applyResult.failed.map((op, i) => (
            <p key={i} className="text-xs text-red-700 font-mono">
              {op.type} {op.filterId ?? ""}: {op.error}
            </p>
          ))}
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {applyResult.undoToken && !undoResult && (
        <div className="flex justify-center">
          <button
            onClick={onUndo}
            className="px-4 py-2 border border-gray-300 text-sm text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            ↩ Undo all changes
          </button>
        </div>
      )}

      {!applyResult.undoToken && (
        <p className="text-center text-xs text-gray-400">
          Undo token unavailable — changes cannot be reversed automatically.
        </p>
      )}
    </div>
  )
}

function Loading({ message, note }: { message: string; note?: string }) {
  return (
    <div className="text-center py-16 space-y-3">
      <div className="inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-gray-700 font-medium">{message}</p>
      {note && <p className="text-sm text-gray-400">{note}</p>}
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
    red: "bg-red-100 text-red-700",
    yellow: "bg-yellow-100 text-yellow-700",
    green: "bg-green-100 text-green-700",
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
    <div className="text-center py-12 text-gray-500 text-sm">{message}</div>
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
