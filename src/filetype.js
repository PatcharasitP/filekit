// ── รู้จักชนิดไฟล์ก่อนจะเริ่มทำงาน ─────────────────────────────────────────
// บทเรียนจากผู้ใช้จริง: ลากไฟล์ PowerPoint ใส่เครื่องมือ PDF→Word แล้วได้
// ข้อความว่า "ไฟล์นี้ไม่ใช่ PDF ที่ถูกต้อง หรือไฟล์เสียหาย"ซึ่งทำให้เข้าใจผิด
// ว่าไฟล์ตัวเองพัง ทั้งที่ไฟล์ปกติดี แค่มาผิดเครื่องมือ
// ไฟล์นี้ทำให้ระบบบอกได้ว่า "นี่คือไฟล์อะไร" และ "ควรไปใช้เครื่องมือไหนแทน"
export const TYPES = {
  pdf:  { label: "PDF",        ext: [".pdf"] },
  docx: { label: "Word",       ext: [".docx"] },
  doc:  { label: "Word รุ่นเก่า", ext: [".doc"] },
  xlsx: { label: "Excel",      ext: [".xlsx", ".xls"] },
  csv:  { label: "CSV",        ext: [".csv"] },
  pptx: { label: "PowerPoint", ext: [".pptx"] },
  ppt:  { label: "PowerPoint รุ่นเก่า", ext: [".ppt"] },
  image:{ label: "รูปภาพ",     ext: [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".heic"] },
  zip:  { label: "ZIP",        ext: [".zip"] },
};

// เครื่องมือที่ "ควรไป"เมื่อเอาไฟล์ชนิดนั้นมาผิดที่
const SUGGEST = {
  pdf:   ["pdf-to-word", "PDF → Word"],
  docx:  ["word-to-pdf", "Word → PDF"],
  doc:   [null, "ไฟล์ .doc รุ่นเก่ายังไม่รองรับ — บันทึกเป็น .docx ก่อนแล้วลองใหม่"],
  xlsx:  ["excel-to-pdf", "Excel → PDF"],
  csv:   ["excel-csv", "Excel → CSV"],
  pptx:  ["powerpoint-to-word", "PowerPoint → Word"],
  ppt:   [null, "ไฟล์ .ppt รุ่นเก่ายังไม่รองรับ — บันทึกเป็น .pptx ก่อนแล้วลองใหม่"],
  image: ["images-to-pdf", "รูปภาพ → PDF"],
};

export function detectType(file) {
  const name = (file.name || "").toLowerCase();
  for (const [kind, t] of Object.entries(TYPES)) {
    if (t.ext.some((e) => name.endsWith(e))) return kind;
  }
  if ((file.type || "").startsWith("image/")) return "image";
  return null;
}

export const typeLabel = (kind) => TYPES[kind]?.label || "ไฟล์ชนิดนี้";

/** ข้อความบอกทางเมื่อผู้ใช้เอาไฟล์มาผิดเครื่องมือ + ปลายทางที่ควรไป */
export function wrongTypeMessage(kind, expectLabel) {
  const what = kind ? `ไฟล์นี้เป็น${typeLabel(kind)}` : "ไฟล์นี้ไม่ใช่ชนิดที่รองรับ";
  const s = SUGGEST[kind];
  if (s && s[0]) return { text: `${what} แต่เครื่องมือนี้รับเฉพาะ${expectLabel}`, toolId: s[0], toolName: s[1] };
  if (s) return { text: `${what} — ${s[1]}`, toolId: null };
  return { text: `${what} เครื่องมือนี้รับเฉพาะ${expectLabel}`, toolId: null };
}
