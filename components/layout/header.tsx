import type { ReactNode } from "react"

export function Header({ title, description, children }: {
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
      {children}
    </header>
  )
}
