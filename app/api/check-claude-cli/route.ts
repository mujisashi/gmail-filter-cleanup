import { getServerSession } from "next-auth/next"
import { NextResponse } from "next/server"
import { spawnSync } from "child_process"
import { authOptions } from "@/lib/auth"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = spawnSync("claude", ["--version"], {
      encoding: "utf8",
      timeout: 5000,
    })
    if (result.status === 0) {
      const version = result.stdout.trim().split("\n")[0] ?? "unknown"
      return NextResponse.json({ available: true, version })
    }
    return NextResponse.json({ available: false })
  } catch {
    return NextResponse.json({ available: false })
  }
}
