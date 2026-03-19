import { google } from "googleapis"
import type { GmailFilter, GmailLabel } from "./types"

function getGmailClient(accessToken: string) {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  return google.gmail({ version: "v1", auth })
}

export async function getFilters(accessToken: string): Promise<GmailFilter[]> {
  const gmail = getGmailClient(accessToken)
  const res = await gmail.users.settings.filters.list({ userId: "me" })
  return (res.data.filter ?? []) as unknown as GmailFilter[]
}

export async function getLabels(accessToken: string): Promise<GmailLabel[]> {
  const gmail = getGmailClient(accessToken)
  const res = await gmail.users.labels.list({ userId: "me" })
  return (res.data.labels ?? []) as unknown as GmailLabel[]
}

export async function createFilter(
  accessToken: string,
  criteria: GmailFilter["criteria"],
  action: GmailFilter["action"]
): Promise<GmailFilter> {
  const gmail = getGmailClient(accessToken)
  const res = await gmail.users.settings.filters.create({
    userId: "me",
    requestBody: { criteria, action } as any,
  })
  return res.data as unknown as GmailFilter
}

export async function deleteFilter(
  accessToken: string,
  filterId: string
): Promise<void> {
  const gmail = getGmailClient(accessToken)
  await gmail.users.settings.filters.delete({ userId: "me", id: filterId })
}

export async function deleteFilterWithRetry(
  accessToken: string,
  filterId: string,
  retries = 3
): Promise<void> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await deleteFilter(accessToken, filterId)
      return
    } catch (err: any) {
      const isRateLimit = err?.code === 429 || err?.status === 429
      if (isRateLimit && attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000))
        continue
      }
      throw err
    }
  }
}
