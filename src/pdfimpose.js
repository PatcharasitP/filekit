// ── โมดูลกลางสำหรับ "วางหน้าเดิมลงบนกระดาษใหม่" ────────────────────────────
// ใช้ร่วมกันโดย 3 เครื่องมือ: เปลี่ยนขนาดกระดาษ, หลายหน้าต่อแผ่น, หนังสือเล่มเล็ก
// ทั้งสามทำงานเดียวกันคือ embed หน้าเดิมแล้ววาดลงหน้าใหม่ ต่างกันแค่ "วางกี่ช่องและช่องไหน"
//
// ‼️ วิธีนี้เก็บชั้นข้อความไว้ครบ หน้าที่ได้ยังค้นหาและคัดลอกได้เหมือนเดิม
//   (ต่างจากการเรนเดอร์เป็นภาพ ซึ่งเป็นทางที่เครื่องมือบีบอัดกับลบข้อมูลลับใช้ และมีราคาที่ต้องจ่าย)
//   พิสูจน์แล้ว 21/09/2026: 3 หน้า A4 เป็น 2 แผ่นแนวนอน ข้อความครบทุกหน้าและยังค้นได้
import { tr } from "./i18n.js";

/* ขนาดกระดาษมาตรฐาน หน่วยเป็นพอยต์ (1 นิ้ว = 72 พอยต์) แนวตั้งเสมอ
   ‼️ A4 ของไทยคือ 595.28 x 841.89 ปัดเป็นจำนวนเต็มไม่ได้ ไฟล์ที่ได้จะเพี้ยนตอนพิมพ์ */
export const PAPER = {
  a3: { w: 841.89, h: 1190.55, label: () => "A3" },
  a4: { w: 595.28, h: 841.89, label: () => "A4" },
  a5: { w: 419.53, h: 595.28, label: () => "A5" },
  letter: { w: 612, h: 792, label: () => tr("Letter (จดหมาย)", "Letter") },
  legal: { w: 612, h: 1008, label: () => tr("Legal (กฎหมาย)", "Legal") },
};

/** ลำดับหน้าของหนังสือเล่มเล็ก พับครึ่งเย็บกลาง
 * ‼️ พิสูจน์แล้วด้วยการจำลองการพับกลับ (21/09/2026): 4, 5, 6, 8, 12 หน้า
 *   พับแล้วอ่านได้ 1,2,3,... ตามลำดับทุกกรณี
 * คืนรายการแผ่น แต่ละแผ่นมี 2 ช่อง ซ้ายกับขวา · เลขหน้าเริ่มนับที่ 1 · null = หน้าว่าง
 */
export function bookletSheets(pageCount) {
  const total = Math.ceil(pageCount / 4) * 4;      // ต้องเป็นพหุคูณของ 4 เสมอ ขาดเท่าไรเติมหน้าว่าง
  const sheets = [];
  const at = (n) => (n <= pageCount ? n : null);   // เกินจำนวนหน้าจริง = ช่องว่าง
  for (let i = 0; i < total / 4; i++) {
    sheets.push([at(total - 2 * i), at(2 * i + 1)]);       // ด้านหน้าของแผ่น
    sheets.push([at(2 * i + 2), at(total - 2 * i - 1)]);   // ด้านหลังของแผ่น
  }
  return { total, sheets };
}

/** แบ่งหน้าเป็นกลุ่มละ n สำหรับโหมดหลายหน้าต่อแผ่น */
export function chunkPages(pageCount, per) {
  const out = [];
  for (let i = 1; i <= pageCount; i += per) {
    const g = [];
    for (let k = 0; k < per; k++) g.push(i + k <= pageCount ? i + k : null);
    out.push(g);
  }
  return out;
}

/** ผังช่องบนแผ่น สำหรับจำนวนหน้าต่อแผ่นแต่ละแบบ
 * คืน { cols, rows, landscape } · landscape = แผ่นควรเป็นแนวนอน
 * ‼️ 2 กับ 6 ใช้แนวนอน เพราะวางเรียงตามแนวยาวแล้วได้พื้นที่ต่อหน้ามากกว่า */
export const GRIDS = {
  2: { cols: 2, rows: 1, landscape: true },
  4: { cols: 2, rows: 2, landscape: false },
  6: { cols: 3, rows: 2, landscape: true },
  9: { cols: 3, rows: 3, landscape: false },
};

/** คำนวณสเกลและตำแหน่งของหน้าเดิม ให้พอดีในกรอบที่กำหนด โดยรักษาสัดส่วนเสมอ
 * mode "fit" = ย่อให้เห็นครบทั้งหน้า (ค่าเริ่มต้น ปลอดภัยที่สุด ไม่มีอะไรหาย)
 * mode "fill" = ขยายจนเต็มกรอบ ส่วนที่ล้นถูกตัด (ใช้เมื่อยอมเสียขอบเพื่อไม่ให้มีขอบขาว)
 */
export function fitBox(srcW, srcH, boxW, boxH, mode = "fit") {
  const s = mode === "fill"
    ? Math.max(boxW / srcW, boxH / srcH)
    : Math.min(boxW / srcW, boxH / srcH);
  const w = srcW * s, h = srcH * s;
  return { scale: s, w, h, dx: (boxW - w) / 2, dy: (boxH - h) / 2 };
}

/**
 * วางหน้าเดิมลงบนกระดาษใหม่ตามผังที่ให้มา
 * @param out      PDFDocument ปลายทาง (สร้างไว้แล้ว)
 * @param embedded ผลของ out.embedPages(...) เรียงตามหน้าเดิม index 0 = หน้า 1
 * @param sheets   รายการแผ่น แต่ละแผ่นคือ array ของเลขหน้า (เริ่มที่ 1) หรือ null สำหรับช่องว่าง
 * @param opt      { sheetW, sheetH, cols, rows, margin, gutter, mode, onSheet }
 * ‼️ margin คือขอบรอบแผ่น · gutter คือช่องไฟระหว่างช่อง ต้องแยกกัน
 *   ไม่งั้นพอเพิ่มขอบเพื่อเข้าเล่ม ช่องไฟระหว่างหน้าจะโตตามไปด้วยโดยไม่ได้ตั้งใจ
 */
export async function imposeSheets(out, embedded, sheets, opt) {
  const { sheetW, sheetH, cols = 1, rows = 1, margin = 0, gutter = 0,
          mode = "fit", onSheet = null } = opt;
  const cellW = (sheetW - margin * 2 - gutter * (cols - 1)) / cols;
  const cellH = (sheetH - margin * 2 - gutter * (rows - 1)) / rows;
  for (let si = 0; si < sheets.length; si++) {
    const page = out.addPage([sheetW, sheetH]);
    sheets[si].forEach((pageNo, idx) => {
      if (!pageNo) return;
      const ep = embedded[pageNo - 1];
      if (!ep) return;
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      const boxX = margin + c * (cellW + gutter);
      /* ‼️ แกน y ของ PDF นับจากล่างขึ้นบน แต่คนอ่านนับแถวจากบนลงล่าง
         ถ้าไม่กลับแกน หน้าจะเรียงกลับหัวกลับหางบนแผ่น (แถวสุดท้ายไปอยู่บนสุด) */
      const boxY = sheetH - margin - (r + 1) * cellH - r * gutter;
      const f = fitBox(ep.width, ep.height, cellW, cellH, mode);
      page.drawPage(ep, { x: boxX + f.dx, y: boxY + f.dy, xScale: f.scale, yScale: f.scale });
    });
    if (onSheet) await onSheet(si + 1, sheets.length);
  }
}
