// ลงทะเบียน happy-dom เป็น global DOM ให้ bun test — ทำให้ render component ได้จริง
// จำเป็นสำหรับเทสแบบ B1 (crash ตอน render) ที่เทส logic ล้วนจับไม่ได้
import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register({ url: 'http://localhost/' })

// @testing-library/react ต้องการ IS_REACT_ACT_ENVIRONMENT เพื่อไม่เตือนเรื่อง act()
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
