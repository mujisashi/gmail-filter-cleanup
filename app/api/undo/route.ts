import { getServerSession } from "next-auth/next"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { createFilter } from "@/lib/gmail"
import { verifyUndoToken } from "@/lib/undo-token"

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let undoToken: string
  try {
    const body = await request.json()
    if (typeof body.undoToken !== "string") {
      return NextResponse.json({ error: "Missing undo token" }, { status: 400 })
    }
    undoToken = body.undoToken
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  let filtersToRestore
  try {
    filtersToRestore = await verifyUndoToken(undoToken)
  } catch (err: any) {
    if (err?.code === "ERR_JWT_EXPIRED") {
      return NextResponse.json(
        { error: "Undo window has passed (1 hour limit)" },
        { status: 410 }
      )
    }
    return NextResponse.json({ error: "Invalid undo token" }, { status: 400 })
  }

  const results = await Promise.allSettled(
    filtersToRestore.map((f) =>
      createFilter(session.access_token!, f.criteria, f.action)
    )
  )

  const restored: string[] = []
  const notRestored: Array<{
    criteria: (typeof filtersToRestore)[0]["criteria"]
    action: (typeof filtersToRestore)[0]["action"]
    error: string
  }> = []

  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status === "fulfilled") {
      restored.push(r.value.id)
    } else {
      notRestored.push({
        criteria: filtersToRestore[i].criteria,
        action: filtersToRestore[i].action,
        error: (r.reason as Error).message ?? "Unknown error",
      })
    }
  }

  return NextResponse.json({ restored, notRestored })
}
