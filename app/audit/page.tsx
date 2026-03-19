import { getServerSession } from "next-auth/next"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { runAudit } from "@/lib/audit"
import { getFilters, getLabels } from "@/lib/gmail"
import { AuditClient } from "./audit-client"

export default async function AuditPage() {
  const session = await getServerSession(authOptions)

  if (!session?.access_token) {
    redirect("/")
  }
  if (session.error === "RefreshAccessTokenError") {
    redirect("/?error=session_expired")
  }

  const [filters, labels] = await Promise.all([
    getFilters(session.access_token),
    getLabels(session.access_token),
  ])

  const auditResult = runAudit(filters, labels)

  return <AuditClient auditResult={auditResult} />
}
