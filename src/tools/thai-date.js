// แปลงปี พ.ศ. กับ ค.ศ. ทั้งคอลัมน์ในไฟล์ Excel/CSV
import { el } from "../dom.js";
import { field, select } from "../ui.js";
import { columnTool } from "../sheetpick.js";
import { parseAnyDate, formatDate, toCE, toBE, isBE } from "../thai.js";
import { tr } from "../i18n.js";

function fmtsDefs() {
  return [
    ["thabbr", tr("15 ม.ค. 2569  (ไทยย่อ)", "15 Jan 2026  (Thai, abbreviated)")],
    ["thfull", tr("15 มกราคม 2569  (ไทยเต็ม)", "15 January 2026  (Thai, full)")],
    ["dmy", "15/01/2569  " + tr("(วัน/เดือน/ปี)", "(day/month/year)")],
    ["iso", "2569-01-15  " + tr("(ปี-เดือน-วัน)", "(year-month-day)")],
    ["excel", tr("วันที่ Excel (คำนวณได้ เฉพาะ ค.ศ.)", "Excel date (for calculations, A.D. only)")],
  ];
}

export function mount(tool) {
  return columnTool(tool, {
    accept: ".xlsx,.xls,.csv", expect: ["xlsx", "csv"], expectLabel: tr("ไฟล์ Excel หรือ CSV", "an Excel or CSV file"),
    hint: tr("ไฟล์เดียว .xlsx .xls .csv (อ่านวันที่ไทยได้ทุกรูปแบบ)",
             "One .xlsx .xls .csv file (reads any Thai date format)"),
    suffix: tr("-แปลงปีแล้ว", "-year-converted"),
    guessColumn: (h) => /วันที่|วัน|ปี|date|year|เดือน/i.test(h),
    labels: { ok: tr("แปลงได้", "Converted"), bad: tr("อ่านรูปแบบวันที่ไม่ออก", "Could not read the date format"), warn: tr("ปีมี 2 หลัก ระบบเดาให้เป็น 25xx", "2-digit year, guessed as 25xx") },

    options(refresh) {
      const dir = select([["toCE", tr("พ.ศ. → ค.ศ.  (ลบ 543)", "B.E. → A.D.  (subtract 543)")],
                          ["toBE", tr("ค.ศ. → พ.ศ.  (บวก 543)", "A.D. → B.E.  (add 543)")],
                          ["keep", tr("ไม่เปลี่ยนปี แค่จัดรูปแบบใหม่", "Keep the year, just reformat")]], "toCE");
      const fmt = select(fmtsDefs(), "iso");
      dir.onchange = () => { fmt.value = dir.value === "toBE" ? "thabbr" : "iso"; refresh(); };
      fmt.onchange = refresh;
      return {
        node: el("div", { class: "row" }, [
          field(tr("ทิศทาง", "Direction"), dir, tr("ปี ≥ 2400 ถือเป็น พ.ศ. แล้ว ไม่บวกซ้ำ", "Years ≥ 2400 are treated as B.E. already")),
          field(tr("รูปแบบผลลัพธ์", "Output format"), fmt),
        ]),
        read: () => ({ dir: dir.value, fmt: fmt.value }),
      };
    },

    outName: (o) => o.dir === "toCE" ? tr("วันที่ (ค.ศ.)", "Date (A.D.)") : o.dir === "toBE" ? tr("วันที่ (พ.ศ.)", "Date (B.E.)") : tr("วันที่ (จัดรูปแบบใหม่)", "Date (reformatted)"),

    convert(v, o) {
      if (v == null || String(v).trim() === "") return null;
      const p = parseAnyDate(v);
      if (!p) return { ok: false, reason: tr("อ่านรูปแบบวันที่ไม่ออก", "Could not read the date format") };
      const y = o.dir === "toCE" ? toCE(p.y) : o.dir === "toBE" ? toBE(p.y) : p.y;
      if (o.fmt === "excel") {
        if (isBE(y)) return { ok: false, reason: tr("เก็บปี พ.ศ. ไม่ได้ เลือกทิศทาง ค.ศ.", "Can't store B.E. years, choose A.D.") };
        if (p.m == null || p.d == null) return { ok: false, reason: tr("ข้อมูลมีแค่ปี/เดือน ทำเป็นวันที่เต็มไม่ได้", "Only a year/month is available, can't build a full date") };
        return { ok: true, value: new Date(y, p.m - 1, p.d), warn: p.guessedYear };
      }
      return { ok: true, value: formatDate({ ...p, y }, o.fmt), warn: p.guessedYear };
    },

    note: tr("ปี 2 หลัก (เช่น 69) เดาเป็น พ.ศ. 2569 และติดธง ตรวจก่อนใช้จริง",
             "A 2-digit year (like 69) is guessed as B.E. 2569 and flagged, double-check first"),
  });
}
