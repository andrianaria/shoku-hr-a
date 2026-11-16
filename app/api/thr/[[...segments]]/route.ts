import { handleDemoPayrollRequest } from "@/lib/demo-payroll-api"

export const dynamic = "force-dynamic"

export function GET(request: Request) {
  return handleDemoPayrollRequest(request)
}

export const POST = GET
