import assert from "node:assert/strict"
import test from "node:test"
import * as XLSX from "xlsx"
import { handleDemoPayrollRequest } from "../lib/demo-payroll-api.ts"
import { DemoPayrollStore } from "../lib/demo-payroll.ts"

function demoClient() {
  const store = new DemoPayrollStore()
  return (path, method = "GET", payload) => handleDemoPayrollRequest(
    new Request(`http://localhost/api/${path}`, {
      method,
      headers: payload === undefined ? undefined : { "Content-Type": "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    }),
    store,
  )
}

test("creates a draft exactly once, validates dates and enforces the payment lifecycle", async () => {
  const request = demoClient()
  const invalid = await request("payroll", "POST", { period_start: "2027-02-29", period_end: "2027-03-01" })
  assert.equal(invalid.status, 400)

  const period = { period_start: "2025-01-01", period_end: "2025-02-01" }
  const response = await request("payroll", "POST", period)
  assert.equal(response.status, 201)
  const { id, detailsCount } = await response.json()
  assert.equal(detailsCount, 2)
  assert.equal((await (await request("payroll", "POST", period)).json()).id, id)
  assert.equal((await request(`payroll/${id}/mark-paid`, "POST")).status, 409)
  assert.equal((await request(`payroll/${id}/process`, "POST")).status, 200)
  assert.equal((await request(`payroll/${id}/revert-to-draft`, "POST")).status, 200)
  assert.equal((await request(`payroll/${id}/publish`, "POST")).status, 200)
  assert.equal((await request(`payroll/${id}/mark-paid`, "POST")).status, 200)
  assert.equal((await request(`payroll/${id}/mark-paid`, "POST")).status, 200)
  assert.equal((await request(`payroll/${id}`, "DELETE")).status, 409)
  assert.equal((await request(`payroll/${id}/components`, "PUT", {})).status, 409)
  const { run } = await (await request(`payroll/${id}`)).json()
  assert.equal(run.status, "paid")
})

test("applies rate and custom updates atomically, with one-person refresh", async () => {
  const request = demoClient()
  const { details } = await (await request("payroll/1")).json()
  const [first, second] = details
  const update = { payroll_detail_id: first.id, component_id: 2, unit: 20, rate: 1 }
  const invalid = await request("payroll/1/components", "PUT", {
    updates: [update, { ...update, payroll_detail_id: 99 }],
  })
  assert.equal(invalid.status, 400)
  const before = await (await request(`payroll/components/${first.id}`)).json()
  assert.equal(before.components.find((component) => component.id === 2).unit, 18)

  const adjustment = { payroll_detail_id: first.id, name: "Demo adjustment", type: "deduction", amount: 50_000 }
  const updated = await request("payroll/1/components", "PUT", { updates: [update], customUpdates: [adjustment] })
  assert.equal(updated.status, 200)
  const regular = await (await request("payroll/1")).json()
  assert.equal(regular.details[0].gross_salary, 4_500_000)
  assert.equal(regular.details[0].net_salary, 4_350_000)
  assert.equal(regular.details[1].net_salary, second.net_salary)

  const refreshed = await request("payroll/1/refresh", "POST", { employeeId: first.employee_id })
  assert.equal(refreshed.status, 200)
  const after = await (await request("payroll/1")).json()
  assert.equal(after.details[0].net_salary, first.net_salary - 50_000)
  assert.equal(after.details[1].net_salary, second.net_salary)

  const cleared = await request("payroll/1/components", "PUT", { replaceCustomDetailIds: [first.id] })
  assert.equal(cleared.status, 200)
  assert.deepEqual(await (await request(`payroll/custom-components/${first.id}`)).json(), { customComponents: [] })
})

test("generates and edits prorated THR slips using the same payroll state", async () => {
  const request = demoClient()
  const created = await request("thr/generate", "POST", { startMonth: 11, startYear: 2024, endMonth: 11, endYear: 2024 })
  assert.equal(created.status, 201)
  const { generated, payrollRunId } = await created.json()
  assert.equal(generated, 2)
  const { slips } = await (await request(`thr?payroll_run_id=${payrollRunId}`)).json()
  assert.equal(slips[0].prorated_percentage, 100)
  assert.ok(slips[1].prorated_percentage > 0 && slips[1].prorated_percentage < 100)

  const { id } = slips[1]
  const { components } = await (await request(`thr/slips/${id}/components`)).json()
  const change = { thr_slip_id: id, component_id: components[0].id, prorated_amount: 1_500_000 }
  const response = await request(`payroll/${payrollRunId}/thr-components`, "PUT", {
    thrUpdates: [change],
    customUpdates: [{ thr_slip_id: id, name: "Demo THR bonus", type: "earning", amount: 25_000 }],
  })
  assert.equal(response.status, 200)
  const updated = await (await request(`payroll/${payrollRunId}`)).json()
  assert.equal(updated.run.type, "thr")
  assert.equal(updated.thrSlips[1].thr_amount, 1_525_000)

  await request(`payroll/${payrollRunId}/thr-components`, "PUT", { thrUpdates: [change], customUpdates: [] })
  assert.deepEqual(await (await request(`thr/slips/${id}/custom-components`)).json(), { customComponents: [] })
})

test("returns genuine filtered XLSX recaps and clearly synthetic payment references", async () => {
  const request = demoClient()
  const download = await request("payroll/1/recap?location=Location%20B")
  assert.equal(download.status, 200)
  assert.match(download.headers.get("content-disposition"), /\.xlsx"/)
  const recap = XLSX.read(await download.arrayBuffer(), { type: "array" })
  const rows = XLSX.utils.sheet_to_json(recap.Sheets[recap.SheetNames[0]], { header: 1 })
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[1].slice(0, 3), ["DEMO-B", "Employee B", "Location B"])

  const payment = await request("payroll/2/payment-sheet")
  const workbook = XLSX.read(await payment.arrayBuffer(), { type: "array" })
  const figures = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 })
  assert.deepEqual(figures.slice(1).map((row) => row[3]), ["TEST-1", "TEST-2"])
})
