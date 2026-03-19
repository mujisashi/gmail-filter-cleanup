import { createFilter, deleteFilterWithRetry } from "./gmail"
import { createUndoToken } from "./undo-token"
import type { ApplyResult, ConsolidationProposal, GmailFilter } from "./types"

export async function applyProposals(
  accessToken: string,
  proposals: ConsolidationProposal[],
  originalFilters: GmailFilter[]
): Promise<ApplyResult> {
  const applied: ApplyResult["applied"] = []
  const failed: ApplyResult["failed"] = []

  const toBeDeletedIds = new Set(proposals.flatMap((p) => p.originalFilterIds))
  const filtersForUndo = originalFilters.filter((f) =>
    toBeDeletedIds.has(f.id)
  )

  for (const proposal of proposals) {
    // Create the replacement filter first — safer ordering
    let created: GmailFilter
    try {
      created = await createFilter(
        accessToken,
        proposal.proposedCriteria,
        proposal.proposedAction
      )
      applied.push({
        type: "create",
        filterId: created.id,
        proposalId: proposal.id,
      })
    } catch (err: any) {
      failed.push({
        type: "create",
        proposalId: proposal.id,
        error: err.message ?? "Failed to create filter",
      })
      // Skip deleting originals — the replacement wasn't created
      continue
    }

    // Delete the original filters
    for (const filterId of proposal.originalFilterIds) {
      try {
        await deleteFilterWithRetry(accessToken, filterId)
        applied.push({ type: "delete", filterId, proposalId: proposal.id })
      } catch (err: any) {
        failed.push({
          type: "delete",
          filterId,
          proposalId: proposal.id,
          error: err.message ?? "Failed to delete filter",
        })
      }
    }
  }

  let undoToken: string | null = null
  if (filtersForUndo.length > 0) {
    try {
      undoToken = await createUndoToken(filtersForUndo)
    } catch {
      // Non-fatal — apply still succeeded, just can't undo automatically
    }
  }

  return { applied, failed, undoToken }
}
