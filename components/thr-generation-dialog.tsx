"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Gift, AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface THRGenerationDialogProps {
  onSuccess?: () => void
}

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
]

export function THRGenerationDialog({ onSuccess }: THRGenerationDialogProps) {
  const currentYear = new Date().getFullYear()
  const [open, setOpen] = useState(false)
  const [startMonth, setStartMonth] = useState("1")
  const [startYear, setStartYear] = useState((currentYear - 1).toString())
  const [endMonth, setEndMonth] = useState("12")
  const [endYear, setEndYear] = useState(currentYear.toString())
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)

  const handleGenerateTHR = async () => {
    if (!startMonth || !startYear || !endMonth || !endYear) {
      setMessage({ type: "error", text: "Please select both start and end periods" })
      return
    }

    setLoading(true)
    setMessage(null)

    try {
      const response = await fetch("/api/thr/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startMonth: parseInt(startMonth),
          startYear: parseInt(startYear),
          endMonth: parseInt(endMonth),
          endYear: parseInt(endYear),
        }),
      })

      const data = await response.json()

      if (response.ok) {
        const skippedText = data.skipped > 0 ? ` (${data.skipped} employees skipped - no salary settings)` : ""
        setMessage({
          type: "success",
          text: `THR slips generated successfully for ${data.generated} employee${data.generated !== 1 ? "s" : ""}${skippedText}`,
        })
        setTimeout(() => {
          setOpen(false)
          setMessage(null)
          setStartMonth("1")
          setStartYear((currentYear - 1).toString())
          setEndMonth("12")
          setEndYear(currentYear.toString())
          onSuccess?.()
        }, 2000)
      } else {
        setMessage({ type: "error", text: data.error || "Slip THR gagal dibuat" })
      }
    } catch (error) {
      setMessage({ type: "error", text: "An error occurred while generating THR slips" })
      console.error("Error generating THR:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-amber-200 hover:bg-amber-50">
          <Gift className="h-4 w-4 mr-2 text-amber-600" />
          Generate THR
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-amber-600" />
            Generate THR Slips
          </DialogTitle>
          <DialogDescription>
            Generate THR (Tunjangan Hari Raya) slips for a specific period. THR is prorated based on working days within the selected period.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              THR is calculated as a prorated amount of fixed salary components based on working days from the start to end of the selected period (including weekends).
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <div className="font-semibold text-sm">Periode THR</div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-month" className="text-xs">Bulan Mulai</Label>
                <Select value={startMonth} onValueChange={setStartMonth}>
                  <SelectTrigger id="start-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((month) => (
                      <SelectItem key={month.value} value={month.value}>
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="start-year" className="text-xs">Tahun Mulai</Label>
                <Select value={startYear} onValueChange={setStartYear}>
                  <SelectTrigger id="start-year">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2023, 2024, 2025, 2026, 2027].map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="end-month" className="text-xs">Bulan Selesai</Label>
                <Select value={endMonth} onValueChange={setEndMonth}>
                  <SelectTrigger id="end-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((month) => (
                      <SelectItem key={month.value} value={month.value}>
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="end-year" className="text-xs">Tahun Selesai</Label>
                <Select value={endYear} onValueChange={setEndYear}>
                  <SelectTrigger id="end-year">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2023, 2024, 2025, 2026, 2027].map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="text-xs text-muted-foreground bg-blue-50 p-2 rounded">
              Selected period: {MONTHS[parseInt(startMonth) - 1].label} {startYear} to {MONTHS[parseInt(endMonth) - 1].label} {endYear}
            </div>
          </div>

          {message && (
            <Alert variant={message.type === "error" ? "destructive" : "default"}>
              {message.type === "error" ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              )}
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerateTHR}
            disabled={loading}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Gift className="h-4 w-4 mr-2" />
                Generate THR
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
