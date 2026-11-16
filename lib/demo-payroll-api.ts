import * as XLSX from "xlsx"
import {
  DemoPayrollError,
  DemoPayrollStore,
  isPayrollAction,
  monthDate,
  payloadObject,
  periodDate,
  positiveId,
} from "./demo-payroll.ts"

const scope = globalThis as typeof globalThis & { demoPayrollStore?: DemoPayrollStore }
const store = scope.demoPayrollStore ??= new DemoPayrollStore()

const noCache = { "Cache-Control": "no-store" }

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: noCache })
}

async function body(request: Request, allowEmpty = false) {
  try {
    const content = await request.text()
    return allowEmpty && !content.trim() ? {} : payloadObject(JSON.parse(content))
  } catch (error) {
    if (error instanceof DemoPayrollError) throw error
    throw new DemoPayrollError("Payload JSON tidak valid")
  }
}

function download(source: DemoPayrollStore, id: number, action: string, location: string | null) {
  const paymentSheet = action === "payment-sheet"
  const sheet = XLSX.utils.aoa_to_sheet(source.exportRows(id, location, paymentSheet))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, paymentSheet ? "Pembayaran Demo" : "Rekap Penggajian")
  const binary = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer
  return new Response(binary, {
    headers: {
      ...noCache,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="demo-${action}-${id}.xlsx"`,
    },
  })
}

const success = () => json({ success: true })

export async function handleDemoPayrollRequest(request: Request, source = store): Promise<Response> {
  const url = new URL(request.url)
  const [, area, ...segments] = url.pathname.split("/").filter(Boolean)
  const { method } = request
  const [first, second, third] = segments

  try {
    if (area === "thr") {
      if (method === "GET" && segments.length === 0) {
        const id = url.searchParams.get("payroll_run_id")
        const slips = source.thrSlips(id === null ? undefined : positiveId(id))
        return json({ success: true, slips, count: slips.length })
      }
      if (method === "POST" && segments.length === 1 && first === "generate") {
        const input = await body(request)
        const start = monthDate(input.startYear, input.startMonth)
        const end = monthDate(input.endYear, input.endMonth, true)
        const result = source.create("thr", start, end)
        return json({ generated: result.detailsCount, skipped: 0, payrollRunId: result.id }, 201)
      }
      if (method === "GET" && segments.length === 2 && first === "components") {
        return json(source.components(positiveId(second), "thr", false))
      }
      if (method === "GET" && segments.length === 3 && first === "slips" && (third === "components" || third === "custom-components")) {
        return json(source.components(positiveId(second), "thr", third === "custom-components"))
      }
    }

    if (area === "payroll") {
      if (method === "GET" && segments.length === 0) {
        const runs = source.list()
        return json({ runs, total: runs.length })
      }
      if (method === "POST" && segments.length === 0) {
        const input = await body(request)
        return json(source.create("payroll", periodDate(input.period_start), periodDate(input.period_end)), 201)
      }
      if (method === "GET" && segments.length === 2 && (first === "components" || first === "custom-components")) {
        return json(source.components(positiveId(second), "payroll", first === "custom-components"))
      }
      if (first && segments.length <= 2) {
        const id = positiveId(first)

        if (method === "GET" && !second) return json(source.details(id))
        if (method === "DELETE" && !second) {
          source.delete(id)
          return success()
        }
        if (method === "GET" && (second === "recap" || second === "payment-sheet")) {
          return download(source, id, second, url.searchParams.get("location"))
        }
        if (method === "POST" && second && isPayrollAction(second)) {
          source.transition(id, second)
          return success()
        }
        if (method === "POST" && second === "refresh") {
          const input = await body(request, true)
          source.refresh(id, input.employeeId === undefined ? undefined : positiveId(input.employeeId))
          return success()
        }
        if (method === "PUT" && (second === "components" || second === "thr-components")) {
          source.updateComponents(id, second === "thr-components" ? "thr" : "payroll", await body(request))
          return success()
        }
      }
    }

    return json({ error: "Endpoint tidak ditemukan" }, 404)
  } catch (error) {
    if (error instanceof DemoPayrollError) return json({ error: error.message }, error.status)
    return json({ error: "Permintaan demo gagal diproses" }, 500)
  }
}
