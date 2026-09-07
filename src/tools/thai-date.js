// แปลงปี พ.ศ. กับ ค.ศ. ทั้งคอลัมน์ในไฟล์ Excel/CSV
import { el } from "../dom.js";
import { field, select } from "../ui.js";
import { columnTool } from "../sheetpick.js";
import { parseAnyDate, formatDate, toCE, toBE, isBE } from "../thai.js";

const FMTS = [
  ["thabbr", "15 ม.ค. 2569  (ไทยย่อ)"],
  ["thfull", "15 มกราคม 2569  (ไทยเต็ม)"],
  ["dmy", "15/01/2569  (วัน/เดือน/ปี)"],
  ["iso", "2569-01-15  (ปี-เดือน-วัน)"],
  ["excel", "วันที่จริงของ Excel — นำไปคำนวณต่อได้ (ค.ศ. เท่านั้น)"],
];

export function mount(tool) {
  return columnTool(tool, {
    accept: ".xlsx,.xls,.csv", expect: ["xlsx", "csv"], expectLabel: "ไฟล์ Excel หรือ CSV",
    hint: "รับ .xlsx .xls .csv ครั้งละ 1 ไฟล์ — อ่านวันที่ไทยได้ทั้ง “15 ม.ค. 2569”, “15/01/2569”, “๑๕/๐๑/๒๕๖๙”",
    suffix: "-แปลงปีแล้ว",
    guessColumn: (h) => /วันที่|วัน|ปี|date|year|เดือน/i.test(h),
    labels: { ok: "แปลงได้", bad: "อ่านรูปแบบวันที่ไม่ออก", warn: "ปีมี 2 หลัก ระบบเดาให้เป็น 25xx" },

    options(refresh) {
      const dir = select([["toCE", "พ.ศ. → ค.ศ.  (ลบ 543)"],
                          ["toBE", "ค.ศ. → พ.ศ.  (บวก 543)"],
                          ["keep", "ไม่เปลี่ยนปี — แค่จัดรูปแบบใหม่"]], "toCE");
      const fmt = select(FMTS, "iso");
      dir.onchange = () => { fmt.value = dir.value === "toBE" ? "thabbr" : "iso"; refresh(); };
      fmt.onchange = refresh;
      return {
        node: el("div", { class: "row" }, [
          field("ทิศทาง", dir, "ปีตั้งแต่ 2400 ขึ้นไปถือว่าเป็น พ.ศ. อยู่แล้ว จะไม่บวกซ้ำให้"),
          field("รูปแบบผลลัพธ์", fmt),
        ]),
        read: () => ({ dir: dir.value, fmt: fmt.value }),
      };
    },

    outName: (o) => o.dir === "toCE" ? "วันที่ (ค.ศ.)" : o.dir === "toBE" ? "วันที่ (พ.ศ.)" : "วันที่ (จัดรูปแบบใหม่)",

    convert(v, o) {
      if (v == null || String(v).trim() === "") return null;
      const p = parseAnyDate(v);
      if (!p) return { ok: false, reason: "อ่านรูปแบบวันที่ไม่ออก" };
      const y = o.dir === "toCE" ? toCE(p.y) : o.dir === "toBE" ? toBE(p.y) : p.y;
      if (o.fmt === "excel") {
        if (isBE(y)) return { ok: false, reason: "วันที่ของ Excel เก็บปี พ.ศ. ไม่ได้ — เลือกทิศทางเป็น ค.ศ." };
        if (p.m == null || p.d == null) return { ok: false, reason: "ข้อมูลมีแค่ปี/เดือน ทำเป็นวันที่เต็มไม่ได้" };
        return { ok: true, value: new Date(y, p.m - 1, p.d), warn: p.guessedYear };
      }
      return { ok: true, value: formatDate({ ...p, y }, o.fmt), warn: p.guessedYear };
    },

    note: "ปีที่พิมพ์มา 2 หลัก (เช่น 69) ระบบจะเดาว่าเป็น พ.ศ. 2569 แล้วติดธง ⚠️ ให้เห็นในสรุป — ตรวจก่อนใช้จริงทุกครั้ง",
  });
}
