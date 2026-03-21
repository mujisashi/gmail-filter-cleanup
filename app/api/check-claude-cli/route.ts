import { getServerSession } from "next-auth/next"
import { NextResponse } from "next/server"
import { execFile } from "child_process"
import { promisify } from "util"
import { authOptions } from "@/lib/auth"

const execFileAsync = promisify(execFile)

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { stdout } = await execFileAsync("claude", ["--version"], {
      encoding: "utf8",
      timeout: 5000,
    })
    const version = stdout.trim().split("\n")[0] ?? "unknown"
    return NextResponse.json({ available: true, version })
  } catch {
    return NextResponse.json({ available: false })
  }
}
