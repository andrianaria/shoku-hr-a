type RunKind = "payroll" | "thr"
type RunStatus = "draft" | "published" | "paid"
type ComponentKind = "earning" | "deduction"
type CalculationKind = "fixed" | "rate" | "input"

const employees = [
  { id: 1, name: "Employee A", code: "DEMO-A", location: "Location A", base: 4_000_000, units: 18, hired: "2024-01-01" },
  { id: 2, name: "Employee B", code: "DEMO-B", location: "Location B", base: 3_500_000, units: 16, hired: "2024-11-15" },
]

type Employee = (typeof employees)[number]
type Component = {
  id: number
  name: string
  type: ComponentKind
  calculation: CalculationKind
  amount: number
  rate?: number
  unit?: number
}
type CustomComponent = Pick<Component, "name" | "type" | "amount">
type Entry = {
  id: number
  employee: Employee
  workingDays: number
  proratedPercentage: number
  components: Component[]
  customComponents: CustomComponent[]
}
type Run = {
  id: number
  type: RunKind
  period_start: string
  period_end: string
  status: RunStatus
  created_at: string
  processed_at?: string
  paid_at?: string
  entries: Entry[]
}

export class DemoPayrollError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export function payloadObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DemoPayrollError("Payload harus berupa objek JSON")
  }
  return value as Record<string, unknown>
}

function optionalArray(value: unknown): unknown[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 100) throw new DemoPayrollError("Daftar perubahan tidak valid")
  return value
}

export function positiveId(value: unknown): number {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value))) {
    throw new DemoPayrollError("ID tidak valid")
  }
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id < 1) throw new DemoPayrollError("ID tidak valid")
  return id
}

function amount(value: unknown, maximum = 1_000_000_000_000): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum) {
    throw new DemoPayrollError("Jumlah tidak valid")
  }
  return value
}

export function periodDate(value: unknown): string {
  if (typeof value !== "string" || !/^(?:19|20)\d\d-\d\d-\d\d$/.test(value)) {
    throw new DemoPayrollError("Tanggal periode tidak valid")
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new DemoPayrollError("Tanggal periode tidak valid")
  }
  return value
}

export function monthDate(year: unknown, month: unknown, endOfMonth = false): string {
  const y = positiveId(year)
  const m = positiveId(month)
  if (y < 1900 || y > 2099 || m > 12) throw new DemoPayrollError("Bulan atau tahun periode tidak valid")
  if (endOfMonth) return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  return new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10)
}

function weekdays(start: string, end: string): number {
  if (start > end) return 0
  const dayCount = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1
  let count = Math.floor(dayCount / 7) * 5
  const firstDay = new Date(start).getUTCDay()
  for (let offset = 0; offset < dayCount % 7; offset++) {
    const day = (firstDay + offset) % 7
    if (day >= 1 && day <= 5) count++
  }
  return count
}

function fixedSalary(employee: Employee): Component {
  return { id: 1, name: "Gaji pokok", type: "earning", calculation: "fixed", amount: employee.base }
}

function payrollComponents(employee: Employee): Component[] {
  const rate = 25_000
  return [
    fixedSalary(employee),
    { id: 2, name: "Uang makan", type: "earning", calculation: "rate", amount: rate * employee.units, rate, unit: employee.units },
    { id: 3, name: "Bonus", type: "earning", calculation: "input", amount: 0 },
    { id: 4, name: "Potongan tetap", type: "deduction", calculation: "fixed", amount: 100_000 },
  ]
}

function totals(entry: Entry) {
  const sums = { earning: 0, deduction: 0 }
  for (const component of [...entry.components, ...entry.customComponents]) sums[component.type] += component.amount
  return { total_earnings: sums.earning, total_deductions: sums.deduction, gross_salary: sums.earning, net_salary: sums.earning - sums.deduction }
}

function entrySummary(run: Run, entry: Entry) {
  return {
    id: entry.id,
    payroll_run_id: run.id,
    employee_id: entry.employee.id,
    employee_name: entry.employee.name,
    employee_code: entry.employee.code,
    employee_id_display: entry.employee.code,
    location_name: entry.employee.location,
    base_salary: entry.employee.base,
    created_at: run.created_at,
    status: run.status === "draft" ? "pending" : "approved",
    ...totals(entry),
  }
}

function thrSummary(run: Run, entry: Entry) {
  const summary = entrySummary(run, entry)
  return {
    ...summary,
    thr_amount: summary.net_salary,
    total_fixed_earnings: entry.components.reduce((sum, component) => sum + component.amount, 0),
    working_days: entry.workingDays,
    prorated_percentage: entry.proratedPercentage,
  }
}

function runSummary(run: Run) {
  const { entries, ...publicFields } = run
  return entries.reduce((summary, entry) => {
    const values = totals(entry)
    summary.total_gross += values.gross_salary
    summary.total_deductions += values.total_deductions
    summary.total_net += values.net_salary
    return summary
  }, { ...publicFields, created_by: 1, created_by_name: "Demo Admin", total_gross: 0, total_deductions: 0, total_net: 0 })
}

function componentSummary(entry: Entry, component: Component) {
  return {
    id: component.id,
    name: component.name,
    component_name: component.name,
    component_id: component.id,
    payroll_detail_id: entry.id,
    type: component.type,
    component_type: component.type,
    calculation_type: component.calculation,
    input_type: component.calculation,
    calculation_value: component.rate ?? component.amount,
    rate: component.rate ?? null,
    unit: component.unit ?? null,
    amount: component.amount,
    can_edit: component.calculation !== "fixed",
  }
}

const transitions = {
  process: { from: "draft", to: "published" },
  publish: { from: "draft", to: "published" },
  "revert-to-draft": { from: "published", to: "draft" },
  "mark-paid": { from: "published", to: "paid" },
} as const

export type PayrollAction = keyof typeof transitions

export function isPayrollAction(value: string): value is PayrollAction {
  return Object.hasOwn(transitions, value)
}

export class DemoPayrollStore {
  private runs = new Map<number, Run>()
  private nextRunId = 1
  private nextEntryId = 1

  constructor() {
    this.create("payroll", "2025-01-01", "2025-01-31")
    const published = this.create("payroll", "2024-12-01", "2024-12-31")
    this.transition(published.id, "publish")
    this.create("thr", "2024-07-01", "2025-06-30")
  }

  private getRun(id: number) {
    const run = this.runs.get(id)
    if (!run) throw new DemoPayrollError("Penggajian tidak ditemukan", 404)
    return run
  }

  list() {
    return Array.from(this.runs.values(), runSummary).reverse()
  }

  create(type: RunKind, periodStart: string, periodEnd: string) {
    if (periodStart > periodEnd) throw new DemoPayrollError("Tanggal selesai harus sama atau setelah tanggal mulai")
    const existing = Array.from(this.runs.values()).find(
      (run) => run.type === type && run.period_start === periodStart && run.period_end === periodEnd,
    )
    if (existing) return { id: existing.id, detailsCount: existing.entries.length }

    const periodWeekdays = type === "thr" ? weekdays(periodStart, periodEnd) : 0
    const entries = employees.filter((employee) => type === "payroll" || employee.hired <= periodEnd).map((employee) => {
      const workingDays = weekdays(employee.hired > periodStart ? employee.hired : periodStart, periodEnd)
      const proratedPercentage = periodWeekdays ? workingDays / periodWeekdays * 100 : 0
      const salary = fixedSalary(employee)
      return {
        id: this.nextEntryId++,
        employee,
        workingDays,
        proratedPercentage,
        components: type === "thr"
          ? [{ ...salary, calculation: "input" as const, amount: Math.round(salary.amount * proratedPercentage / 100) }]
          : payrollComponents(employee),
        customComponents: [],
      }
    })
    const id = this.nextRunId++
    this.runs.set(id, { id, type, period_start: periodStart, period_end: periodEnd, status: "draft", created_at: new Date().toISOString(), entries })
    return { id, detailsCount: entries.length }
  }

  details(id: number) {
    const run = this.getRun(id)
    return {
      run: runSummary(run),
      details: run.type === "payroll" ? run.entries.map((entry) => entrySummary(run, entry)) : [],
      thrSlips: run.type === "thr" ? run.entries.map((entry) => thrSummary(run, entry)) : [],
    }
  }

  thrSlips(runId?: number) {
    const runs = runId === undefined ? Array.from(this.runs.values()) : [this.getRun(runId)]
    return runs.filter((run) => run.type === "thr").flatMap((run) => run.entries.map((entry) => thrSummary(run, entry)))
  }

  components(id: number, type: RunKind, custom: boolean) {
    const entry = Array.from(this.runs.values())
      .filter((run) => run.type === type)
      .flatMap((run) => run.entries)
      .find((item) => item.id === id)
    if (!entry) throw new DemoPayrollError("Rincian karyawan tidak ditemukan", 404)

    if (custom) return { customComponents: entry.customComponents.map((item, index) => ({ ...item, id: index + 1 })) }
    return { components: entry.components.map((component) => componentSummary(entry, component)) }
  }

  transition(id: number, action: PayrollAction) {
    const run = this.getRun(id)
    const { from, to } = transitions[action]
    if (run.status === to) return
    if (run.status !== from) throw new DemoPayrollError("Perubahan status tidak tersedia", 409)
    run.status = to
    if (to === "published") run.processed_at = new Date().toISOString()
    if (to === "paid") run.paid_at = new Date().toISOString()
    if (to === "draft") delete run.processed_at
  }

  delete(id: number) {
    const run = this.getRun(id)
    if (run.status !== "draft") throw new DemoPayrollError("Hanya penggajian draf yang dapat dihapus", 409)
    this.runs.delete(id)
  }

  refresh(id: number, employeeId?: number) {
    const run = this.getRun(id)
    if (run.type !== "payroll" || run.status === "paid" || (run.status === "published" && employeeId === undefined)) {
      throw new DemoPayrollError("Penggajian ini tidak dapat diperbarui", 409)
    }

    const entries = employeeId === undefined ? run.entries : run.entries.filter((entry) => entry.employee.id === employeeId)
    if (!entries.length) throw new DemoPayrollError("Rincian karyawan tidak ditemukan", 404)
    for (const entry of entries) entry.components = payrollComponents(entry.employee)
  }

  updateComponents(id: number, type: RunKind, body: Record<string, unknown>) {
    const run = this.getRun(id)
    if (run.type !== type) throw new DemoPayrollError("Jenis penggajian tidak sesuai")
    if (run.status === "paid") throw new DemoPayrollError("Penggajian yang sudah dibayar tidak dapat diubah", 409)

    const entryKey = type === "thr" ? "thr_slip_id" : "payroll_detail_id"
    const entryCopies = new Map<number, Entry>()
    const getEntryCopy = (value: unknown) => {
      const entryId = positiveId(value)
      let entry = entryCopies.get(entryId)
      if (!entry) {
        const current = run.entries.find((item) => item.id === entryId)
        if (!current) throw new DemoPayrollError("Rincian karyawan tidak ada dalam penggajian ini")
        entry = structuredClone(current)
        entryCopies.set(entryId, entry)
      }
      return entry
    }

    const replacingCustom = new Set<Entry>()
    for (const value of optionalArray(body.replaceCustomDetailIds)) replacingCustom.add(getEntryCopy(value))

    for (const value of optionalArray(type === "thr" ? body.thrUpdates : body.updates)) {
      const update = payloadObject(value)
      const entry = getEntryCopy(update[entryKey])
      const component = entry.components.find((item) => item.id === positiveId(update.component_id))
      if (!component) throw new DemoPayrollError("Komponen gaji tidak ditemukan")

      if (type === "thr") {
        component.amount = Math.round(amount(update.prorated_amount))
        replacingCustom.add(entry)
      } else if (component.calculation === "rate") {
        component.unit = amount(update.unit, 10_000)
        component.amount = Math.round((component.rate ?? 0) * component.unit)
      } else if (component.calculation === "input") {
        component.amount = Math.round(amount(update.amount))
      }
    }

    const customUpdates = optionalArray(body.customUpdates).map((value) => {
      const update = payloadObject(value)
      const entry = getEntryCopy(update[entryKey])
      const name = typeof update.name === "string" ? update.name.trim() : ""
      const { type } = update
      if (!name || name.length > 120 || (type !== "earning" && type !== "deduction")) {
        throw new DemoPayrollError("Nama atau jenis komponen tambahan tidak valid")
      }
      replacingCustom.add(entry)
      const component: CustomComponent = { name, type, amount: Math.round(amount(update.amount)) }
      return { entry, component }
    })

    if (run.status === "published" && entryCopies.size > 1) {
      throw new DemoPayrollError("Koreksi penggajian terbit hanya berlaku untuk satu karyawan", 409)
    }
    for (const entry of replacingCustom) entry.customComponents = []
    for (const { entry, component } of customUpdates) entry.customComponents.push(component)
    run.entries = run.entries.map((entry) => entryCopies.get(entry.id) ?? entry)
  }

  exportRows(id: number, location: string | null, paymentSheet: boolean): Array<Array<string | number>> {
    const run = this.getRun(id)
    const entries = run.entries.filter(({ employee }) => !location || location === "all" || employee.location === location)
    if (paymentSheet) {
      return [
        ["Kode Karyawan", "Nama", "Bank Demo", "Referensi Rekening Demo", "Jumlah (IDR)"],
        ...entries.map((entry) => [entry.employee.code, entry.employee.name, "Bank Demo", `TEST-${entry.employee.id}`, totals(entry).net_salary]),
      ]
    }
    return [
      ["Kode Karyawan", "Nama", "Lokasi", "Bruto (IDR)", "Potongan (IDR)", "Bersih (IDR)"],
      ...entries.map((entry) => {
        const summary = totals(entry)
        return [entry.employee.code, entry.employee.name, entry.employee.location, summary.gross_salary, summary.total_deductions, summary.net_salary]
      }),
    ]
  }
}
