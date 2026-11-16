"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { AppLayout } from "@/components/layout/app-layout"
import { Header } from "@/components/layout/header"
import { THRGenerationDialog } from "@/components/thr-generation-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Plus, Play, Trash2, Eye, Calendar, DollarSign, Users, TrendingUp, Edit, Check, Download, AlertTriangle, ChevronDown, ChevronUp, Undo, Loader2 } from "lucide-react"
import { format } from "date-fns"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface PayrollRun {
  id: number
  period_start: string
  period_end: string
  status: "draft" | "published" | "paid" | "cancelled"
  total_gross: number
  total_net: number
  total_deductions: number
  created_by: number
  created_by_name: string
  created_at: string
  processed_at?: string
  paid_at?: string
  type?: "payroll" | "thr"
}

interface PayrollDetail {
  id: number
  employee_id: number
  employee_name: string
  employee_id_display: string
  base_salary: number
  total_earnings: number
  total_deductions: number
  gross_salary: number
  net_salary: number
  status: string
  is_thr?: boolean
  thr_amount?: number
  working_days?: number
  prorated_percentage?: number
}

interface SalaryComponent {
  component_id?: number
  id?: number
  name: string
  type: "earning" | "deduction"
  amount: number
  rate?: number
  unit?: number
  calculation_type?: string
}

const downloadPayrollRecap = async (runId: number) => {
  try {
    const response = await fetch(`/api/payroll/${runId}/recap`)
    if (response.ok) {
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `payroll-recap-${runId}.xlsx`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } else {
      alert("Rekap payroll gagal diunduh")
    }
  } catch (error) {
    console.error("Error downloading payroll recap:", error)
    alert("Rekap payroll gagal diunduh")
  }
}

export default function PayrollPage() {
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([])
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null)
  const [payrollDetails, setPayrollDetails] = useState<PayrollDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processingRun, setProcessingRun] = useState<{ id: number; action: "publish" | "paid" } | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [showWarningDialog, setShowWarningDialog] = useState(false)
  const [warningMessage, setWarningMessage] = useState("")
  const [pendingPayrollData, setPendingPayrollData] = useState<{
    period_start: string
    period_end: string
  } | null>(null)
  const [periodStart, setPeriodStart] = useState("")
  const [periodEnd, setPeriodEnd] = useState("")
  const [expandedDetailId, setExpandedDetailId] = useState<number | null>(null)
  const [detailComponents, setDetailComponents] = useState<Map<number, SalaryComponent[]>>(new Map())

  useEffect(() => {
    fetchPayrollRuns()
  }, [])

  const fetchPayrollRuns = async () => {
    try {
      const response = await fetch("/api/payroll")
      if (response.ok) {
        const data = await response.json()
        setPayrollRuns(data.runs ?? [])
      }
    } catch (error) {
      console.error("Error fetching payroll runs:", error)
    } finally {
      setLoading(false)
    }
  }

  const createPayrollRun = async (confirmed = false) => {
    if (!periodStart || !periodEnd) return

    setCreating(true)
    try {
      const requestBody = {
        period_start: String(periodStart).trim(),
        period_end: String(periodEnd).trim(),
        confirmed: confirmed,
      }

      const response = await fetch("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      })

      let data: any
      try {
        data = await response.json()
      } catch (parseError) {
        data = { error: "Invalid response from server" }
      }

      if (response.ok) {
        // Check if there's a warning about employees without templates
        if (data.warning && !confirmed) {
          setWarningMessage(data.warning)
          setPendingPayrollData({
            period_start: periodStart,
            period_end: periodEnd,
          })
          setShowWarningDialog(true)
          setCreating(false)
          return
        }

        setShowCreateDialog(false)
        setPeriodStart("")
        setPeriodEnd("")
        setShowWarningDialog(false)
        setPendingPayrollData(null)

        if (data.detailsCount === 0) {
          alert("Penggajian dibuat tanpa detail karyawan. Karyawan yang belum memiliki template gaji telah dilewati.")
        } else {
          alert(`Penggajian berhasil dibuat untuk ${data.detailsCount} karyawan.`)
        }

        fetchPayrollRuns()
      } else {
        const errorMsg = data && typeof data === 'object' && data.error ? String(data.error) : "Penggajian gagal dibuat"
        alert(errorMsg)
      }
    } catch (error) {
      alert("Penggajian gagal dibuat")
    } finally {
      setCreating(false)
    }
  }

  const processPayrollRun = async (runId: number) => {
    setProcessing(true)
    setProcessingRun({ id: runId, action: "publish" })
    try {
      const response = await fetch(`/api/payroll/${runId}/process`, {
        method: "POST",
      })

      if (response.ok) {
        await fetchPayrollRuns()
        alert("Simulasi penggajian selesai.")
      } else {
        const error = await response.json()
        alert(error.error || "Penggajian gagal diproses")
      }
    } catch (error) {
      console.error("Error processing payroll run:", error)
      alert("Penggajian gagal diproses")
    } finally {
      setProcessing(false)
      setProcessingRun(null)
    }
  }

  const deletePayrollRun = async (runId: number) => {
    try {
      const response = await fetch(`/api/payroll/${runId}`, {
        method: "DELETE",
      })

      if (response.ok) {
        fetchPayrollRuns()
      } else {
        const error = await response.json()
        alert(error.error || "Penggajian gagal dihapus")
      }
    } catch (error) {
      console.error("Error deleting payroll run:", error)
      alert("Penggajian gagal dihapus")
    }
  }

  const revertPayrollToDraft = async (runId: number) => {
    if (!confirm("Kembalikan penggajian ini menjadi draf agar dapat diedit kembali?")) {
      return
    }

    try {
      const response = await fetch(`/api/payroll/${runId}/revert-to-draft`, {
        method: "POST",
      })

      if (response.ok) {
        fetchPayrollRuns()
        alert("Penggajian berhasil dikembalikan menjadi draf")
      } else {
        const error = await response.json()
        alert(error.error || "Penggajian gagal dikembalikan menjadi draf")
      }
    } catch (error) {
      console.error("Error reverting payroll:", error)
      alert("Penggajian gagal dikembalikan menjadi draf")
    }
  }

  const markPayrollAsPaid = async (runId: number) => {
    setProcessing(true)
    setProcessingRun({ id: runId, action: "paid" })
    try {
      const response = await fetch(`/api/payroll/${runId}/mark-paid`, {
        method: "POST",
      })

      if (response.ok) {
        fetchPayrollRuns()
        alert("Penggajian berhasil ditandai sudah dibayar")
      } else {
        const error = await response.json()
        alert(error.error || "Penggajian gagal ditandai sudah dibayar")
      }
    } catch (error) {
      console.error("Error marking payroll as paid:", error)
      alert("Penggajian gagal ditandai sudah dibayar")
    } finally {
      setProcessing(false)
      setProcessingRun(null)
    }
  }

  const downloadPaymentSheet = async (runId: number) => {
    try {
      const response = await fetch(`/api/payroll/${runId}/payment-sheet`)
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `payroll-payment-sheet-${runId}.xlsx`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
      } else {
        alert("Lembar pembayaran gagal diunduh")
      }
    } catch (error) {
      console.error("Error downloading payment sheet:", error)
      alert("Lembar pembayaran gagal diunduh")
    }
  }

  const viewPayrollDetails = async (run: PayrollRun) => {
    try {
      if (run.type === "thr") {
        // For THR payroll runs, fetch from the THR API with payroll_run_id
        const response = await fetch(`/api/thr?payroll_run_id=${run.id}`)
        const data = await response.json()
        if (response.ok) {
          const slips = data.slips || []

          // Convert THR slips to payroll detail format for display
          const thrDetails = slips.map((slip: any) => ({
            id: slip.id,
            employee_id: slip.employee_id,
            employee_name: slip.employee_name,
            employee_id_display: slip.employee_code,
            base_salary: 0,
            total_earnings: Number(slip.total_fixed_earnings) || 0,
            total_deductions: 0,
            gross_salary: Number(slip.thr_amount) || 0,
            net_salary: Number(slip.thr_amount) || 0,
            status: "approved",
            is_thr: true,
            thr_amount: Number(slip.thr_amount) || 0,
            working_days: Number(slip.working_days) || 0,
            prorated_percentage: Number(slip.prorated_percentage) || 0,
          }))

          setSelectedRun(run)
          setPayrollDetails(thrDetails)
          setShowDetailsDialog(true)
        }
      } else {
        // For regular payroll runs
        const response = await fetch(`/api/payroll/${run.id}`)
        if (response.ok) {
          const data = await response.json()
          setSelectedRun(run)
          setPayrollDetails(data.details)
          setShowDetailsDialog(true)
        }
      }
    } catch (error) {
      console.error("Error fetching payroll details:", error)
    }
  }

  const fetchComponentsForDetail = async (detailId: number, isThr: boolean = false) => {
    try {
      const endpoint = isThr ? `/api/thr/components/${detailId}` : `/api/payroll/components/${detailId}`
      console.log("[v0] Fetching components from endpoint:", endpoint, "isThr:", isThr)
      const response = await fetch(endpoint)
      const data = await response.json()
      console.log("[v0] Components response:", response.ok, "status:", response.status, "data:", data)
      if (response.ok) {
        // Map the API response to our SalaryComponent interface
        const mappedComponents = (data.components || []).map((comp: any) => ({
          component_id: comp.component_id,
          id: comp.id,
          name: comp.name || comp.component_name,
          type: (comp.type || comp.component_type || "earning") as "earning" | "deduction",
          amount: comp.amount,
          rate: comp.rate,
          unit: comp.unit,
          calculation_type: comp.calculation_type,
        }))
        console.log("[v0] Mapped components count:", mappedComponents.length)
        setDetailComponents(new Map(detailComponents).set(detailId, mappedComponents))
      } else {
        console.error("[v0] Failed to fetch components:", data)
      }
    } catch (error) {
      console.error("[v0] Error fetching components:", error)
    }
  }

  const toggleExpandDetail = async (detailId: number, isThr: boolean = false) => {
    if (expandedDetailId === detailId) {
      setExpandedDetailId(null)
    } else {
      setExpandedDetailId(detailId)
      if (!detailComponents.has(detailId)) {
        await fetchComponentsForDetail(detailId, isThr)
      }
    }
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      draft: "secondary",
      published: "default",
      paid: "default",
      cancelled: "destructive",
    } as const

    const colors = {
      draft: "bg-gray-100 text-gray-800",
      published: "bg-blue-100 text-blue-800",
      paid: "bg-green-100 text-green-800",
      cancelled: "bg-red-100 text-red-800",
    }

    return (
      <Badge className={colors[status as keyof typeof colors]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    )
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount)
  }

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
      <div className="flex flex-col gap-4">
        <Header title="Penggajian" description="Kelola periode dan simulasi proses penggajian">
          <div className="flex flex-wrap gap-2">
            <THRGenerationDialog onSuccess={fetchPayrollRuns} />
              <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogTrigger asChild>
                  <Button className="bg-[#0c8f7d] hover:bg-[#087565]">
                    <Plus className="h-4 w-4 mr-2" />
                    Buat Payroll
                  </Button>
                </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Buat Penggajian Baru</DialogTitle>
                  <DialogDescription>Tentukan periode untuk memproses gaji karyawan</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="period_start">Awal Periode</Label>
                    <Input
                      id="period_start"
                      type="date"
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="period_end">Akhir Periode</Label>
                    <Input
                      id="period_end"
                      type="date"
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Batal
                  </Button>
                  <Button onClick={() => createPayrollRun(false)} disabled={creating}>
                    {creating ? "Membuat..." : "Buat Penggajian"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </Header>

        {/* Warning Dialog for employees without salary templates */}
        <AlertDialog open={showWarningDialog} onOpenChange={setShowWarningDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                Karyawan Tanpa Template Gaji
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-3">
                <p>{warningMessage}</p>
                <p className="text-sm">
                  Jika dilanjutkan, komponen gaji karyawan tanpa template akan dibiarkan kosong. Anda dapat menambahkannya saat memproses payroll.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (pendingPayrollData) {
                    createPayrollRun(true)
                  }
                }}
                className="bg-amber-600 hover:bg-amber-700"
              >
                Tetap Lanjutkan
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <main className="flex-1 space-y-6 p-4 md:p-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Penggajian</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{payrollRuns.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Selesai</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {payrollRuns.filter((run) => run.status === "paid").length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Draf</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{payrollRuns.filter((run) => run.status === "draft").length}</div>
              </CardContent>
            </Card>
          </div>

          {/* Payroll Runs Table */}
          <Card>
            <CardHeader>
              <CardTitle>Daftar Penggajian</CardTitle>
              <CardDescription>Lihat dan kelola seluruh proses penggajian</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Periode</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Total Bruto</TableHead>
                    <TableHead>Total Potongan</TableHead>
                    <TableHead>Total Bersih</TableHead>
                    <TableHead>Dibuat Oleh</TableHead>
                    <TableHead>Tanggal Dibuat</TableHead>
                    <TableHead>Tindakan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payrollRuns.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div>
                            {format(new Date(run.period_start), "MMM dd")} -{" "}
                            {format(new Date(run.period_end), "MMM dd, yyyy")}
                          </div>
                          {run.type === "thr" && (
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">THR</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(run.status)}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium">{formatCurrency(run.total_gross)}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium text-red-600">
                        {formatCurrency(run.total_deductions)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-semibold text-emerald-600">
                        {formatCurrency(run.total_net)}
                      </TableCell>
                      <TableCell>{run.created_by_name}</TableCell>
                      <TableCell>{format(new Date(run.created_at), "MMM dd, yyyy")}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  asChild
                                >
                                  <Link href={`/payroll/${run.id}/edit`} aria-label="Lihat rincian penggajian">
                                    <Eye className="h-4 w-4" aria-hidden="true" />
                                  </Link>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Lihat detail penggajian</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>

                          {run.status === "draft" && (
                            <>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      asChild
                                      className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                    >
                                      <Link href={`/payroll/${run.id}/edit`} aria-label="Edit penggajian">
                                        <Edit className="h-4 w-4" aria-hidden="true" />
                                      </Link>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {run.type === "thr" ? "Edit komponen THR" : "Edit payroll (khusus draf)"}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => processPayrollRun(run.id)}
                                      aria-label="Terbitkan penggajian"
                                      disabled={processing}
                                      className={processingRun?.id === run.id ? "min-w-[132px]" : ""}
                                    >
                                      {processingRun?.id === run.id && processingRun.action === "publish" ? (
                                        <>
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                          Menerbitkan...
                                        </>
                                      ) : (
                                        <Play className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {run.type === "thr" ? "Setujui payroll THR" : "Terbitkan penggajian"}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="outline" size="sm" aria-label="Hapus penggajian">
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Hapus {run.type === "thr" ? "Payroll THR" : "Payroll"}</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Yakin ingin menghapus {run.type === "thr" ? "payroll THR" : "payroll"} ini? Tindakan ini tidak dapat dibatalkan.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Batal</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => deletePayrollRun(run.id)}>
                                            Hapus
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </TooltipTrigger>
                                  <TooltipContent>Hapus {run.type === "thr" ? "payroll THR" : "penggajian"}</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </>
                          )}

                          {run.status === "published" && (
                            <>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => downloadPaymentSheet(run.id)}
                                      aria-label="Unduh lembar pembayaran"
                                      className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Unduh lembar pembayaran demo</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => downloadPayrollRecap(run.id)}
                                      aria-label="Unduh rekap penggajian"
                                      className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Download payroll recap (Excel)</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => markPayrollAsPaid(run.id)}
                                      aria-label="Tandai sudah dibayar"
                                      disabled={processing}
                                      className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                    >
                                      {processingRun?.id === run.id && processingRun.action === "paid" ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Check className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Tandai sudah dibayar</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </>
                          )}

                          {run.status === "published" && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => revertPayrollToDraft(run.id)}
                                    aria-label="Kembalikan ke draf"
                                    className="text-gray-600 hover:text-gray-700 hover:bg-gray-50"
                                  >
                                    <Undo className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Revert to draft for editing</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </main>
      </div>

      {/* Payroll Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {selectedRun?.type === "thr" ? "THR Slip" : "Payroll Details"} - {selectedRun && format(new Date(selectedRun.period_start), "MMM dd")} to{" "}
              {selectedRun && format(new Date(selectedRun.period_end), "MMM dd, yyyy")}
            </DialogTitle>
            <DialogDescription>
              {selectedRun?.type === "thr" ? "THR calculation based on fixed salary components" : "Employee salary breakdown for this payroll period"}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            {selectedRun?.type === "thr" && payrollDetails.length > 0 ? (
              <div className="space-y-4">
                {payrollDetails.map((detail) => (
                  <Card key={detail.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => toggleExpandDetail(detail.id, true)}
                          >
                            {expandedDetailId === detail.id ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                          <CardTitle className="text-base">
                            {detail.employee_name}
                            <span className="text-sm text-muted-foreground ml-2">{detail.employee_id_display}</span>
                          </CardTitle>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-muted-foreground">Working Days</div>
                          <div className="text-lg font-medium">{detail.working_days} days</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Prorated %</div>
                          <div className="text-lg font-medium">{detail.prorated_percentage?.toFixed(2)}%</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Pendapatan Tetap</div>
                          <div className="text-lg font-medium">{formatCurrency(detail.total_earnings)}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Jumlah THR</div>
                          <div className="text-lg font-semibold text-amber-600">{formatCurrency(detail.thr_amount || 0)}</div>
                        </div>
                      </div>
                      {expandedDetailId === detail.id && (
                        <div className="mt-4 pt-4 border-t space-y-3">
                          <div className="font-medium text-sm">Rincian Komponen</div>
                          {(detailComponents.get(detail.id) || []).length > 0 ? (
                            <div className="space-y-2">
                              {(detailComponents.get(detail.id) || []).map((component, idx) => (
                                <div key={idx} className="flex justify-between text-sm bg-muted/30 p-2 rounded">
                                  <span>{component.name}</span>
                                  <span className="font-medium">{formatCurrency(component.amount)}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground">Memuat komponen...</div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Karyawan</TableHead>
                    <TableHead>Pendapatan</TableHead>
                    <TableHead>Potongan</TableHead>
                    <TableHead>Bruto</TableHead>
                    <TableHead>Bersih</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payrollDetails.map((detail) => (
                    <>
                      <TableRow key={detail.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                            onClick={() => toggleExpandDetail(detail.id, true)}
                            >
                              {expandedDetailId === detail.id ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                            <div>
                              <div className="font-medium">{detail.employee_name}</div>
                              <div className="text-sm text-muted-foreground">{detail.employee_id_display}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{formatCurrency(detail.total_earnings)}</TableCell>
                        <TableCell>{formatCurrency(detail.total_deductions)}</TableCell>
                        <TableCell>{formatCurrency(detail.gross_salary)}</TableCell>
                        <TableCell className="font-medium">{formatCurrency(detail.net_salary)}</TableCell>
                      </TableRow>
                      {expandedDetailId === detail.id && (
                        <TableRow key={`${detail.id}-components`}>
                          <TableCell colSpan={5}>
                            <div className="bg-muted/30 p-4 rounded-lg space-y-3">
                              <div className="font-medium text-sm">Rincian Komponen</div>
                              <div className="grid grid-cols-2 gap-4">
                                {(detailComponents.get(detail.id) || []).length > 0 ? (
                                  <>
                                    <div>
                                      <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Pendapatan</div>
                                      <div className="space-y-1">
                                        {(detailComponents.get(detail.id) || [])
                                          .filter((c) => c.type === "earning")
                                          .map((component, idx) => (
                                            <div key={idx} className="flex justify-between text-sm">
                                              <span>{component.name}</span>
                                              <span className="font-medium">{formatCurrency(component.amount)}</span>
                                            </div>
                                          ))}
                                        {(detailComponents.get(detail.id) || []).filter((c) => c.type === "earning").length === 0 && (
                                          <div className="text-sm text-muted-foreground text-center py-2">—</div>
                                        )}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Potongan</div>
                                      <div className="space-y-1">
                                        {(detailComponents.get(detail.id) || [])
                                          .filter((c) => c.type === "deduction")
                                          .map((component, idx) => (
                                            <div key={idx} className="flex justify-between text-sm">
                                              <span>{component.name}</span>
                                              <span className="font-medium text-red-600">{formatCurrency(component.amount)}</span>
                                            </div>
                                          ))}
                                        {(detailComponents.get(detail.id) || []).filter((c) => c.type === "deduction").length === 0 && (
                                          <div className="text-sm text-muted-foreground text-center py-2">—</div>
                                        )}
                                      </div>
                                    </div>
                                  </>
                                ) : (
                                  <div className="col-span-2 text-sm text-muted-foreground text-center py-4">Memuat komponen...</div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
