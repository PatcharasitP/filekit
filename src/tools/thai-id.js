// ตรวจเลขบัตรประชาชน / เลขประจำตัวผู้เสียภาษี 13 หลัก ทั้งคอลัมน์
import { el } from "../dom.js";
import { field, select } from "../ui.js";
import { columnTool } from "../sheetpick.js";
import { checkThaiId13, formatThaiId } from "../thai.js";

export function mount(tool) {
  return columnTool(tool, {
    accept: ".xlsx,.xls,.csv", expect: ["xlsx", "csv"], expectLabel: "ไฟล์ Excel หรือ CSV",
    hint: "รับ .xlsx .xls .csv ครั้งละ 1 ไฟล์ — มีขีดคั่นหรือเป็นเลขไทยก็อ่านได้",
    suffix: "-ตรวจแล้ว", writeFail: true,
    guessColumn: (h) => /บัตร|ประชาชน|ผู้เสียภาษี|ภาษี|เลขประจำตัว|citizen|tax|id/i.test(h),
    labels: { ok: "ถูกต้อง", bad: "ผิด/ไม่ครบ" },

    options(refresh) {
      const mode = select([["check", "บอกผลตรวจ (ถูกต้อง / ผิดเพราะอะไร)"],
                           ["format", "จัดรูปแบบให้มีขีดคั่น 1-2345-67890-12-3"],
                           ["digits", "เอาแต่ตัวเลข 13 หลัก (ตัดขีด/ช่องว่างทิ้ง)"]], "check");
      mode.onchange = refresh;
      return {
        node: el("div", { class: "row" }, [field("ผลลัพธ์ที่ต้องการ", mode)]),
        read: () => ({ mode: mode.value }),
      };
    },

    outName: (o) => o.mode === "check" ? "ผลตรวจ" : o.mode === "format" ? "เลข 13 หลัก (มีขีด)" : "เลข 13 หลัก",

    convert(v, o) {
      if (v == null || String(v).trim() === "") return null;
      const r = checkThaiId13(v);
      if (!r.ok) return { ok: false, reason: r.reason, value: "❌ " + r.reason };
      if (o.mode === "format") return { ok: true, value: formatThaiId(r.digits) };
      if (o.mode === "digits") return { ok: true, value: r.digits };
      return { ok: true, value: "✅ ถูกต้อง" };
    },

    note: "ตรวจด้วยสูตรหลักตรวจสอบมาตรฐานของเลข 13 หลัก (ผลรวมถ่วงน้ำหนัก 13…2 หารเอาเศษ 11) — บอกได้ว่าเลขพิมพ์ผิด แต่ยืนยันไม่ได้ว่าเลขนั้นมีเจ้าของอยู่จริง",
  });
}
