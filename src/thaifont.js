// ── ฟอนต์ไทยสำหรับ jsPDF ───────────────────────────────────────────────────
// ฟอนต์ในตัวของ jsPDF ครอบคลุมแค่ WinAnsi (ละติน) ถ้าไม่ฝังฟอนต์ไทยก่อน
// ข้อความไทยจะกลายเป็นสี่เหลี่ยมว่างทั้งหมด
//
// เราใช้ Sarabun ที่ตัดเหลือเฉพาะช่วงอักขระที่ใช้จริง (ไทย + ละติน + เครื่องหมาย)
// เหลือไฟล์ละ ~45 KB จากต้นฉบับ ~90 KB และโหลดจากโดเมนเดียวกันครั้งเดียว
// แล้วเก็บไว้ใช้ซ้ำทั้ง session

import { tr } from "./i18n.js";

const FILES = {
  normal: { path: "vendor/fonts/Sarabun-Regular-th.ttf", vfs: "Sarabun-Regular.ttf" },
  bold:   { path: "vendor/fonts/Sarabun-Bold-th.ttf",    vfs: "Sarabun-Bold.ttf" },
};
export const THAI_FONT = "Sarabun";

const cache = new Map(); // path -> Promise<base64>

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  const CHUNK = 0x8000; // แปลงเป็นก้อน กัน stack ล้นเมื่อไฟล์ใหญ่
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

function fetchFont(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(path).then((r) => {
      if (!r.ok) throw new Error(tr(`โหลดฟอนต์ไม่สำเร็จ (${r.status})`, `Failed to load font (${r.status})`));
      return r.arrayBuffer();
    }).then(toBase64).catch((e) => { cache.delete(path); throw e; }));
  }
  return cache.get(path);
}

/** ฝังฟอนต์ไทยลงเอกสาร jsPDF แล้วตั้งเป็นฟอนต์ปัจจุบัน */
export async function useThaiFont(doc, style = "normal") {
  const specs = style === "both" ? ["normal", "bold"] : [style];
  for (const s of specs) {
    const { path, vfs } = FILES[s];
    doc.addFileToVFS(vfs, await fetchFont(path));
    doc.addFont(vfs, THAI_FONT, s);
  }
  doc.setFont(THAI_FONT, specs[0]);
  return THAI_FONT;
}

/** เริ่มโหลดฟอนต์ไว้ล่วงหน้าเงียบ ๆ (เรียกตอนผู้ใช้เปิดเครื่องมือ) */
export function warmThaiFont() {
  Object.values(FILES).forEach(({ path }) => fetchFont(path).catch(() => {}));
}
