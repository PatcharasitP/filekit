// ตัวเลข → คำอ่านบาทถ้วน · เลขไทย กับ เลขอารบิก ทั้งคอลัมน์
import { el } from "../dom.js";
import { field, select } from "../ui.js";
import { columnTool } from "../sheetpick.js";
import { bahtText, readThaiInteger, thaiToArabicDigits, arabicToThaiDigits } from "../thai.js";
import { tr } from "../i18n.js";

function modeDefs() {
  return [
    ["baht", tr("ตัวเลข → บาทถ้วน  (128,400 → หนึ่งแสนสองหมื่นแปดพันสี่ร้อยบาทถ้วน)", "Number → baht text  (128,400 → หนึ่งแสนสองหมื่นแปดพันสี่ร้อยบาทถ้วน)")],
    ["read", tr("ตัวเลข → คำอ่านเฉย ๆ  (128,400 → หนึ่งแสนสองหมื่นแปดพันสี่ร้อย)", "Number → plain reading  (128,400 → หนึ่งแสนสองหมื่นแปดพันสี่ร้อย)")],
    ["toThai", tr("เลขอารบิก → เลขไทย  (12345 → ๑๒๓๔๕)", "Arabic digits → Thai digits  (12345 → ๑๒๓๔๕)")],
    ["toArabic", tr("เลขไทย → เลขอารบิก  (๑๒๓๔๕ → 12345)", "Thai digits → Arabic digits  (๑๒๓๔๕ → 12345)")],
  ];
}

export function mount(tool) {
  return columnTool(tool, {
    accept: ".xlsx,.xls,.csv", expect: ["xlsx", "csv"], expectLabel: tr("ไฟล์ Excel หรือ CSV", "an Excel or CSV file"),
    hint: tr("รับ .xlsx .xls .csv ครั้งละ 1 ไฟล์ — ตัวเลขมีคอมมาหรือเป็นเลขไทยก็อ่านได้", "Accepts one .xlsx .xls .csv file at a time — reads numbers with commas or Thai digits too"),
    suffix: tr("-แปลงตัวเลขแล้ว", "-number-converted"),
    guessColumn: (h) => /ยอด|จำนวนเงิน|ราคา|เงิน|รวม|สุทธิ|amount|total|price/i.test(h),
    labels: { ok: tr("แปลงได้", "Converted"), bad: tr("ไม่ใช่ตัวเลข", "Not a number") },

    options(refresh) {
      const mode = select(modeDefs(), "baht");
      mode.onchange = refresh;
      return { node: el("div", { class: "row" }, [field(tr("แปลงเป็น", "Convert to"), mode)]), read: () => ({ mode: mode.value }) };
    },

    outName: (o) => ({ baht: tr("จำนวนเงินตัวหนังสือ", "Amount in words"), read: tr("คำอ่าน", "Reading"),
                       toThai: tr("เลขไทย", "Thai digits"), toArabic: tr("เลขอารบิก", "Arabic digits") })[o.mode],

    convert(v, o) {
      const s = v == null ? "" : String(v).trim();
      if (!s) return null;
      if (o.mode === "toThai") return { ok: true, value: arabicToThaiDigits(s) };
      if (o.mode === "toArabic") return { ok: true, value: thaiToArabicDigits(s) };
      const n = typeof v === "number" ? v : parseFloat(thaiToArabicDigits(s).replace(/[,\s฿]/g, ""));
      if (!isFinite(n)) return { ok: false, reason: tr("ไม่ใช่ตัวเลข", "Not a number") };
      if (o.mode === "read") {
        if (!Number.isInteger(n)) return { ok: false, reason: tr("คำอ่านแบบนี้รองรับเฉพาะจำนวนเต็ม", "This reading only supports whole numbers") };
        return { ok: true, value: (n < 0 ? "ลบ" : "") + readThaiInteger(Math.abs(n)) };
      }
      return { ok: true, value: bahtText(n) };
    },

    note: tr("ใช้คู่กับ “จดหมายเวียน Word + Excel” ได้เลย — เติมคอลัมน์ตัวหนังสือไว้ในไฟล์ข้อมูล แล้วอ้างด้วย {{จำนวนเงินตัวหนังสือ}} ในเทมเพลต",
             "Works great with a “Word + Excel mail merge” — add the words column to your data file and reference it as {{Amount in words}} in the template"),
  });
}
