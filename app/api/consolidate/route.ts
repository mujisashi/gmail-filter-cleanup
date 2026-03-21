import { getServerSession } from "next-auth/next"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { runAudit } from "@/lib/audit"
import { consolidateFilters, consolidateFiltersViaCLI } from "@/lib/consolidate"
import { getFilters, getLabels } from "@/lib/gmail"

export const maxDuration = 60

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (session.error === "RefreshAccessTokenError") {
    return NextResponse.json(
      { error: "Session expired — please sign in again" },
      { status: 401 }
    )
  }

  let apiKey: string | null = null
  let useLocalClaude = false
  try {
    const body = await request.json()
    if (body.useLocalClaude === true) {
      useLocalClaude = true
    } else if (typeof body.apiKey === "string" && body.apiKey.trim()) {
      apiKey = body.apiKey.trim()
    } else {
      return NextResponse.json(
        { error: "Missing or invalid Anthropic API key" },
        { status: 400 }
      )
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  let filters, labels
  try {
    ;[filters, labels] = await Promise.all([
      getFilters(session.access_token),
      getLabels(session.access_token),
    ])
  } catch (err: any) {
    if (err?.code === 403 || err?.status === 403) {
      return NextResponse.json(
        { error: "Session expired — please sign in again" },
        { status: 401 }
      )
    }
    throw err
  }

  const auditResult = runAudit(filters, labels)

  if (Object.keys(auditResult.groupedByAction).length === 0) {
    return NextResponse.json({ proposals: [], unchangedFilterIds: [] })
  }

  const result = useLocalClaude
    ? await consolidateFiltersViaCLI(auditResult)
    : await consolidateFilters(apiKey!, auditResult)
  return NextResponse.json(result)
}
