export interface PayrollObjectNote {
  label?: string
  points?: number
  units?: number
  unitLabel?: string
  periodStart?: string
  periodEnd?: string
  dates?: string[]
}

const hiddenAllowanceLabels = new Set([
  "bonus hari libur",
  "tunjangan harian",
  "tunjangan sabtu minggu",
  "tunjangan transport harian",
])

export function payrollNoteLines(note: PayrollObjectNote): string[] {
  const label = typeof note.label === "string" ? note.label.trim().toLowerCase() : ""
  if (hiddenAllowanceLabels.has(label)) return []
  const points = typeof note.points === "number" ? `Poin keterlambatan: ${note.points}` : ""
  if (label === "potongan keterlambatan" || label === "terlambat") return points ? [points] : []
  return [
    typeof note.label === "string" ? note.label : "",
    points,
    typeof note.units === "number" ? `Jumlah: ${note.units} ${note.unitLabel || "unit"}` : "",
    note.periodStart && note.periodEnd ? `Periode: ${note.periodStart} s.d. ${note.periodEnd}` : "",
  ].filter(Boolean)
}

export function payrollBreakdownLines(
  items: unknown[],
  formatDate: (value: string) => string = (value) => new Date(value).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
): string[] {
  return items.flatMap((value) => {
    if (!value || typeof value !== "object") return []
    const item = value as Record<string, unknown>
    let label = "Rincian potongan"
    if ("installment_number" in item || "installment_months" in item) {
      const number = Number(item.installment_number)
      const total = Number(item.installment_months)
      label = Number.isInteger(number) && number > 0 && Number.isInteger(total) && total >= number
        ? `Cicilan ${number}/${total}` : "Cicilan"
    } else if (typeof item.date === "string" && Number.isFinite(Date.parse(item.date))) {
      label = formatDate(item.date)
    }
    const amount = item.amount === null || item.amount === undefined || item.amount === "" ? NaN : Number(item.amount)
    return [Number.isFinite(amount)
      ? `${label} - ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)}`
      : label]
  })
}
