// ── อ่านเนื้อหาจากไฟล์ PowerPoint (.pptx) ในเบราว์เซอร์ ────────────────────
// .pptx คือไฟล์ ZIP ที่ข้างในเป็น XML ตามมาตรฐาน OOXML เราจึงอ่านได้เองด้วย
// JSZip + DOMParser โดยไม่ต้องพึ่งเซิร์ฟเวอร์หรือไลบรารีเพิ่ม
//
// สิ่งที่ดึงได้: ข้อความทุกกล่องในสไลด์ (แยกหัวเรื่องกับเนื้อหา), ระดับ bullet,
// โน้ตผู้บรรยาย และรูปภาพที่ฝังอยู่
// สิ่งที่ทำไม่ได้: ตำแหน่ง/ขนาด/สี/แอนิเมชันแบบเป๊ะ ๆ — งานนั้นต้องใช้เอนจิน
// เรนเดอร์เต็มรูปแบบอย่าง LibreOffice ซึ่งรันในเบราว์เซอร์ไม่ไหว

import { loadLibs } from "./loader.js";
import { tr } from "./i18n.js";
import { assertNotEmpty, friendlyZipOpenError } from "./filetype.js";

const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P = "http://schemas.openxmlformats.org/presentationml/2006/main";

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

/** ดึงกล่องข้อความทั้งหมดในสไลด์ พร้อมบอกว่ากล่องไหนคือหัวเรื่อง */
function readShapes(doc) {
  const out = [];
  for (const sp of doc.getElementsByTagNameNS(P, "sp")) {
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
  }
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
    throw new Error(tr(`${file.name} — ไม่พบสไลด์ในไฟล์ อาจไม่ใช่ .pptx จริง (.ppt รุ่นเก่ายังไม่รองรับ) · ตรวจไฟล์แล้วลองใหม่`,
      `${file.name} — no slides found, this may not be a real .pptx (.ppt isn't supported yet) · check the file and try again`));

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
