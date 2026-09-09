// ── เดาชนิดข้อมูลของคอลัมน์ สำหรับสร้างโค้ด Power Query ────────────────────
// แยกจาก pqm.js เพื่อให้ทดสอบ "การเดา" กับ "การสร้างโค้ด" คนละชุดได้
//
// ‼️ หลักที่ยึด: ใช้กฎเรียงชั้น ตัดสินได้แน่นอนก่อน แล้วค่อยลงกฎที่หลวมกว่า
//    ห้ามใช้วิธีให้คะแนนแล้วเลือกคะแนนสูงสุด เพราะเดาผิดแบบเงียบ ๆ
//    และเมื่อไม่มั่นใจให้ตกไปเป็น "ข้อความ" เสมอ เพราะผู้ใช้แก้ชนิดเองง่ายกว่า
//    ตามหาว่าข้อมูลเพี้ยนตรงไหนหลังแปลงไปแล้ว

import { parseAnyDate, thaiToArabicDigits } from "./thai.js";
import { tr } from "./i18n.js";

const BLANKS = new Set(["", "-", "--", "n/a", "na", "n.a.", "null", "none",
                        "ไม่มี", "ไม่ระบุ", "ว่าง", "ไม่มีข้อมูล"]);
/* ‼️ ไม่นับ "1" กับ "0" เป็นจริง/เท็จ เพราะแยกจากจำนวนจริง ๆ ไม่ได้
 * คอลัมน์ที่มีแต่ 0 กับ 1 อาจเป็นยอดจริงก็ได้ ปล่อยเป็นตัวเลขไว้ปลอดภัยกว่า
 * ผู้ใช้เปลี่ยนเป็นจริง/เท็จเองได้ในคลิกเดียว แต่ถ้าเราเดาผิดข้อมูลเสียเลย */
const TRUE_WORDS = new Set(["true", "yes", "y", "ใช่", "จริง", "เปิด"]);
const FALSE_WORDS = new Set(["false", "no", "n", "ไม่ใช่", "เท็จ", "ปิด"]);
const MONEY = /[฿$€£]|บาท|THB|USD/i;

export const isBlank = (v) =>
  v == null || (typeof v === "string" && BLANKS.has(v.trim().toLowerCase()));

/* ‼️ ตัวเลขที่จริง ๆ แล้วเป็น "รหัส" ไม่ใช่จำนวน ถ้าปล่อยเป็นตัวเลขจะเสียข้อมูลถาวร
 * เลขศูนย์นำหน้าหายไป เลขบัตร 13 หลักถูกปัดเป็นค่าประมาณ เบอร์โทรกลายเป็นจำนวนเงิน
 * กฎที่ตัดสินได้แน่นอน ไม่ต้องเดา:
 *   ศูนย์นำหน้าและยาวเกิน 1 หลัก, ตัวเลขล้วนยาวตั้งแต่ 9 หลัก, มีตัวอักษรปนตัวเลข,
 *   มีขีดหรือทับคั่นแบบรหัส (1-2345-67890-12-3, 88/2, กท 0123/2569) */
function looksLikeCode(s) {
  const t = s.trim();
  if (/^0\d+$/.test(t)) return "ขึ้นต้นด้วยศูนย์";
  if (/^\d{9,}$/.test(t)) return "ตัวเลขยาวเกินไปสำหรับจำนวน";
  if (/^\d[\d-]{10,}\d$/.test(t) && (t.match(/-/g) || []).length >= 2) return "รูปแบบเลขบัตรประชาชน";
  if (/^[A-Za-zก-๙]+[-/]?\d/.test(t) && /\d/.test(t) && /[A-Za-zก-๙]/.test(t)) return "มีตัวอักษรปนตัวเลข";
  if (/^\d+\/\d+/.test(t)) return "มีเครื่องหมายทับคั่น";
  return null;
}

const numFromText = (s) => {
  const t = thaiToArabicDigits(s).replace(/,/g, "").trim();
  return /^[+-]?\d*\.?\d+$/.test(t) ? Number(t) : null;
};

const atMidnight = (d) => d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0;

/** จัดชนิดของค่าหนึ่งช่อง คืน { kind, why } โดย kind ตรงกับ id ใน PQ_TYPES หรือ "blank" */
export function classifyCell(v) {
  if (isBlank(v)) return { kind: "blank" };
  if (typeof v === "boolean") return { kind: "logical" };
  if (v instanceof Date && !Number.isNaN(v.getTime()))
    return { kind: atMidnight(v) ? "date" : "datetime" };

  if (typeof v === "number" && Number.isFinite(v)) {
    // เลขบัตรประชาชนที่ถูกอ่านมาเป็นตัวเลขแล้ว ยังกู้ได้ถ้าเห็นความยาว 13 หลัก
    if (Number.isInteger(v) && String(Math.abs(v)).length === 13)
      return { kind: "text", why: "รูปแบบเลขบัตรประชาชน" };
    return { kind: Number.isInteger(v) ? "int64" : "number" };
  }

  const s = String(v).trim();
  const low = s.toLowerCase();
  if (TRUE_WORDS.has(low) || FALSE_WORDS.has(low)) return { kind: "logical" };

  /* ‼️ ลำดับตรงนี้สำคัญมาก ต้องตรวจของที่ "มีรูปแบบชัดเจน" ให้หมดก่อน
   * แล้วค่อยตกมาที่กฎ "ดูเหมือนรหัส" ซึ่งหลวมที่สุด ถ้าสลับลำดับ
   * วันที่ 15/01/2569 จะถูกจับเป็นบ้านเลขที่ และ ฿1,250 จะถูกจับเป็นรหัส
   * เพราะสัญลักษณ์บาทอยู่ในช่วงอักษรไทยพอดี (เจอจริงตอนเขียนเทสชุดนี้) */
  if (/%\s*$/.test(s) && numFromText(s.replace(/%\s*$/, "")) != null) return { kind: "percentage" };
  if (MONEY.test(s) && numFromText(s.replace(MONEY, "")) != null) return { kind: "currency" };

  // วันที่พร้อมเวลาและโซนเวลา แบบ ISO
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?\s*([+-]\d{2}:?\d{2}|Z)$/i.test(s))
    return { kind: "datetimezone" };
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) return { kind: "datetime" };

  // เวลา กับ ช่วงเวลา หน้าตาเหมือนกัน แยกด้วยจำนวนชั่วโมงและการมีส่วน "วัน" นำหน้า
  let m = /^(\d{1,3}):([0-5]\d)(:([0-5]\d))?$/.exec(s);
  if (m) return { kind: +m[1] <= 23 ? "time" : "duration" };
  if (/^\d+[.\s]\d{1,2}:[0-5]\d(:[0-5]\d)?$/.test(s)) return { kind: "duration" };

  const p = parseAnyDate(s);
  if (p && p.m != null && p.d != null) return { kind: "date" };

  const code = looksLikeCode(s);
  if (code) return { kind: "text", why: code };

  const n = numFromText(s);
  if (n != null) return { kind: Number.isInteger(n) ? "int64" : "number" };

  return { kind: "text" };
}

// ชนิดที่ปนกันแล้วยังฟันธงได้ (ตัวกว้างกว่าครอบตัวแคบกว่าได้พอดี)
const SAFE_MERGE = [
  [["int64", "number"], "number"],
  [["int64", "currency"], "currency"],
  [["number", "currency"], "currency"],
  [["date", "datetime"], "datetime"],
  [["date", "datetimezone"], "datetimezone"],
  [["datetime", "datetimezone"], "datetimezone"],
  [["time", "duration"], "duration"],
];

function mergeKinds(kinds) {
  if (kinds.size === 1) return [...kinds][0];
  for (const [set, out] of SAFE_MERGE) {
    if (kinds.size === set.length && set.every((k) => kinds.has(k))) return out;
  }
  return null;
}

/**
 * เดาชนิดของทั้งคอลัมน์
 * คืน { type, confidence: "high" | "medium" | "low", reason }
 */
export function guessColumnType(values) {
  const seen = new Map();      // ชนิด → จำนวนที่เจอ
  const whys = new Set();
  let filled = 0;
  for (const v of values) {
    const c = classifyCell(v);
    if (c.kind === "blank") continue;
    filled++;
    seen.set(c.kind, (seen.get(c.kind) || 0) + 1);
    if (c.why) whys.add(c.why);
  }

  if (!filled) {
    return { type: "text", confidence: "low",
             reason: tr("คอลัมน์นี้ว่างทั้งหมด เดาชนิดไม่ได้", "This column is empty, nothing to infer from") };
  }

  const kinds = new Set(seen.keys());
  const merged = mergeKinds(kinds);
  if (!merged) {
    // ‼️ ปนกันแบบที่ครอบกันไม่ได้ ต้องตกเป็นข้อความเสมอ ห้ามเลือกชนิดที่พบบ่อยสุด
    const list = [...kinds].join(", ");
    return { type: "text", confidence: "low",
             reason: tr(`ในคอลัมน์มีข้อมูลปนกันหลายแบบ (${list}) จึงเก็บเป็นข้อความไว้ก่อน`,
                        `Mixed kinds of data in this column (${list}), keeping it as text to be safe`) };
  }

  // ตกเป็นข้อความเพราะดูเหมือนรหัส ต้องบอกเหตุผลให้ผู้ใช้ตัดสินใจเองได้
  if (merged === "text" && whys.size) {
    return { type: "text", confidence: "medium",
             reason: tr(`ดูเหมือนรหัสมากกว่าตัวเลข (${[...whys].join(", ")}) ถ้าเป็นตัวเลขจริงให้เปลี่ยนเอง`,
                        `Looks like a code rather than a number (${[...whys].join(", ")}), change it if it really is a number`) };
  }

  // วันที่ที่กำกวมว่าเป็นวัน/เดือน หรือ เดือน/วัน ต้องเตือน เพราะเดาผิดแล้วผิดทั้งคอลัมน์
  if (merged === "date" || merged === "datetime") {
    const ambiguous = values.filter((v) => !isBlank(v)).every((v) => {
      if (v instanceof Date) return false;
      const t = thaiToArabicDigits(String(v)).trim();
      const m = /^(\d{1,2})[/-](\d{1,2})[/-]\d{2,4}$/.exec(t);
      return !!m && +m[1] <= 12 && +m[2] <= 12;
    });
    if (ambiguous) {
      return { type: merged, confidence: "medium",
               reason: tr("ทุกแถวมีทั้งวันและเดือนไม่เกิน 12 อ่านเป็น วัน/เดือน ให้ ตรวจดูอีกที",
                          "Every row has both parts under 13, read as day/month, please double-check") };
    }
  }

  // จำนวนเต็มที่ยาวผิดปกติ มักเป็นรหัสที่เผลอถูกอ่านเป็นตัวเลขมาตั้งแต่ต้นทาง
  if (merged === "int64") {
    const longOnes = values.filter((v) => !isBlank(v) &&
      String(typeof v === "number" ? Math.abs(v) : thaiToArabicDigits(String(v)).replace(/\D/g, "")).length >= 9);
    if (longOnes.length === filled) {
      return { type: "int64", confidence: "medium",
               reason: tr("ตัวเลขยาวผิดปกติ อาจเป็นรหัสหรือเบอร์โทรที่ควรเก็บเป็นข้อความ",
                          "Unusually long numbers, these may be codes or phone numbers better kept as text") };
    }
  }

  return { type: merged, confidence: "high", reason: "" };
}

/** เดาทั้งตารางทีเดียว คืนอาเรย์ตามลำดับคอลัมน์ */
export function guessTableTypes(header, rows) {
  return header.map((name, i) => ({ name, ...guessColumnType(rows.map((r) => r[i])) }));
}
