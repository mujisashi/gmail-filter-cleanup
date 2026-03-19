export interface GmailFilter {
  id: string
  criteria: {
    from?: string
    to?: string
    subject?: string
    query?: string
    negatedQuery?: string
    hasAttachment?: boolean
    excludeChats?: boolean
    size?: number
    sizeComparison?: "larger" | "smaller" | "unspecified"
  }
  action: {
    addLabelIds?: string[]
    removeLabelIds?: string[]
    forward?: string
  }
}

export interface GmailLabel {
  id: string
  name: string
  type: "system" | "user"
  messageListVisibility?: "show" | "hide"
  labelListVisibility?: "labelShow" | "labelShowIfUnread" | "labelHide"
}

export type ActionType =
  | "skip_inbox"
  | "delete"
  | "mark_read"
  | "star"
  | "mark_important"
  | "never_spam"
  | "forward"
  | "other"
  | `apply_label:${string}`

export interface AuditResult {
  filters: GmailFilter[]
  labels: GmailLabel[]
  deadLabelFilterIds: string[]
  duplicateGroups: string[][]
  groupedByAction: Record<string, GmailFilter[]>
  stats: {
    total: number
    deadLabels: number
    duplicates: number
    actionCounts: Record<string, number>
  }
}

export interface ConsolidationProposal {
  id: string
  groupType: string
  explanation: string
  originalFilterIds: string[]
  proposedCriteria: GmailFilter["criteria"]
  proposedAction: GmailFilter["action"]
  confidence: "high" | "medium" | "low"
}

export interface ConsolidationResult {
  proposals: ConsolidationProposal[]
  unchangedFilterIds: string[]
}

export interface AppliedOperation {
  type: "create" | "delete"
  filterId: string
  proposalId: string
}

export interface FailedOperation {
  type: "create" | "delete"
  filterId?: string
  proposalId: string
  error: string
}

export interface ApplyResult {
  applied: AppliedOperation[]
  failed: FailedOperation[]
  undoToken: string | null
}

export interface UndoResult {
  restored: string[]
  notRestored: Array<{
    criteria: GmailFilter["criteria"]
    action: GmailFilter["action"]
    error: string
  }>
}
