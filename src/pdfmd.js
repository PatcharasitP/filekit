// ── PDF เป็น Markdown ─────────────────────────────────────────────────────────
// รับบรรทัดแบบที่ pageLines (src/pdftext.js) ให้ แล้วเดาโครงเอกสาร หัวข้อ รายการ ตาราง ย่อหน้า
// เคสจริง: เอาเอกสารไปให้ AI อ่านต่อ ข้อความเรียงเป็นบรรทัดตามหน้ากระดาษ (TXT) ทำให้ย่อหน้าขาดกลาง
// และตารางกลายเป็นคำเรียงกัน ส่วน Markdown เก็บโครงไว้ให้ AI และคนอ่านรู้ว่าอะไรเป็นหัวข้อ
//
// ‼️ ลำดับบรรทัดและคำไทยจาก pdf.js ถูก (พิสูจน์ 29/09/2026 ไฟล์จาก Word และ Chrome) แต่ตัวอักษรหายได้
//   PDF จาก Chrome ที่ใช้เว็บฟอนต์ Sarabun ชี้สระกับวรรณยุกต์ตัวสำรองเป็นรหัส 0000 pdf.js ทุกรุ่นคืน \u0000
//   จึงตัดทิ้งแล้วนับไว้ให้หน้าจอเตือนและเสนอ OCR (ดูโน้ตคลัง ข้อความไทยจาก PDF สระหายได้สองทาง)
// ‼️ กฎทุกข้อด้านล่างมาจากข้อมูลดิบของไฟล์จริง (ค่าอยู่ในเทส tests/pdfmd.test.mjs ข้อ ⑥)

import { pageLines } from "./pdftext.js";

const BULLET = /^\s*[•●▪■◦○‣∙*–-]\s+/;
const BULLET_ONLY = /^[•●▪■◦○‣∙–-]$/;
const NUMBERED = /^\s*([0-9]+|[๐-๙]+)[.)]\s+/;
const THAI_DIGIT = (s) => s.replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0E50));
const SENTENCE_END = /[.:;,!?)]$|ครับ$|ค่ะ$/;

const round = (n) => Math.round(n * 2) / 2;
const escCell = (s) => s.replace(/\|/g, "\\|");

/** ต่อ item เติมเว้นวรรคเมื่อมีช่องว่างจริง วัดจากขอบขวาสุดที่เคยเห็น (สระบนล่างความกว้าง 0 ไม่ทำให้เว้นผิด) */
function joinItems(items) {
  let out = "", right = null;
  for (const it of items) {
    if (!it.str) continue;
    if (right !== null && it.x - right > 1.2 && !/\s$/.test(out) && !/^\s/.test(it.str)) out += " ";
    out += it.str;
    right = Math.max(right ?? -Infinity, it.x + it.w);
  }
  /* ‼️ Sarabun แยกสระอำเป็นนิคหิตกับสระอา รวมกลับเป็นตัวเดียว (ค่าจริงจาก PDF ของ Chrome) */
  return out.replace(/ํ\s*า/g, "ำ").trim();
}

/** แบ่งบรรทัดเป็นก้อน ตรงช่องว่างที่กว้างกว่าครึ่งตัวอักษร คืน [{ x, text }] */
function chunksOf(items, size) {
  const chunks = [];
  let cur = [], right = null;
  for (const it of items) {
    if (!it.str.trim()) continue;
    if (right !== null && it.x - right > size * 0.5) { chunks.push(cur); cur = []; }
    cur.push(it);
    right = Math.max(right ?? -Infinity, it.x + it.w);
  }
  if (cur.length) chunks.push(cur);
  return chunks.map((c) => ({ x: c[0].x, text: joinItems(c) }));
}

/** ค่าที่พบบ่อยสุด ถ่วงด้วยจำนวนตัวอักษร */
function weightedMode(pairs) {
  const m = new Map();
  for (const [k, w] of pairs) m.set(k, (m.get(k) || 0) + w);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

const aligned = (a, b, tol = 8) => a.length === b.length && a.every((c, i) => Math.abs(c.x - b[i].x) <= tol);

/**
 * pages: [[{ y, items:[{ x, str, w, h, bold? }] }]] แต่ละหน้าเรียงบนลงล่าง
 * คืน { md, nul, stats } nul คือจำนวนอักขระว่างที่ตัดทิ้ง (มากกว่า 0 = ไฟล์นี้ตัวอักษรบางตัวหาย)
 */
export function rowsToMarkdown(pages) {
  let nul = 0;
  const all = [];
  pages.forEach((rows, p) => {
    for (const row of rows || []) {
      let items = row.items.map((it) => {
        const n = (it.str.match(/\u0000/g) || []).length;
        nul += n;
        return n ? { ...it, str: it.str.replace(/\u0000/g, "") } : it;
      }).filter((it) => it.str.trim() || it.str === " ");
      if (!items.length) continue;
      /* จุดนำหน้าที่เป็นชิ้นแยก (Word ใช้ฟอนต์ Symbol) ถอดออกแล้วจำไว้ ไม่งั้นสามบรรทัดติดกันจะหน้าตาเหมือนตารางสองคอลัมน์ */
      let bullet = false;
      if (BULLET_ONLY.test(items[0].str.trim()) && items.length > 1) { bullet = true; items = items.slice(1); }
      const sized = items.filter((it) => it.str.trim());
      const r = {
        y: row.y, page: p, items, bullet,
        x: sized[0].x,
        size: Math.max(0, ...sized.map((it) => it.h || 0)),
        bold: sized.every((it) => it.bold),
        text: joinItems(items),
      };
      if (bullet) r.text = "• " + r.text;
      if (r.text) all.push(r);
    }
  });
  if (!all.length) return { md: "", nul, stats: { headings: 0, lists: 0, tables: 0, paragraphs: 0 } };

  const body = weightedMode(all.map((r) => [round(r.size), r.text.length]));
  const pageLeft = new Map();
  for (const p of new Set(all.map((r) => r.page)))
    pageLeft.set(p, weightedMode(all.filter((r) => r.page === p).map((r) => [Math.round(r.x), r.text.length])));

  /* หัวข้อ: ใหญ่กว่าเนื้อความชัดเจน หรือเป็นตัวหนาทั้งบรรทัดที่สั้นและไม่ได้จบแบบประโยค (Word ทำหัวข้อขนาดเท่าเนื้อความ) */
  const isHead = (r) => r.text.length <= 150 && !r.bullet &&
    (r.size >= body * 1.15 || (r.bold && r.text.length <= 100 && !SENTENCE_END.test(r.text)));
  const headSizes = [...new Set(all.filter(isHead).map((r) => round(r.size)))].sort((a, b) => b - a);

  for (const r of all) {
    r.chunks = chunksOf(r.items, r.size || body);
    if (isHead(r)) { r.kind = "h"; r.level = Math.min(3, headSizes.indexOf(round(r.size)) + 1); }
    else if (BULLET.test(r.text)) r.kind = "ul";
    else if (NUMBERED.test(r.text)) r.kind = "ol";
    else if (r.chunks.length >= 2) r.kind = "cells";
    else r.kind = "p";
  }

  /* ตาราง: อย่างน้อย 2 บรรทัดติดกันที่แบ่งเป็นก้อนได้เท่ากัน และจุดเริ่มก้อนตรงแนวเดียวกัน
     ‼️ ดูแนวคอลัมน์ ไม่ใช่ระยะห่าง ช่องในตาราง Word ห่างกันแค่ 10.9 pt เมื่อชื่อยาวเต็มคอลัมน์ */
  for (let i = 0; i < all.length; i++) {
    if (all[i].kind !== "cells") continue;
    let j = i;
    while (j + 1 < all.length && all[j + 1].kind === "cells" && all[j + 1].page === all[i].page
           && aligned(all[j + 1].chunks, all[i].chunks)) j++;
    for (let k = i; k <= j; k++) all[k].kind = j > i ? "tr" : "p";
    i = j;
  }

  /* รายการที่ไม่มีจุดเป็นตัวอักษร (HTML ที่ Chrome พิมพ์ วาดจุดเป็นรูป) บรรทัดเยื้องจากขอบซ้ายหลักของหน้า
     ตั้งแต่ 2 บรรทัดติดกันที่เยื้องเท่ากัน นับเป็นรายการ บรรทัดเยื้องโดด ๆ ยังเป็นย่อหน้าปกติ */
  for (let i = 0; i < all.length; i++) {
    const r = all[i];
    if (r.kind !== "p" || r.x < pageLeft.get(r.page) + r.size * 1.5) continue;
    let j = i;
    while (j + 1 < all.length && all[j + 1].kind === "p" && all[j + 1].page === r.page && Math.abs(all[j + 1].x - r.x) <= 2) j++;
    if (j > i && (i === 0 || all[i - 1].kind !== "ul")) for (let k = i; k <= j; k++) all[k].kind = "ul-implied";
    i = j;
  }

  const blocks = [];
  const last = () => blocks[blocks.length - 1];
  for (let i = 0; i < all.length; i++) {
    const r = all[i], prev = all[i - 1];
    const near = prev && prev.page === r.page && prev.y - r.y <= Math.max(r.size, body) * 1.9;
    if (r.kind === "h") {
      blocks.push({ kind: "h", text: "#".repeat(r.level) + " " + r.text });
    } else if (r.kind === "ul" || r.kind === "ol" || r.kind === "ul-implied") {
      const kind = r.kind === "ol" ? "ol" : "ul";
      const item = r.kind === "ol"
        ? THAI_DIGIT(r.text.match(NUMBERED)[1]) + ". " + r.text.replace(NUMBERED, "")
        : "- " + r.text.replace(BULLET, "");
      if (last()?.kind === kind && near) last().lines.push(item);
      else blocks.push({ kind, lines: [item] });
    } else if (r.kind === "tr") {
      const row = "| " + r.chunks.map((c) => escCell(c.text)).join(" | ") + " |";
      if (last()?.kind === "table" && prev?.kind === "tr" && prev.page === r.page) last().lines.push(row);
      else blocks.push({ kind: "table", lines: [row, "| " + r.chunks.map(() => "---").join(" | ") + " |"] });
    } else {
      /* ย่อหน้าที่ถูกตัดบรรทัด ต่อกลับเมื่ออยู่หน้าเดียวกันและห่างไม่เกินระยะบรรทัดปกติ
         บรรทัดต่อของรายการ (เยื้องเข้าไปจากต้นบรรทัดของหัวข้อย่อย) ต่อท้ายรายการนั้น */
      const lb = last();
      if (lb?.kind === "p" && near && prev.kind === "p") lb.text += " " + r.text;
      else if (lb?.kind === "ul" && near && prev.bullet && r.x >= prev.x - 2) lb.lines[lb.lines.length - 1] += " " + r.text;
      else blocks.push({ kind: "p", text: r.text });
    }
  }

  const md = blocks.map((b) => (b.lines ? b.lines.join("\n") : b.text)).join("\n\n");
  const count = (k) => blocks.filter((b) => b.kind === k).length;
  return { md, nul, stats: { headings: count("h"), lists: count("ul") + count("ol"), tables: count("table"), paragraphs: count("p") } };
}

/** บรรทัดของหน้าพร้อมธงตัวหนา สำหรับ rowsToMarkdown
 *  ‼️ ชื่อฟอนต์จริง (เช่น BrowalliaNew-Bold) มีใน commonObjs หลังอ่านคำสั่งวาดหน้าเท่านั้น วัดแล้ว 12 ms ต่อหน้า */
export async function markdownRows(page) {
  const rows = await pageLines(page);
  try { await page.getOperatorList(); } catch { /* อ่านไม่ได้ก็เดาหัวข้อจากขนาดอย่างเดียว */ }
  const boldOf = new Map();
  for (const r of rows) for (const it of r.items) {
    if (!boldOf.has(it.font)) {
      let name = "";
      try { name = page.commonObjs.has(it.font) ? page.commonObjs.get(it.font).name || "" : ""; } catch { /* ไม่มีชื่อ */ }
      boldOf.set(it.font, /bold|black|heavy|semibold|demibold/i.test(name));
    }
    it.bold = boldOf.get(it.font);
  }
  return rows;
}

/** รวมนิคหิตกับสระอาเป็นสระอำ ใช้กับข้อความจาก OCR (tesseract คืน ดําเนิน แยกสองตัว) */
export const normalizeThai = (s) => s.replace(/\u0E4D\s*\u0E32/g, "\u0E33");

/**
 * เรื่องที่ต้องเตือนผู้ใช้ว่าตัวอักษรไทยในผลลัพธ์อาจเชื่อไม่ได้
 * "nul"          มีรหัสว่างที่ตัดทิ้ง (PDF จาก Chrome ฟอนต์ Sarabun) สระหรือวรรณยุกต์หายไป
 * "word-sara-am" PDF ที่ Word บันทึก ใช้รูปสระอาร่วมกับสระอำ ตั้งรหัสตามตัวที่เจอก่อน อีกตัวจึงผิดทั้งไฟล์
 * ‼️ ลอง 5 ฟอนต์ 29/09/2026 เป็นทุกฟอนต์ ข้อความเองแยกไม่ออกว่าตัวไหนถูก จึงเตือนทุกไฟล์ Word ที่มีสระอาหรือสระอำ
 */
export function thaiWarnings({ nul = 0, producer = "", text = "" }) {
  const out = [];
  if (nul > 0) out.push("nul");
  if (/Microsoft.*Word/i.test(producer || "") && /[\u0E32\u0E33]/.test(text)) out.push("word-sara-am");
  return out;
}
