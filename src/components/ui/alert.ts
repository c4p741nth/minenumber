// wrapper กลางของ SweetAlert2 — ห้าม import sweetalert2 ตรง ๆ นอกไฟล์นี้
import Swal from 'sweetalert2'

// ใช้ CSS variable ใน globals.css ให้เข้ากับธีมของเกม
// FIX #13: ปุ่มยืนยันเป็นเขียว (ไม่ใช่แดง/ส้มซึ่งอ่านเหมือนอันตราย)
// และปุ่มยกเลิกต้องอ่านออก — เทาจางเกินไปมองไม่เห็นตัวหนังสือ
const theme = {
  background: 'var(--card)',
  color: 'var(--foreground)',
  confirmButtonColor: 'var(--confirm)',
  cancelButtonColor: 'var(--cancel)',
  iconColor: 'var(--primary)',
  customClass: {
    confirmButton: 'mn-swal-confirm',
    cancelButton: 'mn-swal-cancel',
  },
}

export async function confirmDialog(opts: {
  title: string
  text?: string
  confirmText?: string
}): Promise<boolean> {
  const result = await Swal.fire({
    title: opts.title,
    text: opts.text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: opts.confirmText ?? 'ยืนยัน',
    cancelButtonText: 'ยกเลิก',
    reverseButtons: true,
    ...theme,
  })
  return result.isConfirmed
}

export async function infoDialog(opts: {
  title: string
  text?: string
  icon?: 'info' | 'success' | 'error'
}): Promise<void> {
  await Swal.fire({
    title: opts.title,
    text: opts.text,
    icon: opts.icon ?? 'info',
    confirmButtonText: 'ตกลง',
    ...theme,
  })
}