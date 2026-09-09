// ── ฟอนต์ไทยสำหรับ jsPDF ───────────────────────────────────────────────────
// ฟอนต์ในตัวของ jsPDF ครอบคลุมแค่ WinAnsi (ละติน) ถ้าไม่ฝังฟอนต์ไทยก่อน
// ข้อความไทยจะกลายเป็นสี่เหลี่ยมว่างทั้งหมด
//
// เราใช้ Sarabun ที่ตัดเหลือเฉพาะช่วงอักขระที่ใช้จริง (ไทย + ละติน + เครื่องหมาย)
// เหลือไฟล์ละ ~45 KB จากต้นฉบับ ~90 KB และโหลดจากโดเมนเดียวกันครั้งเดียว
// แล้วเก็บไว้ใช้ซ้ำทั้ง session

import { tr } from "./i18n.js";

const FILES = {
  normal: { path: "vendor/fonts/Sarabun-Regular-th.ttf", vfs: "Sarabun-Regular.ttf" },
  bold:   { path: "vendor/fonts/Sarabun-Bold-th.ttf",    vfs: "Sarabun-Bold.ttf" },
};
export const THAI_FONT = "Sarabun";

const cache = new Map(); // path -> Promise<base64>

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  const CHUNK = 0x8000; // แปลงเป็นก้อน กัน stack ล้นเมื่อไฟล์ใหญ่
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

function fetchFont(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(path).then((r) => {
      if (!r.ok) throw new Error(tr(`โหลดฟอนต์ไม่สำเร็จ (${r.status})`, `Failed to load font (${r.status})`));
      return r.arrayBuffer();
    }).then(toBase64).catch((e) => { cache.delete(path); throw e; }));
  }
  return cache.get(path);
}

/** ฝังฟอนต์ไทยลงเอกสาร jsPDF แล้วตั้งเป็นฟอนต์ปัจจุบัน */
export async function useThaiFont(doc, style = "normal") {
  const specs = style === "both" ? ["normal", "bold"] : [style];
  for (const s of specs) {
    const { path, vfs } = FILES[s];
    doc.addFileToVFS(vfs, await fetchFont(path));
    doc.addFont(vfs, THAI_FONT, s);
  }
  doc.setFont(THAI_FONT, specs[0]);
  return THAI_FONT;
}

/** เริ่มโหลดฟอนต์ไว้ล่วงหน้าเงียบ ๆ (เรียกตอนผู้ใช้เปิดเครื่องมือ) */
export function warmThaiFont() {
  Object.values(FILES).forEach(({ path }) => fetchFont(path).catch(() => {}));
}

/* ‼️ jsPDF ตัดบรรทัดด้วย text.split(" ") เท่านั้น (อ่านจากตัวบันเดิลที่ใช้อยู่จริง)
 * ภาษาไทยไม่เว้นวรรคระหว่างคำ ทั้งย่อหน้าจึงถูกนับเป็น "คำเดียว" แล้วโดนหั่นตามความกว้าง
 * ตรงไหนก็ได้ · วัดจริง 09/09/2026 จากไฟล์ .docx ไทย: "และ" ถูกฉีกเป็น "แล" ท้ายบรรทัด
 * กับ "ะ" ต้นบรรทัดถัดไป และ "ค่าใช้จ่าย" ถูกฉีกจนค้นหาใน PDF ไม่เจอเลย (0 ผลลัพธ์)
 * ซึ่งไม่ใช่แค่ดูไม่สวย แต่ทำให้ค้นหา/คัดลอกข้อความจากเอกสารที่เราสร้างไม่ได้จริง
 *
 * แก้โดยตัดคำเองด้วย Intl.Segmenter ของเบราว์เซอร์ (ของที่มีอยู่แล้ว ไม่ต้องเพิ่มไลบรารี)
 * แล้วต่อคำจนเต็มบรรทัด · เบราว์เซอร์ที่ไม่มี Intl.Segmenter จะตกกลับไปใช้วิธีเดิม
 * (เท่าเดิม ไม่ได้แย่ลง) เช่นเดียวกับข้อความที่ไม่มีอักษรไทยเลย */
const THAI_LETTER = /[฀-๿]/;
let segmenterCache;

function thaiWordSegmenter() {
  if (segmenterCache === undefined) {
    try { segmenterCache = new Intl.Segmenter("th", { granularity: "word" }); }
    catch { segmenterCache = null; }
  }
  return segmenterCache;
}

// วัดความกว้างซ้ำ ๆ ทีละคำแพงเกินจำเป็น เอกสารไทยใช้คำเดิมซ้ำเยอะมาก จึงจำค่าไว้
const widthCache = new Map();
function wordWidth(doc, w) {
  const key = `${doc.getFont().fontName}|${doc.getFontSize()}|${w}`;
  let v = widthCache.get(key);
  if (v === undefined) {
    v = doc.getTextWidth(w);
    if (widthCache.size > 4000) widthCache.clear();   // กันบวมในเอกสารยาวมาก
    widthCache.set(key, v);
  }
  return v;
}

/* ‼️ คำเดียวที่ยาวเกินความกว้างของคอลัมน์ (เช่นคอลัมน์แคบใน Excel) เลี่ยงการหั่นกลางคำไม่ได้
 * แต่ยังห้ามหั่นตรงที่ผิดรูปภาษา · กฎที่ตัดสินได้แน่นอนโดยไม่ต้องมีพจนานุกรม:
 *   · สระนำ เ แ โ ใ ไ เขียนไว้หน้าพยัญชนะ จึงเป็นตัวท้ายบรรทัดไม่ได้
 *   · สระบน/ล่าง วรรณยุกต์ ทัณฑฆาต และสระ ะ า ำ ต้องเกาะพยัญชนะที่มาก่อน จึงขึ้นต้นบรรทัดไม่ได้
 * (วัดจริง 09/09/2026: ไม่มีกฎนี้แล้ว "สำนักงานใหญ่" ถูกหั่นเป็น "สำนักง" กับ "านใหญ่") */
const CANNOT_START_LINE = "ะัาำิีึืุู็่้๊๋์ํๆฺๅ";
const CANNOT_END_LINE = "เแโใไ";

const canBreakAt = (s, i) =>
  i > 0 && i < s.length && !CANNOT_START_LINE.includes(s[i]) && !CANNOT_END_LINE.includes(s[i - 1]);

function hardSplitThai(doc, word, maxWidth, k) {
  const out = [];
  let start = 0;
  while (start < word.length) {
    let end = start + 1;
    while (end <= word.length && doc.getTextWidth(word.slice(start, end)) * k <= maxWidth) end++;
    if (end > word.length) { out.push(word.slice(start)); break; }
    let cut = end - 1;                               // ตัวสุดท้ายที่ยังกว้างพอดี
    while (cut > start + 1 && !canBreakAt(word, cut)) cut--;
    if (cut <= start) cut = start + 1;               // หาจุดตัดที่ถูกกฎไม่ได้จริง ๆ ก็ต้องตัด
    out.push(word.slice(start, cut));
    start = cut;
  }
  return out.length ? out : [word];
}

/** ซอยข้อความเป็นชิ้นตามขอบเขตคำ (ไทยใช้ Intl.Segmenter, ภาษาอื่นแยกที่ช่องว่าง)
 *  ใช้เมื่อผู้เรียกต้องจัดบรรทัดเอง เช่นย่อหน้าที่มีตัวหนาสลับตัวธรรมดากลางประโยค */
export function textChunks(text) {
  const s = String(text ?? "");
  if (!s) return [];
  const seg = THAI_LETTER.test(s) ? thaiWordSegmenter() : null;
  if (seg) return [...seg.segment(s)].map((x) => x.segment);
  return s.split(/(\s+)/).filter((x) => x !== "");
}

/** ตัดบรรทัดแบบไม่ฉีกคำไทย — ใช้แทน doc.splitTextToSize() ได้ตรง ๆ (คืนอาเรย์ของบรรทัด)
 *  opts.fallback  ตัวตัดบรรทัดเดิมที่จะใช้เมื่อไม่ใช่ข้อความไทย (ต้องส่งมาถ้าไป
 *                 สลับ doc.splitTextToSize ไว้ ไม่งั้นจะเรียกวนหาตัวเอง)
 *  opts.fontSize  ขนาดตัวอักษรที่ผู้เรียกจะใช้จริง ถ้าไม่ตรงกับที่ตั้งอยู่ในเอกสาร */
export function splitThaiTextToSize(doc, text, maxWidth, opts = {}) {
  const fallback = opts.fallback || ((t, w) => doc.splitTextToSize(t, w));
  const s = String(text ?? "");
  const seg = THAI_LETTER.test(s) ? thaiWordSegmenter() : null;
  if (!seg || !(maxWidth > 0)) return fallback(s, maxWidth);
  const k = opts.fontSize ? opts.fontSize / (doc.getFontSize() || opts.fontSize) : 1;

  const out = [];
  for (const para of s.split(/\r\n|\r|\n/)) {
    if (!para.trim()) { out.push(""); continue; }
    let line = "", lineW = 0, pushed = 0;
    for (const { segment: w } of seg.segment(para)) {
      const ww = wordWidth(doc, w) * k;
      if (line && lineW + ww > maxWidth) {
        out.push(line); pushed++;
        line = ""; lineW = 0;
        if (!w.trim()) continue;          // ช่องว่างต้นบรรทัดใหม่ไม่มีประโยชน์ ตัดทิ้ง
      }
      if (!line && ww > maxWidth) {
        // คำเดียวยาวเกินบรรทัด (เช่น URL หรือคำทับศัพท์ยาว ๆ) จำเป็นต้องหั่นตามความกว้าง
        const parts = hardSplitThai(doc, w, maxWidth, k);
        for (let i = 0; i < parts.length - 1; i++) { out.push(parts[i]); pushed++; }
        line = parts[parts.length - 1] || "";
        lineW = line ? wordWidth(doc, line) * k : 0;
        continue;
      }
      line += w; lineW += ww;
    }
    if (line) out.push(line);
    else if (!pushed) out.push("");
  }
  return out;
}
