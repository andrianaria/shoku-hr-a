"use client"

import { useEffect } from "react"
import { toast } from "@/hooks/use-toast"
import { isErrorNotification, isWarningNotification, localizeNotificationText } from "@/lib/ui-notifications"

export function BrowserAlertToasterBridge() {
  useEffect(() => {
    const originalAlert = window.alert

    window.alert = (message?: unknown) => {
      const localizedMessage = localizeNotificationText(String(message ?? ""))
      const isError = isErrorNotification(localizedMessage)
      const isWarning = isWarningNotification(localizedMessage)
      toast({
        title: isError ? "Tindakan gagal" : isWarning ? "Perhatian" : "Berhasil",
        description: localizedMessage,
        variant: isError ? "destructive" : "default",
      })
    }

    return () => {
      window.alert = originalAlert
    }
  }, [])

  return null
}
