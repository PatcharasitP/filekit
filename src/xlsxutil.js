// ─────────────────────────────────────────────────────────────────────────────
// ตัวช่วยเล็ก ๆ เรื่องสมุดงาน Excel ที่ใช้ร่วมกันหลายเครื่องมือ (ไม่พึ่ง UI เลย)
// ─────────────────────────────────────────────────────────────────────────────

/* ‼️ ชีทที่ผู้ใช้ "ซ่อนไว้" ใน Excel มักคือของที่ตั้งใจไม่ให้คนอื่นเห็น เช่น ฐานเงินเดือน
 * ต้นทุนจริง สูตรคิดราคา หรือชีทงานร่างที่ยังไม่เสร็จ · เครื่องมือที่ส่งออก "ทุกชีท"
 * ถ้าไม่เช็คสถานะนี้ = ทำข้อมูลที่ผู้ใช้ตั้งใจซ่อนหลุดออกไปเงียบ ๆ โดยไม่มีใครสั่ง
 * (ยิงจริง 09/09/2026: ชีทชื่อ "ลับ" ที่ตั้งซ่อนไว้ ถูกส่งออกเป็น CSV และพิมพ์ลง PDF ครบทุกตัวอักษร)
 * SheetJS เก็บสถานะไว้ที่ wb.Workbook.Sheets[i].Hidden — 0 = เห็นปกติ, 1 = ซ่อน, 2 = ซ่อนลึก
 * (ซ่อนลึกคือแบบที่เปิด Excel แล้วสั่ง "ยกเลิกซ่อน" ก็ยังไม่เห็น ต้องเขียนมาโครถึงจะเรียกได้) */
export function sheetHiddenLevel(wb) {
  const state = new Map();
  for (const s of (wb && wb.Workbook && wb.Workbook.Sheets) || [])
    if (s && s.name) state.set(s.name, s.Hidden | 0);
  return (name) => state.get(name) | 0;
}

/** แยกรายชื่อชีทเป็น "ที่เห็นปกติ" กับ "ที่ซ่อนไว้" (ตัดชีทที่ไม่มีข้อมูลจริงออกให้ด้วย) */
export function splitSheetsByVisibility(wb) {
  const hiddenOf = sheetHiddenLevel(wb);
  const all = (wb.SheetNames || []).filter((n) => wb.Sheets[n]);
  return {
    all,
    visible: all.filter((n) => !hiddenOf(n)),
    hidden: all.filter((n) => hiddenOf(n)),
    hiddenOf,
  };
}

/* ‼️ ไฟล์ใหญ่อ่านใน worker (xlsx-worker.js) หน้าไม่ค้างนิ่ง ที่มา 09/11/2026 เทสเตอร์มือถือ Pixel 7 CPU ช้า 4 เท่า
 * เปิดไฟล์ 50,000 แถว หน้าค้าง 8 ถึง 11 วินาที ตัวกินเวลาคือ XLSX.read บนเธรดหลัก
 * ไฟล์เล็กกว่าเกณฑ์อ่านบนหน้าเหมือนเดิม (เปิด worker ครั้งแรกต้องโหลดไลบรารีซ้ำ ไฟล์เล็กจะช้าลงเปล่า ๆ)
 * worker ใช้ไม่ได้ (เบราว์เซอร์เก่า โหลดไลบรารีไม่ได้ อ่านไฟล์แล้ว error) คืน null ให้อ่านบนหน้าแบบเดิม ไม่มีทางพังเพิ่ม
 * ใช้ร่วม: sheetpick readWorkbook, preview ตัวดูไฟล์, excel-csv, excel-to-pdf
 * เทส tests/browser_xlsx_worker.py เทียบผลสองทางทุกเซลล์ */
const WORKER_MIN = 256 * 1024;
let xw = null;
let xwBroken = false;
let xwSeq = 0;
const xwWait = new Map();

function xlsxWorker() {
  if (xw) return xw;
  xw = new Worker(new URL("./xlsx-worker.js", import.meta.url));
  xw.onmessage = ({ data }) => {
    const done = xwWait.get(data.id);
    xwWait.delete(data.id);
    done?.(data.wb || null);
  };
  xw.onerror = (e) => {
    e.preventDefault?.();
    xwBroken = true;
    for (const done of xwWait.values()) done(null);
    xwWait.clear();
    xw?.terminate();
    xw = null;
  };
  return xw;
}

async function readOffMain(data, opts) {
  const size = typeof data === "string" ? data.length : data.byteLength;
  if (xwBroken || typeof Worker === "undefined" || size < WORKER_MIN) return null;
  try {
    return await new Promise((resolve) => {
      const id = ++xwSeq;
      xwWait.set(id, resolve);
      xlsxWorker().postMessage({ id, data, opts });
    });
  } catch {
    return null;
  }
}

/** XLSX.read ที่ไฟล์ใหญ่ทำใน worker ได้ผลเหมือน XLSX.read ทุกอย่าง (ใช้ worker ไม่ได้ก็อ่านบนหน้า error เดิม) */
export async function readXlsx(data, opts) {
  return (await readOffMain(data, opts)) || XLSX.read(data, opts);
}
