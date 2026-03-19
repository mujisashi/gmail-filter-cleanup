import { SignJWT, jwtVerify } from "jose"
import type { GmailFilter } from "./types"

function getSecret() {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set")
  return new TextEncoder().encode(secret)
}

export async function createUndoToken(filters: GmailFilter[]): Promise<string> {
  return new SignJWT({ filters })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .setIssuedAt()
    .sign(getSecret())
}

export async function verifyUndoToken(token: string): Promise<GmailFilter[]> {
  const { payload } = await jwtVerify(token, getSecret())
  if (!Array.isArray(payload.filters)) {
    throw new Error("Invalid undo token payload")
  }
  return payload.filters as GmailFilter[]
}
