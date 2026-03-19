import { getServerSession } from "next-auth/next"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { applyProposals } from "@/lib/apply"
import { getFilters } from "@/lib/gmail"
import { ApplyRequestSchema } from "@/lib/schemas"

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let proposals
  try {
    const body = await request.json()
    const parsed = ApplyRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid proposals payload" },
        { status: 400 }
      )
    }
    proposals = parsed.data.proposals
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const originalFilters = await getFilters(session.access_token)
  const result = await applyProposals(
    session.access_token,
    proposals,
    originalFilters
  )
  return NextResponse.json(result)
}
