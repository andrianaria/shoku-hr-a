import Link from "next/link"
import type { ReactNode } from "react"

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b bg-white">
        <nav aria-label="Navigasi utama" className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 md:px-8">
          <Link href="/payroll" className="font-semibold text-slate-900 hover:text-teal-700">
            Shoku HR Demo
          </Link>
          <span className="text-sm text-slate-600">Data sintetis</span>
        </nav>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">{children}</div>
    </div>
  )
}
