import NextAuth from "next-auth"

declare module "next-auth" {
  interface Session {
    access_token: string
    error?: "RefreshAccessTokenError"
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    access_token: string
    refresh_token?: string
    expires_at?: number
    error?: "RefreshAccessTokenError"
  }
}
