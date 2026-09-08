// ตรวจเลขบัตรประชาชน / เลขประจำตัวผู้เสียภาษี 13 หลัก ทั้งคอลัมน์
import { el } from "../dom.js";
import { field, select } from "../ui.js";
import { columnTool } from "../sheetpick.js";
import { checkThaiId13, formatThaiId } from "../thai.js";
import { tr } from "../i18n.js";

export function mount(tool) {
  return columnTool(tool, {
    accept: ".xlsx,.xls,.csv", expect: ["xlsx", "csv"], expectLabel: tr("ไฟล์ Excel หรือ CSV", "an Excel or CSV file"),
    hint: tr("ไฟล์เดียว .xlsx .xls .csv — อ่านขีด/เลขไทยได้", "One .xlsx .xls .csv file — reads dashes or Thai digits"),
    suffix: tr("-ตรวจแล้ว", "-checked"), writeFail: true,
    guessColumn: (h) => /บัตร|ประชาชน|ผู้เสียภาษี|ภาษี|เลขประจำตัว|citizen|tax|id/i.test(h),
    labels: { ok: tr("ถูกต้อง", "Valid"), bad: tr("ผิด/ไม่ครบ", "Invalid/Incomplete") },

    options(refresh) {
      const mode = select([["check", tr("บอกผลตรวจ (ถูกต้อง / ผิดเพราะอะไร)", "Show the check result (valid / why it's invalid)")],
                           ["format", tr("จัดรูปแบบให้มีขีดคั่น 1-2345-67890-12-3", "Format with dashes: 1-2345-67890-12-3")],
                           ["digits", tr("เอาแต่ตัวเลข 13 หลัก (ตัดขีด/ช่องว่างทิ้ง)", "Digits only, 13 digits (strip dashes/spaces)")]], "check");
      mode.onchange = refresh;
      return {
        node: el("div", { class: "row" }, [field(tr("ผลลัพธ์ที่ต้องการ", "Output"), mode)]),
        read: () => ({ mode: mode.value }),
      };
    },

    outName: (o) => o.mode === "check" ? tr("ผลตรวจ", "Check result") : o.mode === "format" ? tr("เลข 13 หลัก (มีขีด)", "13-digit number (with dashes)") : tr("เลข 13 หลัก", "13-digit number"),

    convert(v, o) {
      if (v == null || String(v).trim() === "") return null;
      const r = checkThaiId13(v);
      if (!r.ok) return { ok: false, reason: r.reason, value: " " + r.reason };
      if (o.mode === "format") return { ok: true, value: formatThaiId(r.digits) };
      if (o.mode === "digits") return { ok: true, value: r.digits };
      return { ok: true, value: tr("ถูกต้อง", "Valid") };
    },

    note: tr("ตรวจด้วยสูตร check-digit มาตรฐาน — บอกได้แค่ว่าพิมพ์ผิด ไม่ยืนยันว่ามีเจ้าของจริง",
             "Uses the standard check-digit formula — flags typos only, doesn't confirm the ID belongs to anyone"),
  });
}
