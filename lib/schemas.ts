import { z } from "zod"

export const CriteriaSchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    subject: z.string().optional(),
    query: z.string().optional(),
    negatedQuery: z.string().optional(),
    hasAttachment: z.boolean().optional(),
    excludeChats: z.boolean().optional(),
    size: z.number().optional(),
    sizeComparison: z.enum(["larger", "smaller", "unspecified"]).optional(),
  })
  .refine(
    (c) => Object.values(c).some((v) => v !== undefined),
    "Criteria must have at least one field"
  )

export const ActionSchema = z
  .object({
    addLabelIds: z.array(z.string()).optional(),
    removeLabelIds: z.array(z.string()).optional(),
    forward: z.string().optional(),
  })
  .refine(
    (a) =>
      (a.addLabelIds?.length ?? 0) > 0 ||
      (a.removeLabelIds?.length ?? 0) > 0 ||
      !!a.forward,
    "Action must have at least one field"
  )

export const ProposalSchema = z.object({
  id: z.string().min(1),
  groupType: z.string().min(1),
  explanation: z.string().min(1),
  originalFilterIds: z.array(z.string()).min(1),
  proposedCriteria: CriteriaSchema,
  proposedAction: ActionSchema,
  confidence: z.enum(["high", "medium", "low"]),
})

export const ConsolidationResultSchema = z.object({
  proposals: z.array(ProposalSchema),
  unchangedFilterIds: z.array(z.string()),
})

export const ApplyRequestSchema = z.object({
  proposals: z.array(ProposalSchema),
})
