// ── สร้างโค้ด Power Query (ภาษา M) จากตาราง ────────────────────────────────
// ไฟล์นี้ทำหน้าที่เดียว: แปลง "ตารางที่รู้ชนิดข้อมูลแล้ว" เป็นข้อความโค้ด M ที่วางใช้ได้จริง
// ส่วนการเดาชนิดข้อมูลอยู่คนละไฟล์ (pqtypes.js) เพื่อให้ทดสอบแยกกันได้
//
// อ้างอิงไวยากรณ์จากเอกสารทางการของ Microsoft (Power Query M language specification)
// สรุปที่ใช้ตัดสินใจ: .claude/research/2026-09-09-filekit-tool-depth.md

import { tr } from "./i18n.js";
import { parseAnyDate, toCE } from "./thai.js";

/* ชนิดข้อมูลที่รองรับ เรียงตามลำดับที่จะโชว์ในเมนูให้ผู้ใช้เลือก
 * mType   คือสิ่งที่เขียนใน type table [...]
 * label   คือชื่อที่ Power Query Editor แสดงจริง ผู้ใช้จะได้เทียบถูกว่าตรงกับที่เห็นในโปรแกรม */
export const PQ_TYPES = [
  { id: "text", mType: "text", label: () => tr("ข้อความ (Text)", "Text") },
  { id: "int64", mType: "Int64.Type", label: () => tr("จำนวนเต็ม (Whole number)", "Whole number") },
  { id: "number", mType: "number", label: () => tr("ทศนิยม (Decimal number)", "Decimal number") },
  { id: "currency", mType: "Currency.Type", label: () => tr("จำนวนเงิน (Fixed decimal)", "Fixed decimal number") },
  { id: "percentage", mType: "Percentage.Type", label: () => tr("เปอร์เซ็นต์ (Percentage)", "Percentage") },
  { id: "date", mType: "date", label: () => tr("วันที่ (Date)", "Date") },
  { id: "datetime", mType: "datetime", label: () => tr("วันที่และเวลา (Date/Time)", "Date/Time") },
  { id: "datetimezone", mType: "datetimezone", label: () => tr("วันที่ เวลา โซนเวลา", "Date/Time/Timezone") },
  { id: "time", mType: "time", label: () => tr("เวลา (Time)", "Time") },
  { id: "duration", mType: "duration", label: () => tr("ช่วงเวลา (Duration)", "Duration") },
  { id: "logical", mType: "logical", label: () => tr("จริง/เท็จ (True/False)", "True/False") },
];

export const TYPE_BY_ID = new Map(PQ_TYPES.map((t) => [t.id, t]));

/* ‼️ กฎ escape ของข้อความในภาษา M ต้องทำครบทุกข้อ ไม่งั้นโค้ดที่สร้างพังทันทีที่ข้อมูลมีอักขระพิเศษ
 *   1. เครื่องหมายคำพูด " ต้องเขียนซ้อนเป็น ""
 *   2. ขึ้นบรรทัดใหม่ กับ tab ต้องเขียนเป็น #(lf) #(cr) #(tab)
 *   3. ‼️ ตัวข้อความที่มี #( อยู่จริง ต้อง escape ตัว # เป็น #(#) ก่อน ไม่งั้น M จะอ่านเป็นคำสั่ง escape
 *      ข้อนี้คนลืมบ่อยที่สุด และเป็นช่องที่ทำให้โค้ดพังแบบงง ๆ
 *   4. ภาษาไทยและ Unicode อื่นใส่ตรง ๆ ได้เลย ไม่ต้องแปลง */
export function escapeMText(value) {
  return String(value ?? "")
    .replace(/#\(/g, "#(#)(")
    .replace(/"/g, '""')
    .replace(/\r\n/g, "#(cr,lf)")
    .replace(/\n/g, "#(lf)")
    .replace(/\r/g, "#(cr)")
    .replace(/\t/g, "#(tab)");
}

/** ครอบชื่อคอลัมน์ด้วย #"..." เสมอ ตัดปัญหาชื่อที่มีช่องว่าง ภาษาไทย ตัวเลขนำหน้า และคำสงวนทิ้งทั้งหมด */
export const quoteName = (name) => `#"${escapeMText(name)}"`;

const pad = (n) => String(n);
const numOrNull = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // ตัวเลขไทยและคอมมาคั่นหลักพันต้องถูกล้างก่อนเสมอ M รับเฉพาะจุดทศนิยม
  const s = String(v).trim()
    .replace(/[๐-๙]/g, (c) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(c)))
    .replace(/,/g, "")
    .replace(/[^\d.+-]/g, "");
  if (!/^[+-]?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/* ‼️ วันที่ในไฟล์จริงมาเป็น "ข้อความ" เป็นส่วนใหญ่ (ระบบไทยส่วนมาก export ออกมาแบบนั้น)
 * ตัวเดาชนิดใน pqtypes.js ตัดสินว่าคอลัมน์เป็นวันที่ด้วย parseAnyDate ซึ่งอ่านวันที่ไทยและ
 * พ.ศ. ออก · ถ้าตรงนี้รับแค่ Date object จะได้ตารางที่หัวประกาศ = date แต่ค่าเป็น null
 * ทุกแถว คือข้อมูลหายเงียบ ๆ (วัดจริง 09/09/2026 บนเว็บจริง: "1 ตุลาคม 2569", "01/10/2569"
 * และแม้แต่ "2026-10-01" หายทั้งคอลัมน์) จึงต้องใช้ตัวอ่านตัวเดียวกันทั้งสองฝั่ง */
const TIME_IN_TEXT = /(\d{1,2}):(\d{2})(?::(\d{2}))?/;

const parts = (v) => {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return { y: v.getFullYear(), mo: v.getMonth() + 1, d: v.getDate(),
             h: v.getHours(), mi: v.getMinutes(), s: v.getSeconds() };
  }
  if (typeof v !== "string" && typeof v !== "number") return null;

  let t = null, forDate = v;
  if (typeof v === "string") {
    // แยกส่วนเวลาออกก่อน เพราะตัวอ่านวันที่รับเฉพาะส่วนวันที่ล้วน
    t = v.match(TIME_IN_TEXT);
    forDate = (t ? v.replace(TIME_IN_TEXT, " ") : v).replace(/\s+/g, " ").trim();
    if (!forDate) return null;
  }
  const p = parseAnyDate(forDate);
  // มีแค่ปี หรือมีแค่เดือนกับปี ประกอบเป็นวันที่ไม่ได้ ต้องคืน null ไม่ใช่เดาวันที่ 1 ให้
  if (!p || p.m == null || p.d == null) return null;
  return { y: toCE(p.y), mo: p.m, d: p.d,
           h: t ? +t[1] : 0, mi: t ? +t[2] : 0, s: t && t[3] ? +t[3] : 0 };
};

/** แปลงค่าหนึ่งช่องเป็น literal ของภาษา M ตามชนิดที่ผู้ใช้เลือก
 *  ค่าที่แปลงไม่ได้จะคืน null เสมอ (ปลอดภัยกว่าเดาแล้วได้ค่าผิดเงียบ ๆ) */
export function mLiteral(value, typeId, opts = {}) {
  if (value == null || (typeof value === "string" && value.trim() === "")) return "null";
  switch (typeId) {
    case "logical": {
      if (typeof value === "boolean") return value ? "true" : "false";
      const s = String(value).trim().toLowerCase();
      if (["true", "1", "yes", "y", "ใช่", "จริง"].includes(s)) return "true";
      if (["false", "0", "no", "n", "ไม่ใช่", "เท็จ"].includes(s)) return "false";
      return "null";
    }
    case "int64": {
      const n = numOrNull(value);
      return n == null ? "null" : String(Math.round(n));
    }
    case "number":
    case "currency": {
      const n = numOrNull(value);
      return n == null ? "null" : String(n);
    }
    case "percentage": {
      // ‼️ Percentage ใน M เก็บเป็น "สัดส่วน" ไม่ใช่เลขเปอร์เซ็นต์ 87.5% ต้องเขียนเป็น 0.875
      let n = numOrNull(value);
      if (n == null) return "null";
      if (typeof value === "string" && value.includes("%")) n = n / 100;
      return String(n);
    }
    case "date": {
      const p = parts(value);
      return p ? `#date(${pad(p.y)},${pad(p.mo)},${pad(p.d)})` : "null";
    }
    case "datetime": {
      const p = parts(value);
      return p ? `#datetime(${pad(p.y)},${pad(p.mo)},${pad(p.d)},${pad(p.h)},${pad(p.mi)},${pad(p.s)})` : "null";
    }
    case "datetimezone": {
      const p = parts(value);
      if (!p) return "null";
      const oh = opts.tzHours ?? 7, om = opts.tzMinutes ?? 0;   // ไทยคือ +07:00
      return `#datetimezone(${pad(p.y)},${pad(p.mo)},${pad(p.d)},${pad(p.h)},${pad(p.mi)},${pad(p.s)},${pad(oh)},${pad(om)})`;
    }
    case "time": {
      const p = parts(value);
      if (p) return `#time(${pad(p.h)},${pad(p.mi)},${pad(p.s)})`;
      const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(value).trim());
      return m ? `#time(${+m[1]},${+m[2]},${+(m[3] || 0)})` : "null";
    }
    case "duration": {
      // รับได้ทั้ง d.hh:mm:ss และ hh:mm:ss (รูปแบบที่ Excel ให้มา)
      const s = String(value).trim();
      const m = /^(?:(\d+)[.\s])?(\d{1,3}):(\d{2})(?::(\d{2}))?$/.exec(s);
      if (m) return `#duration(${+(m[1] || 0)},${+m[2]},${+m[3]},${+(m[4] || 0)})`;
      const n = numOrNull(value);                 // Excel เก็บเวลาเป็นเศษของวัน
      if (n == null) return "null";
      const total = Math.round(n * 86400);
      return `#duration(${Math.floor(total / 86400)},${Math.floor(total / 3600) % 24},${Math.floor(total / 60) % 60},${total % 60})`;
    }
    default:
      return `"${escapeMText(value)}"`;
  }
}

/**
 * สร้างโค้ด #table ฉบับเต็ม
 * columns: [{ name, type }]  rows: [[ค่า, ...], ...]
 */
export function buildTableCode(columns, rows, opts = {}) {
  const indent = "    ";
  const typeLines = columns.map((c, i) => {
    const t = TYPE_BY_ID.get(c.type) || TYPE_BY_ID.get("text");
    const nullable = opts.nullable && rows.some((r) => r[i] == null || r[i] === "");
    // nullable ใส่ให้เฉพาะคอลัมน์ที่มีช่องว่างจริง จะได้ไม่รกโดยไม่จำเป็น
    return `${indent}${indent}${quoteName(c.name)} = ${nullable ? "nullable " : ""}${t.mType}`;
  }).join(",\n");

  const rowLines = rows.map((r) => {
    const cells = columns.map((c, i) => mLiteral(r[i], c.type, opts));
    return `${indent}${indent}{${cells.join(", ")}}`;
  }).join(",\n");

  return `#table(\n${indent}type table [\n${typeLines}\n${indent}],\n${indent}{\n${rowLines}\n${indent}}\n)`;
}

/** ห่อโค้ดให้เป็น query เต็มพร้อมวางใน Advanced Editor */
export function wrapAsQuery(code, name = "Source") {
  return `let\n    ${name} = ${code.replace(/\n/g, "\n    ")}\nin\n    ${name}`;
}
