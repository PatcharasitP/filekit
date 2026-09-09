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

/* ── วรรณยุกต์ที่ต้องซ้อนบนสระบน ──────────────────────────────────────────────
 * jsPDF ไม่ทำ mark positioning ของ OpenType เลย (หา GPOS/GSUB/mkmk ในตัวบันเดิล
 * ไม่เจอสักคำ) · สระบนกับวรรณยุกต์ต่างก็มีความกว้าง 0 และถูกออกแบบให้ลอยอยู่เหนือ
 * พยัญชนะที่ความสูงเดียวกัน จึงถูกวาดทับกันสนิทเมื่อต้องอยู่ด้วยกัน
 * วัดจริง 09/09/2026 (word-to-pdf ไฟล์ .docx ไทย): "ที่นี่ พี่ชาย" ออกมาเป็น
 * "ทีนี พีชาย" ไม้เอกจมหายไปในสระอี · "เสื้อ หนึ่ง ผึ้ง" กลายเป็นก้อนดำอ่านไม่ออก
 *
 * แก้ด้วยตัวดำเนินการ Ts (text rise) ของ PDF เอง ยกเฉพาะรูปวรรณยุกต์ขึ้นไปวาง
 * เหนือสระ · ‼️ ต้องเป็น Ts ห้ามใช้วิธีวาดวรรณยุกต์ที่พิกัด y ใหม่ เพราะ Ts ยัง
 * นับเป็นบรรทัดและลำดับเดิม ข้อความจึงค้นหา/คัดลอกได้ครบ (วัดจริง: วิธีวาดที่ y
 * ใหม่ทำให้ค้นคำว่า "ที่นี่" ในไฟล์ผลลัพธ์ไม่เจอ และวรรณยุกต์ไปกองท้ายหน้า)
 *
 * ระยะยกมาจากการวัดตำแหน่งที่เบราว์เซอร์วางจริงทีละคู่ (เบราว์เซอร์ทำ shaping
 * เต็มรูปแบบ ถือเป็นคำตอบที่ถูก) ไม่ใช่อ่านจากตาราง mkmk ตรง ๆ เพราะฟอนต์มี GSUB
 * สลับไปใช้รูปวรรณยุกต์สำหรับซ้อนโดยเฉพาะ ค่าจากตารางดิบจึงสูงเกินจริง ~80/1000 em
 * สคริปต์วัดซ้ำได้ที่ tests/calibrate_thai_marks.py (รันใหม่เมื่อเปลี่ยนฟอนต์) */
const UPPER_VOWELS = "ัิีึื็ํ";
const TONE_MARKS = "่้๊๋์";
/* สระอำ (ำ) เป็นอักขระเต็มที่มีนิคหิตอยู่ในตัว วรรณยุกต์จึงเขียนไว้ "ก่อน" มัน
 * และไปทับวงกลมของ ำ พอดี (วัดจริง: "ค่ำ" เหลือแต่วงกลม ไม้เอกจมหายไป)
 * ระยะยกที่วัดได้เท่ากับกรณีนิคหิตเดี่ยว จึงใช้ตารางช่อง "ํ" ร่วมกัน */
const SARA_AM = "ำ";
const HAS_STACKED_MARK = /[ัิีึื็ํ][่้๊๋์]|[่้๊๋์][ัิีึื็ํำ]/;

// [เลื่อนแนวนอน, ยกขึ้น] หน่วย 1/1000 em — วัดจากเบราว์เซอร์ ดูหัวข้อด้านบน
const MARK_LIFT = {
  normal: {
    "ั": { "่": [-12, 276], "้": [14, 272], "๊": [74, 270], "๋": [0, 281], "์": [-9, 250] },
    "ิ": { "่": [-6, 264], "้": [20, 260], "๊": [72, 258], "๋": [-6, 251], "์": [-1, 260] },
    "ี": { "่": [-6, 308], "้": [20, 305], "๊": [72, 302], "๋": [-6, 291], "์": [-1, 305] },
    "ึ": { "่": [-14, 302], "้": [12, 300], "๊": [65, 298], "๋": [-14, 298], "์": [-9, 300] },
    "ื": { "่": [-64, 308], "้": [-38, 305], "๊": [15, 302], "๋": [-64, 291], "์": [-59, 305] },
    "็": { "่": [-162, 385], "้": [-136, 382], "๊": [-100, 380], "๋": [-164, 390], "์": [-159, 382] },
    "ํ": { "่": [-21, 238], "้": [6, 249], "๊": [86, 250], "๋": [-21, 241], "์": [-16, 250] },
  },
  bold: {
    "ั": { "่": [-19, 294], "้": [5, 290], "๊": [60, 285], "๋": [9, 298], "์": [-18, 258] },
    "ิ": { "่": [1, 291], "้": [24, 288], "๊": [69, 282], "๋": [2, 295], "์": [2, 286] },
    "ี": { "่": [66, 324], "้": [41, 320], "๊": [86, 315], "๋": [20, 328], "์": [22, 319] },
    "ึ": { "่": [4, 336], "้": [26, 332], "๊": [71, 328], "๋": [5, 345], "์": [8, 331] },
    "ื": { "่": [-15, 324], "้": [-31, 320], "๊": [14, 315], "๋": [-52, 328], "์": [-52, 319] },
    "็": { "่": [-159, 402], "้": [-135, 400], "๊": [-116, 395], "๋": [-158, 408], "์": [-161, 401] },
    "ํ": { "่": [-11, 252], "้": [12, 270], "๊": [88, 271], "๋": [-10, 258], "์": [-8, 271] },
  },
};

function liftFor(style, vowel, tone) {
  const byVowel = MARK_LIFT[style] || MARK_LIFT.normal;
  const pair = byVowel[vowel];
  return (pair && pair[tone]) || null;
}

/** วาดข้อความหนึ่งบรรทัด โดยยกวรรณยุกต์ที่ซ้อนบนสระบนขึ้นไปวางให้ถูกที่ */
function drawStackedLine(doc, text, x, y, opts, orig) {
  const sf = doc.internal.scaleFactor || 1;
  const size = doc.getFontSize();
  const style = doc.getFont().fontStyle === "bold" ? "bold" : "normal";
  const unit = size / 1000 / sf;                    // 1 หน่วยฟอนต์ = กี่หน่วยเอกสาร
  const align = opts && opts.align;
  // jsPDF จัดชิดขวา/กึ่งกลางให้เอง แต่เราต้องรู้ขอบซ้ายจริงเพื่อวางวรรณยุกต์ทีละตัว
  let penX = x;
  if (align === "center") penX = x - doc.getTextWidth(text) / 2;
  else if (align === "right") penX = x - doc.getTextWidth(text);
  const rest = Object.assign({}, opts || {});
  delete rest.align;

  let chunk = "";
  const flush = () => {
    if (!chunk) return;
    orig.call(doc, chunk, penX, y, rest);
    penX += doc.getTextWidth(chunk);
    chunk = "";
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    let vowel = null;
    if (TONE_MARKS.includes(ch)) {
      // รองรับทั้งลำดับปกติ (สระแล้ววรรณยุกต์) และลำดับกลับที่พบในไฟล์จริงบางฉบับ
      if (UPPER_VOWELS.includes(text[i - 1])) vowel = text[i - 1];
      else if (UPPER_VOWELS.includes(text[i + 1])) vowel = text[i + 1];
      else if (text[i + 1] === SARA_AM) vowel = "ํ";
    }
    const lift = vowel ? liftFor(style, vowel, ch) : null;
    if (!lift) { chunk += ch; continue; }
    flush();
    doc.internal.write((lift[1] * size / 1000).toFixed(2) + " Ts");
    orig.call(doc, ch, penX + lift[0] * unit, y, rest);
    doc.internal.write("0 Ts");
  }
  flush();
  return doc;
}

/** ครอบ doc.text ของเอกสารนี้ให้จัดวรรณยุกต์ซ้อนเองทุกครั้ง
 *  ‼️ ครอบที่ doc.text จุดเดียวแทนการไล่แก้ทีละเครื่องมือ เพราะ autoTable
 *  (excel-to-pdf) วาดข้อความในเซลล์ผ่าน doc.text ของตัวเองที่เราแตะไม่ถึง */
function patchThaiText(doc) {
  if (doc.__thaiMarkPatched) return;
  doc.__thaiMarkPatched = true;
  const orig = doc.text;
  doc.text = function (text, x, y, opts) {
    // กรณีที่เราคำนวณตำแหน่งเองไม่ได้ ปล่อยให้ของเดิมทำงานตามปกติ (ไม่แย่ลงกว่าเดิม)
    if (opts && (opts.angle != null || opts.maxWidth != null || opts.rotationDirection != null)) {
      return orig.apply(this, arguments);
    }
    if (Array.isArray(text)) {
      if (!text.some((t) => HAS_STACKED_MARK.test(String(t)))) return orig.apply(this, arguments);
      const lh = doc.getLineHeight() / (doc.internal.scaleFactor || 1);
      text.forEach((line, i) => { doc.text(String(line), x, y + i * lh, opts); });
      return doc;
    }
    const s = String(text == null ? "" : text);
    if (!HAS_STACKED_MARK.test(s)) return orig.apply(this, arguments);
    return drawStackedLine(doc, s, x, y, opts, orig);
  };
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
  patchThaiText(doc);
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
