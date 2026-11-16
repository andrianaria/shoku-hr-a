import assert from "node:assert/strict"
import test from "node:test"
import { payrollBreakdownLines, payrollNoteLines } from "../lib/payroll-note-display.ts"

const period = { periodStart: "2030-04-01T00:00:00.000Z", periodEnd: "2030-04-30T00:00:00.000Z" }

test("kasbon uses the stored installment number and total, not a missing date", () => {
  const items = [
    { installment_number: 4, installment_months: 12, amount: "210000.00", due_date: "2030-04-15" },
    { installment_number: 2, installment_months: 4, amount: 210000 },
    { installment_number: "2", installment_months: "9", amount: 300000 },
  ]
  const before = structuredClone(items)
  const lines = payrollBreakdownLines(items)
  assert.equal(lines[0].replace(/\s/g, " "), "Cicilan 4/12 - Rp 210.000")
  assert.ok(lines[1].startsWith("Cicilan 2/4 - "))
  assert.ok(lines[2].startsWith("Cicilan 2/9 - "))
  assert.deepEqual(items, before)
})

test("cash advance dates are retained and malformed data never shows Invalid Date", () => {
  assert.equal(payrollBreakdownLines([{ date: "2030-04-06", amount: 100000 }], () => "06 Apr 2030")[0].replace(/\s/g, " "), "06 Apr 2030 - Rp 100.000")
  const lines = payrollBreakdownLines([null, { date: "invalid", amount: 1 }, { installment_number: 0, installment_months: 4, amount: 1 }, { installment_number: 4, installment_months: 2, amount: null }])
  assert.equal(lines.length, 3)
  assert.ok(lines.every((line) => !line.includes("Invalid Date") && !line.includes("NaN")))
  assert.equal(lines[2], "Cicilan")
  assert.deepEqual(payrollBreakdownLines([]), [])
})

test("attendance allowances have no extra captions", () => {
  for (const label of ["Bonus Hari Libur", "Tunjangan Harian", "Tunjangan Sabtu Minggu", "Tunjangan Transport Harian"]) {
    assert.deepEqual(payrollNoteLines({ label, units: 14, unitLabel: "hari", ...period }), [])
  }
})

test("late deductions show only points, including zero and fractional points", () => {
  for (const points of [0, 1.5, 46]) {
    assert.deepEqual(payrollNoteLines({ label: "Potongan keterlambatan", points, ...period }), [`Poin keterlambatan: ${points}`])
  }
  assert.deepEqual(payrollNoteLines({ label: "Potongan Keterlambatan", ...period }), [])
})

test("other notes remain unchanged and input metadata is preserved", () => {
  const note = { label: "Prorata skema lama 10/30 hari", ...period }
  const before = structuredClone(note)
  assert.deepEqual(payrollNoteLines(note), [note.label, `Periode: ${period.periodStart} s.d. ${period.periodEnd}`])
  assert.deepEqual(note, before)
  assert.deepEqual(payrollNoteLines({ label: "Part Time - all-in", units: 2, unitLabel: "shift" }), ["Part Time - all-in", "Jumlah: 2 shift"])
  assert.deepEqual(payrollNoteLines({}), [])
})
