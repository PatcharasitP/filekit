// ตัวเลข → คำอ่านบาทถ้วน · เลขไทย กับ เลขอารบิก ทั้งคอลัมน์
import { el } from "../dom.js";
import { field, select } from "../ui.js";
import { columnTool } from "../sheetpick.js";
import { bahtText, readThaiInteger, thaiToArabicDigits, arabicToThaiDigits } from "../thai.js";

const MODES = [
  ["baht", "ตัวเลข → บาทถ้วน  (128,400 → หนึ่งแสนสองหมื่นแปดพันสี่ร้อยบาทถ้วน)"],
  ["read", "ตัวเลข → คำอ่านเฉย ๆ  (128,400 → หนึ่งแสนสองหมื่นแปดพันสี่ร้อย)"],
  ["toThai", "เลขอารบิก → เลขไทย  (12345 → ๑๒๓๔๕)"],
  ["toArabic", "เลขไทย → เลขอารบิก  (๑๒๓๔๕ → 12345)"],
];

export function mount(tool) {
  return columnTool(tool, {
    accept: ".xlsx,.xls,.csv", expect: ["xlsx", "csv"], expectLabel: "ไฟล์ Excel หรือ CSV",
    hint: "รับ .xlsx .xls .csv ครั้งละ 1 ไฟล์ — ตัวเลขมีคอมมาหรือเป็นเลขไทยก็อ่านได้",
    suffix: "-แปลงตัวเลขแล้ว",
    guessColumn: (h) => /ยอด|จำนวนเงิน|ราคา|เงิน|รวม|สุทธิ|amount|total|price/i.test(h),
    labels: { ok: "แปลงได้", bad: "ไม่ใช่ตัวเลข" },

    options(refresh) {
      const mode = select(MODES, "baht");
      mode.onchange = refresh;
      return { node: el("div", { class: "row" }, [field("แปลงเป็น", mode)]), read: () => ({ mode: mode.value }) };
    },

    outName: (o) => ({ baht: "จำนวนเงินตัวหนังสือ", read: "คำอ่าน",
                       toThai: "เลขไทย", toArabic: "เลขอารบิก" })[o.mode],

    convert(v, o) {
      const s = v == null ? "" : String(v).trim();
      if (!s) return null;
      if (o.mode === "toThai") return { ok: true, value: arabicToThaiDigits(s) };
      if (o.mode === "toArabic") return { ok: true, value: thaiToArabicDigits(s) };
      const n = typeof v === "number" ? v : parseFloat(thaiToArabicDigits(s).replace(/[,\s฿]/g, ""));
      if (!isFinite(n)) return { ok: false, reason: "ไม่ใช่ตัวเลข" };
      if (o.mode === "read") {
        if (!Number.isInteger(n)) return { ok: false, reason: "คำอ่านแบบนี้รองรับเฉพาะจำนวนเต็ม" };
        return { ok: true, value: (n < 0 ? "ลบ" : "") + readThaiInteger(Math.abs(n)) };
      }
      return { ok: true, value: bahtText(n) };
    },

    note: "ใช้คู่กับ “จดหมายเวียน Word + Excel” ได้เลย — เติมคอลัมน์ตัวหนังสือไว้ในไฟล์ข้อมูล แล้วอ้างด้วย {{จำนวนเงินตัวหนังสือ}} ในเทมเพลต",
  });
}
