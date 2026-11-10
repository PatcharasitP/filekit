/* วันที่ที่ FileKit เขียนลงไฟล์ xlsx ต้องตรงวินาที ไม่เกิน 4 วินาทีในเครื่องเขตเวลาไทย
 *
 * ‼️ ที่มา 10/11/2026: รวมไฟล์ Excel (excel-merge) วันที่ 1 ม.ค. 2026 ในไฟล์ผลเปิดด้วย openpyxl ได้ 00:00:04
 *    เลขในไฟล์ 46023.0000463 แทน 46023 เพราะ SheetJS แปลง Date เป็นเลขวันที่โดยอิง new Date(1899,11,30) ตามเวลาเครื่อง
 *    กรุงเทพปี 1899 ใช้ +06:42:04 เศษ 4 วินาทีติดไปทุกเซลล์ (ขาอ่านแก้ไว้แล้วที่ fixExcelDateSkew ขาเขียนยังไม่ได้แก้)
 *    Excel โชว์วันถูกเพราะรูปแบบ dd/mm/yyyy แต่ค้นหาตรงวันที่ จับคู่ใน Power Query หรือเทียบเท่ากันพังเงียบ
 *    หลักฐาน .claude/evidence/2026-11-09-fk-xlsx-worker/ ในโฟลเดอร์งาน (skew_write red loop)
 * ‼️ บั๊กเขตเวลาไม่โผล่ในเครื่องที่เป็น UTC เทสนี้จึงตั้ง TZ เป็นกรุงเทพเองก่อนสร้าง Date ใด ๆ */
process.env.TZ = "Asia/Bangkok";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
globalThis.XLSX = createRequire(import.meta.url)(join(ROOT, "vendor/xlsx.full.min.js"));
const { xlsxBytes } = await import("../src/xlsxutil.js");

/** เขียนแถวเดียวผ่านตัวเขียนของ FileKit แล้วอ่านเลขดิบในไฟล์กลับ (ไม่ให้ SheetJS แปลงเป็น Date) */
function roundTrip(value, opts = {}) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["h"], [value]], { cellDates: true, dateNF: "dd/mm/yyyy", ...opts }), "S");
  const buf = xlsxBytes(wb, { bookType: "xlsx", type: "array", compression: true });
  return XLSX.read(buf, { type: "array", cellNF: true }).Sheets.S.A2;
}

test("เขตเวลาของเทสเป็นกรุงเทพจริง และฐานปี 1899 มีเศษวินาที (ไม่งั้นเทสนี้จับบั๊กไม่ได้)", () => {
  assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, "Asia/Bangkok");
  assert.notEqual(new Date(1899, 11, 30).getTime() % 60000, 0);
});

test("เที่ยงคืน 1 ม.ค. 2026 เขียนเป็นเลข 46023 ตรง ไม่เกิน 4 วินาที", () => {
  const c = roundTrip(new Date(2026, 0, 1));
  assert.equal(c.v, 46023);
});

test("เวลาที่มีวินาทีจริง 10:30:12 ยังเป็น 10:30:12 ทุกวินาที", () => {
  const c = roundTrip(new Date(2026, 8, 1, 10, 30, 12));
  const secs = Math.round((c.v - Math.floor(c.v)) * 86400);
  assert.equal(secs, 10 * 3600 + 30 * 60 + 12);
  assert.equal(Math.floor(c.v), 46266);
});

test("ยังเป็นเซลล์วันที่ในสายตา Excel รูปแบบ dd/mm/yyyy ติดไปด้วย", () => {
  const c = roundTrip(new Date(2026, 0, 1));
  assert.equal(c.z, "dd/mm/yyyy");
});

test("ข้อความกับตัวเลขธรรมดาไม่ถูกแตะ", () => {
  assert.equal(roundTrip("01/01/2026").v, "01/01/2026");
  assert.equal(roundTrip(46023.5).v, 46023.5);
});
