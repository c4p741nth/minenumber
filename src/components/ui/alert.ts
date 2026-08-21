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
  customClass: {
    confirmButton: 'mn-swal-confirm',
    cancelButton: 'mn-swal-cancel',
  },
}

// FIX_LISTS #13: สีไอคอนต้องสื่อความหมายของ icon นั้น ๆ
// เดิม theme บังคับ iconColor = var(--primary) ทุก dialog ทำให้ warning ไม่เหลือง
// info ไม่ฟ้า — ผลสแกน "ปลอดภัย/ไม่ปลอดภัย" จึงดูเหมือนกันหมด
// ปล่อย warning/info/error/success ใช้สีมาตรฐานของ SweetAlert
// (confirmDialog ยังคุมสีเองได้ผ่าน iconColor ที่ส่งเข้ามาทีหลัง)
const ICON_COLORS: Record<string, string> = {
  info: '#3b82f6',
  warning: '#f59e0b',
  error: '#dc2626',
  success: '#16a34a',
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
    iconColor: ICON_COLORS.warning,
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
  // FIX_LISTS #13: รองรับ warning (สามเหลี่ยมเหลือง) — ผลสแกนที่ "ไม่ปลอดภัย"
  // ควรเป็นคำเตือน ไม่ใช่กากบาทแดงซึ่งอ่านเหมือนคำสั่งผิดพลาด/ทำไม่สำเร็จ
  icon?: 'info' | 'success' | 'error' | 'warning'
}): Promise<void> {
  const icon = opts.icon ?? 'info'
  await Swal.fire({
    title: opts.title,
    text: opts.text,
    icon,
    iconColor: ICON_COLORS[icon],
    confirmButtonText: 'ตกลง',
    ...theme,
  })
}