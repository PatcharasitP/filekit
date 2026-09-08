// ── ตรวจและล้างร่องรอยในเอกสาร Word ก่อนส่งออกนอกองค์กร ───────────────────
// เอกสารที่ผ่านการรีวิวหลายรอบมักพกของที่ไม่ควรออกไปด้วย: คอมเมนต์ภายใน
// ประวัติการแก้ไขที่ยังไม่ยอมรับ ชื่อคนที่แก้ ชื่อบริษัท และเวลาที่ใช้ทำงาน
// ของพวกนี้มองไม่เห็นบนหน้าจอถ้าไม่เปิดโหมดรีวิว แต่ผู้รับเปิดดูได้ทั้งหมด
//
// ทำในเบราว์เซอร์ล้วน — ซึ่งสำคัญเป็นพิเศษกับงานประเภทนี้ เพราะไฟล์ที่กลัว
// ข้อมูลรั่วที่สุด ย่อมไม่ควรถูกอัปโหลดขึ้นเว็บใครเพื่อ "ล้างข้อมูล"
import { loadLibs } from "./loader.js";
import { tr } from "./i18n.js";
import { assertNotEmpty, friendlyZipOpenError } from "./filetype.js";

const RELS = "word/_rels/document.xml.rels";
const CT = "[Content_Types].xml";

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
    throw new Error(tr(`${file.name} — เนื้อในไม่ใช่ไฟล์ Word (.docx) ที่ถูกต้อง, ตรวจไฟล์ต้นทางแล้วลองใหม่`,
      `${file.name} — the content inside isn't a valid Word (.docx) file, check the source and try again`));
  return zip;
}

/** ไฟล์ส่วนที่เก็บคอมเมนต์ (Word แยกไว้หลายไฟล์ตามเวอร์ชัน) */
const COMMENT_PARTS = /^word\/comments(Extended|Ids|Extensible)?\.xml$/;

const countAll = (s, re) => (s.match(re) || []).length;

/** อ่านว่าไฟล์นี้มีร่องรอยอะไรติดมาบ้าง (ไม่แก้ไขไฟล์) */
export async function inspect(file) {
  const [JSZipLib] = await loadLibs("jszip");
  const zip = await openDocxZip(file, JSZipLib);
  const names = Object.keys(zip.files);
  const doc = zip.file("word/document.xml") ? await zip.file("word/document.xml").async("string") : "";

  const report = { comments: 0, commentAuthors: [], inserted: 0, deleted: 0, formatChanges: 0,
                   author: "", lastModifiedBy: "", company: "", manager: "", revision: "",
                   totalTime: "", created: "", modified: "", rsid: 0, hasPersonalInfoFlag: false };

  const cmtFile = names.find((n) => n === "word/comments.xml");
  if (cmtFile) {
    const xml = await zip.file(cmtFile).async("string");
    report.comments = countAll(xml, /<w:comment[ >]/g);
    report.commentAuthors = [...new Set([...xml.matchAll(/w:author="([^"]*)"/g)].map((m) => m[1]))];
  }

  report.inserted = countAll(doc, /<w:ins[ >]/g);
  report.deleted = countAll(doc, /<w:del[ >]/g);
  report.formatChanges = countAll(doc, /<w:(rPrChange|pPrChange|sectPrChange|tblPrChange|tcPrChange|trPrChange)[ >]/g);
  report.rsid = new Set([...doc.matchAll(/w:rsid[A-Za-z]*="([^"]*)"/g)].map((m) => m[1])).size;

  const grab = (xml, tag) => (xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`)) || [])[1] || "";
  if (zip.file("docProps/core.xml")) {
    const core = await zip.file("docProps/core.xml").async("string");
    report.author = grab(core, "dc:creator");
    report.lastModifiedBy = grab(core, "cp:lastModifiedBy");
    report.revision = grab(core, "cp:revision");
    report.created = grab(core, "dcterms:created");
    report.modified = grab(core, "dcterms:modified");
  }
  if (zip.file("docProps/app.xml")) {
    const app = await zip.file("docProps/app.xml").async("string");
    report.company = grab(app, "Company");
    report.manager = grab(app, "Manager");
    report.totalTime = grab(app, "TotalTime");
  }
  if (zip.file("word/settings.xml")) {
    const st = await zip.file("word/settings.xml").async("string");
    report.hasPersonalInfoFlag = st.includes("removePersonalInformation");
  }

  report.anything = report.comments > 0 || report.inserted > 0 || report.deleted > 0 ||
    report.formatChanges > 0 || !!(report.author || report.lastModifiedBy || report.company || report.manager);
  return report;
}

/** ยอมรับการแก้ไขทั้งหมด: ข้อความที่เพิ่มให้คงไว้ · ข้อความที่ลบให้หายไปจริง */
function acceptTrackChanges(xml) {
  // ข้อความในบล็อกลบต้องหายทั้งก้อน ทำก่อนเสมอ ไม่งั้นเนื้อในจะหลุดออกมา
  xml = xml.replace(/<w:del[ >][\s\S]*?<\/w:del>/g, "");
  // บล็อกเพิ่ม: เอาเปลือกออก เก็บเนื้อข้างในไว้
  xml = xml.replace(/<w:ins[^>]*>([\s\S]*?)<\/w:ins>/g, "$1");
  // ร่องรอยการเปลี่ยนรูปแบบ (ฟอนต์/ย่อหน้า/ตาราง)
  xml = xml.replace(/<w:(rPrChange|pPrChange|sectPrChange|tblPrChange|tcPrChange|trPrChange)[^>]*>[\s\S]*?<\/w:\1>/g, "");
  xml = xml.replace(/<w:(rPrChange|pPrChange|sectPrChange|tblPrChange|tcPrChange|trPrChange)[^>]*\/>/g, "");
  return xml;
}

/** ถอดจุดอ้างอิงคอมเมนต์ออกจากตัวเอกสาร */
function stripCommentMarks(xml) {
  xml = xml.replace(/<w:comment(RangeStart|RangeEnd)[^>]*\/>/g, "");
  // ตัว <w:r> ที่มีแต่ commentReference ต้องเอาออกทั้ง run ไม่งั้นเหลือ run ว่าง
  xml = xml.replace(/<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:commentReference[^>]*\/>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, "");
  xml = xml.replace(/<w:commentReference[^>]*\/>/g, "");
  return xml;
}

/** ลบรหัสรอบการบันทึก (rsid) ที่บอกได้ว่าใครแก้ช่วงไหนบ้าง */
const stripRsid = (xml) => xml.replace(/\s+w:rsid[A-Za-z]*="[^"]*"/g, "");

/**
 * ล้างไฟล์ตามตัวเลือก คืน { blob, removed }
 * options: comments, trackChanges, metadata, rsid
 */
export async function clean(file, options = {}) {
  const { comments = true, trackChanges = true, metadata = true, rsid = true } = options;
  const [JSZipLib] = await loadLibs("jszip");
  const zip = await openDocxZip(file, JSZipLib);
  const removed = [];

  const names = Object.keys(zip.files);
  const out = new JSZipLib();

  // เตรียมเนื้อหาที่แก้แล้วของไฟล์ที่ต้องแตะ
  let relsXml = zip.file(RELS) ? await zip.file(RELS).async("string") : null;
  let ctXml = zip.file(CT) ? await zip.file(CT).async("string") : null;

  if (comments) {
    const found = names.filter((n) => COMMENT_PARTS.test(n));
    if (found.length) removed.push(tr(`คอมเมนต์ ${found.length} ส่วน`, `${found.length} comment part(s)`));
    if (relsXml) {
      // ตัดความสัมพันธ์ที่ชี้ไปไฟล์คอมเมนต์ ไม่งั้น Word แจ้งว่าไฟล์เสีย
      relsXml = relsXml.replace(/<Relationship[^>]*Target="comments(Extended|Ids|Extensible)?\.xml"[^>]*\/>/g, "");
    }
    if (ctXml) {
      ctXml = ctXml.replace(/<Override[^>]*PartName="\/word\/comments(Extended|Ids|Extensible)?\.xml"[^>]*\/>/g, "");
    }
  }

  for (const name of names) {
    const entry = zip.files[name];
    if (entry.dir) continue;
    if (comments && COMMENT_PARTS.test(name)) continue;      // ไม่คัดลอกไฟล์คอมเมนต์ไปไฟล์ใหม่

    if (name === RELS && relsXml !== null) { out.file(name, relsXml); continue; }
    if (name === CT && ctXml !== null) { out.file(name, ctXml); continue; }

    if (/^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(name)) {
      let xml = await entry.async("string");
      if (trackChanges) xml = acceptTrackChanges(xml);
      if (comments) xml = stripCommentMarks(xml);
      if (rsid) xml = stripRsid(xml);
      out.file(name, xml);
      continue;
    }

    if (metadata && name === "docProps/core.xml") {
      // ‼️ ห้ามตัดช่องว่างระหว่าง attribute ออกเพื่อให้บรรทัดสั้นลง — XML บังคับต้องมีคั่นเสมอ
      //    (HTML ยอมให้ติดกันได้ XML ไม่ยอม) เคยเขียนติดกันแล้ว Word/lxml อ่าน core.xml ไม่ผ่าน
      out.file(name, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator></dc:creator><cp:lastModifiedBy></cp:lastModifiedBy><cp:revision>1</cp:revision></cp:coreProperties>`);
      continue;
    }
    if (metadata && name === "docProps/app.xml") {
      let app = await entry.async("string");
      app = app.replace(/<(Company|Manager|TotalTime|LastPrinted)>[^<]*<\/\1>/g, "<$1></$1>");
      out.file(name, app);
      continue;
    }

    out.file(name, await entry.async("uint8array"));
  }

  if (trackChanges) removed.push(tr("ประวัติการแก้ไขที่ยังไม่ยอมรับ", "Unaccepted track changes history"));
  if (metadata) removed.push(tr("ชื่อผู้เขียน ผู้แก้ไขล่าสุด บริษัท และเวลาที่ใช้ทำ", "Author, last-modified-by, company, and time spent"));
  if (rsid) removed.push(tr("รหัสรอบการบันทึก (rsid)", "Save-session IDs (rsid)"));

  const blob = await out.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
  return { blob, removed };
}
