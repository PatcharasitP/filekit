// ─────────────────────────────────────────────────────────────────────────────
// ตัวอย่างสั้นที่อยู่ในช่องพิมพ์ตอนเปิดครั้งแรก (แผนเฟส 2 ข้อ 5: ไม่ใช่ช่องว่างเปล่า)
// ผู้ใช้เห็นวิธีเขียนไปในตัว แก้ทับได้ทันที · แยกไฟล์ไว้ให้เทสใน node อ่านได้ทั้งสองภาษา
// ‼️ ทุกตัวอย่างต้องอ่านผ่านโดยไม่มี error และไม่มีคำเตือน (tests/flow_parse.test.mjs จับ)
// ─────────────────────────────────────────────────────────────────────────────

export const SAMPLES = {
  th: {
    steps: [
      "ลูกค้าแจ้งเรื่อง",
      "Call Center รับเรื่อง",
      "แก้ได้เองไหม?",
      "  ได้: ปิดงาน",
      "  ไม่ได้: ส่งช่างหน้างาน",
      "    ช่างปิดงาน",
    ].join("\n"),
    org: [
      "ผู้อำนวยการ",
      "  ผู้จัดการฝ่ายขาย",
      "    ทีมขายภาคเหนือ",
      "    ทีมขายภาคใต้",
      "  ผู้จัดการฝ่ายบัญชี",
      "    ทีมบัญชีเจ้าหนี้",
    ].join("\n"),
    system: [
      "ลูกค้า -> เว็บไซต์: สั่งซื้อ",
      "เว็บไซต์ -> ระบบชำระเงิน: ตัดบัตร",
      "ระบบชำระเงิน --> เว็บไซต์: ผลการชำระ",
      "เว็บไซต์ -> คลังสินค้า: แจ้งจัดส่ง",
    ].join("\n"),
    timeline: [
      "สัปดาห์ 1: เก็บความต้องการ",
      "สัปดาห์ 2: ออกแบบหน้าจอ",
      "สัปดาห์ 3: ลงมือทำ",
      "  ทดสอบกับผู้ใช้",
      "สัปดาห์ 4: ส่งมอบ",
    ].join("\n"),
  },
  en: {
    steps: [
      "Customer reports a problem",
      "Call center logs it",
      "Can we fix it remotely?",
      "  Yes: Close the case",
      "  No: Send a technician",
      "    Technician closes the case",
    ].join("\n"),
    org: [
      "Managing director",
      "  Sales manager",
      "    North sales team",
      "    South sales team",
      "  Finance manager",
      "    Accounts payable team",
    ].join("\n"),
    system: [
      "Customer -> Website: Places an order",
      "Website -> Payment gateway: Charges the card",
      "Payment gateway --> Website: Payment result",
      "Website -> Warehouse: Ships the order",
    ].join("\n"),
    timeline: [
      "Week 1: Gather requirements",
      "Week 2: Design the screens",
      "Week 3: Build it",
      "  Test with users",
      "Week 4: Hand over",
    ].join("\n"),
  },
};
