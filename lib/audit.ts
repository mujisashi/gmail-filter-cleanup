import type { ActionType, AuditResult, GmailFilter, GmailLabel } from "./types"

const SYSTEM_LABEL_IDS = new Set([
  "INBOX",
  "SENT",
  "TRASH",
  "SPAM",
  "STARRED",
  "IMPORTANT",
  "UNREAD",
  "DRAFT",
  "CATEGORY_PERSONAL",
  "CATEGORY_SOCIAL",
  "CATEGORY_PROMOTIONS",
  "CATEGORY_UPDATES",
  "CATEGORY_FORUMS",
])

export function detectDeadLabels(
  filters: GmailFilter[],
  labels: GmailLabel[]
): string[] {
  const labelIds = new Set(labels.map((l) => l.id))
  return filters
    .filter((f) =>
      (f.action.addLabelIds ?? []).some(
        (id) => !SYSTEM_LABEL_IDS.has(id) && !labelIds.has(id)
      )
    )
    .map((f) => f.id)
}

export function detectDuplicates(filters: GmailFilter[]): string[][] {
  const criteriaMap = new Map<string, string[]>()
  for (const filter of filters) {
    const key = normalizeCriteria(filter.criteria)
    const group = criteriaMap.get(key) ?? []
    group.push(filter.id)
    criteriaMap.set(key, group)
  }
  return Array.from(criteriaMap.values()).filter((g) => g.length > 1)
}

function normalizeCriteria(criteria: GmailFilter["criteria"]): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(criteria)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
    )
  )
}

export function getActionType(filter: GmailFilter): ActionType {
  const add = filter.action.addLabelIds ?? []
  const remove = filter.action.removeLabelIds ?? []
  if (remove.includes("INBOX")) return "skip_inbox"
  if (add.includes("TRASH")) return "delete"
  if (remove.includes("UNREAD")) return "mark_read"
  if (add.includes("STARRED")) return "star"
  if (add.includes("IMPORTANT")) return "mark_important"
  if (remove.includes("SPAM")) return "never_spam"
  if (filter.action.forward) return "forward"
  const userLabel = add.find((id) => !SYSTEM_LABEL_IDS.has(id))
  if (userLabel) return `apply_label:${userLabel}` as ActionType
  return "other"
}

export function groupByAction(
  filters: GmailFilter[]
): Record<string, GmailFilter[]> {
  const groups: Record<string, GmailFilter[]> = {}
  for (const filter of filters) {
    const type = getActionType(filter)
    if (!groups[type]) groups[type] = []
    groups[type].push(filter)
  }
  return groups
}

export function runAudit(
  filters: GmailFilter[],
  labels: GmailLabel[]
): AuditResult {
  const deadLabelFilterIds = detectDeadLabels(filters, labels)
  const duplicateGroups = detectDuplicates(filters)
  const groupedByAction = groupByAction(filters)
  const duplicateCount = duplicateGroups.reduce(
    (sum, g) => sum + g.length - 1,
    0
  )
  return {
    filters,
    labels,
    deadLabelFilterIds,
    duplicateGroups,
    groupedByAction,
    stats: {
      total: filters.length,
      deadLabels: deadLabelFilterIds.length,
      duplicates: duplicateCount,
      actionCounts: Object.fromEntries(
        Object.entries(groupedByAction).map(([k, v]) => [k, v.length])
      ),
    },
  }
}
