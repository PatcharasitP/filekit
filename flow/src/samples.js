// ─────────────────────────────────────────────────────────────────────────────
// ตัวอย่างสั้นที่อยู่ในช่องพิมพ์ตอนเปิดครั้งแรก (แผนเฟส 2 ข้อ 5: ไม่ใช่ช่องว่างเปล่า)
// ผู้ใช้เห็นวิธีเขียนไปในตัว แก้ทับได้ทันที · แยกไฟล์ไว้ให้เทสใน node อ่านได้ทั้งสองภาษา
// ‼️ ทุกตัวอย่างต้องอ่านผ่านโดยไม่มี error และไม่มีคำเตือน (tests/flow_parse.test.mjs จับ)
// ─────────────────────────────────────────────────────────────────────────────

/* ตัวอย่างของหน้า Power Automate (ทางเข้า ②) เป็น flow สมมติ รูปแบบเดียวกับที่ prunePA() ตัดแล้ว
   โชว์ของที่ผังแบบนี้ทำได้ครบในใบเดียว: ตัวเริ่ม flow , กรอบ Try กับ Catch , Condition , วนทีละรายการ , Terminate
   ‼️ flow ของจริงในบริษัทห้ามเอามาเป็นตัวอย่าง (W6) และ repo นี้เป็นสาธารณะ */
const paSample = (t) => JSON.stringify({
  definition: {
    triggers: { Recurrence: { type: "Recurrence", description: t[0] } },
    actions: {
      Try: { type: "Scope", description: t[1], runAfter: {}, actions: {
        Get_rows: { type: "OpenApiConnection", description: t[2], runAfter: {} },
        Filter_due: { type: "Query", description: t[3], runAfter: { Get_rows: ["Succeeded"] } },
        Has_items: { type: "If", description: t[4], runAfter: { Filter_due: ["Succeeded"] },
          actions: { For_each_item: { type: "Foreach", runAfter: {}, actions: {
            Compose_html: { type: "Compose", description: t[5], runAfter: {} },
            Send_mail: { type: "OpenApiConnection", description: t[6], runAfter: { Compose_html: ["Succeeded"] } } } } },
          else: { actions: { Log_nothing: { type: "Compose", description: t[7], runAfter: {} } } } } } },
      Catch: { type: "Scope", description: t[8], runAfter: { Try: ["Failed", "TimedOut"] }, actions: {
        Notify_admin: { type: "OpenApiConnection", description: t[9], runAfter: {} },
        Stop_failed: { type: "Terminate", description: t[10], runAfter: { Notify_admin: ["Succeeded"] } } } },
    },
  },
}, null, 2);

export const SAMPLES = {
  th: {
    pa: paSample(["ทุกวัน 8 โมงเช้า", "ส่งเมลเตือนงานที่ครบกำหนด", "อ่านรายการจากตาราง", "กรองเฉพาะที่ครบกำหนด", "มีรายการไหม",
      "ประกอบเนื้อเมล", "ส่งเมลถึงผู้รับผิดชอบ", "บันทึกว่าวันนี้ไม่มีงาน", "ถ้ามีขั้นไหนพัง", "แจ้งผู้ดูแลว่า flow พัง", "จบแบบล้มเหลว"]),
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
    pa: paSample(["Every day at 8 AM", "Send reminders for due work", "Read the rows from the table", "Keep only what is due", "Anything due?",
      "Build the email body", "Email the owner", "Log that nothing is due today", "If any step fails", "Tell the admin the flow failed", "End as failed"]),
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
