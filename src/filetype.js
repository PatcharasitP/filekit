// ── รู้จักชนิดไฟล์ก่อนจะเริ่มทำงาน ─────────────────────────────────────────
// บทเรียนจากผู้ใช้จริง: ลากไฟล์ PowerPoint ใส่เครื่องมือ PDF→Word แล้วได้
// ข้อความว่า "ไฟล์นี้ไม่ใช่ PDF ที่ถูกต้อง หรือไฟล์เสียหาย"ซึ่งทำให้เข้าใจผิด
// ว่าไฟล์ตัวเองพัง ทั้งที่ไฟล์ปกติดี แค่มาผิดเครื่องมือ
// ไฟล์นี้ทำให้ระบบบอกได้ว่า "นี่คือไฟล์อะไร" และ "ควรไปใช้เครื่องมือไหนแทน"
import { tr, IS_EN } from "./i18n.js";

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

/** ไฟล์ว่าง 0 ไบต์ — เช็คได้แน่นอนโดยไม่ต้องเดา ควรเรียกก่อนพยายามอ่านไฟล์ใด ๆ ทั้งนั้น */
export function assertNotEmpty(file) {
  if (file.size === 0)
    throw new Error(tr(`${file.name} — ไฟล์นี้ว่างเปล่า (0 ไบต์) · เลือกไฟล์ที่มีเนื้อหาแล้วลองใหม่`,
      `${file.name} — this file is empty (0 bytes) · choose one that has content and try again`));
}

const OLE_SIG = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // .doc/.ppt/.xls รุ่นเก่า (Compound File)
const PDF_SIG = [0x25, 0x50, 0x44, 0x46]; // "%PDF"
function sigMatch(buf, sig) {
  if (!buf || buf.byteLength < sig.length) return false;
  const b = new Uint8Array(buf, 0, sig.length);
  return sig.every((v, i) => b[i] === v);
}

/**
 * แปลง error ตอนเปิดไฟล์ที่โครงสร้างเป็น ZIP ภายใน (.docx .pptx .xlsx) เป็นข้อความที่คนอ่าน
 * แล้วทำต่อได้ — ใช้เมื่อ JSZip.loadAsync()/อ่านชิ้นส่วนข้างในล้มเหลว
 * ก่อนแปลงจะ log error จริงลง console เสมอ (กันบั๊กหายเงียบ ๆ) · ส่ง buf (ArrayBuffer ของไฟล์)
 * มาด้วยถ้ามี จะช่วยจับกรณี "นามสกุลถูกแต่ข้างในเป็นไฟล์อื่น" ได้แม่นขึ้น
 */
export function friendlyZipOpenError(e, file, buf) {
  console.error(e);
  const name = file?.name ? `${file.name} — ` : "";
  const msg = String(e?.message || e);
  if (sigMatch(buf, OLE_SIG))
    return new Error(tr(
      `${name}ไฟล์ Office รุ่นเก่า (.doc/.ppt/.xls) เปลี่ยนนามสกุลมา · เปิดแล้วบันทึกเป็นรุ่นใหม่ก่อน`,
      `${name}This is an old Office file (.doc/.ppt/.xls) with a renamed extension — open it and save as the new format first`));
  if (sigMatch(buf, PDF_SIG))
    return new Error(tr(`${name}เป็นไฟล์ PDF ที่เปลี่ยนนามสกุลเอง ไม่ใช่ไฟล์นี้จริง · เลือกไฟล์ต้นฉบับที่ถูกต้อง`,
      `${name}This is actually a PDF with a renamed extension · choose the correct source file`));
  if (/out of memory|allocation failed|invalid (string|array|typed array) length/i.test(msg))
    return new Error(tr(`${name}ไฟล์ใหญ่เกินไป เบราว์เซอร์ประมวลผลไม่ไหว · ลองแบ่งไฟล์ให้เล็กลงหรือใช้เครื่องแรมเยอะขึ้น`,
      `${name}This file is too large for the browser to handle · try splitting it or using a device with more memory`));
  return new Error(tr(`${name}เปิดไม่ได้ ไฟล์นี้อาจเสียหายหรือเนื้อในไม่ตรงนามสกุล · เปิดต้นฉบับแล้วบันทึกใหม่อีกครั้ง`,
    `${name}Could not open — the file may be damaged or its content doesn't match the extension · open the original and save again`));
}

export function detectType(file) {
  const name = (file.name || "").toLowerCase();
  for (const [kind, t] of Object.entries(TYPES)) {
    if (t.ext.some((e) => name.endsWith(e))) return kind;
  }
  if ((file.type || "").startsWith("image/")) return "image";
  return null;
}

/* ‼️ ป้ายชนิดไฟล์ที่โชว์เดี่ยว ๆ (เช่นในแถบ "ไฟล์ของคุณ" หน้าแรก) ต้องแปลด้วย
   เดิมคืนไทยเสมอ ทำให้หน้าอังกฤษขึ้นคำว่า "รูปภาพ" ปนอยู่ (พี่ปอนด์จับได้ 08/09/2026)
   ‼️ คนละชุดกับ LABEL_EN ข้างบนซึ่งเป็นวลีในประโยค ("an image") ใช้เป็นป้ายเดี่ยวไม่ได้
   ชื่อส่วนใหญ่เป็นคำสากลอยู่แล้ว (PDF/Word/Excel) จึงมีเฉพาะตัวที่ต่างจริง */
const LABEL_SHORT_EN = { image: "Image", doc: "Word (legacy)", ppt: "PowerPoint (legacy)" };
export const typeLabel = (kind) =>
  (IS_EN ? LABEL_SHORT_EN[kind] || TYPES[kind]?.label : TYPES[kind]?.label)
  || tr("ไฟล์ชนิดนี้", "this file type");

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
