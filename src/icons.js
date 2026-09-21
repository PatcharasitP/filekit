// ─────────────────────────────────────────────────────────────────────────────
// ไอคอนเส้นวาดเอง 24×24 · ใช้ currentColor จึงเปลี่ยนสีตามหมวดได้
//
// ‼️ กฎที่ได้จากการวัดจริง 19/09/2026 (อย่าเอากรอบหน้ากระดาษกลับมาครอบทุกตัว)
//    วัดความเหมือนของไอคอนทุกคู่จากภาพที่เรนเดอร์ขนาดจริงบนการ์ด พบว่า
//    **42 คู่เหมือนกันเกิน 90%** และ 11 คู่ในนั้นอยู่หมวดเดียวกัน (กวาดตาหาไม่เจอจริง)
//    ต้นเหตุ: กรอบหน้ากระดาษกินหมึกเกือบหมด เหลือที่ให้สัญลักษณ์ที่ต่างกันแค่ 7×7 หน่วย
//    = 5.8px ตอนแสดงจริง ซึ่งเล็กเกินกว่าจะแยกออก
//    กฎ: **ตัวที่ต่างต้องเป็นตัวที่ใหญ่ที่สุดในภาพ** ไม่ใช่รายละเอียดเล็ก ๆ ในกรอบเดียวกัน
//    ลองเอากรอบกลับมาแล้ว (แบบ B) ซ้ำกลับมา 5 คู่ทันที จึงยืนยันว่ากรอบคือต้นเหตุจริง
//    ผลหลังแก้: 0 คู่ที่เหมือนกันเกิน 90% ในหมวดเดียวกัน (เทส browser_icons.py เฝ้าไว้)
// เลิกใช้อีโมจิเพราะแต่ละตัวมาคนละสไตล์ คนละน้ำหนัก คนละสี — เป็นสัญญาณ "งานอดิเรก"
// ที่แรงที่สุดบนหน้าเว็บ และคุมให้เข้าชุดกันไม่ได้เลย
// ─────────────────────────────────────────────────────────────────────────────
const DOC = 'M7 3h7l4 4v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M14 3v4h4';

export const ICONS = {
  // ── จัดการไฟล์ PDF ──
  "pdf-pages":    `<rect x="3"y="6"width="11"height="14"rx="1.8"/><path d="M7 3h9a2 2 0 0 1 2 2v11"/><path d="M6.5 11h5M6.5 14.5h3"/>`,
  "pdf-edit":     `<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M13.5 6.5l3 3"/>`,
  "pdf-merge":    `<rect x="2.2"y="2.2"width="7.4"height="6.2"rx="1.5"/><rect x="14.4"y="2.2"width="7.4"height="6.2"rx="1.5"/><path d="M5.9 8.4v2.4a2 2 0 0 0 2 2h8.2a2 2 0 0 0 2-2V8.4"/><path d="M12 12.8v2.6"/><rect x="8.1"y="15.4"width="7.8"height="6.4"rx="1.5"/>`,
  "pdf-split":    `<path d="M6.4 3h11.2"/><path d="M12 6.4v5.2"/><path d="M9.2 9L12 11.8l2.8-2.8"/><rect x="2.6"y="13.8"width="8.4"height="7.4"rx="1.6"/><rect x="13"y="13.8"width="8.4"height="7.4"rx="1.6"/>`,
  "pdf-compress": `<path d="M9.6 4v5.6H4"/><path d="M14.4 4v5.6H20"/><path d="M9.6 20v-5.6H4"/><path d="M14.4 20v-5.6H20"/><path d="M3.8 3.8l4.4 4.4M20.2 3.8l-4.4 4.4M3.8 20.2l4.4-4.4M20.2 20.2l-4.4-4.4"/>`,
  "pdf-sign":     `<path d="M3 19.5c3.2 0 3-9.5 6.2-9.5s2.8 6 6 6 3-3 5.8-3"/><path d="M15.6 3.6l4.8 4.8L12 16.8l-5 1.2 1.2-5z"/>`,
  // หน้ากระดาษที่มีป้ายเลขอยู่ขอบล่าง (จุดที่เลขหน้าจะไปอยู่จริง)
  // กระดาษเปล่าถูกดึงออกจากปึก (แผ่นที่ถูกตัดมีกากบาท)
  "pdf-remove-blank": `<path d="M6.4 2.8h7.2l5.2 5.2v11a2.4 2.4 0 0 1-2.4 2.4H6.4A2.4 2.4 0 0 1 4 19V5.2A2.4 2.4 0 0 1 6.4 2.8z"/><path d="M13.6 2.8V8h5.2"/><path d="M8.4 11.6l6.4 6.4M14.8 11.6l-6.4 6.4"/>`,
  "pdf-page-numbers": `<path d="M9.2 3.2l-2.4 17.6M17.2 3.2l-2.4 17.6M3.4 8.6h17.2M2.6 15.4h17.2"/>`,
  "pdf-unstamp":  `<path d="M6.2 3.4h6.6l4.6 4.6v10.6a2.2 2.2 0 0 1-2.2 2.2H6.2A2.2 2.2 0 0 1 4 18.6V5.6a2.2 2.2 0 0 1 2.2-2.2z"/><path d="M12.8 3.4V8h4.6"/><rect x="12.6"y="12.4"width="8.8"height="6.2"rx="1.4"transform="rotate(-14 17 15.5)"/>`,
  "pdf-protect":  `<rect x="4" y="10.2" width="16" height="11.2" rx="2.4"/><path d="M8 10.2V7a4 4 0 0 1 8 0v3.2"/><path d="M12 14.6v2.6"/>`,
  "pdf-compare":  `<path d="M3.5 8.2h13.2M13.2 4.6l3.5 3.6-3.5 3.6"/><path d="M20.5 15.8H7.3M10.8 12.2l-3.5 3.6 3.5 3.6"/>`,
  "pdf-crop":     `<path d="M6.5 2.6v12.8a2 2 0 0 0 2 2h12.9"/><path d="M2.6 6.5h12.9a2 2 0 0 1 2 2v12.9"/>`,
  "pdf-resize":   `<rect x="3" y="4.5" width="11" height="9" rx="1.6"/><rect x="10" y="10.5" width="11" height="9" rx="1.6"/>`,
  "pdf-nup":      `<rect x="3.2" y="3.2" width="7.4" height="7.4" rx="1.2"/><rect x="13.4" y="3.2" width="7.4" height="7.4" rx="1.2"/><rect x="3.2" y="13.4" width="7.4" height="7.4" rx="1.2"/><rect x="13.4" y="13.4" width="7.4" height="7.4" rx="1.2"/>`,
  "pdf-clean":    `<path d="M6.2 2.6h7.6l5.4 5.4v11.4a2.4 2.4 0 0 1-2.4 2.4H6.2a2.4 2.4 0 0 1-2.4-2.4V5a2.4 2.4 0 0 1 2.4-2.4z"/><path d="M13.8 2.6V8h5.4"/><path d="M8.4 14.2l2.3 2.3 4.6-4.6"/>`,
  "pdf-redact":   `<path d="M3.4 5.6h10.2M3.4 19.4h13.2"/><rect x="3.4" y="9" width="17.2" height="2.6" rx="0.5" fill="currentColor"/><rect x="3.4" y="13.6" width="11.4" height="2.6" rx="0.5" fill="currentColor"/>`,
  "pdf-unlock":   `<rect x="3.2" y="10.6" width="13.6" height="10.8" rx="2.2"/><path d="M6.8 10.6V7.2a4 4 0 0 1 7.8-1.3"/><path d="M14.6 5.9l2.6 2.2 3.6-4.3"/>`,
  "pdf-watermark":`<path d="M6.2 2.6h7.6l5.4 5.4v11.4a2.4 2.4 0 0 1-2.4 2.4H6.2a2.4 2.4 0 0 1-2.4-2.4V5a2.4 2.4 0 0 1 2.4-2.4z"/><path d="M13.8 2.6V8h5.4"/><path d="M11.6 9.6s4.6 4.7 4.6 7.3a4.6 4.6 0 0 1-9.2 0c0-2.6 4.6-7.3 4.6-7.3z"/>`,
  "pdf-ocr":      `<path d="M7 3h7l4 4v4"/><path d="M14 3v4h4"/><path d="M5 5v14a2 2 0 0 0 2 2h4.5"/><path d="M8.5 10.5h5M8.5 13.5h3"/><circle cx="16.8"cy="16.8"r="3.4"/><path d="M19.3 19.3L21.5 21.5"/>`,

  // ── แปลงจาก PDF ──
  "pdf-extract-images": `<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.6"/><path d="M21 16.5l-5-5-5.5 5.5-2.5-2.5L3 18.5"/>`,
  "pdf-to-powerpoint": `<rect x="3" y="4" width="18" height="12" rx="1.8"/><path d="M12 16v4M8.6 20h6.8"/><path d="M8.8 12.4V7.6h2.6a1.7 1.7 0 0 1 0 3.4H8.8"/>`,
  "pdf-to-images":`<rect x="4.2"y="6.2"width="15.6"height="11.6"rx="1.9"/><circle cx="8.2"cy="10.1"r="1.4"/><path d="M4.2 15.2l4-3.7 3.1 2.7 2.2-1.9 6.3 5.4"/>`,
  "pdf-to-text":  `<path d="M4.4 7h15.2M4.4 12h15.2M4.4 17h9.4"/>`,
  "pdf-to-word":  `<path d="M4.4 7.4l2.5 9.2 3.7-6.6 3.7 6.6 2.5-9.2"/>`,
  "pdf-to-excel": `<rect x="4.4"y="5.6"width="15.2"height="12.8"rx="1.8"/><path d="M4.4 10h15.2M4.4 14h15.2M9.5 5.6v12.8M14.6 5.6v12.8"/>`,

  // ── แปลงเป็น PDF ──
  "word-to-pdf":  `<path d="M1.6 7.6l2.2 8.8 3.3-6.3 3.3 6.3 2.2-8.8"/><path d="M14.6 5.4h4.2l3 3v8.8a1.9 1.9 0 0 1-1.9 1.9h-5.3a1.9 1.9 0 0 1-1.9-1.9V7.3a1.9 1.9 0 0 1 1.9-1.9z"/><path d="M18.8 5.4v3h3"/>`,
  "text-to-pdf":  `<path d="M2.4 7.4h8.4M2.4 11.4h8.4M2.4 15.4h5"/><path d="M14.6 5.4h4.2l3 3v8.8a1.9 1.9 0 0 1-1.9 1.9h-5.3a1.9 1.9 0 0 1-1.9-1.9V7.3a1.9 1.9 0 0 1 1.9-1.9z"/><path d="M18.8 5.4v3h3"/>`,
  "excel-to-pdf": `<rect x="1.6"y="6"width="11"height="12"rx="1.7"/><path d="M1.6 10h11M1.6 14h11M5.3 6v12M9 6v12"/><path d="M14.6 5.4h4.2l3 3v8.8a1.9 1.9 0 0 1-1.9 1.9h-5.3a1.9 1.9 0 0 1-1.9-1.9V7.3a1.9 1.9 0 0 1 1.9-1.9z"/><path d="M18.8 5.4v3h3"/>`,
  "images-to-pdf":`<rect x="1.6"y="6.6"width="11"height="10.8"rx="1.8"/><circle cx="5"cy="10.2"r="1.3"/><path d="M1.6 15.2l3.1-3.4 2.4 2.4 1.7-1.6 3.8 3.4"/><path d="M14.6 5.4h4.2l3 3v8.8a1.9 1.9 0 0 1-1.9 1.9h-5.3a1.9 1.9 0 0 1-1.9-1.9V7.3a1.9 1.9 0 0 1 1.9-1.9z"/><path d="M18.8 5.4v3h3"/>`,

  // ── รูปภาพ ──
  "image-convert":`<rect x="2.5"y="4.5"width="8.5"height="8"rx="1.4"/><rect x="13"y="11.5"width="8.5"height="8"rx="1.4"/><path d="M6.7 15.5v3.6M4.9 17.3l1.8 1.8 1.8-1.8"/><path d="M17.3 8.5V4.9M15.5 6.7l1.8-1.8 1.8 1.8"/>`,
  "image-bg-remove":`<path d="M3 7.4V5.4a2.4 2.4 0 0 1 2.4-2.4h2M16.6 3h2A2.4 2.4 0 0 1 21 5.4v2M21 16.6v2a2.4 2.4 0 0 1-2.4 2.4h-2M7.4 21h-2A2.4 2.4 0 0 1 3 18.6v-2"/><rect x="6.6"y="6.6"width="10.8"height="10.8"rx="1.8"/><circle cx="9.9"cy="10"r="1.1"/><path d="M6.6 15.4l3-2.8 2.2 1.9 1.6-1.3 4 3.2"/>`,
  "image-resize": `<rect x="3"y="3.5"width="17.5"height="13"rx="1.8"/><path d="M3 12.5l4.6-3.8 3.4 2.8 2.4-1.9 3 2.4"/><path d="M14 19h7M14 19l2.2-2.2M14 19l2.2 2.2"/>`,

  // ── เอกสารและจดหมายเวียน ──
  "word-join":    `<rect x="2.5"y="3.5"width="7.5"height="10"rx="1.4"/><rect x="2.5"y="16"width="7.5"height="4.5"rx="1.2"/><path d="M10 8.5h4.5a2 2 0 0 1 2 2v3"/><path d="M18.6 11l2.4 2.6-2.4 2.6"/><path d="M16.5 13.6H21"/>`,
  "word-replace": `<path d="M4 7h7M4 7l2-2M4 7l2 2"/><path d="M20 17h-7M20 17l-2-2M20 17l2-2"opacity="0"/><path d="M20 17h-7M18 15l2 2-2 2"/><rect x="13"y="3.5"width="8"height="7"rx="1.4"/><rect x="3"y="13.5"width="8"height="7"rx="1.4"/>`,
  "word-clean":   `<path d="M9.5 3.5l5.5 5.5"/><path d="M14 3l3 3-7.5 7.5-3-3z"/><path d="M6.5 13.5L4 21l7.5-2.5"/><path d="M17 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>`,
  "word-mailmerge":`<rect x="2.5"y="4"width="8"height="6"rx="1.2"/><path d="M2.5 5.4l4.2 3 4.3-3"/><rect x="2.5"y="14"width="8"height="6"rx="1.2"/><path d="M4.6 15.8h3.8M4.6 18.2h2.4"/><path d="M11 12h3.4"/><path d="M15 3.5h4a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-4"/><path d="M17 8.5h2M17 12h2M17 15.5h2"/>`,

  // ── PowerPoint ──
  "powerpoint-to-word": `<rect x="1.4"y="4.4"width="12.6"height="9"rx="1.5"/><path d="M7.7 13.4v2.6M4.7 18.6h6"/><path d="M15.4 8.2l1.4 5.4 2.1-3.9 2.1 3.9 1.4-5.4"/>`,
  "powerpoint-to-pdf":  `<rect x="1.4"y="4.4"width="12.6"height="9"rx="1.5"/><path d="M7.7 13.4v2.6M4.7 18.6h6"/><path d="M17.4 5.4h2.6a1.8 1.8 0 0 1 1.8 1.8v9.6a1.8 1.8 0 0 1-1.8 1.8h-2.6a1.8 1.8 0 0 1-1.8-1.8V7.2a1.8 1.8 0 0 1 1.8-1.8z"/><path d="M17 9.4h2.8M17 12.4h2.8"/>`,

  // ── ตารางและข้อมูล ──
  // ตารางหนึ่งใบแตกเป็นสองใบ (เส้นบนสุดของทุกใบ = หัวตาราง)
  // สามหน้าต่อกันกลายเป็นแถบยาวแผ่นเดียว
  "pdf-to-longimage": `<rect x="2.5"y="3"width="7"height="5"rx="1.2"/><rect x="2.5"y="9.5"width="7"height="5"rx="1.2"/><rect x="2.5"y="16"width="7"height="5"rx="1.2"/><path d="M11.2 12h2.4"/><path d="M15 9.6L17.4 12L15 14.4"/><rect x="18.4"y="3"width="3.1"height="18"rx="1.2"/>`,
  "excel-split":  `<rect x="2.5"y="8"width="7.5"height="8"rx="1.5"/><path d="M2.5 10.8h7.5"/><path d="M10.6 12h2"/><path d="M15 4.6h6.5a1.3 1.3 0 0 1 1.3 1.3v3.9a1.3 1.3 0 0 1-1.3 1.3H15a1.3 1.3 0 0 1-1.3-1.3V5.9A1.3 1.3 0 0 1 15 4.6z"/><path d="M13.7 7h9.1"/><path d="M15 13.9h6.5a1.3 1.3 0 0 1 1.3 1.3v3.9a1.3 1.3 0 0 1-1.3 1.3H15a1.3 1.3 0 0 1-1.3-1.3v-3.9a1.3 1.3 0 0 1 1.3-1.3z"/><path d="M13.7 16.3h9.1"/>`,
  // ตารางสองใบรวมเป็นใบเดียว
  "excel-merge":  `<rect x="2.5"y="3"width="8"height="7"rx="1.5"/><path d="M2.5 5.6h8"/><rect x="2.5"y="14"width="8"height="7"rx="1.5"/><path d="M2.5 16.6h8"/><path d="M11 6.5h3.6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H11"/><path d="M18.2 9.6L21 12l-2.8 2.4"/>`,
  // ตารางที่แปลงเป็นโค้ด สื่อด้วยวงเล็บปีกกาข้างตาราง
  "excel-to-pq": `<rect x="2.5"y="4.5"width="10"height="15"rx="1.4"/><path d="M2.5 9h10M7.5 4.5v15"/><path d="M17.4 6.5a2 2 0 0 0-2 2v2a1.6 1.6 0 0 1-1.6 1.6 1.6 1.6 0 0 1 1.6 1.6v2a2 2 0 0 0 2 2"/><path d="M21.5 9.4v5.2"/>`,
  "excel-match-sum":`<circle cx="11"cy="13"r="7.5"/><circle cx="11"cy="13"r="3.6"/><path d="M11 13l8.4-8.4"/><path d="M16.8 4.2h3.4v3.4"/>`,
  "excel-csv":    `<rect x="2.5"y="4.5"width="8"height="15"rx="1.4"/><path d="M2.5 9h8M6.5 4.5v15"/><path d="M12.5 12h6"/><path d="M16.6 9.6L19.4 12l-2.8 2.4"/><path d="M21.5 7v10"opacity="0"/><path d="M12.5 12h-.2"/>`,

  // ── งานเอกสารไทย ──
  "thai-encoding":`<path d="${DOC}"/><path d="M8 11.4h3.4M8 14.4h6M8 17.4h4"/><circle cx="17.6"cy="16.4"r="4"/><path d="M15.9 16.4l1.2 1.2 2.3-2.4"/>`,
  "thai-date":    `<rect x="3"y="5"width="18"height="16"rx="2.2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M7.5 14.5h3.5M9.5 13.2v3.2"/><path d="M13.5 17.5h3.5M15.5 13.2v3.2"opacity="0"/><path d="M13.4 14.5h3.6"/><path d="M14.2 16.6l2 2"opacity="0"/>`,
  "thai-id":      `<rect x="2.5"y="5"width="19"height="14"rx="2.2"/><circle cx="8.2"cy="10.6"r="2.2"/><path d="M4.8 15.8c.5-1.7 1.9-2.6 3.4-2.6s2.9.9 3.4 2.6"/><path d="M14.5 9.5h4.5M14.5 12.5h4.5M14.5 15.5h2.8"/>`,
  "thai-name":    `<circle cx="12"cy="7.6"r="4.1"/><path d="M4 20.8a8 8 0 0 1 16 0"/>`,
  "thai-address": `<path d="M12 21.4c0 0 7.3-6.6 7.3-11.5a7.3 7.3 0 1 0-14.6 0c0 4.9 7.3 11.5 7.3 11.5z"/><circle cx="12"cy="9.6"r="2.9"/>`,
  "thai-number":  `<path d="M9 3.2v17.6M13.4 3.2v17.6"/><path d="M5.8 7.2h8.8a3.3 3.3 0 0 1 0 6.6H5.8"/><path d="M5.8 13.8h9.4a3.3 3.3 0 0 1 0 6.6H5.8"/>`,

  // ── Power BI ──
  // วงแหวนโดนัทที่มีเส้นแบ่งส่วนสองเส้น ให้อ่านออกว่าเป็นกราฟ ไม่ใช่แค่วงกลมซ้อน
  "pbi-bar":      `<path d="M4 4.5v15"/><rect x="4" y="6" width="14.5" height="3.6" rx="1"/><rect x="4" y="11.2" width="9.5" height="3.6" rx="1"/><rect x="4" y="16.4" width="5" height="3.6" rx="1"/>`,
  // ตารางที่คอลัมน์ซ้ายถูกตรึง (เส้นทึบคั่น) ส่วนช่องขวามีบรรทัดข้อความซ้อนกัน
  "pbi-matrix-details": `<rect x="3.2" y="4.6" width="17.6" height="14.8" rx="1.8"/><path d="M9 4.6v14.8"/><path d="M3.2 9.2h17.6"/><path d="M11.4 12.4h6.8"/><path d="M11.4 15.6h4.4"/>`,
  // กล่องของขวัญ เส้นริบบิ้นพาดกลางกับโบว์สองข้าง อ่านออกว่าเป็นของแจกโดยไม่ต้องใช้อีโมจิ
  "freebies": `<rect x="3.2" y="9.6" width="17.6" height="10.8" rx="1.8"/><rect x="2.4" y="6.2" width="19.2" height="3.4" rx="1.2"/><path d="M12 6.2v14.2"/><path d="M12 6.2C10.6 3.4 6.6 3.4 7.2 5.4c.4 1.3 3 1.5 4.8.8"/><path d="M12 6.2c1.4-2.8 5.4-2.8 4.8-.8-.4 1.3-3 1.5-4.8.8"/>`,
  // กรอบรายงานหนึ่งหน้า กับแถบสีประจำธีมเรียงอยู่ด้านล่าง
  "pbi-theme":    `<rect x="3.2"y="4.4"width="17.6"height="15.2"rx="2"/><path d="M3.2 14.4h17.6"/><path d="M6.4 8h7"/><path d="M6.4 11.2h4.6"/><rect x="5.6"y="15.9"width="2.7"height="2.7"rx=".6"/><rect x="9.6"y="15.9"width="2.7"height="2.7"rx=".6"/><rect x="13.6"y="15.9"width="2.7"height="2.7"rx=".6"/>`,

  "pbi-donut":    `<circle cx="12"cy="12"r="8.7"/><circle cx="12"cy="12"r="4.3"/><path d="M12 3.3v4.4"/><path d="M19.5 16.3l-3.8-2.2"/>`,

  // ── Power Automate ──
  // ปีกกาเปิดปิดของ JSON กับจุดสามจุดตรงกลาง แทนค่าที่ถูกดึงออกมา
  "pa-parse-json": `<path d="M9.4 4.2c-2.1 0-1.9 3.1-1.9 3.1 0 1.3-1 2.4-2.3 2.4v4.6c1.3 0 2.3 1.1 2.3 2.4 0 0-.2 3.1 1.9 3.1"/><path d="M14.6 4.2c2.1 0 1.9 3.1 1.9 3.1 0 1.3 1 2.4 2.3 2.4v4.6c-1.3 0-2.3 1.1-2.3 2.4 0 0 .2 3.1-1.9 3.1"/><circle cx="12"cy="12"r=".9"/>`,

  // ── Power Query ──
  // สามเส้นทางจากคนละแหล่ง ไหลมารวมออกทางเดียว
  "pq-multisource-lookup": `<path d="M3.5 5.5h4.2a3 3 0 0 1 3 3v6a3 3 0 0 0 3 3h6.3"/><path d="M3.5 12h4.2a2.6 2.6 0 0 1 2.6 2.6"/><path d="M3.5 18.5h4"/><path d="M17.6 14.6l3.4 2.9-3.4 2.9"/>`,

  // ปฏิทินที่มีลูกศรชี้ออก สื่อว่าข้อความกลายเป็นวันที่จริง
  "pq-to-date": `<rect x="2.5"y="5"width="11.5"height="11"rx="2"/><path d="M2.5 9h11.5M6 2.5v3M10.5 2.5v3"/><path d="M16.5 10.5h5"/><path d="M19 8l2.5 2.5L19 13"/>`,

  // ปฏิทินสองใบซ้อน ใบหน้ามีเครื่องหมายถูก สื่อว่าเลือกมาใบเดียวจากหลายใบ
  "pq-pick-date": `<path d="M8.5 5.5h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><rect x="2.5"y="8.5"width="12"height="10"rx="2"fill="var(--card)"/><path d="M2.5 12h12M6 6.5v3M11 6.5v3"/><path d="M5.5 15l2 2 4-4"/>`,

  // หลายเส้นทางซ้ายมัดรวมเป็นเส้นเดียวออกขวา สื่อว่าหลายแถวยุบเหลือแถวเดียว
  "pq-group-concat": `<path d="M3 6h4M3 12h4M3 18h4"/><path d="M7 6c4 0 3 6 6 6M7 12h6M7 18c4 0 3-6 6-6"/><path d="M13 12h8"/><path d="M18.5 9.5L21 12l-2.5 2.5"/>`,

  // แท่งการกระจายสูงต่ำ มีเส้นแบ่งกลุ่มผ่ากลาง สื่อว่าตัดตัวเลขเป็นช่วง
  "number-bins": `<path d="M3 20.5h18"/><rect x="4"y="13"width="2.6"height="7.5"rx=".6"/><rect x="8"y="8"width="2.6"height="12.5"rx=".6"/><rect x="13.4"y="10.5"width="2.6"height="10"rx=".6"/><rect x="17.4"y="15.5"width="2.6"height="5"rx=".6"/><path d="M12 3v18" stroke-dasharray="2.5 2"/>`,

  // หมุดสองจุดกับเส้นประเชื่อม สื่อว่าย้ายจากจุดเดิมไปจุดใหม่
  "map-coverage": `<circle cx="12" cy="12" r="7.6" stroke-dasharray="2.6 2.2"/><circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none"/><circle cx="16.4" cy="8.6" r="1.25" fill="currentColor" stroke="none"/><circle cx="8.3" cy="14.6" r="1.25" fill="currentColor" stroke="none"/><circle cx="14.2" cy="15.4" r="1.25" fill="currentColor" stroke="none"/>`,
  "map-relocate": `<path d="M6.5 3.5a3.2 3.2 0 0 1 3.2 3.2c0 2.4-3.2 5.3-3.2 5.3S3.3 9.1 3.3 6.7A3.2 3.2 0 0 1 6.5 3.5Z"/><circle cx="6.5" cy="6.7" r="1.05" fill="var(--card)"/><path d="M17.5 12.2a3.2 3.2 0 0 1 3.2 3.2c0 2.4-3.2 5.3-3.2 5.3s-3.2-2.9-3.2-5.3a3.2 3.2 0 0 1 3.2-3.2Z"/><circle cx="17.5" cy="15.4" r="1.05" fill="var(--card)"/><path d="M8.6 9.4l6.4 4.6" stroke-dasharray="2.4 2"/>`,

  // ซองจดหมายที่มีตารางอยู่ข้างใน
  "pa-html-table": `<rect x="2.5"y="4.5"width="19"height="15"rx="2"/><path d="M2.5 6.5l9.5 6.5 9.5-6.5"/><rect x="7"y="11.5"width="10"height="6.5"rx="1"fill="var(--card)"/><path d="M7 14h10M12 11.5v6.5"/>`,
};

/** ไอคอนใช้งานทั่วไปสำหรับปุ่ม — แทนอักขระสัญลักษณ์ที่ฟอนต์ไทยไม่มี (⬇ ⠿ ⏹ ↺)
 *  ตัวพวกนั้นจะตกไปใช้ฟอนต์อื่นของระบบ ทำให้ปุ่มดูไม่เข้าชุดกัน */
/* ── ไอคอน "ชนิดไฟล์" สำหรับกล่องภาพย่อ ──────────────────────────────────
 * ‼️ คนละเรื่องกับไอคอนเครื่องมือ — เดิมยืมไอคอน "Excel → PDF" มาใช้แทนไฟล์ .xlsx
 *    ทำให้แถวไฟล์ขึ้นไอคอนลูกศรแปลงไฟล์ อ่านแล้วเหมือนไอคอนเครื่องมือซ้ำ ไม่ใช่ "นี่คือไฟล์ Excel"
 * ทุกตัวเป็นแผ่นเอกสารมุมพับเหมือนกัน ต่างกันแค่สัญลักษณ์ข้างใน — กวาดตาแล้วแยกออกทันที */
export const FILE_KIND = {
  pdf:   `<path d="${DOC}"/><path d="M8.4 17.6c2.6-1.4 4-4.6 3.4-6-.5-1.2-1.9-.6-1.7 1 .3 2.4 3 5 5.5 5.3"/>`,
  docx:  `<path d="${DOC}"/><path d="M8 12.2l1.5 5 1.6-4 1.6 4 1.5-5"/>`,
  xlsx:  `<path d="${DOC}"/><path d="M8.6 12.4l4.8 5.6M13.4 12.4l-4.8 5.6"/>`,
  csv:   `<path d="${DOC}"/><path d="M7.6 12.6h8.8M7.6 15.2h8.8M7.6 17.8h8.8M10.5 12.6v5.2M13.5 12.6v5.2"/>`,
  pptx:  `<path d="${DOC}"/><path d="M9 18v-5.6h2.4a1.7 1.7 0 0 1 0 3.4H9"/>`,
  image: `<path d="${DOC}"/><circle cx="9.6" cy="13.4" r="1"/><path d="M7.4 17.6l2.9-2.6 2.4 2 1.5-1.2 1.8 1.6"/>`,
  zip:   `<path d="${DOC}"/><path d="M11.2 11.4h1.6M11.2 13.4h1.6M11.2 15.4h1.6"/><rect x="10.9" y="17" width="2.2" height="2.6" rx=".8"/>`,
};
FILE_KIND.doc = FILE_KIND.docx;
FILE_KIND.ppt = FILE_KIND.pptx;

/** คืน <svg> ไอคอนชนิดไฟล์ (ไม่มีชนิดนั้น = คืน null ให้ผู้เรียกหาทางอื่น) */
export function fileKindIcon(kind, cls = "ico-svg") {
  const d = FILE_KIND[kind];
  if (!d) return null;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", cls);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = d;
  return svg;
}

export const UI = {
  download: `<path d="M12 3.5v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M4 17v1.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V17"/>`,
  zip:      `<path d="M4 7.5l8-4 8 4v9l-8 4-8-4z"/><path d="M4 7.5l8 4 8-4M12 11.5V20"/><path d="M10.2 5.4h1.6M10.2 7.2h1.6M10.2 9h1.6"/>`,
  grip:     `<circle cx="9"cy="6"r="1.3"/><circle cx="15"cy="6"r="1.3"/><circle cx="9"cy="12"r="1.3"/><circle cx="15"cy="12"r="1.3"/><circle cx="9"cy="18"r="1.3"/><circle cx="15"cy="18"r="1.3"/>`,
  stop:     `<rect x="6"y="6"width="12"height="12"rx="2"/>`,
  rotateR:  `<path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 4.5V11h-6.5"/>`,
  rotateL:  `<path d="M4 11a8 8 0 1 1 2.3 6.3"/><path d="M4 4.5V11h6.5"/>`,
  undo:     `<path d="M4 9h11a5 5 0 0 1 0 10h-6"/><path d="M8 5L4 9l4 4"/>`,
  // กระดาษสองใบซ้อนกัน สื่อถึงการคัดลอก
  copy:     `<rect x="8.5"y="8.5"width="11.5"height="11.5"rx="2"/><path d="M15.5 5.5A2 2 0 0 0 13.5 3.5h-7A3 3 0 0 0 3.5 6.5v7a2 2 0 0 0 2 2"/>`,
  list:     `<path d="M4 6.5h16M4 12h16M4 17.5h16"/>`,
  check:    `<path d="M4.8 12.6l4.6 4.6L19.2 7.4"/>`,
  close:    `<path d="M6.4 6.4l11.2 11.2M17.6 6.4L6.4 17.6"/>`,
  trash:    `<path d="M4.5 6.6h15"/><path d="M9.2 6.6V4.9a1.6 1.6 0 0 1 1.6-1.6h2.4a1.6 1.6 0 0 1 1.6 1.6v1.7"/><path d="M6.4 6.6l.9 12.2A2 2 0 0 0 9.3 20.7h5.4a2 2 0 0 0 2-1.9l.9-12.2"/><path d="M10.4 10.4v6M13.6 10.4v6"/>`,
  upload:   `<path d="M12 16V4"/><path d="M7.5 8.5L12 4l4.5 4.5"/><path d="M3.5 15v3.5A2.5 2.5 0 0 0 6 21h12a2.5 2.5 0 0 0 2.5-2.5V15"/>`,
  lock:     `<rect x="4.5"y="10"width="15"height="10.5"rx="2.4"/><path d="M8 10V7.2a4 4 0 0 1 8 0V10"/><circle cx="12"cy="15.2"r="1.3"/>`,
  search:   `<circle cx="10.8"cy="10.8"r="6.8"/><path d="M15.8 15.8L21 21"/>`,
  offline:  `<circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2"/><path d="M12 3.4c2.3 2.4 3.5 5.4 3.5 8.6S14.3 18.2 12 20.6c-2.3-2.4-3.5-5.4-3.5-8.6S9.7 5.8 12 3.4z"/><path d="M4.2 4.2l15.6 15.6"/>`,
  /* ลูกศรพับ/กางกลุ่มตั้งค่า ชี้ลงเมื่อกางอยู่ หมุนด้วย CSS ตอนพับ */
  chev:     `<path d="M6 9.5l6 6 6-6"/>`,
  rows:     `<rect x="3.5"y="4"width="17"height="6"rx="1.4"/><rect x="3.5"y="14"width="17"height="6"rx="1.4"/>`,
  /* ไอคอนบนแถบที่โผล่แทนแผงที่พับเก็บ (20/09/2026)
     sliders = แผงตั้งค่า · stack = แผงไฟล์เข้า · ทั้งคู่ใช้เส้น 2px เหมือนไอคอนอื่นในชุดนี้ */
  sliders:  `<path d="M4 7.5h5M13 7.5h7"/><path d="M4 16.5h9M17 16.5h3"/><circle cx="11" cy="7.5" r="2.2"/><circle cx="15" cy="16.5" r="2.2"/>`,
  stack:    `<path d="M4.5 8.6l7.5-3.8 7.5 3.8-7.5 3.8z"/><path d="M4.5 13l7.5 3.8L19.5 13"/><path d="M4.5 17.2l7.5 3.8 7.5-3.8"/>`,
};

/** <svg> ของไอคอนใช้งานทั่วไป */
export function uiIcon(name, cls = "btn-ico") {
  const d = UI[name];
  if (!d) return null;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", cls);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = d;
  return svg;
}

/** คืน <svg> ของเครื่องมือ · ถ้ายังไม่มีไอคอนวาดไว้ ใช้อีโมจิเดิมแทน (ไม่พังแน่นอน) */
export function toolIcon(tool, cls = "ico-svg") {
  const d = ICONS[tool.id];
  if (!d) return null;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", cls);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = d;
  return svg;
}
