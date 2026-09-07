// ── รู้จักชนิดไฟล์ก่อนจะเริ่มทำงาน ─────────────────────────────────────────
// บทเรียนจากผู้ใช้จริง: ลากไฟล์ PowerPoint ใส่เครื่องมือ PDF→Word แล้วได้
// ข้อความว่า "ไฟล์นี้ไม่ใช่ PDF ที่ถูกต้อง หรือไฟล์เสียหาย"ซึ่งทำให้เข้าใจผิด
// ว่าไฟล์ตัวเองพัง ทั้งที่ไฟล์ปกติดี แค่มาผิดเครื่องมือ
// ไฟล์นี้ทำให้ระบบบอกได้ว่า "นี่คือไฟล์อะไร" และ "ควรไปใช้เครื่องมือไหนแทน"
import { tr } from "./i18n.js";

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

// ป้ายชนิดไฟล์แบบ noun phrase ภาษาอังกฤษ (ใส่ a/an ไว้ในตัวเพื่อให้ประโยคลื่น)
// ‼️ เป็นแค่ข้อมูล ไม่เรียก tr() ที่นี่ — แปลจริงตอนอ่านออกมาใช้ใน typeLabel()/wrongTypeMessage()
const LABEL_EN = {
  pdf: "a PDF", docx: "a Word document", doc: "an old Word (.doc) file",
  xlsx: "an Excel file", csv: "a CSV file", pptx: "a PowerPoint file",
  ppt: "an old PowerPoint (.ppt) file", image: "an image", zip: "a ZIP file",
};

// เครื่องมือที่ "ควรไป"เมื่อเอาไฟล์ชนิดนั้นมาผิดที่ · [toolId, ข้อความไทย, ข้อความอังกฤษ(ถ้าข้อความไทยมี)]
const SUGGEST = {
  pdf:   ["pdf-to-word", "PDF → Word"],
  docx:  ["word-to-pdf", "Word → PDF"],
  doc:   [null, "ไฟล์ .doc รุ่นเก่ายังไม่รองรับ — บันทึกเป็น .docx ก่อนแล้วลองใหม่", "Old .doc files aren't supported yet — save as .docx first, then try again."],
  xlsx:  ["excel-to-pdf", "Excel → PDF"],
  csv:   ["excel-csv", "Excel → CSV"],
  pptx:  ["powerpoint-to-word", "PowerPoint → Word"],
  ppt:   [null, "ไฟล์ .ppt รุ่นเก่ายังไม่รองรับ — บันทึกเป็น .pptx ก่อนแล้วลองใหม่", "Old .ppt files aren't supported yet — save as .pptx first, then try again."],
  image: ["images-to-pdf", "รูปภาพ → PDF", "Image → PDF"],
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
  const t = TYPES[kind];
  const labelTh = t ? t.label : "ไฟล์ชนิดนี้";
  const labelEn = t ? (LABEL_EN[kind] || t.label) : "this file type";
  const whatTh = kind ? `ไฟล์นี้เป็น${labelTh}` : "ไฟล์นี้ไม่ใช่ชนิดที่รองรับ";
  const whatEn = kind ? `This is ${labelEn}` : "This file type isn't supported";
  const s = SUGGEST[kind];
  if (s && s[0]) {
    return {
      text: tr(`${whatTh} แต่เครื่องมือนี้รับเฉพาะ${expectLabel}`, `${whatEn}, but this tool only accepts ${expectLabel}`),
      toolId: s[0],
      toolName: tr(s[1], s[2]),
    };
  }
  if (s) return { text: tr(`${whatTh} — ${s[1]}`, `${whatEn} — ${s[2]}`), toolId: null };
  return { text: tr(`${whatTh} เครื่องมือนี้รับเฉพาะ${expectLabel}`, `${whatEn}. This tool only accepts ${expectLabel}`), toolId: null };
}
