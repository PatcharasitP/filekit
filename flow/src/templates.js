// ─────────────────────────────────────────────────────────────────────────────
// เทมเพลต 8 ใบ (แผนเฟส 5 ทางเข้า ③) เก็บเป็น "ข้อความตาม SPEC" ไม่ใช่ภาพ
// ผู้ใช้เห็นวิธีเขียนไปในตัว แก้ต่อได้ทันที · 6 ใบแรกมาจากผังตัวอย่างที่ยิง draw.io พิสูจน์แล้ว (tests/flow_golden)
// ‼️ repo นี้เป็นสาธารณะ เนื้อหาต้องเป็นกระบวนการทั่วไป ไม่มีชื่อบริษัท ระบบ หรือคน
// ‼️ ทุกใบต้องอ่านผ่านโดยไม่มี error และไม่มีคำเตือน ทั้งสองภาษา (tests/flow_parse.test.mjs จับ)
// ─────────────────────────────────────────────────────────────────────────────

const L = (...lines) => lines.join("\n");

export const TEMPLATES = [
  {
    id: "approval", kind: "steps",
    title: { th: "อนุมัติตามวงเงิน", en: "Approval by amount" },
    text: {
      th: L("พนักงานยื่นขอซื้อ", "วงเงินเท่าไร?", "  ไม่เกิน 10,000: หัวหน้างานอนุมัติ", "  10,001 ถึง 100,000: ผู้จัดการฝ่ายอนุมัติ",
        "  เกิน 100,000: ผู้อำนวยการอนุมัติ", "ผลการพิจารณา?", "  อนุมัติ: ส่งจัดซื้อ", "  ไม่อนุมัติ: แจ้งผู้ขอพร้อมเหตุผล", "    จบ", "ออกใบสั่งซื้อ"),
      en: L("Employee submits a request", "How much?", "  Up to 10,000: Team lead approves", "  10,001 to 100,000: Department manager approves",
        "  Over 100,000: Director approves", "Decision?", "  Approved: Send to purchasing", "  Rejected: Tell the requester why", "    stop", "Issue the purchase order"),
    },
  },
  {
    id: "complaint", kind: "steps",
    title: { th: "รับเรื่องร้องเรียน", en: "Handle a complaint" },
    text: {
      th: L("ลูกค้าแจ้งเรื่อง", "Call Center รับเรื่อง", "แก้ได้เองไหม?", "  ได้: ปิดงาน", "  ไม่ได้: ส่งทีมที่รับผิดชอบ", "    ทีมตรวจสอบหน้างาน",
        "    แก้เสร็จภายในวันไหม?", "      เสร็จ: แจ้งลูกค้าแล้วปิดงาน", "      ไม่เสร็จ: นัดวันใหม่กับลูกค้า", "        กลับไป: ทีมตรวจสอบหน้างาน"),
      en: L("Customer reports a problem", "Call center logs it", "Can we fix it remotely?", "  Yes: Close the case", "  No: Send to the owning team",
        "    Team checks on site", "    Fixed the same day?", "      Yes: Tell the customer and close", "      No: Book a new date", "        back to: Team checks on site"),
    },
  },
  {
    id: "purchasing", kind: "steps",
    title: { th: "จัดซื้อ แยกผู้รับผิดชอบ", en: "Purchasing by role" },
    text: {
      th: L("[ผู้ขอ] กรอกใบขอซื้อ", "[หัวหน้า] ตรวจความจำเป็น", "จำเป็นไหม?", "  ไม่จำเป็น: [ผู้ขอ] รับแจ้งปฏิเสธ", "    จบ",
        "  จำเป็น: [จัดซื้อ] ขอใบเสนอราคา 3 ราย", "[จัดซื้อ] เทียบราคา", "[หัวหน้า] อนุมัติผู้ขาย", "[จัดซื้อ] ออกใบสั่งซื้อ", "[ผู้ขอ] รับของและตรวจรับ"),
      en: L("[Requester] Fill in the request", "[Manager] Check the need", "Needed?", "  No: [Requester] Gets a rejection", "    stop",
        "  Yes: [Purchasing] Ask 3 vendors for quotes", "[Purchasing] Compare prices", "[Manager] Approve the vendor", "[Purchasing] Issue the order",
        "[Requester] Receive and check the goods"),
    },
  },
  {
    id: "renewal", kind: "steps",
    title: { th: "ต่อสัญญาเช่า", en: "Lease renewal" },
    text: {
      th: L("สัญญาใกล้หมดอายุ 90 วัน", "แจ้งเตือนผู้ดูแลพื้นที่", "ติดต่อเจ้าของที่", "เจ้าของที่ต่อสัญญาไหม?", "  ต่อ:", "    เจรจาค่าเช่า",
        "    ค่าเช่าขึ้นเกิน 10% ไหม?", "      เกิน: เสนอผู้จัดการอนุมัติ", "        ผู้จัดการอนุมัติไหม?", "          อนุมัติ: ร่างสัญญา",
        "          ไม่อนุมัติ: กลับไป: เจรจาค่าเช่า", "      ไม่เกิน: ร่างสัญญา", "    ลงนามสัญญา", "    บันทึกเข้าระบบ", "  ไม่ต่อ:", "    หาพื้นที่ทดแทน", "    แจ้งแผนย้ายออก"),
      en: L("Lease ends in 90 days", "Alert the site owner", "Contact the landlord", "Landlord renews?", "  Yes:", "    Negotiate the rent",
        "    Rent up more than 10%?", "      Yes: Ask the manager to approve", "        Manager approves?", "          Approved: Draft the contract",
        "          Rejected: back to: Negotiate the rent", "      No: Draft the contract", "    Sign the contract", "    Record it in the system", "  No:",
        "    Find a replacement site", "    Plan the move out"),
    },
  },
  {
    id: "sla", kind: "steps",
    title: { th: "SLA รายขั้น", en: "SLA per step" },
    text: {
      th: L("ชื่อ: SLA งานซ่อม", "รับแจ้ง | ภายใน 15 นาที", "ประเมินความเร่งด่วน | ภายใน 1 ชั่วโมง", "เร่งด่วนไหม?",
        "  เร่งด่วน: ส่งช่างทันที | ถึงหน้างานใน 4 ชั่วโมง", "  ไม่เร่งด่วน: นัดวันซ่อม | ภายใน 3 วันทำการ", "ซ่อมเสร็จ | ปิดงานภายใน 1 วัน", "สอบถามความพอใจ"),
      en: L("title: Repair SLA", "Log the request | within 15 minutes", "Assess urgency | within 1 hour", "Urgent?",
        "  Yes: Dispatch a technician | on site within 4 hours", "  No: Book a repair date | within 3 working days", "Repair done | close within 1 day",
        "Ask about satisfaction"),
    },
  },
  {
    id: "team", kind: "org",
    title: { th: "โครงสร้างทีม", en: "Team structure" },
    text: {
      th: L("ผู้อำนวยการ", "  ผู้จัดการฝ่าย (ดูแลภาพรวม)", "    ทีมโครงการ", "      หัวหน้าโครงการ", "      นักวิเคราะห์", "      ผู้ทดสอบ",
        "    ผู้ดูแลระบบ", "    ผู้ดูแลรายงาน"),
      en: L("Director", "  Department manager (overall)", "    Project team", "      Project lead", "      Analyst", "      Tester",
        "    System admin", "    Reporting lead"),
    },
  },
  {
    id: "systems", kind: "system",
    title: { th: "ระบบกับระบบ", en: "System to system" },
    text: {
      th: L("[แหล่งข้อมูล] ไฟล์ Excel รายวัน -> [เตรียมข้อมูล] Power Query: โหลดทุกเช้า", "[แหล่งข้อมูล] ฐานข้อมูลงานซ่อม -> Power Query: ดึงผ่าน gateway",
        "Power Query -> [โมเดล] Semantic model: ตารางที่ล้างแล้ว", "Semantic model -> [นำเสนอ] รายงาน Power BI: measure",
        "รายงาน Power BI -> [นำเสนอ] สไลด์ผู้บริหาร: ภาพส่งออก", "Power Automate --> Semantic model: สั่ง refresh"),
      en: L("[Sources] Daily Excel file -> [Prep] Power Query: loads every morning", "[Sources] Repair database -> Power Query: through the gateway",
        "Power Query -> [Model] Semantic model: cleaned tables", "Semantic model -> [Report] Power BI report: measures",
        "Power BI report -> [Report] Executive slides: exported images", "Power Automate --> Semantic model: triggers refresh"),
    },
  },
  {
    id: "weekly", kind: "timeline",
    title: { th: "แผนงานรายสัปดาห์", en: "Weekly plan" },
    text: {
      th: L("ชื่อ: แผนงาน 4 สัปดาห์", "สัปดาห์ 1: เก็บความต้องการ", "  สัมภาษณ์ผู้ใช้", "สัปดาห์ 2: ออกแบบ", "  ทำต้นแบบให้เลือก",
        "สัปดาห์ 3: ลงมือทำ", "  ทดสอบกับผู้ใช้จริง", "สัปดาห์ 4: ส่งมอบ", "  สอนการใช้งาน"),
      en: L("title: 4 week plan", "Week 1: Gather needs", "  Interview users", "Week 2: Design", "  Mockups to choose from",
        "Week 3: Build", "  Test with real users", "Week 4: Hand over", "  Train the team"),
    },
  },
];
