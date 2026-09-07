// ── รวมข้อมูลจาก Excel เข้ากับเทมเพลต Word (Mail Merge) ────────────────────
// ‼️ หัวใจของเรื่องนี้คือ Word ไม่ได้เก็บข้อความเป็นก้อนเดียว
// ย่อหน้าหนึ่งถูกหั่นเป็นหลาย <w:r> (run) ตามการจัดรูปแบบ การตรวจคำสะกด และ
// ประวัติการแก้ไข ทำให้ตัวยึด {{ชื่อ}} ที่คนพิมพ์ติดกันในหน้าจอ กลายเป็น
// "{{ชื่", "อ}}" คนละ run ในไฟล์จริง — โค้ดที่ค้นหาทีละ run จึงหาไม่เจอ
//
// วิธีที่ใช้: ต่อข้อความของทุก run ในย่อหน้าเดียวกันเป็นสตริงเดียวก่อน
// หาตัวยึดบนสตริงนั้น แล้วค่อยเขียนค่ากลับลง run ตามช่วงตำแหน่งที่จับคู่ไว้
// วิธีนี้รักษารูปแบบตัวอักษรของ run แรกไว้ (ตัวหนา สี ขนาด) ซึ่งเป็นที่ที่
// ตัวยึดเริ่มต้น จึงได้ผลลัพธ์ที่หน้าตาเหมือนที่คนออกแบบเทมเพลตตั้งใจ

import { loadLibs } from "./loader.js";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** ไฟล์ใน .docx ที่อาจมีตัวยึด — หัวกระดาษและท้ายกระดาษก็ต้องแทนที่ด้วย */
const TARGET = /^word\/(document|header\d*|footer\d*)\.xml$/;

export const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** ดึงรายชื่อตัวยึดทั้งหมดจากไฟล์เทมเพลต (ใช้โชว์ให้ผู้ใช้จับคู่กับคอลัมน์ Excel) */
export async function readPlaceholders(file) {
  const [JSZipLib] = await loadLibs("jszip");
  const zip = await JSZipLib.loadAsync(await file.arrayBuffer());
  const names = new Set();
  let paragraphs = 0;

  for (const path of Object.keys(zip.files)) {
    if (!TARGET.test(path)) continue;
    const xml = await zip.file(path).async("string");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    for (const p of doc.getElementsByTagNameNS(W, "p")) {
      paragraphs++;
      const text = joinRuns(p).text;
      for (const m of text.matchAll(PLACEHOLDER)) names.add(m[1]);
    }
  }
  if (!paragraphs) throw new Error("อ่านเนื้อหาในไฟล์ไม่ได้ — ตรวจว่าเป็นไฟล์ .docx จริง (ไฟล์ .doc รุ่นเก่ายังไม่รองรับ)");
  return [...names];
}

/** ต่อข้อความทุก run ในย่อหน้าเป็นสตริงเดียว พร้อมจำว่าอักษรช่วงไหนอยู่ node ใด */
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

/** แทนที่ตัวยึดในย่อหน้าเดียว คืน true ถ้ามีการเปลี่ยนแปลง */
function mergeParagraph(p, valueOf) {
  const { text, spans } = joinRuns(p);
  if (!text.includes("{{")) return false;

  const hits = [...text.matchAll(PLACEHOLDER)];
  if (!hits.length) return false;

  // แทนที่จากท้ายไปหน้า เพื่อไม่ให้ตำแหน่งที่จับไว้ขยับตามความยาวที่เปลี่ยน
  const out = new Map(spans.map((s) => [s.node, s.node.textContent || ""]));
  for (let i = hits.length - 1; i >= 0; i--) {
    const m = hits[i];
    const from = m.index, to = m.index + m[0].length;
    const value = valueOf(m[1]);

    let placed = false;
    for (const sp of spans) {
      if (sp.end <= from || sp.start >= to) continue;   // run นี้ไม่เกี่ยวกับตัวยึดนี้
      const cur = out.get(sp.node);
      const localFrom = Math.max(0, from - sp.start);
      const localTo = Math.min(cur.length, to - sp.start);
      // run แรกที่ทับกับตัวยึดจะได้ค่าจริงไป ส่วน run ถัดไปตัดเศษที่เหลือทิ้ง
      out.set(sp.node, cur.slice(0, localFrom) + (placed ? "" : value) + cur.slice(localTo));
      placed = true;
    }
  }

  for (const [node, value] of out) {
    if ((node.textContent || "") === value) continue;
    node.textContent = value;
    // ต้องบอก Word ให้เก็บช่องว่างหัว-ท้ายไว้ ไม่งั้นชื่อจะไปติดกับคำข้างหน้า
    node.setAttribute("xml:space", "preserve");
  }
  return true;
}

/**
 * สร้างเอกสารหนึ่งชุดจากเทมเพลต + ข้อมูลหนึ่งแถว
 * missing: "keep" = คงตัวยึดไว้ · "blank" = แทนด้วยค่าว่าง
 */
export async function mergeOne(zip, JSZipLib, row, { missing = "blank" } = {}) {
  const out = zip.clone ? zip.clone() : null;   // JSZip ไม่มี clone จริง จึงสร้างใหม่ด้านล่างแทน
  const valueOf = (key) => {
    const v = row[key];
    if (v === undefined || v === null || v === "") return missing === "keep" ? `{{${key}}}` : "";
    return String(v);
  };
  const files = {};
  for (const path of Object.keys(zip.files)) {
    const entry = zip.files[path];
    if (entry.dir) continue;
    if (!TARGET.test(path)) { files[path] = await entry.async("uint8array"); continue; }
    const xml = await entry.async("string");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    for (const p of doc.getElementsByTagNameNS(W, "p")) mergeParagraph(p, valueOf);
    files[path] = new XMLSerializer().serializeToString(doc);
  }
  const zipOut = new JSZipLib();
  for (const [path, data] of Object.entries(files)) zipOut.file(path, data);
  return zipOut.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
}

/** ทำทั้งชุด: เทมเพลต + ข้อมูลหลายแถว → เอกสารหลายไฟล์ */
export async function mergeAll(templateFile, rows, { missing = "blank", nameOf, onProgress } = {}) {
  const [JSZipLib] = await loadLibs("jszip");
  const buf = await templateFile.arrayBuffer();
  const results = [];
  for (let i = 0; i < rows.length; i++) {
    const zip = await JSZipLib.loadAsync(buf);          // โหลดใหม่ทุกแถว กัน state ปนกัน
    const blob = await mergeOne(zip, JSZipLib, rows[i], { missing });
    results.push({ name: nameOf ? nameOf(rows[i], i) : `เอกสาร-${i + 1}.docx`, blob });
    onProgress?.({ done: i + 1, total: rows.length });
  }
  return results;
}
