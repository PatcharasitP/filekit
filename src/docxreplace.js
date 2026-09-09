// ── ค้นหาและแทนที่ข้อความในไฟล์ Word หลายไฟล์พร้อมกัน ─────────────────────
// ใช้เทคนิคเดียวกับที่จำเป็นในงานจดหมายเวียน: Word หั่นย่อหน้าเป็นหลาย <w:r>
// คำที่ต้องการค้นจึงอาจถูกตัดคาไว้คนละ run ("บริษัท ทดสอบ"อาจเป็น "บริษัท ท"
// กับ "ดสอบ") การค้นทีละ run จะพลาดคำเหล่านี้ทั้งหมด
//
// จึงต่อข้อความทุก run ในย่อหน้าเป็นสตริงเดียวก่อน ค้นบนสตริงรวม แล้วเขียนผล
// กลับลง run ตามช่วงตำแหน่ง — run แรกที่ทับคำได้ข้อความใหม่ไป run ที่เหลือตัดเศษทิ้ง
// วิธีนี้ทำให้รูปแบบตัวอักษรของคำเดิมถูกรักษาไว้

import { loadLibs } from "./loader.js";
import { tr } from "./i18n.js";
import { assertNotEmpty, friendlyZipOpenError } from "./filetype.js";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const PARTS = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;

/** เปิดไฟล์ .docx เป็น JSZip พร้อมแปลง error ให้อ่านรู้เรื่อง — คืน zip หรือ throw ข้อความที่ทำต่อได้ */
async function openDocxZip(file, JSZipLib) {
  assertNotEmpty(file);
  let buf, zip;
  try {
    buf = await file.arrayBuffer();
    zip = await JSZipLib.loadAsync(buf);
  } catch (e) {
    throw friendlyZipOpenError(e, file, buf);
  }
  if (!zip.file("word/document.xml"))
    throw new Error(tr(`${file.name}: เนื้อในไม่ใช่ไฟล์ Word (.docx) ที่ถูกต้อง, ตรวจไฟล์ต้นทางแล้วลองใหม่`,
      `${file.name}: the content inside isn't a valid Word (.docx) file, check the source and try again`));
  return zip;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function buildPattern(find, { matchCase, wholeWord }) {
  let src = escapeRe(find);
  // \b ใช้กับภาษาไทยไม่ได้ (ไม่มีขอบเขตคำแบบละติน) จึงบังคับเฉพาะเมื่อเป็นอักษรละติน
  if (wholeWord && /^[\w\s]+$/.test(find)) src = `\\b${src}\\b`;
  return new RegExp(src, matchCase ? "g" : "gi");
}

function joinRuns(p) {
  const nodes = [...p.getElementsByTagNameNS(W, "t")];
  const spans = [];
  let text = "";
  for (const n of nodes) {
    const s = n.textContent || "";
    spans.push({ node: n, start: text.length, end: text.length + s.length });
    text += s;
  }
  return { text, spans };
}

/** แทนที่ในย่อหน้าเดียว คืนจำนวนจุดที่แทน */
function replaceInParagraph(p, rules) {
  const { text, spans } = joinRuns(p);
  if (!text) return 0;

  const hits = [];
  for (const { pattern, to } of rules) {
    pattern.lastIndex = 0;
    for (const m of text.matchAll(pattern)) hits.push({ from: m.index, to: m.index + m[0].length, value: to });
  }
  if (!hits.length) return 0;

  // เรียงจากท้ายไปหน้า และข้ามช่วงที่ซ้อนกัน (กฎแรกที่จับได้ชนะ)
  hits.sort((a, b) => b.from - a.from);
  const applied = [];
  for (const h of hits) {
    if (applied.some((a) => h.from < a.to && a.from < h.to)) continue;
    applied.push(h);
  }

  const out = new Map(spans.map((s) => [s.node, s.node.textContent || ""]));
  for (const h of applied) {
    let placed = false;
    for (const sp of spans) {
      if (sp.end <= h.from || sp.start >= h.to) continue;
      const cur = out.get(sp.node);
      const a = Math.max(0, h.from - sp.start);
      const b = Math.min(cur.length, h.to - sp.start);
      out.set(sp.node, cur.slice(0, a) + (placed ? "" : h.value) + cur.slice(b));
      placed = true;
    }
  }
  for (const [node, value] of out) {
    if ((node.textContent || "") === value) continue;
    node.textContent = value;
    node.setAttribute("xml:space", "preserve");
  }
  return applied.length;
}

/** นับจำนวนที่จะถูกแทน โดยไม่แก้ไฟล์ (ใช้ทำพรีวิวก่อนลงมือ) */
export async function countMatches(file, rules) {
  const [JSZipLib] = await loadLibs("jszip");
  const zip = await openDocxZip(file, JSZipLib);
  const counts = rules.map(() => 0);
  for (const name of Object.keys(zip.files)) {
    if (!PARTS.test(name)) continue;
    const xml = await zip.file(name).async("string");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    for (const p of doc.getElementsByTagNameNS(W, "p")) {
      const { text } = joinRuns(p);
      rules.forEach((r, i) => {
        r.pattern.lastIndex = 0;
        counts[i] += (text.match(r.pattern) || []).length;
      });
    }
  }
  return counts;
}

/** แทนที่จริง คืน { blob, total } */
export async function replaceInDocx(file, rules) {
  const [JSZipLib] = await loadLibs("jszip");
  const zip = await openDocxZip(file, JSZipLib);
  const out = new JSZipLib();
  let total = 0;

  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (entry.dir) continue;
    if (!PARTS.test(name)) { out.file(name, await entry.async("uint8array")); continue; }
    const xml = await entry.async("string");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    for (const p of doc.getElementsByTagNameNS(W, "p")) total += replaceInParagraph(p, rules);
    out.file(name, new XMLSerializer().serializeToString(doc));
  }

  const blob = await out.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
  return { blob, total };
}

/** แปลงรายการที่ผู้ใช้กรอกเป็นกฎที่ใช้ค้นได้ */
export const makeRules = (pairs, opts) =>
  pairs.filter((p) => p.find).map((p) => ({ pattern: buildPattern(p.find, opts), to: p.replace ?? "" }));
