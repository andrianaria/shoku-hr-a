"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { AppLayout } from "@/components/layout/app-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Save, ChevronDown, ChevronUp, Plus, RefreshCw, Loader2, Download, Pencil, X } from "lucide-react"
import { format } from "date-fns"
import { payrollBreakdownLines, payrollNoteLines, type PayrollObjectNote } from "@/lib/payroll-note-display"

interface THRSlip {
  id: number
  employee_id: number
  employee_name: string
  employee_code: string
  total_fixed_earnings: number
  thr_amount: number
}

interface THRComponent {
  id: number
  thr_slip_id: number
  component_name: string
  prorated_amount: number
  component_type?: "earning"
}

interface PayrollComponent {
  id: number
  payroll_detail_id: number
  component_id: number
  component_name: string
  name?: string
  type?: "earning" | "deduction"
  component_type: "earning" | "deduction"
  input_type: "fixed" | "rate" | "formula" | "input"
  amount: number
  calculation_type: string
  calculation_value: number
  note?: string | null
  can_edit: boolean
}

function ComponentBreakdown({ note }: { note?: string | null }) {
  if (!note) return null

  try {
    const parsed = JSON.parse(note) as
      | unknown[]
      | PayrollObjectNote

    if (!Array.isArray(parsed)) {
      if (!parsed || typeof parsed !== "object") return null
      const lines = payrollNoteLines(parsed)
      if (!lines.length) return null
      return (
        <div className="mt-1 space-y-0.5 text-[11px] font-normal text-muted-foreground">
          {lines.map((line, index) => <div key={index}>{line}</div>)}
        </div>
      )
    }
    if (parsed.length === 0) return null

    return (
      <div className="mt-1 space-y-0.5 text-[11px] font-normal text-muted-foreground">
        {payrollBreakdownLines(parsed).map((line, index) => <div key={index}>{line}</div>)}
      </div>
    )
  } catch {
    return null
  }
}

interface PayrollRun {
  id: number
  period_start: string
  period_end: string
  status: string
  total_gross: number
  total_net: number
  total_deductions: number
  type?: "regular" | "thr"
}

interface PayrollDetail {
  id: number
  payroll_run_id: number
  employee_id: number
  employee_name: string
  employee_code?: string
  employee_id_display?: string
  location_id?: number | null
  location_name?: string | null
  base_salary: number
  total_earnings: number
  total_deductions: number
  gross_salary: number
  net_salary: number
  thr_amount?: number
  status: string
  created_at: string
}

export default function EditPayrollPage() {
  const router = useRouter()
  const params = useParams()
  const { toast } = useToast()
  const payrollId = params.id as string

  const [payrollRun, setPayrollRun] = useState<PayrollRun | null>(null)
  const [payrollDetails, setPayrollDetails] = useState<PayrollDetail[]>([])
  const [payrollComponents, setPayrollComponents] = useState<{ [key: number]: PayrollComponent[] }>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshingEmployee, setRefreshingEmployee] = useState<number | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [loadingComponents, setLoadingComponents] = useState<number | null>(null)
  const [locationFilter, setLocationFilter] = useState("all")
  const [expandedEmployee, setExpandedEmployee] = useState<number | null>(null)
  const [editingEmployee, setEditingEmployee] = useState<number | null>(null)
  const [unitInputs, setUnitInputs] = useState<{ [key: string]: number }>({})
  const [customComponents, setCustomComponents] = useState<{ [key: number]: Array<{ id: string; name: string; type: "earning" | "deduction"; amount: number }> }>({})
  const [openDialogDetail, setOpenDialogDetail] = useState<number | null>(null)
  const [dialogFormData, setDialogFormData] = useState({ name: "", amount: "", type: "earning" as "earning" | "deduction" })
  const [newCustomComponent, setNewCustomComponent] = useState<{ [key: number]: { name: string; type: "earning" | "deduction"; amount: string } }>({})

  const updateUnitInput = (detailId: number, componentId: number, value: number) => {
    const key = `${detailId}-${componentId}`
    setUnitInputs((prev) => ({ ...prev, [key]: value }))
  }

  const getUnitInput = (detailId: number, componentId: number) => {
    const key = `${detailId}-${componentId}`
    return unitInputs[key] ?? 0
  }

  const addCustomComponent = () => {
    if (!openDialogDetail || !dialogFormData.name || !dialogFormData.amount || Number.isNaN(Number(dialogFormData.amount))) {
      return
    }

    const customId = `custom-${Date.now()}`
    setCustomComponents((prev) => ({
      ...prev,
      [openDialogDetail]: [
        ...(prev[openDialogDetail] || []),
        {
          id: customId,
          name: dialogFormData.name,
          type: dialogFormData.type,
          amount: Number(dialogFormData.amount),
        },
      ],
    }))

    setDialogFormData({ name: "", amount: "", type: "earning" })
    setOpenDialogDetail(null)
  }

  const removeCustomComponent = (detailId: number, customId: string) => {
    setCustomComponents((prev) => ({
      ...prev,
      [detailId]: (prev[detailId] || []).filter((c) => c.id !== customId),
    }))
  }

  const updateCustomComponentAmount = (detailId: number, customId: string, newAmount: number) => {
    setCustomComponents((prev) => ({
      ...prev,
      [detailId]: (prev[detailId] || []).map((c) => (c.id === customId ? { ...c, amount: newAmount } : c)),
    }))
  }

  useEffect(() => {
    fetchPayrollData()
  }, [payrollId])

  const fetchPayrollData = async () => {
    try {
      const response = await fetch(`/api/payroll/${payrollId}`)
      if (response.ok) {
        const data = await response.json()
        setPayrollRun(data.run)

        setPayrollDetails(data.run.type === "thr" ? data.thrSlips || [] : data.details || [])
        setExpandedEmployee(null)
        setEditingEmployee(null)
        setPayrollComponents({})
        setCustomComponents({})
        setUnitInputs({})
      }
    } catch (error) {
      console.error("Error fetching payroll data:", error)
    } finally {
      setLoading(false)
    }
  }

  const toggleEmployee = async (detailId: number) => {
    if (expandedEmployee === detailId) {
      setExpandedEmployee(null)
      return
    }

    if (!Object.prototype.hasOwnProperty.call(payrollComponents, detailId)) {
      setLoadingComponents(detailId)
      try {
        const isThr = payrollRun?.type === "thr"
        const [componentsResponse, customResponse] = await Promise.all([
          fetch(isThr ? `/api/thr/slips/${detailId}/components` : `/api/payroll/components/${detailId}`),
          fetch(isThr ? `/api/thr/slips/${detailId}/custom-components` : `/api/payroll/custom-components/${detailId}`),
        ])
        if (!componentsResponse.ok || !customResponse.ok) throw new Error("Komponen gaji gagal dimuat")

        const componentsData = await componentsResponse.json()
        const customData = await customResponse.json()
        const components = componentsData.components || []
        setPayrollComponents((prev) => ({ ...prev, [detailId]: components }))
        setCustomComponents((prev) => ({
          ...prev,
          [detailId]: (customData.customComponents || []).map((component: any) => ({
            id: component.id.toString(),
            name: component.name,
            type: component.type,
            amount: component.amount,
          })),
        }))

        const loadedUnits: { [key: string]: number } = {}
        for (const component of components) {
          if (component.unit !== null && component.unit !== undefined) {
            loadedUnits[`${detailId}-${component.component_id}`] = Number(component.unit)
          }
        }
        setUnitInputs((prev) => ({ ...prev, ...loadedUnits }))
      } catch (error) {
        toast({
          title: "Komponen belum dapat dibuka",
          description: error instanceof Error ? error.message : "Silakan coba kembali",
          variant: "destructive",
        })
        return
      } finally {
        setLoadingComponents(null)
      }
    }

    setExpandedEmployee(detailId)
  }

  const updateComponentAmount = (detailId: number, componentId: number, newAmount: number) => {
    setPayrollComponents(
      prev =>
        ({
          ...prev,
          [detailId]: prev[detailId]?.map((comp) => {
            // Handle both regular payroll (with component_id) and THR (with id)
            const compId = comp.component_id ?? comp.id
            return compId === componentId ? { ...comp, amount: newAmount } : comp
          }) || [],
        } as any),
    )
  }

  const refreshFromSalarySettings = async () => {
    const confirmed = window.confirm(
      "Perbarui payroll dari pengaturan gaji terbaru? Semua perubahan unit, nominal, dan komponen tambahan yang diedit manual pada draft ini akan direset.",
    )
    if (!confirmed) return

    setRefreshing(true)
    try {
      const response = await fetch(`/api/payroll/${payrollId}/refresh`, { method: "POST" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Payroll gagal diperbarui")

      toast({ title: "Payroll diperbarui", description: result.message })
      setExpandedEmployee(null)
      setPayrollComponents({})
      setCustomComponents({})
      setUnitInputs({})
      await fetchPayrollData()
    } catch (error) {
      toast({
        title: "Payroll gagal diperbarui",
        description: error instanceof Error ? error.message : "Silakan coba lagi",
        variant: "destructive",
      })
    } finally {
      setRefreshing(false)
    }
  }

  const refreshEmployeeFromSalarySettings = async (detail: PayrollDetail) => {
    const confirmed = window.confirm(
      `Perbarui payroll ${detail.employee_name} dari pengaturan gaji terbaru? Unit, potongan manual, dan komponen tambahan yang sudah disimpan akan tetap dipertahankan.`,
    )
    if (!confirmed) return

    setRefreshingEmployee(detail.id)
    try {
      const response = await fetch(`/api/payroll/${payrollId}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: detail.employee_id }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Payroll karyawan gagal diperbarui")

      toast({
        title: "Payroll karyawan diperbarui",
        description: `${detail.employee_name} memakai pengaturan terbaru tanpa menghapus input manual yang sudah disimpan.`,
      })

      const payrollResponse = await fetch(`/api/payroll/${payrollId}`)
      if (!payrollResponse.ok) throw new Error("Ringkasan payroll terbaru gagal dimuat")
      const payrollData = await payrollResponse.json()
      const refreshedDetails: PayrollDetail[] = payrollData.details || []
      const refreshedDetail = refreshedDetails.find((item) => item.employee_id === detail.employee_id)
      const resetDetailIds = new Set([detail.id, refreshedDetail?.id].filter((id): id is number => id !== undefined))

      setPayrollRun(payrollData.run)
      setPayrollDetails(refreshedDetails)
      setPayrollComponents((previous) =>
        Object.fromEntries(Object.entries(previous).filter(([detailId]) => !resetDetailIds.has(Number(detailId)))),
      )
      setCustomComponents((previous) =>
        Object.fromEntries(Object.entries(previous).filter(([detailId]) => !resetDetailIds.has(Number(detailId)))),
      )
      setUnitInputs((previous) =>
        Object.fromEntries(
          Object.entries(previous).filter(([key]) => !resetDetailIds.has(Number(key.split("-", 1)[0]))),
        ),
      )
      if (resetDetailIds.has(expandedEmployee ?? -1)) setExpandedEmployee(null)
    } catch (error) {
      toast({
        title: "Payroll karyawan gagal diperbarui",
        description: error instanceof Error ? error.message : "Silakan coba lagi",
        variant: "destructive",
      })
    } finally {
      setRefreshingEmployee(null)
    }
  }

  const saveChanges = async (onlyDetailId?: number) => {
    setSaving(true)
    try {
      // Check if this is THR payroll or regular payroll
      const isTHR = payrollRun?.type === "thr"

      if (isTHR) {
        // For THR payroll, send updates to THR-specific endpoint
        const thrUpdates = Object.entries(payrollComponents).flatMap(([slipId, components]) =>
          onlyDetailId && Number(slipId) !== onlyDetailId ? [] :
          components.map((comp) => ({
            thr_slip_id: Number.parseInt(slipId),
            component_id: comp.id,
            component_name: comp.name,
            prorated_amount: Number(comp.amount) || 0,
          })),
        )

        // Collect custom components for THR
        const customUpdates = Object.entries(customComponents).flatMap(([slipId, components]) =>
          onlyDetailId && Number(slipId) !== onlyDetailId ? [] :
          components.map((comp) => ({
            thr_slip_id: Number.parseInt(slipId),
            name: comp.name,
            type: comp.type,
            amount: Number(comp.amount) || 0,
          })),
        )

        const response = await fetch(`/api/payroll/${payrollId}/thr-components`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ thrUpdates, customUpdates }),
          credentials: "include",
        })

        if (response.ok) {
          toast({
            title: "Berhasil",
            description: "THR berhasil disimpan",
          })
          await fetchPayrollData()
        } else {
          const error = await response.text()
          const parsedError = JSON.parse(error)
          toast({
            title: "Gagal",
            description: parsedError.error || "Perubahan THR gagal disimpan",
            variant: "destructive",
          })
        }
      } else {
        // For regular payroll, use existing logic
        const updates = Object.entries(payrollComponents).flatMap(([detailId, components]) =>
          onlyDetailId && Number(detailId) !== onlyDetailId ? [] :
          components.map((comp) => {
            const unit = getUnitInput(Number(detailId), comp.component_id)
            return {
              payroll_detail_id: Number.parseInt(detailId),
              component_id: comp.component_id,
              amount: Number(comp.amount) || 0,
              unit: comp.calculation_type === "rate" ? unit : null,
              rate: comp.calculation_type === "rate" ? Number(comp.calculation_value) || 0 : null,
            }
          }),
        )

        // Collect custom components
        const customUpdates = Object.entries(customComponents).flatMap(([detailId, components]) =>
          onlyDetailId && Number(detailId) !== onlyDetailId ? [] :
          components.map((comp) => ({
            payroll_detail_id: Number.parseInt(detailId),
            name: comp.name,
            type: comp.type,
            amount: Number(comp.amount) || 0,
          })),
        )

        const response = await fetch(`/api/payroll/${payrollId}/components`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            updates,
            customUpdates,
            replaceCustomDetailIds: onlyDetailId ? [onlyDetailId] : Object.keys(customComponents).map(Number),
          }),
          credentials: "include",
        })

        if (response.ok) {
          toast({
            title: "Berhasil",
            description: onlyDetailId ? "Koreksi gaji karyawan berhasil disimpan" : "Payroll berhasil disimpan",
          })
          await fetchPayrollData()
        } else {
          const error = await response.text()
          const parsedError = JSON.parse(error)
          toast({
            title: "Gagal",
            description: parsedError.error || "Perubahan gagal disimpan",
            variant: "destructive",
          })
        }
      }
    } catch (error) {
      console.error("[v0] Error saving changes:", error)
      toast({
        title: "Gagal",
        description: "Perubahan gagal disimpan",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const canEditDetail = (detailId: number) =>
    payrollRun?.status === "draft" ||
    (["published", "completed"].includes(payrollRun?.status || "") && editingEmployee === detailId)

  const beginEmployeeCorrection = async (detailId: number) => {
    if (expandedEmployee !== detailId) await toggleEmployee(detailId)
    setEditingEmployee(detailId)
  }

  const cancelEmployeeCorrection = async () => {
    await fetchPayrollData()
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const calculateTotals = (detailId: number) => {
    if (!Object.prototype.hasOwnProperty.call(payrollComponents, detailId)) {
      const detail = payrollDetails.find((item) => item.id === detailId)
      if (payrollRun?.type === "thr") {
        const amount = Number(detail?.thr_amount) || 0
        return { earnings: amount, deductions: 0, gross: amount, net: amount }
      }
      return {
        earnings: Number(detail?.total_earnings) || 0,
        deductions: Number(detail?.total_deductions) || 0,
        gross: Number(detail?.gross_salary) || 0,
        net: Number(detail?.net_salary) || 0,
      }
    }

    const components = payrollComponents[detailId] || []
    const custom = customComponents[detailId] || []

    const earnings = components
      .filter((c) => c.component_type === "earning" || c.type === "earning")
      .reduce((sum, c) => {
        // Recalculate based on component type
        if (c.calculation_type === "rate") {
          // For rate components, use unit × rate
          const rate = Number(c.calculation_value) || 0
          const compId = c.component_id ?? c.id
          const unit = getUnitInput(detailId, compId)
          return sum + (unit * rate)
        } else if (c.calculation_type === "fixed") {
          // For fixed components, use the stored amount (already prorated)
          return sum + (Number(c.amount) || 0)
        } else if (c.calculation_type === "input") {
          // For input components, use the stored amount
          return sum + (Number(c.amount) || 0)
        }
        // For THR components without calculation_type, just use the amount
        return sum + (Number(c.amount) || 0)
      }, 0)

    // Add custom earnings
    const customEarnings = custom.filter((c) => c.type === "earning").reduce((sum, c) => sum + Number(c.amount || 0), 0)

    const deductions = components
      .filter((c) => c.component_type === "deduction" || c.type === "deduction")
      .reduce((sum, c) => {
        // Recalculate based on component type
        if (c.calculation_type === "rate") {
          // For rate components, use unit × rate
          const rate = Number(c.calculation_value) || 0
          const unit = getUnitInput(detailId, c.component_id)
          return sum + (unit * rate)
        } else if (c.calculation_type === "fixed") {
          // For fixed components, use the stored amount (already prorated)
          return sum + (Number(c.amount) || 0)
        } else if (c.calculation_type === "input") {
          // For input components, use the stored amount
          return sum + (Number(c.amount) || 0)
        }
        return sum
      }, 0)

    // Add custom deductions
    const customDeductions = custom.filter((c) => c.type === "deduction").reduce((sum, c) => sum + Number(c.amount || 0), 0)

    const totalEarnings = Number(earnings || 0) + Number(customEarnings || 0)
    const totalDeductions = Number(deductions || 0) + Number(customDeductions || 0)
    const gross = totalEarnings
    const net = gross - totalDeductions

    return { earnings: totalEarnings, deductions: totalDeductions, gross, net }
  }

  const downloadPayrollWorkbook = async () => {
    setDownloading(true)
    try {
      const query = locationFilter === "all" ? "" : `?location=${encodeURIComponent(locationFilter)}`
      const response = await fetch(`/api/payroll/${payrollId}/recap${query}`, { credentials: "include" })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || "Excel gagal dibuat")
      }

      const blob = await response.blob()
      const disposition = response.headers.get("content-disposition") || ""
      const filename =
        disposition.match(/filename="?([^";]+)"?/)?.[1] || `rekap-penggajian-${payrollId}.xlsx`
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast({
        title: "Excel gagal diunduh",
        description: error instanceof Error ? error.message : "Silakan coba kembali",
        variant: "destructive",
      })
    } finally {
      setDownloading(false)
    }
  }

  const locationOptions = Array.from(
    new Set(payrollDetails.map((detail) => detail.location_name?.trim()).filter(Boolean) as string[]),
  ).sort((a, b) => a.localeCompare(b))

  const filteredPayrollDetails = payrollDetails.filter(
    (detail) => locationFilter === "all" || (detail.location_name || "Tanpa lokasi") === locationFilter,
  )

  const payrollSummary = filteredPayrollDetails.reduce(
    (summary, detail) => {
      const totals = calculateTotals(detail.id)
      summary.totalEmployees += 1
      summary.totalNet += totals.net
      summary.totalGross += totals.gross
      summary.totalDeductions += totals.deductions
      return summary
    },
    { totalEmployees: 0, totalNet: 0, totalGross: 0, totalDeductions: 0 },
  )

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="flex flex-col sm:gap-4 sm:py-4 sm:pl-6">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
          <Button variant="outline" onClick={() => router.push("/payroll")} size="sm">
            <ArrowLeft className="mr-2 h-3 w-3" />
            Back
          </Button>
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              {payrollRun?.status === "draft"
                ? payrollRun?.type === "thr" ? "Edit Komponen THR" : "Edit Komponen Penggajian"
                : "Detail Penggajian"}
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              {payrollRun &&
                `${format(new Date(payrollRun.period_start), "MMM dd")} - ${format(new Date(payrollRun.period_end), "MMM dd, yyyy")}`}
            </p>
          </div>
          {payrollRun?.status === "draft" && payrollRun?.type !== "thr" && (
            <Button
              variant="outline"
              size="sm"
              onClick={refreshFromSalarySettings}
              disabled={refreshing || refreshingEmployee !== null || saving}
              className="h-9"
            >
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span className="hidden lg:inline">{refreshing ? "Memperbarui..." : "Refresh Pengaturan Gaji"}</span>
              <span className="lg:hidden">Refresh</span>
            </Button>
          )}
          <Button
            onClick={() => saveChanges()}
            disabled={saving || refreshing || refreshingEmployee !== null || payrollRun?.status !== "draft"}
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 h-9 text-sm"
            size="sm"
          >
            <Save className="mr-2 h-3 w-3" />
            <span className="hidden sm:inline">{saving ? "Menyimpan..." : "Simpan Perubahan"}</span>
            <span className="sm:hidden">{saving ? "..." : "Simpan"}</span>
          </Button>
        </header>

        <main className="flex-1 space-y-4 p-2 md:p-4 lg:p-6">
          {payrollRun?.status !== "draft" && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-4 md:pt-6">
                <p className="text-xs md:text-sm text-amber-800">
                  Penggajian ini sudah diterbitkan. Gunakan ikon refresh untuk mengambil data demo terbaru, atau ikon edit untuk koreksi manual per karyawan.
                </p>
              </CardContent>
            </Card>
          )}

          {payrollRun?.type !== "thr" && (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <Card className="overflow-hidden">
                <CardHeader className="border-b bg-slate-50/70 pb-4">
                  <CardTitle className="text-base">Ringkasan Penggajian</CardTitle>
                  <CardDescription>Nilai berikut mengikuti lokasi yang sedang dipilih.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-5 pt-5 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Karyawan</p>
                    <p className="mt-1 text-2xl font-bold text-slate-950">{payrollSummary.totalEmployees}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gaji Bruto</p>
                    <p className="mt-1 text-2xl font-bold text-slate-950">{formatCurrency(payrollSummary.totalGross)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Potongan</p>
                    <p className="mt-1 text-2xl font-bold text-red-600">{formatCurrency(payrollSummary.totalDeductions)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gaji Bersih</p>
                    <p className="mt-1 text-2xl font-bold text-emerald-600">{formatCurrency(payrollSummary.totalNet)}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Filter & Ekspor</CardTitle>
                  <CardDescription>Pilih lokasi untuk memfilter daftar dan file Excel.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Select value={locationFilter} onValueChange={setLocationFilter}>
                    <SelectTrigger className="h-11 w-full">
                      <SelectValue placeholder="Semua lokasi" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua lokasi</SelectItem>
                      {locationOptions.map((location) => (
                        <SelectItem key={location} value={location}>
                          {location}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    className="h-11 w-full"
                    onClick={downloadPayrollWorkbook}
                    disabled={downloading || saving}
                  >
                    {downloading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    {downloading ? "Membuat Excel..." : "Unduh Excel"}
                  </Button>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Excel memakai perubahan yang sudah disimpan.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="space-y-3">
            {filteredPayrollDetails.map((detail) => {
              const totals = calculateTotals(detail.id)
              const isExpanded = expandedEmployee === detail.id

              // Handle both regular and THR payroll components
              const allComponents = payrollComponents[detail.id] || []
              const earnings = allComponents.filter((c) => c.type === "earning" || c.component_type === "earning") || []
              const deductions = allComponents.filter((c) => c.type === "deduction" || c.component_type === "deduction") || []

              return (
                <Card key={detail.id} className="overflow-hidden">
                  <CardHeader
                    className="cursor-pointer hover:bg-muted/50 transition-colors p-3 md:p-4"
                    onClick={() => toggleEmployee(detail.id)}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base md:text-lg truncate">{detail.employee_name}</CardTitle>
                        <CardDescription className="text-xs">
                          {[detail.employee_code || detail.employee_id_display, detail.location_name]
                            .filter(Boolean)
                            .join(" • ") || "-"}
                        </CardDescription>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 text-right text-xs md:text-sm mr-2">
                        <div>
                          <p className="text-xs text-muted-foreground">Pendapatan</p>
                          <p className="font-medium text-xs md:text-sm">{formatCurrency(totals.earnings)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Potongan</p>
                          <p className="font-medium text-xs md:text-sm">{formatCurrency(totals.deductions)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Bruto</p>
                          <p className="font-medium text-xs md:text-sm">{formatCurrency(totals.gross)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Bersih</p>
                          <p className="text-sm md:text-base font-semibold text-green-600">{formatCurrency(totals.net)}</p>
                        </div>
                      </div>
                      {["draft", "published", "completed"].includes(payrollRun?.status || "") && payrollRun?.type !== "thr" && (
                        <Button
                          variant="outline"
                          size="sm"
                          title={`Refresh payroll ${detail.employee_name}`}
                          disabled={refreshingEmployee !== null || refreshing || saving}
                          onClick={(event) => {
                            event.stopPropagation()
                            refreshEmployeeFromSalarySettings(detail)
                          }}
                        >
                          <RefreshCw className={`h-4 w-4 ${refreshingEmployee === detail.id ? "animate-spin" : ""}`} />
                          <span className="sr-only">Refresh payroll karyawan</span>
                        </Button>
                      )}
                      {["published", "completed"].includes(payrollRun?.status || "") && (
                        editingEmployee === detail.id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              disabled={saving}
                              onClick={(event) => {
                                event.stopPropagation()
                                saveChanges(detail.id)
                              }}
                            >
                              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                              Simpan
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={saving}
                              onClick={(event) => {
                                event.stopPropagation()
                                cancelEmployeeCorrection()
                              }}
                            >
                              <X className="h-4 w-4" />
                              <span className="sr-only">Batalkan koreksi</span>
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={editingEmployee !== null || loadingComponents === detail.id}
                            title={`Koreksi gaji ${detail.employee_name}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              beginEmployeeCorrection(detail.id)
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit gaji karyawan</span>
                          </Button>
                        )
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-expanded={isExpanded}
                        aria-label={`Rincian gaji ${detail.employee_name}`}
                        disabled={loadingComponents === detail.id}
                      >
                        {loadingComponents === detail.id ? <Loader2 className="h-4 w-4 animate-spin" /> : isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="space-y-4 md:space-y-6 border-t pt-4 md:pt-6 p-3 md:p-4 md:p-6">
                      {/* Income Components */}
                      <div>
                        <h4 className="font-semibold mb-2 text-sm md:text-base">Komponen Pendapatan</h4>
                        <div className="overflow-x-auto -mx-3 md:-mx-4 md:-mx-6 px-3 md:px-4 md:px-6">
                          <table className="w-full text-xs md:text-sm">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left py-1.5 md:py-2 px-1 md:px-2 font-medium">Komponen</th>
                                <th className="w-[100px] min-w-[100px] px-2 py-1.5 text-right font-medium md:py-2">Unit</th>
                                <th className="w-[130px] min-w-[130px] px-2 py-1.5 text-right font-medium md:py-2">Tarif</th>
                                <th className="w-[145px] min-w-[145px] px-2 py-1.5 text-right font-medium md:py-2">Jumlah</th>
                              </tr>
                            </thead>
                            <tbody>
                              {earnings.map((component) => {
                                // Handle both regular and THR components
                                const compId = component.component_id ?? component.id
                                const compName = component.component_name ?? component.name
                                const rate = component.calculation_type === "rate" ? (component.calculation_value || 0) : 0
                                // Get the actual unit value from state (user input)
                                const unit = component.calculation_type === "rate" ? getUnitInput(detail.id, compId) : 0
                                // Calculate display amount: for rate components it's unit * rate, for others it's the stored amount
                                const displayAmount = component.calculation_type === "fixed"
                                  ? Number(component.amount) || 0
                                  : component.calculation_type === "rate"
                                  ? (unit * rate) || 0
                                  : Number(component.amount) || 0

                                return (
                                  <tr key={compId} className="border-b hover:bg-muted/50">
                                    <td className="py-1.5 md:py-2 px-1 md:px-2">
                                      <div className="truncate">{compName}</div>
                                      <ComponentBreakdown note={component.note} />
                                    </td>
                                    <td className="text-right py-1.5 md:py-2 px-1 md:px-2">
                                      {component.calculation_type === "rate" ? (
                                        <Input
                                          type="number"
                                          value={getUnitInput(detail.id, component.component_id)}
                                          onChange={(e) => {
                                            const newUnit = Number.parseFloat(e.target.value) || 0
                                            updateUnitInput(detail.id, component.component_id, newUnit)
                                            const newAmount = newUnit * rate
                                            updateComponentAmount(detail.id, component.component_id, newAmount)
                                          }}
                                          disabled={!canEditDetail(detail.id)}
                                          className="h-8 min-w-[92px] w-full text-right text-xs"
                                          placeholder="0"
                                        />
                                      ) : (
                                        <span className="text-muted-foreground">-</span>
                                      )}
                                    </td>
                                    <td className="text-right py-1.5 md:py-2 px-1 md:px-2 text-xs md:text-sm">
                                      {component.calculation_type === "rate" ? (
                                        <span>{formatCurrency(rate)}</span>
                                      ) : (
                                        <span className="text-muted-foreground">-</span>
                                      )}
                                    </td>
                                    <td className="text-right py-1.5 md:py-2 px-1 md:px-2">
                                      {component.calculation_type === "input" ? (
                                        <Input
                                          type="number"
                                          value={component.amount || 0}
                                          onChange={(e) =>
                                            updateComponentAmount(
                                              detail.id,
                                              component.component_id,
                                              Number.parseFloat(e.target.value) || 0,
                                            )
                                          }
                                          disabled={!canEditDetail(detail.id)}
                                          className="h-8 min-w-[132px] w-full text-right text-xs"
                                          placeholder="0"
                                        />
                                      ) : (
                                        <span className="text-xs md:text-sm">{formatCurrency(displayAmount)}</span>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                              <tr className="font-semibold bg-muted/30">
                                <td className="py-1.5 md:py-2 px-1 md:px-2 text-xs md:text-sm">Total Pendapatan</td>
                                <td className="text-right py-1.5 md:py-2 px-1 md:px-2">-</td>
                                <td className="text-right py-1.5 md:py-2 px-1 md:px-2">-</td>
                                <td className="text-right py-1.5 md:py-2 px-1 md:px-2 text-xs md:text-sm">
                                  {formatCurrency(
                                    earnings.reduce((sum, c) => {
                                      const rate = c.calculation_type === "rate" ? (c.calculation_value || 0) : 0
                                      const unit = c.calculation_type === "rate" ? getUnitInput(detail.id, c.component_id) : 0
                                      const amount = c.calculation_type === "rate"
                                        ? (unit * rate) || 0
                                        : (Number(c.amount) || 0)
                                      return sum + amount
                                    }, 0),
                                  )}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Deduction Components */}
                      <div>
                        <h4 className="font-semibold mb-2 text-sm md:text-base">Komponen Potongan</h4>
                        <div className="overflow-x-auto -mx-3 md:-mx-4 md:-mx-6 px-3 md:px-4 md:px-6">
                          <table className="w-full text-xs md:text-sm">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left py-1.5 md:py-2 px-1 md:px-2 font-medium">Komponen</th>
                                <th className="w-[100px] min-w-[100px] px-2 py-1.5 text-right font-medium md:py-2">Unit</th>
                                <th className="w-[130px] min-w-[130px] px-2 py-1.5 text-right font-medium md:py-2">Tarif</th>
                                <th className="w-[145px] min-w-[145px] px-2 py-1.5 text-right font-medium md:py-2">Jumlah</th>
                              </tr>
                            </thead>
                            <tbody>
                              {deductions.map((component) => {
                                // Handle both regular and THR components
                                const compId = component.component_id ?? component.id
                                const compName = component.component_name ?? component.name
                                const rate = component.calculation_type === "rate" ? (component.calculation_value || 0) : 0
                                // Get the actual unit value from state (user input)
                                const unit = component.calculation_type === "rate" ? getUnitInput(detail.id, compId) : 0
                                // Calculate display amount: for rate components it's unit * rate, for others it's the stored amount
                                const displayAmount = component.calculation_type === "fixed"
                                  ? Number(component.amount) || 0
                                  : component.calculation_type === "rate"
                                  ? (unit * rate) || 0
                                  : Number(component.amount) || 0

                                return (
                                  <tr key={compId} className="border-b hover:bg-muted/50">
                                    <td className="py-1.5 md:py-2 px-1 md:px-2">
                                      <div className="truncate">{compName}</div>
                                      <ComponentBreakdown note={component.note} />
                                    </td>
                                    <td className="text-right py-1.5 md:py-2 px-1 md:px-2">
                                      {component.calculation_type === "rate" ? (
                                        <Input
                                          type="number"
                                          value={getUnitInput(detail.id, compId)}
                                          onChange={(e) => {
                                            const newUnit = Number.parseFloat(e.target.value) || 0
                                            updateUnitInput(detail.id, compId, newUnit)
                                            const newAmount = newUnit * rate
                                            updateComponentAmount(detail.id, compId, newAmount)
                                          }}
                                          disabled={!canEditDetail(detail.id)}
                                          className="h-8 min-w-[92px] w-full text-right text-xs"
                                          placeholder="0"
                                        />
                                      ) : (
                                        <span className="text-muted-foreground">-</span>
                                      )}
                                    </td>
                                    <td className="text-right py-1.5 md:py-2 px-1 md:px-2 text-xs md:text-sm">
                                      {component.calculation_type === "rate" ? (
                                        <span>{formatCurrency(rate)}</span>
                                      ) : (
                                        <span className="text-muted-foreground">-</span>
                                      )}
                                    </td>
                                    <td className="text-right py-1.5 md:py-2 px-1 md:px-2">
                                      {component.calculation_type === "input" ? (
                                        <Input
                                          type="number"
                                          value={component.amount || 0}
                                          onChange={(e) =>
                                            updateComponentAmount(
                                              detail.id,
                                              component.component_id,
                                              Number.parseFloat(e.target.value) || 0,
                                            )
                                          }
                                          disabled={!canEditDetail(detail.id)}
                                          className="h-8 min-w-[132px] w-full text-right text-xs"
                                          placeholder="0"
                                        />
                                      ) : (
                                        <span className="text-xs md:text-sm">{formatCurrency(displayAmount)}</span>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                              <tr className="font-semibold bg-muted/30">
                                <td className="py-1.5 md:py-2 px-1 md:px-2 text-xs md:text-sm">Total Deduction</td>
                                <td className="text-right py-1.5 md:py-2 px-1 md:px-2">-</td>
                                <td className="text-right py-1.5 md:py-2 px-1 md:px-2">-</td>
                                <td className="text-right py-1.5 md:py-2 px-1 md:px-2 text-xs md:text-sm">
                                  {formatCurrency(
                                    deductions.reduce((sum, c) => {
                                      const rate = c.calculation_type === "rate" ? (c.calculation_value || 0) : 0
                                      const unit = c.calculation_type === "rate" ? getUnitInput(detail.id, c.component_id) : 0
                                      const amount = c.calculation_type === "rate"
                                        ? (unit * rate) || 0
                                        : (Number(c.amount) || 0)
                                      return sum + amount
                                    }, 0),
                                  )}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Custom Components Section */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold text-sm md:text-base">Komponen Khusus</h4>
                          {canEditDetail(detail.id) && (
                            <Dialog open={openDialogDetail === detail.id} onOpenChange={(open) => {
                              if (!open) {
                                setOpenDialogDetail(null)
                                setDialogFormData({ name: "", amount: "", type: "earning" })
                              }
                            }}>
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setOpenDialogDetail(detail.id)}
                                  className="h-8 text-xs md:text-sm"
                                >
                                  <Plus className="w-3 h-3 mr-1" />
                                  <span className="hidden sm:inline">Tambah Komponen</span>
                                  <span className="sm:hidden">Add</span>
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="text-sm md:text-base">
                                <DialogHeader>
                                  <DialogTitle className="text-base md:text-lg">Tambah Komponen Khusus</DialogTitle>
                                  <DialogDescription className="text-xs md:text-sm">Tambahkan pendapatan atau potongan khusus ke slip gaji karyawan ini</DialogDescription>
                                </DialogHeader>
                                <div className="space-y-3">
                                  <div>
                                    <label className="text-xs md:text-sm font-medium mb-1 block">Nama Komponen</label>
                                    <Input
                                      placeholder="Contoh: Bonus, Denda, Penyesuaian"
                                      value={dialogFormData.name}
                                      onChange={(e) => setDialogFormData((prev) => ({ ...prev, name: e.target.value }))}
                                      className="text-xs md:text-sm h-8 md:h-9"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs md:text-sm font-medium mb-1 block">Jumlah</label>
                                    <Input
                                      type="number"
                                      placeholder="0"
                                      value={dialogFormData.amount}
                                      onChange={(e) => setDialogFormData((prev) => ({ ...prev, amount: e.target.value }))}
                                      className="text-xs md:text-sm h-8 md:h-9"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs md:text-sm font-medium mb-1 block">Jenis</label>
                                    <div className="flex gap-2">
                                      <Button
                                        variant={dialogFormData.type === "earning" ? "default" : "outline"}
                                        className="flex-1 h-8 text-xs"
                                        onClick={() => setDialogFormData((prev) => ({ ...prev, type: "earning" }))}
                                      >
                                        Income
                                      </Button>
                                      <Button
                                        variant={dialogFormData.type === "deduction" ? "default" : "outline"}
                                        className="flex-1 h-8 text-xs"
                                        onClick={() => setDialogFormData((prev) => ({ ...prev, type: "deduction" }))}
                                      >
                                        Deduction
                                      </Button>
                                    </div>
                                  </div>
                                  <Button
                                    onClick={addCustomComponent}
                                    className="w-full h-8 text-xs"
                                    disabled={!dialogFormData.name || !dialogFormData.amount}
                                  >
                                    Add Component
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>
                          )}
                        </div>

                        {customComponents[detail.id]?.length > 0 && (
                          <div className="overflow-x-auto -mx-3 md:-mx-4 md:-mx-6 px-3 md:px-4 md:px-6 mb-3">
                            <table className="w-full text-xs md:text-sm">
                              <thead>
                                <tr className="border-b">
                                  <th className="text-left py-1.5 md:py-2 px-1 md:px-2 font-medium">Komponen</th>
                                  <th className="text-left py-1.5 md:py-2 px-1 md:px-2 font-medium w-12 md:w-20">Jenis</th>
                                  <th className="w-[145px] min-w-[145px] px-2 py-1.5 text-right font-medium md:py-2">Jumlah</th>
                                  <th className="text-center py-1.5 md:py-2 px-1 md:px-2 font-medium w-8 md:w-12">Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {customComponents[detail.id]?.map((component) => (
                                  <tr key={component.id} className="border-b hover:bg-muted/50">
                                    <td className="py-1.5 md:py-2 px-1 md:px-2 truncate text-xs md:text-sm">{component.name}</td>
                                    <td className="py-1.5 md:py-2 px-1 md:px-2">
                                      <Badge variant={component.type === "earning" ? "default" : "secondary"} className="text-xs">
                                        {component.type === "earning" ? "Inc" : "Ded"}
                                      </Badge>
                                    </td>
                                    <td className="text-right py-1.5 md:py-2 px-1 md:px-2">
                                      <Input
                                        type="number"
                                        value={component.amount}
                                        onChange={(e) =>
                                          updateCustomComponentAmount(detail.id, component.id, Number(e.target.value) || 0)
                                        }
                                        disabled={!canEditDetail(detail.id)}
                                        className="h-8 min-w-[132px] w-full text-right text-xs"
                                        placeholder="0"
                                      />
                                    </td>
                                    <td className="text-center py-1.5 md:py-2 px-1 md:px-2">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeCustomComponent(detail.id, component.id)}
                                        disabled={!canEditDetail(detail.id)}
                                        className="h-6 w-6 p-0"
                                      >
                                        ×
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {customComponents[detail.id]?.length === 0 && payrollRun?.status !== "draft" && (
                          <p className="text-xs md:text-sm text-muted-foreground">Belum ada komponen khusus</p>
                        )}
                      </div>
                      <div className="border-t pt-3 md:pt-4 bg-blue-50 p-2 md:p-4 rounded">
                        <div className="grid grid-cols-3 gap-2 md:gap-4">
                          <div>
                            <p className="text-xs md:text-sm text-muted-foreground mb-0.5 md:mb-1">Total Pendapatan</p>
                            <p className="text-sm md:text-lg font-semibold">{formatCurrency(totals.earnings)}</p>
                          </div>
                          <div>
                            <p className="text-xs md:text-sm text-muted-foreground mb-0.5 md:mb-1">Total Potongan</p>
                            <p className="text-sm md:text-lg font-semibold">{formatCurrency(totals.deductions)}</p>
                          </div>
                          <div>
                            <p className="text-xs md:text-sm text-muted-foreground mb-0.5 md:mb-1">Gaji Bersih</p>
                            <p className="text-sm md:text-lg font-semibold text-green-600">{formatCurrency(totals.net)}</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              )
            })}

            {filteredPayrollDetails.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Tidak ada karyawan untuk lokasi yang dipilih.
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>
    </AppLayout>
  )
}
