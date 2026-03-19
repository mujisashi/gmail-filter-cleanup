import { getServerSession } from "next-auth/next"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { SignInButton } from "./sign-in-button"

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (session?.access_token && !session.error) {
    redirect("/audit")
  }

  const { error } = await searchParams

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-8">
        {error === "session_expired" && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
            Your session expired. Please sign in again.
          </div>
        )}
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            Gmail Filter Cleanup
          </h1>
          <p className="text-gray-500 text-lg leading-relaxed">
            Audit your Gmail filters, find the mess, and let AI consolidate it
            — all in one click.
          </p>
        </div>

        <div className="space-y-2">
          <SignInButton />
          <p className="text-xs text-gray-400">
            Reads and writes Gmail filter settings only. No email content is
            accessed.
          </p>
        </div>

        <div className="text-left border border-gray-200 rounded-lg p-4 space-y-2 bg-white">
          <p className="text-sm font-medium text-gray-700">What it does</p>
          <ul className="text-sm text-gray-500 space-y-1">
            <li>→ Finds filters pointing to deleted labels</li>
            <li>→ Detects duplicate and overlapping rules</li>
            <li>→ Proposes consolidated replacements using AI</li>
            <li>→ Applies changes with one-click undo</li>
          </ul>
        </div>
      </div>
    </main>
  )
}
