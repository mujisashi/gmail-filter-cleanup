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

  let filters, labels
  try {
    ;[filters, labels] = await Promise.all([
      getFilters(session.access_token),
      getLabels(session.access_token),
    ])
  } catch (err: any) {
    if (err?.code === 403 || err?.status === 403) {
      redirect("/?error=session_expired")
    }
    throw err
  }

  const auditResult = runAudit(filters, labels)

  return <AuditClient auditResult={auditResult} />
}
