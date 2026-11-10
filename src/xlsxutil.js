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
    done?.(data);
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

/** ส่งงานให้ worker คืนคำตอบของ worker หรือ null เมื่อใช้ worker ไม่ได้ (ฝั่งเรียกทำบนหน้าแทน) */
async function askWorker(msg, transfer) {
  if (xwBroken || typeof Worker === "undefined") return null;
  try {
    return await new Promise((resolve) => {
      const id = ++xwSeq;
      xwWait.set(id, resolve);
      try {
        xlsxWorker().postMessage({ id, ...msg }, transfer || []);
      } catch (e) {
        xwWait.delete(id); // ส่งข้ามไม่ได้ (เช่นของในสมุดงานโคลนไม่ได้) ทำบนหน้าแทน
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

/** XLSX.read ที่ไฟล์ใหญ่ทำใน worker ได้ผลเหมือน XLSX.read ทุกอย่าง (ใช้ worker ไม่ได้ก็อ่านบนหน้า error เดิม) */
export async function readXlsx(data, opts) {
  const size = typeof data === "string" ? data.length : data.byteLength;
  const r = size >= WORKER_MIN ? await askWorker({ op: "read", data, opts }) : null;
  return (r && r.wb) || XLSX.read(data, opts);
}

/* ‼️ วัด 10/11/2026 Pixel 7 CPU ช้า 4 เท่า เขียน 50,000 แถว บนหน้าค้าง 2,071 ms ใน worker ค้าง 586 ms (ช่วงส่งสมุดงานข้าม)
 * 100,000 แถว 4,300 เหลือ 1,180 ms และเสร็จเร็วกว่า (.claude/evidence/2026-11-09-fk-xlsx-worker/probe_write_run.log)
 * เกณฑ์นับเป็นจำนวนช่องในสมุดงาน ต่ำกว่า 50,000 ช่องเขียนบนหน้าเหมือนเดิม */
const WRITE_MIN_CELLS = 50000;

function cellCount(wb) {
  let n = 0;
  for (const name of wb.SheetNames || []) {
    const ref = wb.Sheets[name] && wb.Sheets[name]["!ref"];
    if (!ref) continue;
    const r = XLSX.utils.decode_range(ref);
    n += (r.e.r - r.s.r + 1) * (r.e.c - r.s.c + 1);
  }
  return n;
}

/** XLSX.write แบบ type "array" ที่สมุดงานใหญ่ทำใน worker คืน ArrayBuffer เหมือนเดิม (ใช้ worker ไม่ได้ก็เขียนบนหน้า) */
export async function writeXlsx(wb, opts) {
  fixDatesForWrite(wb); // แปลงวันที่บนหน้าก่อน worker จะได้ไม่พึ่งเขตเวลาของ worker
  if (opts.type !== "array" || cellCount(wb) < WRITE_MIN_CELLS) return XLSX.write(wb, opts);
  const r = await askWorker({ op: "write", wb, opts });
  return (r && r.buf) || XLSX.write(wb, opts);
}

/* ‼️ ขาเขียนของวันที่เพี้ยน 4 วินาที (คู่กับ fixExcelDateSkew ขาอ่านใน sheetpick.js) พบ 10/11/2026
 * SheetJS แปลง Date เป็นเลขวันที่โดยอิง new Date(1899,11,30) ตามเวลาเครื่อง กรุงเทพปี 1899 ใช้ +06:42:04
 * เที่ยงคืน 1 ม.ค. 2026 ลงไฟล์เป็น 46023.0000463 (00:00:04) Excel โชว์วันถูก แต่ค้นตรงวันที่หรือจับคู่ใน Power Query พังเงียบ
 * แปลงเซลล์วันที่เป็นเลขวันที่เองจากเวลาท้องถิ่นที่ตาเห็น ไม่ผ่านฐาน 1899 คงรูปแบบวันที่ไว้ Excel ยังเห็นเป็นวันที่
 * วันที่ก่อน 1 มี.ค. 1900 ปล่อยให้ SheetJS จัดเอง (ช่วงที่ Excel นับ 29 ก.พ. 1900 ผิด) เทส tests/xlsx_write_dates.test.mjs */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const SAFE_FROM = Date.UTC(1900, 2, 1);

export function fixDatesForWrite(wb) {
  for (const name of wb.SheetNames || []) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    for (const addr of Object.keys(ws)) {
      if (addr[0] === "!") continue;
      const c = ws[addr];
      if (!c || c.t !== "d" || !(c.v instanceof Date) || !Number.isFinite(c.v.getTime())) continue;
      const d = c.v;
      const ms = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
      if (ms < SAFE_FROM) continue;
      const hasTime = ms % 86400000 !== 0;
      c.t = "n";
      c.v = (ms - EXCEL_EPOCH) / 86400000;
      if (!c.z) c.z = hasTime ? "dd/mm/yyyy hh:mm:ss" : "dd/mm/yyyy";
      delete c.w;
    }
  }
  return wb;
}

/** XLSX.write ที่วันที่ตรงวินาที ใช้แทน XLSX.write ทุกจุดที่เขียนไฟล์ให้ผู้ใช้ */
export function xlsxBytes(wb, opts) {
  return XLSX.write(fixDatesForWrite(wb), opts);
}
