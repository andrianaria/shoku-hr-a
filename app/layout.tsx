import type { Metadata } from "next"
import type { ReactNode } from "react"
import { BrowserAlertToasterBridge } from "@/components/browser-alert-toaster-bridge"
import { Toaster } from "@/components/ui/toaster"
import "./globals.css"

export const metadata: Metadata = {
  title: "Shoku HR Demo",
  description: "Demo lokal penggajian dan THR dengan data sintetis.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body className="font-sans antialiased">
        {children}
        <BrowserAlertToasterBridge />
        <Toaster />
      </body>
    </html>
  )
}
