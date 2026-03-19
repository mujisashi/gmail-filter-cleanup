import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import "./globals.css"
import { Providers } from "./providers"

export const metadata: Metadata = {
  title: "Gmail Filter Cleanup",
  description: "Audit and consolidate your Gmail filters with AI",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${GeistSans.className} ${GeistMono.variable} bg-gray-950 text-gray-100`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
