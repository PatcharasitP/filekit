// ── ดึง "ตาราง" ออกจากไฟล์ชนิดไหนก็ได้ ──────────────────────────────────────
// คืนรูปแบบเดียวกันเสมอ { header, rows, note } ไม่ว่าต้นทางจะเป็น PDF, Word หรือรูปถ่าย
// เพื่อให้เครื่องมือปลายทาง (เช่นตัวสร้างสูตร Power Query) ไม่ต้องรู้ว่าไฟล์มาจากไหน
//
// ‼️ ใช้ตัวอ่านที่โปรเจกต์มีอยู่แล้วทั้งหมด ไม่เขียนตัวอ่านใหม่
//    PDF ที่มีชั้นข้อความ ใช้ตัวจับคอลัมน์ตัวเดียวกับ pdf-to-excel
//    PDF สแกนกับรูปถ่าย ใช้ OCR ตัวเดียวกับ pdf-ocr
//    Word ใช้ mammoth แปลงเป็น HTML แล้วอ่านตารางจาก DOM ซึ่งแม่นกว่าการเดาจากข้อความ

import { loadLibs } from "./loader.js";
import { openPdf } from "./pdfopen.js";
import { pageLines, guessColumns, rowToCells } from "./pdftext.js";
import { ocrPdf, ocrImage, hasTextLayer } from "./ocr.js";
import { tr } from "./i18n.js";

export const TABLE_SOURCES = {
  pdf: ["pdf"],
  word: ["docx"],
  image: ["png", "jpg", "jpeg", "webp", "bmp"],
};

export const extOf = (name) => (String(name).split(".").pop() || "").toLowerCase();

export function kindOfFile(name) {
  const e = extOf(name);
  for (const [kind, list] of Object.entries(TABLE_SOURCES)) if (list.includes(e)) return kind;
  return null;
}

/* แปลงอาเรย์สองชั้นเป็นรูปแบบตารางมาตรฐาน โดยตัดแถวว่างและคอลัมน์ที่ว่างทั้งคอลัมน์ทิ้ง
   ‼️ ตารางจากการอ่านไฟล์มักมีคอลัมน์ผีติดมาจากช่องว่างที่กว้างผิดปกติ ถ้าไม่ตัดออก
   ผู้ใช้จะเจอคอลัมน์เปล่าเต็มไปหมดแล้วต้องมานั่งลบเอง */
function toTable(aoa) {
  const rows = aoa.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (!rows.length) return { header: [], rows: [] };
  const width = Math.max(...rows.map((r) => r.length));
  const keep = [];
  for (let c = 0; c < width; c++) if (rows.some((r) => String(r[c] ?? "").trim() !== "")) keep.push(c);
  const norm = rows.map((r) => keep.map((c) => {
    const v = r[c];
    return v == null || String(v).trim() === "" ? null : String(v).trim();
  }));
  const head = norm[0].map((h, i) => h || tr(`คอลัมน์ ${i + 1}`, `Column ${i + 1}`));
  return { header: head, rows: norm.slice(1) };
}

// บรรทัดข้อความล้วนจาก OCR ตัดเป็นช่องด้วย "ช่องว่างสองตัวขึ้นไปหรือแท็บ"
// เป็นวิธีเดียวกับที่ pdf-to-excel ใช้กับไฟล์สแกน ซึ่งได้ผลดีกับตารางที่จัดคอลัมน์ชัด
const linesToAoa = (lines) => lines.map((l) => l.split(/\s{2,}|\t+/).map((c) => c.trim()));

async function fromPdf(file, onProgress) {
  // ‼️ โหลดไลบรารีตอนใช้จริงเท่านั้น เครื่องมือนี้รับไฟล์หลายชนิด ถ้าประกาศไว้ในทะเบียนทั้งหมด
  //    ผู้ใช้ที่เอาแค่ Excel มาจะต้องโหลดตัวอ่าน PDF ทิ้งเปล่า ๆ ทุกครั้ง
  await loadLibs("pdfjs");
  const pdf = await openPdf(file);
  try {
    if (await hasTextLayer(pdf)) {
      const aoa = [];
      for (let p = 1; p <= pdf.numPages; p++) {
        onProgress?.({ phase: "page", current: p, total: pdf.numPages });
        const page = await pdf.getPage(p);
        const rows = await pageLines(page);
        const cols = guessColumns(rows);
        for (const r of rows) {
          aoa.push(cols.length > 1 ? rowToCells(r, cols) : [r.items.map((i) => i.str).join(" ")]);
        }
        page.cleanup();
      }
      return { ...toTable(aoa), note: null };
    }
    // ไม่มีชั้นข้อความ แปลว่าเป็นไฟล์สแกน ต้องอ่านด้วย OCR ซึ่งอาจอ่านผิดได้
    const pages = await ocrPdf(pdf, { onProgress });
    const aoa = linesToAoa(pages.flatMap((p) => p.lines));
    return {
      ...toTable(aoa),
      note: tr("ไฟล์นี้เป็นภาพสแกน อ่านด้วย OCR ตัวอักษรอาจคลาดเคลื่อน ตรวจข้อมูลก่อนใช้",
               "This is a scanned file read with OCR, characters may be misread, check the data before using it"),
    };
  } finally {
    pdf.destroy?.();
  }
}

async function fromWord(file) {
  const [mammoth] = await loadLibs("mammoth");
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const doc = new DOMParser().parseFromString(html, "text/html");
  // เอาตารางที่มีช่องเยอะที่สุด เพราะเอกสารมักมีตารางเล็ก ๆ ที่เป็นส่วนหัวปนมาด้วย
  let best = null, bestCells = 0;
  for (const t of doc.querySelectorAll("table")) {
    const n = t.querySelectorAll("td,th").length;
    if (n > bestCells) { best = t; bestCells = n; }
  }
  if (!best) {
    throw new Error(tr("ไม่พบตารางในไฟล์ Word นี้ ตัวสร้างสูตรต้องการข้อมูลที่เป็นตาราง",
                       "No table found in this Word file, the formula builder needs tabular data"));
  }
  const aoa = [...best.rows].map((r) => [...r.children].map((c) => c.textContent.replace(/\s+/g, " ").trim()));
  return { ...toTable(aoa), note: null };
}

async function fromImage(file, onProgress) {
  const { lines } = await ocrImage(file, { onProgress });
  const t = toTable(linesToAoa(lines));
  if (!t.header.length) {
    throw new Error(tr("อ่านข้อความจากรูปนี้ไม่ได้ ลองใช้รูปที่คมชัดกว่านี้",
                       "Could not read text from this image, try a sharper one"));
  }
  return {
    ...t,
    note: tr("อ่านจากรูปด้วย OCR ตัวอักษรอาจคลาดเคลื่อน และการแบ่งคอลัมน์อาศัยระยะห่างในภาพ ตรวจก่อนใช้",
             "Read from an image with OCR, characters may be misread and columns are guessed from spacing, check before using"),
  };
}

/** ดึงตารางจากไฟล์ PDF, Word หรือรูปภาพ คืน { header, rows, note } */
export async function extractTable(file, { onProgress } = {}) {
  const kind = kindOfFile(file.name);
  if (kind === "pdf") return fromPdf(file, onProgress);
  if (kind === "word") return fromWord(file);
  if (kind === "image") return fromImage(file, onProgress);
  throw new Error(tr(`ยังอ่านตารางจากไฟล์ชนิด .${extOf(file.name)} ไม่ได้`,
                     `Reading a table from .${extOf(file.name)} files isn't supported yet`));
}
