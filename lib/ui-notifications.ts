const exactTranslations: Record<string, string> = {
  Unauthorized: "Sesi Anda tidak valid. Silakan masuk kembali.",
  Forbidden: "Anda tidak memiliki akses untuk tindakan ini.",
  "Internal server error": "Terjadi kesalahan pada server. Silakan coba kembali.",
  "Invalid response from server": "Respons server tidak valid. Silakan coba kembali.",
  "Payroll run reverted to draft successfully": "Penggajian berhasil dikembalikan menjadi draf.",
  "Payroll marked as paid successfully": "Penggajian berhasil ditandai sudah dibayar.",
  "Payroll run processed successfully": "Penggajian berhasil diselesaikan dan slip gaji telah diterbitkan.",
  "Error approving payslip": "Terjadi kesalahan saat menyetujui slip gaji.",
  "Error rejecting payslip": "Terjadi kesalahan saat menolak slip gaji.",
  "Employee not found": "Karyawan tidak ditemukan.",
  "Payroll run not found": "Penggajian tidak ditemukan.",
  "Payslip not found": "Slip gaji tidak ditemukan.",
  "Request not found": "Permintaan tidak ditemukan.",
  "Invalid status": "Status tidak valid.",
  "Invalid token": "Sesi Anda tidak valid. Silakan masuk kembali.",
}

export function localizeNotificationText(value: string) {
  const text = value.trim()
  if (!text) return text
  if (exactTranslations[text]) return exactTranslations[text]

  const createdPayroll = text.match(/^Payroll run created successfully with (\d+) employee payroll details\.?$/i)
  if (createdPayroll) {
    return `Penggajian berhasil dibuat untuk ${createdPayroll[1]} karyawan.`
  }

  return text
    .replace(/payroll run/gi, "penggajian")
    .replace(/payroll/gi, "penggajian")
    .replace(/payslip/gi, "slip gaji")
    .replace(/successfully/gi, "berhasil")
    .replace(/failed to/gi, "gagal")
    .replace(/not found/gi, "tidak ditemukan")
    .replace(/please try again/gi, "silakan coba kembali")
}

export function isErrorNotification(value: string) {
  return /gagal|error|invalid|unauthorized|forbidden|tidak valid|tidak ditemukan|belum dapat/i.test(value)
}

export function isWarningNotification(value: string) {
  return /pilih |wajib|terlebih dahulu|tanpa detail|dilewati|peringatan/i.test(value)
}
