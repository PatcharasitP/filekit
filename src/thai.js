// ─────────────────────────────────────────────────────────────────────────────
// ตรรกะงานเอกสารภาษาไทย — ไม่แตะ DOM ไม่ใช้ไลบรารีนอกแม้แต่ตัวเดียว
// แยกไฟล์ไว้เพื่อทดสอบด้วย node ได้ตรง ๆ (tests/thai.test.mjs)
// ─────────────────────────────────────────────────────────────────────────────
import { tr } from "./i18n.js";

/* ══ ส่วนที่ 1 · การเข้ารหัสอักขระ (encoding) ═══════════════════════════════ */

export const ENC_LABEL = {
  "utf-8": "UTF-8",
  "windows-874": tr("TIS-620 / Windows-874 (ไทยเก่า)", "TIS-620 / Windows-874 (legacy Thai)"),
  "utf-16le": "UTF-16 LE",
  "utf-16be": "UTF-16 BE",
  "latin1": "ISO-8859-1 (Latin-1)",
};

const BOMS = [
  { enc: "utf-8", bytes: [0xef, 0xbb, 0xbf] },
  { enc: "utf-16le", bytes: [0xff, 0xfe] },
  { enc: "utf-16be", bytes: [0xfe, 0xff] },
];

export function detectBOM(u8) {
  for (const b of BOMS)
    if (u8.length >= b.bytes.length && b.bytes.every((v, i) => u8[i] === v))
      return { enc: b.enc, skip: b.bytes.length };
  return null;
}

export function stripBOM(u8) {
  const b = detectBOM(u8);
  return { body: b ? u8.subarray(b.skip) : u8, bom: b ? b.enc : null };
}

export function decodeBytes(u8, enc) {
  return new TextDecoder(enc).decode(stripBOM(u8).body);
}

// สร้างตาราง "ตัวอักษร → ไบต์"ย้อนกลับจาก TextDecoder เอง
// (JS มี TextEncoder แค่ UTF-8 จึงต้องกลับตารางเอง — ทำครั้งเดียวแล้วจำไว้)
const _encoders = new Map();
export function encoderFor(enc) {
  // latin1 จับคู่ไบต์ 0x00–0xFF กับจุดรหัสตรงตัวทุกตัว รวมช่วง 0x80–0x9F ที่ตาราง
  // windows-1252 ไม่ได้จับคู่ไว้ — โปรแกรมเก่า/สคริปต์ฝั่งเซิร์ฟเวอร์มักอ่านผิดแบบนี้
  // (TextDecoder ทำ latin1 แท้ ๆ ให้ไม่ได้ เพราะมาตรฐานให้ชื่อนี้ชี้ไป windows-1252)
  if (enc === "latin1")
    return { get: (ch) => { const c = ch.codePointAt(0); return c < 256 ? c : undefined; } };
  if (_encoders.has(enc)) return _encoders.get(enc);
  const dec = new TextDecoder(enc);
  const m = new Map();
  for (let b = 0; b < 256; b++) {
    const ch = dec.decode(Uint8Array.of(b));
    if (ch && ch !== "�" && !m.has(ch)) m.set(ch, b);
  }
  _encoders.set(enc, m);
  return m;
}

export function scoreText(s) {
  let thai = 0, ascii = 0, bad = 0, other = 0, ctrl = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c === 0xfffd) bad++;
    else if (c >= 0x0e00 && c <= 0x0e7f) thai++;
    else if (c === 9 || c === 10 || c === 13) ascii++;
    else if (c < 32) ctrl++;
    else if (c < 128) ascii++;
    else other++;
  }
  return { thai, ascii, bad, other, ctrl,
    total: thai + ascii + bad + other + ctrl,
    score: thai * 3 + ascii * 0.2 - bad * 12 - other * 2 - ctrl * 8 };
}

// ลายเซ็นของ "ไทยเพี้ยนซ้อน 2 ชั้น": UTF-8 ของอักษรไทยคือ E0 B8 xx / E0 B9 xx
//  · อ่านผิดด้วยตาราง 874  → เธ / เน   (เช่น "เธชเธงเธฑเธชเธ”เธต")
//  · อ่านผิดด้วยตาราง 1252 → à¸ / à¹  (เช่น "à¸ªà¸§à¸±")
export function looksDoubleEncoded(s) {
  const marks =
    (s.match(/เ[ธน]/g) || []).length +
    (s.match(/à[¸¹]/g) || []).length;
  if (!marks) return false;
  const letters = (s.match(/[^\s\d\p{P}\p{S}]/gu) || []).length || 1;
  return (marks * 2) / letters > 0.4;
}

// แกะการเข้ารหัสซ้อน: เอาตัวอักษรกลับเป็นไบต์เดิม แล้วอ่านใหม่แบบ UTF-8
export function undoDoubleEncode(text) {
  for (const enc of ["windows-874", "windows-1252", "latin1"]) {
    const map = encoderFor(enc);
    const bytes = [];
    let ok = true;
    for (const ch of text) {
      const b = map.get(ch);
      if (b === undefined) { ok = false; break; }
      bytes.push(b);
    }
    if (!ok) continue;
    try {
      const out = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
      if (/[฀-๿]/.test(out)) return { text: out, via: enc };
    } catch { /* ไม่ใช่ UTF-8 ที่ถูกต้อง → ไม่ใช่เคสนี้ */ }
  }
  return null;
}

// ตัด byte ท้ายที่เป็นลำดับ UTF-8 ครึ่ง ๆ กลาง ๆ จากการหั่นตัวอย่าง (ไม่งั้นตรวจ UTF-8 ตกทั้งที่ไฟล์ดี)
function trimUtf8Tail(u8, truncated) {
  if (!truncated) return u8;
  let end = u8.length, back = 0;
  while (end > 0 && back < 4 && (u8[end - 1] & 0xc0) === 0x80) { end--; back++; }
  if (end > 0 && (u8[end - 1] & 0xc0) === 0xc0) end--;
  return u8.subarray(0, end);
}

export function isStrictUtf8(u8) {
  try { new TextDecoder("utf-8", { fatal: true }).decode(u8); return true; }
  catch { return false; }
}

// ‼️ ห้ามตัดสินด้วย "คะแนนว่าดูเป็นไทยแค่ไหน" — ไบต์ UTF-8 ของอักษรไทย 1 ตัวยาว 3 ไบต์
// พออ่านด้วยตาราง 874 จะกลายเป็นอักษรไทย 3 ตัว ทำให้ไฟล์ UTF-8 ที่ดีอยู่แล้ว "ดูเป็นไทยมากกว่า"
// เมื่ออ่านผิด → ต้องใช้กฎเรียงชั้นที่ตัดสินได้แน่นอนแทน (UTF-8 ตรวจสอบความถูกต้องตัวเองได้)
export function analyzeBytes(u8, sampleBytes = 65536) {
  const truncated = u8.length > sampleBytes;
  const raw = u8.subarray(0, Math.min(u8.length, sampleBytes));
  const { body: afterBom, bom } = stripBOM(raw);
  const body = trimUtf8Tail(afterBom, truncated);

  const cands = [];
  for (const enc of ["utf-8", "windows-874", "utf-16le", "utf-16be"]) {
    let text;
    try { text = new TextDecoder(enc).decode(body); } catch { continue; }
    cands.push({ enc, undo: false, label: ENC_LABEL[enc], text, ...scoreText(text) });
  }

  let pickEnc, why;
  if (bom) {
    pickEnc = bom; why = tr(`ไฟล์มีเครื่องหมาย BOM ระบุว่าเป็น ${ENC_LABEL[bom]}`, `The file has a BOM marker identifying it as ${ENC_LABEL[bom]}`);
  } else {
    let nul = 0, nulOdd = 0;
    for (let i = 0; i < body.length; i++) if (body[i] === 0) { nul++; if (i % 2) nulOdd++; }
    if (body.length && nul / body.length > 0.1) {
      pickEnc = nulOdd * 2 > nul ? "utf-16le" : "utf-16be";
      why = tr("พบไบต์ศูนย์แทรกทุกตัวอักษร = เป็นไฟล์ UTF-16", "Zero bytes between every character = this is a UTF-16 file");
    } else if (isStrictUtf8(body)) {
      pickEnc = "utf-8"; why = tr("ถอดแบบ UTF-8 เข้มงวดผ่านครบทุกไบต์", "Strict UTF-8 decoding passed for every byte");
    } else {
      pickEnc = "windows-874"; why = tr("ถอดแบบ UTF-8 ไม่ผ่าน แต่ไบต์ตรงช่วงอักษรไทยของตาราง TIS-620", "UTF-8 decoding failed, but the bytes match the Thai range of the TIS-620 table");
    }
  }

  let best = cands.find((c) => c.enc === pickEnc) || cands[0] || null;
  // ชั้นสุดท้าย: เป็น UTF-8 ที่ถูกต้องอยู่แล้ว แต่เนื้อในเป็นไทยที่เคยถูกอ่านผิดมาก่อน (เพี้ยนซ้อน)
  if (best && best.enc === "utf-8" && looksDoubleEncoded(best.text)) {
    const fixed = undoDoubleEncode(best.text);
    if (fixed) {
      best = { enc: "utf-8", undo: true, via: fixed.via, text: fixed.text,
        label: tr(`UTF-8 ที่เคยถูกอ่านผิดเป็น ${ENC_LABEL[fixed.via] || fixed.via}`, `UTF-8, previously misread as ${ENC_LABEL[fixed.via] || fixed.via}`),
        ...scoreText(fixed.text) };
      why = tr("ไฟล์เป็น UTF-8 ที่ถูกต้อง แต่ข้างในเป็นภาษาไทยที่เคยถูกอ่านผิดแล้วบันทึกซ้ำ",
              "The file is valid UTF-8, but the Thai text inside was misread once before and saved again");
      cands.unshift(best);
    }
  }
  const rest = cands.filter((c) => c !== best).sort((a, b) => b.score - a.score);
  return { bom, why, best, candidates: best ? [best, ...rest] : rest };
}

// อ่านไฟล์ข้อความให้ออกโดยเดาการเข้ารหัสเอง (ใช้ร่วมกับ CSV ทุกเครื่องมือ)
export function smartDecode(u8) {
  const a = analyzeBytes(u8);
  if (!a.best) return { text: "", enc: "utf-8", undo: false, why: tr("ไฟล์ว่าง", "Empty file") };
  const full = decodeBytes(u8, a.best.enc);
  if (a.best.undo) {
    const fixed = undoDoubleEncode(full);
    if (fixed) return { text: fixed.text, enc: a.best.enc, undo: true, via: fixed.via, why: a.why };
  }
  return { text: full, enc: a.best.enc, undo: false, why: a.why };
}

/* ══ ส่วนที่ 2 · ตัวเลขไทย ═══════════════════════════════════════════════════ */

const TH_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
export const thaiToArabicDigits = (s) =>
  String(s ?? "").replace(/[๐-๙]/g, (c) => String(TH_DIGITS.indexOf(c)));
export const arabicToThaiDigits = (s) =>
  String(s ?? "").replace(/[0-9]/g, (c) => TH_DIGITS[+c]);

/* ══ ส่วนที่ 3 · วันที่ไทย (พ.ศ. ⇄ ค.ศ.) ══════════════════════════════════ */

export const TH_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
                          "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
export const TH_ABBR = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.",
                        "ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

const MONTHS = (() => {
  const m = new Map();
  const put = (k, i) => m.set(String(k).replace(/[\s.]/g, "").toUpperCase(), i);
  TH_MONTHS.forEach(put);
  TH_ABBR.forEach(put);
  ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE",
   "JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"].forEach((n, i) => { put(n, i); put(n.slice(0, 3), i); });
  return m;
})();

function monthIndex(tok) {
  const t = String(tok).replace(/[\s.]/g, "").toUpperCase();
  if (!t) return null;
  if (MONTHS.has(t)) return MONTHS.get(t);
  if (t.length > 3 && MONTHS.has(t.slice(0, 3))) return MONTHS.get(t.slice(0, 3));
  return null;
}

export function excelSerialToParts(n) {
  const dt = new Date(Math.round((n - 25569) * 86400000));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

// คืน { y, m, d, guessedYear }  · m/d เป็น null ได้ถ้าต้นทางมีแค่ปี หรือเดือน+ปี
export function parseAnyDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v))
    return { y: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate() };
  if (typeof v === "number" && isFinite(v)) {
    // 1000–2600 = ตีความว่าเป็น "ปี"ไม่ใช่เลขลำดับวันของ Excel
    // (เลขลำดับช่วงนี้คือปี ค.ศ. 1902–1907 ซึ่งแทบไม่มีในงานจริง แต่คอลัมน์ปีมีเยอะมาก)
    if (v >= 1000 && v <= 2600 && Number.isInteger(v)) return { y: v, m: null, d: null };
    if (v > 0 && v < 2958466) return excelSerialToParts(v);
    return null;
  }
  let s = thaiToArabicDigits(String(v)).trim().replace(/\s+/g, " ");
  if (!s) return null;
  s = s.replace(/^(วันที่|ณ\s*วันที่)\s*/i, "").replace(/\s*(พ\.?ศ\.?|ค\.?ศ\.?)\s*/gi, " ").trim();
  let m;
  // 15 มกราคม 2569 · 15 ม.ค. 69 · 15 Jan 2026
  if ((m = s.match(/^(\d{1,2})\s*[\s/-]\s*([^\d\s/-][^\d]*?)\s*[\s/-]\s*(\d{2,4})$/))) {
    const mi = monthIndex(m[2]);
    if (mi != null) return withYear(+m[3], { m: mi + 1, d: +m[1] });
  }
  // มกราคม 2569 (ไม่มีวัน)
  if ((m = s.match(/^([^\d\s/-][^\d]*?)\s*[\s/-]\s*(\d{2,4})$/))) {
    const mi = monthIndex(m[1]);
    if (mi != null) return withYear(+m[2], { m: mi + 1, d: null });
  }
  // 2569-01-15
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)))
    return withYear(+m[1], { m: +m[2], d: +m[3] });
  // 15/01/2569
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)))
    return withYear(+m[3], { m: +m[2], d: +m[1] });
  // 01/2569
  if ((m = s.match(/^(\d{1,2})[-/.](\d{4})$/))) return withYear(+m[2], { m: +m[1], d: null });
  // 2569
  if ((m = s.match(/^(\d{4})$/))) return withYear(+m[1], { m: null, d: null });
  return null;
}

function withYear(y, rest) {
  let guessedYear = false;
  if (y < 100) { y = 2500 + y; guessedYear = true; } // "69" → เดาว่า พ.ศ. 2569
  if (rest.m != null && (rest.m < 1 || rest.m > 12)) return null;
  if (rest.d != null && (rest.d < 1 || rest.d > 31)) return null;
  return { y, ...rest, guessedYear };
}

export const isBE = (y) => y >= 2400;
export const toCE = (y) => (y >= 2400 ? y - 543 : y);
export const toBE = (y) => (y < 2400 ? y + 543 : y);

export function formatDate(p, fmt) {
  if (!p) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const { y, m, d } = p;
  if (m == null) return String(y);
  if (d == null) {
    if (fmt === "thfull") return `${TH_MONTHS[m - 1]} ${y}`;
    if (fmt === "thabbr") return `${TH_ABBR[m - 1]} ${y}`;
    if (fmt === "iso") return `${y}-${pad(m)}`;
    return `${pad(m)}/${y}`;
  }
  switch (fmt) {
    case "iso": return `${y}-${pad(m)}-${pad(d)}`;
    case "thfull": return `${d} ${TH_MONTHS[m - 1]} ${y}`;
    case "thabbr": return `${d} ${TH_ABBR[m - 1]} ${y}`;
    default: return `${pad(d)}/${pad(m)}/${y}`;
  }
}

/* ══ ส่วนที่ 4 · เลขบัตรประชาชน / เลขประจำตัวผู้เสียภาษี 13 หลัก ═══════════ */

export function checkThaiId13(raw) {
  const s = thaiToArabicDigits(String(raw ?? "")).replace(/[\s\-.]/g, "");
  if (!s) return { ok: false, empty: true, reason: tr("ไม่มีข้อมูล", "No data"), digits: "" };
  if (!/^\d+$/.test(s)) return { ok: false, reason: tr("มีตัวอักษรอื่นปนอยู่", "Contains non-digit characters"), digits: s };
  if (s.length !== 13) return { ok: false, reason: tr(`มี ${s.length} หลัก (ต้องมี 13 หลัก)`, `Has ${s.length} digits (needs 13)`), digits: s };
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += +s[i] * (13 - i);
  const chk = (11 - (sum % 11)) % 10;
  if (chk !== +s[12])
    return { ok: false, reason: tr(`หลักสุดท้ายควรเป็น ${chk} แต่เป็น ${s[12]}`, `Last digit should be ${chk} but is ${s[12]}`), digits: s, expect: chk };
  return { ok: true, digits: s };
}

export const formatThaiId = (d) =>
  String(d).length === 13 ? `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}` : String(d);

/* ══ ส่วนที่ 5 · ตัวเลข → คำอ่านภาษาไทย / บาทถ้วน ═════════════════════════ */

const N_WORDS = ["ศูนย์","หนึ่ง","สอง","สาม","สี่","ห้า","หก","เจ็ด","แปด","เก้า"];
const N_UNITS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

// อ่านเลขไม่เกิน 6 หลัก · hasHigher = มีหลักที่สูงกว่านำหน้าอยู่ (คุมการใช้ "เอ็ด")
function readGroup(s, hasHigher) {
  s = s.replace(/^0+/, "");
  if (!s) return "";
  let out = "";
  const L = s.length;
  for (let i = 0; i < L; i++) {
    const d = +s[i], pos = L - 1 - i;
    if (!d) continue;
    if (pos === 0) out += d === 1 && (L > 1 || hasHigher) ? "เอ็ด" : N_WORDS[d];
    else if (pos === 1) out += d === 1 ? "สิบ" : d === 2 ? "ยี่สิบ" : N_WORDS[d] + "สิบ";
    else out += N_WORDS[d] + N_UNITS[pos];
  }
  return out;
}

export function readThaiInteger(digits, hasHigher = false) {
  let s = String(digits).replace(/\D/g, "").replace(/^0+/, "");
  if (!s) return hasHigher ? "" : "ศูนย์";
  if (s.length > 6) {
    const head = s.slice(0, s.length - 6), tail = s.slice(-6);
    return readThaiInteger(head, hasHigher) + "ล้าน" + readGroup(tail, true);
  }
  return readGroup(s, hasHigher);
}

// 1234.5 → "หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์"
export function bahtText(value) {
  let n = typeof value === "number" ? value : parseFloat(thaiToArabicDigits(String(value ?? "")).replace(/[,\s฿]/g, ""));
  if (!isFinite(n)) return null;
  const neg = n < 0;
  n = Math.abs(n);
  const total = Math.round(n * 100);
  const baht = Math.floor(total / 100), satang = total % 100;
  let out = "";
  if (baht === 0 && satang === 0) out = "ศูนย์บาทถ้วน";
  else {
    if (baht > 0) out += readThaiInteger(baht) + "บาท";
    out += satang === 0
      ? "ถ้วน"
      : (baht === 0 ? "" : "") + readGroup(String(satang).padStart(2, "0"), false) + "สตางค์";
  }
  return (neg ? "ลบ" : "") + out;
}
