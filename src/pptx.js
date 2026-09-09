// ── อ่านเนื้อหาจากไฟล์ PowerPoint (.pptx) ในเบราว์เซอร์ ────────────────────
// .pptx คือไฟล์ ZIP ที่ข้างในเป็น XML ตามมาตรฐาน OOXML เราจึงอ่านได้เองด้วย
// JSZip + DOMParser โดยไม่ต้องพึ่งเซิร์ฟเวอร์หรือไลบรารีเพิ่ม
//
// สิ่งที่ดึงได้: ข้อความทุกกล่องในสไลด์ (แยกหัวเรื่องกับเนื้อหา), ระดับ bullet,
// ข้อความในตารางบนสไลด์, โน้ตผู้บรรยาย และรูปภาพที่ฝังอยู่
// สิ่งที่ทำไม่ได้: ตำแหน่ง/ขนาด/สี/แอนิเมชันแบบเป๊ะ ๆ — งานนั้นต้องใช้เอนจิน
// เรนเดอร์เต็มรูปแบบอย่าง LibreOffice ซึ่งรันในเบราว์เซอร์ไม่ไหว

import { loadLibs } from "./loader.js";
import { tr } from "./i18n.js";
import { assertNotEmpty, friendlyZipOpenError } from "./filetype.js";

const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const CHART_URI = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const DIAGRAM_URI = "http://schemas.openxmlformats.org/drawingml/2006/diagram";

const numOf = (name) => {
  const m = name.match(/(\d+)\.xml$/);
  return m ? +m[1] : 0;
};


/** หาไฟล์โน้ตที่ผูกกับสไลด์นี้จริง ผ่านไฟล์ความสัมพันธ์ (_rels) */
async function resolveNotes(zip, parser, slideName) {
  const relsPath = slideName.replace(/slides\/(slide\d+\.xml)$/, "slides/_rels/$1.rels");
  const relsFile = zip.file(relsPath);
  if (!relsFile) return null;
  const rels = parser.parseFromString(await relsFile.async("string"), "application/xml");
  for (const r of rels.getElementsByTagName("Relationship")) {
    if ((r.getAttribute("Type") || "").endsWith("/notesSlide")) {
      const target = (r.getAttribute("Target") || "").replace(/^\.\.\//, "ppt/");
      return zip.file(target) || null;
    }
  }
  return null;
}

function textOfParagraph(p) {
  return [...p.getElementsByTagNameNS(A, "t")].map((t) => t.textContent).join("").trim();
}

/* ดึงเนื้อหาทั้งหมดในสไลด์ พร้อมบอกว่ากล่องไหนคือหัวเรื่อง
 * ‼️ เดิมไล่แค่ <p:sp> (กล่องข้อความ) อย่างเดียว ตารางกับกราฟบนสไลด์อยู่ใน <p:graphicFrame>
 *    จึงหายไปทั้งก้อนแบบเงียบสนิท ไม่มีอะไรฟ้อง (ยิงจริง 09/09/2026: สไลด์ที่มีตาราง 4x3
 *    กับกราฟแท่ง แปลงออกมาเหลือแค่หัวเรื่อง เนื้อในตารางหายหมดทุกเซลล์)
 * ‼️ ต้องเดินตามลำดับใน spTree เอง ไม่ใช้ getElementsByTagNameNS รวด ๆ เพราะต้องรู้ลำดับ
 *    ของกล่องข้อความกับตารางที่สลับกัน และต้องลงไปในกล่องที่จัดกลุ่มไว้ (<p:grpSp>) ด้วย */
function readShapes(doc) {
  const out = [];

  const readSp = (sp) => {
    const ph = sp.getElementsByTagNameNS(P, "ph")[0];
    const phType = ph?.getAttribute("type") || "";
    const isTitle = phType === "title" || phType === "ctrTitle";
    const paras = [];
    for (const p of sp.getElementsByTagNameNS(A, "p")) {
      const text = textOfParagraph(p);
      if (!text) continue;
      const lvl = +(p.getElementsByTagNameNS(A, "pPr")[0]?.getAttribute("lvl") || 0);
      paras.push({ text, level: lvl });
    }
    if (paras.length) out.push({ isTitle, paras });
  };

  const readFrame = (frame) => {
    const tbl = frame.getElementsByTagNameNS(A, "tbl")[0];
    if (tbl) {
      const rows = [];
      for (const tr of tbl.getElementsByTagNameNS(A, "tr")) {
        const cells = [...tr.getElementsByTagNameNS(A, "tc")].map((tc) =>
          [...tc.getElementsByTagNameNS(A, "p")].map(textOfParagraph).filter(Boolean).join(" "));
        if (cells.some((c) => c)) rows.push(cells.join("  |  "));
      }
      // ไม่คงเส้นตาราง แต่ต้องไม่ทำข้อมูลในเซลล์หาย จึงเรียงเป็นบรรทัดคั่นด้วยขีด
      if (rows.length) out.push({ kind: "table", isTitle: false, paras: rows.map((text) => ({ text, level: 0 })) });
      return;
    }
    const uri = frame.getElementsByTagNameNS(A, "graphicData")[0]?.getAttribute("uri") || "";
    // กราฟกับ SmartArt แปลงเป็นข้อความตรง ๆ ไม่ได้ แต่ต้องบอกให้รู้ว่าตรงนี้มีของอยู่
    if (uri.startsWith(CHART_URI)) out.push({ kind: "chart", isTitle: false, paras: [] });
    else if (uri.startsWith(DIAGRAM_URI)) out.push({ kind: "diagram", isTitle: false, paras: [] });
  };

  const visit = (node) => {
    for (const el of node.children) {
      if (el.namespaceURI !== P) continue;
      if (el.localName === "sp") readSp(el);
      else if (el.localName === "graphicFrame") readFrame(el);
      else if (el.localName === "grpSp") visit(el);      // กล่องที่จัดกลุ่มไว้ ต้องลงไปดูข้างใน
    }
  };
  const tree = doc.getElementsByTagNameNS(P, "spTree")[0];
  visit(tree || doc.documentElement);
  return out;
}

/**
 * อ่านไฟล์ .pptx ทั้งไฟล์
 * คืน { slides: [{ no, title, paras, notes }], images: [{name, blob}] }
 */
export async function readPptx(file, { withImages = false, onProgress } = {}) {
  assertNotEmpty(file);
  const [JSZipLib] = await loadLibs("jszip");
  let buf, zip;
  try {
    buf = await file.arrayBuffer();
    zip = await JSZipLib.loadAsync(buf);
  } catch (e) {
    throw friendlyZipOpenError(e, file, buf);
  }

  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => numOf(a) - numOf(b));   // slide10 ต้องมาหลัง slide9 ไม่ใช่หลัง slide1
  if (!slideNames.length)
    throw new Error(tr(`${file.name}: ไม่พบสไลด์ในไฟล์ อาจไม่ใช่ .pptx จริง (.ppt รุ่นเก่ายังไม่รองรับ), ตรวจไฟล์แล้วลองใหม่`,
      `${file.name}: no slides found, this may not be a real .pptx (.ppt isn't supported yet), check the file and try again`));

  const parser = new DOMParser();
  const slides = [];
  for (let i = 0; i < slideNames.length; i++) {
    onProgress?.({ current: i + 1, total: slideNames.length });
    const doc = parser.parseFromString(await zip.file(slideNames[i]).async("string"), "application/xml");
    const shapes = readShapes(doc);
    const titleShape = shapes.find((s) => s.isTitle);
    const bodyShapes = shapes.filter((s) => s !== titleShape);

    // โน้ตผู้บรรยายอยู่คนละไฟล์ และ ‼️ เลขไฟล์ไม่ตรงกับเลขสไลด์เสมอไป
    // (PowerPoint สร้าง notesSlide เฉพาะสไลด์ที่มีโน้ต — เดาจากเลขแล้วโน้ตจะสลับสไลด์)
    // ต้องตามลิงก์จริงใน _rels ของสไลด์นั้นเท่านั้น
    let notes = "";
    const notesFile = await resolveNotes(zip, parser, slideNames[i]);
    if (notesFile) {
      const nd = parser.parseFromString(await notesFile.async("string"), "application/xml");
      notes = [...nd.getElementsByTagNameNS(A, "p")].map(textOfParagraph).filter(Boolean).join("\n");
      // กล่องโน้ตมักมีเลขหน้าปนมาเป็นบรรทัดสุดท้าย ตัดทิ้งถ้าเป็นตัวเลขล้วน
      notes = notes.split("\n").filter((l) => !/^\d+$/.test(l.trim())).join("\n").trim();
    }

    slides.push({
      no: i + 1,
      title: titleShape ? titleShape.paras.map((p) => p.text).join(" ") : "",
      paras: bodyShapes.flatMap((s) => s.paras),
      // นับของที่แปลงเป็นข้อความไม่ได้ไว้ ให้เครื่องมือปลายทางบอกผู้ใช้ได้ว่าสไลด์ไหนมีอะไรตกหล่น
      charts: shapes.filter((s) => s.kind === "chart").length,
      diagrams: shapes.filter((s) => s.kind === "diagram").length,
      notes,
    });
  }

  const images = [];
  if (withImages) {
    for (const name of Object.keys(zip.files).filter((n) => /^ppt\/media\/image\d+\.(png|jpe?g)$/i.test(n))) {
      images.push({ name: name.split("/").pop(), blob: await zip.file(name).async("blob") });
    }
  }
  return { slides, images };
}
