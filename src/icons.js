// ─────────────────────────────────────────────────────────────────────────────
// ไอคอนเส้นวาดเอง 24×24 · stroke-width 1.7 · ใช้ currentColor จึงเปลี่ยนสีตามหมวดได้
// เลิกใช้อีโมจิเพราะแต่ละตัวมาคนละสไตล์ คนละน้ำหนัก คนละสี — เป็นสัญญาณ "งานอดิเรก"
// ที่แรงที่สุดบนหน้าเว็บ และคุมให้เข้าชุดกันไม่ได้เลย
// ─────────────────────────────────────────────────────────────────────────────
const DOC = 'M7 3h7l4 4v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M14 3v4h4';

export const ICONS = {
  // ── จัดการไฟล์ PDF ──
  "pdf-pages":    `<rect x="3"y="6"width="11"height="14"rx="1.8"/><path d="M7 3h9a2 2 0 0 1 2 2v11"/><path d="M6.5 11h5M6.5 14.5h3"/>`,
  "pdf-merge":    `<rect x="3"y="3"width="8"height="7"rx="1.5"/><rect x="3"y="14"width="8"height="7"rx="1.5"/><path d="M11 6.5h4a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-4"/><path d="M18.5 9l2.5 2.5-2.5 2.5"/>`,
  "pdf-split":    `<rect x="2.5"y="8"width="7.5"height="8"rx="1.5"/><path d="M10 12h2.4"/><path d="M12.4 12V7.4h2.6M12.4 12v4.6h2.6"/><rect x="15"y="4"width="6.5"height="6.5"rx="1.3"/><rect x="15"y="13.5"width="6.5"height="6.5"rx="1.3"/>`,
  "pdf-compress": `<path d="M9.6 4v5.6H4"/><path d="M14.4 4v5.6H20"/><path d="M9.6 20v-5.6H4"/><path d="M14.4 20v-5.6H20"/><path d="M3.8 3.8l4.4 4.4M20.2 3.8l-4.4 4.4M3.8 20.2l4.4-4.4M20.2 20.2l-4.4-4.4"/>`,
  "pdf-sign":     `<path d="M3 19.5c3.2 0 3-9.5 6.2-9.5s2.8 6 6 6 3-3 5.8-3"/><path d="M15.6 3.6l4.8 4.8L12 16.8l-5 1.2 1.2-5z"/>`,
  "pdf-watermark":`<path d="${DOC}"/><path d="M8.4 16.6c0-2.4 3.4-5.6 3.4-5.6s3.4 3.2 3.4 5.6a3.4 3.4 0 0 1-6.8 0z"/>`,
  "pdf-ocr":      `<path d="M7 3h7l4 4v4"/><path d="M14 3v4h4"/><path d="M5 5v14a2 2 0 0 0 2 2h4.5"/><path d="M8.5 10.5h5M8.5 13.5h3"/><circle cx="16.8"cy="16.8"r="3.4"/><path d="M19.3 19.3L21.5 21.5"/>`,

  // ── แปลงจาก PDF ──
  "pdf-to-images":`<path d="${DOC}"/><rect x="8.5"y="11"width="8"height="6.5"rx="1.2"/><circle cx="11"cy="13.4"r="1"/><path d="M8.5 16l2.6-2.2 2.4 2 1.4-1.1 1.6 1.3"/>`,
  "pdf-to-text":  `<path d="${DOC}"/><path d="M8.5 11.5h7M8.5 14.5h7M8.5 17.5h4"/>`,
  "pdf-to-word":  `<path d="${DOC}"/><path d="M8 11.5l1.5 6 1.8-4.2 1.8 4.2 1.5-6"/>`,
  "pdf-to-excel": `<path d="${DOC}"/><path d="M8 11.5h8M8 15h8M8 18.5h8M11.5 11.5v7.5M14.5 11.5v7.5"/>`,

  // ── แปลงเป็น PDF ──
  "word-to-pdf":  `<rect x="2.5"y="4"width="8.5"height="16"rx="1.6"/><path d="M4.6 9l1.3 5.4L7.4 10l1.5 4.4L10.2 9"/><path d="M13 12h5.5"/><path d="M16.6 9.4L19.6 12l-3 2.6"/><rect x="19.5"y="4"width="2"height="16"rx="1"opacity="0"/>`,
  "excel-to-pdf": `<rect x="2.5"y="4"width="8.5"height="16"rx="1.6"/><path d="M4.6 8.6h4.3M4.6 12h4.3M4.6 15.4h4.3M6.8 8.6v6.8"/><path d="M13 12h5.5"/><path d="M16.6 9.4L19.6 12l-3 2.6"/>`,
  "images-to-pdf":`<rect x="2.5"y="5"width="9"height="8"rx="1.4"/><circle cx="5.2"cy="7.8"r="0.9"/><path d="M2.5 11.4l2.9-2.4 2.5 2.1 1.4-1.1 2.2 1.8"/><path d="M6 16.5h5.5"/><path d="M9.6 14l2.6 2.5-2.6 2.5"/><path d="M15 5h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4"/>`,

  // ── รูปภาพ ──
  "image-convert":`<rect x="2.5"y="4.5"width="8.5"height="8"rx="1.4"/><rect x="13"y="11.5"width="8.5"height="8"rx="1.4"/><path d="M6.7 15.5v3.6M4.9 17.3l1.8 1.8 1.8-1.8"/><path d="M17.3 8.5V4.9M15.5 6.7l1.8-1.8 1.8 1.8"/>`,
  "image-resize": `<rect x="3"y="3.5"width="17.5"height="13"rx="1.8"/><path d="M3 12.5l4.6-3.8 3.4 2.8 2.4-1.9 3 2.4"/><path d="M14 19h7M14 19l2.2-2.2M14 19l2.2 2.2"/>`,

  // ── เอกสารและจดหมายเวียน ──
  "word-join":    `<rect x="2.5"y="3.5"width="7.5"height="10"rx="1.4"/><rect x="2.5"y="16"width="7.5"height="4.5"rx="1.2"/><path d="M10 8.5h4.5a2 2 0 0 1 2 2v3"/><path d="M18.6 11l2.4 2.6-2.4 2.6"/><path d="M16.5 13.6H21"/>`,
  "word-replace": `<path d="M4 7h7M4 7l2-2M4 7l2 2"/><path d="M20 17h-7M20 17l-2-2M20 17l2-2"opacity="0"/><path d="M20 17h-7M18 15l2 2-2 2"/><rect x="13"y="3.5"width="8"height="7"rx="1.4"/><rect x="3"y="13.5"width="8"height="7"rx="1.4"/>`,
  "word-clean":   `<path d="M9.5 3.5l5.5 5.5"/><path d="M14 3l3 3-7.5 7.5-3-3z"/><path d="M6.5 13.5L4 21l7.5-2.5"/><path d="M17 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>`,
  "word-mailmerge":`<rect x="2.5"y="4"width="8"height="6"rx="1.2"/><path d="M2.5 5.4l4.2 3 4.3-3"/><rect x="2.5"y="14"width="8"height="6"rx="1.2"/><path d="M4.6 15.8h3.8M4.6 18.2h2.4"/><path d="M11 12h3.4"/><path d="M15 3.5h4a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-4"/><path d="M17 8.5h2M17 12h2M17 15.5h2"/>`,

  // ── PowerPoint ──
  "powerpoint-to-word": `<rect x="2.5"y="3.5"width="10"height="8"rx="1.4"/><path d="M7.5 11.5v3M5 17h5"/><path d="M14 8h3"/><path d="M15.4 5.8L17.8 8l-2.4 2.2"/><path d="M18.5 12.5l1.2 5 1.5-3.6 1.5 3.6 1.2-5"transform="translate(-3.5,0)"/>`,
  "powerpoint-to-pdf":  `<rect x="2.5"y="3.5"width="10"height="8"rx="1.4"/><path d="M7.5 11.5v3M5 17h5"/><path d="M14 8h3"/><path d="M15.4 5.8L17.8 8l-2.4 2.2"/><rect x="14.5"y="12"width="7"height="8.5"rx="1.3"/><path d="M16.5 15h3M16.5 17.6h3"/>`,

  // ── ตารางและข้อมูล ──
  "excel-csv":    `<rect x="2.5"y="4.5"width="8"height="15"rx="1.4"/><path d="M2.5 9h8M6.5 4.5v15"/><path d="M12.5 12h6"/><path d="M16.6 9.6L19.4 12l-2.8 2.4"/><path d="M21.5 7v10"opacity="0"/><path d="M12.5 12h-.2"/>`,

  // ── งานเอกสารไทย ──
  "thai-encoding":`<path d="${DOC}"/><path d="M8 11.4h3.4M8 14.4h6M8 17.4h4"/><circle cx="17.6"cy="16.4"r="4"/><path d="M15.9 16.4l1.2 1.2 2.3-2.4"/>`,
  "thai-date":    `<rect x="3"y="5"width="18"height="16"rx="2.2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M7.5 14.5h3.5M9.5 13.2v3.2"/><path d="M13.5 17.5h3.5M15.5 13.2v3.2"opacity="0"/><path d="M13.4 14.5h3.6"/><path d="M14.2 16.6l2 2"opacity="0"/>`,
  "thai-id":      `<rect x="2.5"y="5"width="19"height="14"rx="2.2"/><circle cx="8.2"cy="10.6"r="2.2"/><path d="M4.8 15.8c.5-1.7 1.9-2.6 3.4-2.6s2.9.9 3.4 2.6"/><path d="M14.5 9.5h4.5M14.5 12.5h4.5M14.5 15.5h2.8"/>`,
  "thai-name":    `<path d="${DOC}"/><circle cx="14.5" cy="13.2" r="2.4"/><path d="M10.6 20.4a4 4 0 0 1 7.8 0"/>`,
  "thai-address": `<path d="${DOC}"/><path d="M14.5 20.6s3.6-3.5 3.6-6.2a3.6 3.6 0 1 0-7.2 0c0 2.7 3.6 6.2 3.6 6.2Z"/><circle cx="14.5" cy="14.3" r="1.3"/>`,
  "thai-number":  `<path d="${DOC}"/><path d="M11.6 9.8v10.4"/><path d="M9.8 11.6h3.4a2 2 0 0 1 0 4h-3.4zM9.8 15.6h3.8a2 2 0 0 1 0 4H9.8z"/>`,
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
  list:     `<path d="M4 6.5h16M4 12h16M4 17.5h16"/>`,
  close:    `<path d="M6.4 6.4l11.2 11.2M17.6 6.4L6.4 17.6"/>`,
  trash:    `<path d="M4.5 6.6h15"/><path d="M9.2 6.6V4.9a1.6 1.6 0 0 1 1.6-1.6h2.4a1.6 1.6 0 0 1 1.6 1.6v1.7"/><path d="M6.4 6.6l.9 12.2A2 2 0 0 0 9.3 20.7h5.4a2 2 0 0 0 2-1.9l.9-12.2"/><path d="M10.4 10.4v6M13.6 10.4v6"/>`,
  upload:   `<path d="M12 16V4"/><path d="M7.5 8.5L12 4l4.5 4.5"/><path d="M3.5 15v3.5A2.5 2.5 0 0 0 6 21h12a2.5 2.5 0 0 0 2.5-2.5V15"/>`,
  lock:     `<rect x="4.5"y="10"width="15"height="10.5"rx="2.4"/><path d="M8 10V7.2a4 4 0 0 1 8 0V10"/><circle cx="12"cy="15.2"r="1.3"/>`,
  search:   `<circle cx="10.8"cy="10.8"r="6.8"/><path d="M15.8 15.8L21 21"/>`,
  offline:  `<path d="M2.4 8.9A15 15 0 0 1 8 5.7M15.6 5.6a15 15 0 0 1 6 3.3"/><path d="M5.6 12.6A10 10 0 0 1 9 10.7M14.6 10.5a10 10 0 0 1 3.8 2.1"/><path d="M9 16.3a5 5 0 0 1 5.4.6"/><circle cx="12" cy="19.6" r="1.15" fill="currentColor" stroke="none"/><path d="M3.2 3.2l17.6 17.6"/>`,
  rows:     `<rect x="3.5"y="4"width="17"height="6"rx="1.4"/><rect x="3.5"y="14"width="17"height="6"rx="1.4"/>`,
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
