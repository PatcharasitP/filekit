// ── รวมไฟล์ Word หลายไฟล์เป็นเล่มเดียว ─────────────────────────────────────
// แนวทาง: ใช้ไฟล์แรกเป็น "ฐาน" (เก็บ styles, numbering, theme, ตั้งค่าหน้ากระดาษ)
// แล้วนำเนื้อหาของไฟล์ถัด ๆ ไปต่อท้ายใน body เดียวกัน
//
// จุดที่ต้องระวังและจัดการ:
//  1. รหัสความสัมพันธ์ (rId) ของแต่ละไฟล์ซ้ำกันแน่นอน เพราะทุกไฟล์เริ่มนับใหม่
//     ถ้าต่อกันดื้อ ๆ รูปในไฟล์ที่สองจะกลายเป็นรูปของไฟล์แรก → ต้องออกรหัสใหม่ทั้งหมด
//  2. รูปภาพและไฟล์แนบต้องคัดลอกมาพร้อมตั้งชื่อใหม่ กันชื่อชนกัน
//  3. <w:sectPr> ตัวสุดท้ายของแต่ละไฟล์คือการตั้งค่าหน้ากระดาษของไฟล์นั้น
//     ต้องตัดทิ้งเพื่อไม่ให้ขึ้น section ใหม่ที่ทำให้หน้าเพี้ยน (คงของไฟล์แรกไว้)
//  4. footnotes.xml เป็น part แบบ "unique ต่อเอกสาร" เหมือน styles/numbering — แต่ต่างจากพวกนั้นตรงที่
//     "มีเนื้อหาที่ต้องรวมจริง ๆ" (ไม่ใช่แค่ใช้ของไฟล์แรกอย่างเดียว) จึงต้อง merge เนื้อ <w:footnote>
//     เข้าด้วยกัน + ออกเลข w:id ใหม่ให้ไม่ชนกัน (คนละเรื่องกับ r:id ของ rIdJoinNNN ที่จัดการอยู่แล้ว
//     เพราะ w:footnoteReference ใช้ attribute w:id คนละ namespace กับ r:id — ถ้าไม่ remap จุดนี้
//     ทุกไฟล์ที่เริ่มนับ footnote id ที่ 1/2 เหมือนกัน จะชนกันเงียบ ๆ แล้ว Word เอาไปแสดงเนื้อหาไฟล์แรกซ้ำ)
//  5. numbering.xml (นิยามรูปแบบรายการมีเลข/หัวข้อย่อย) ก็ "มีเนื้อหาที่ต้องรวมจริง" เหมือน footnotes
//     แต่ (09/09/2026) เดิมถูกจัดกลุ่มปนกับ styles/settings ว่าใช้ของไฟล์แรกพอ ทำให้ไฟล์ที่ 2 ขึ้นไป
//     ที่ตั้งใจใช้รูปแบบอื่น (เช่น ก. ข. ค. แทน 1. 2. 3.) ถูกบังคับให้ใช้รูปแบบของไฟล์แรกเงียบ ๆ
//     ต่างจาก footnotes/endnotes/comments ตรงที่ numbering ซ้อนสองชั้น: เนื้อหาอ้าง w:numId (ฉลาก
//     ที่ใช้จริง) → w:numId ชี้ไปที่ w:abstractNumId (นิยามรูปแบบแต่ละระดับ) อีกที ต้องออกเลขใหม่
//     ให้ทั้งสองชั้นแล้วเชื่อมให้ตรงกัน จึงจัดการแยกจาก MERGE_PARTS (ดู NUMBERING_PART ด้านล่าง)

import { loadLibs } from "./loader.js";
import { tr } from "./i18n.js";
import { assertNotEmpty, friendlyZipOpenError } from "./filetype.js";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";

/* ‼️ part กลุ่มนี้เป็น "ไฟล์เดียวต่อเอกสาร" เหมือน styles/numbering แต่ต่างกันตรงที่
 * มันมีเนื้อหาของผู้ใช้อยู่ข้างใน จึงต้อง merge จริง ไม่ใช่ใช้ของไฟล์แรกแล้วทิ้งที่เหลือ
 * และเนื้อแต่ละชิ้นถูกอ้างจาก body ด้วย attribute w:id ซึ่งทุกไฟล์เริ่มนับใหม่ที่เลขต่ำเหมือนกันหมด
 * ถ้าไม่ออกเลขใหม่ให้ ตัวอ้างอิงของไฟล์หลังจะไปชี้เนื้อของไฟล์แรก = เนื้อหาสลับกันแบบเงียบสนิท
 * (ยิงจริง 09/09/2026: รวม 2 ไฟล์ที่ต่างมีเชิงอรรถ ได้จุดอ้างอิง w:id = ['2','2'] ทั้งคู่
 *  เนื้อของไฟล์ที่ 2 หายไปนอนเป็นไฟล์กำพร้าใน word/media/ และคอมเมนต์หายสนิทไม่เหลือใน zip เลย)
 * ‼️ w:id ตรงนี้คนละเรื่องกับ r:id ของ relationship คนละเนมสเปซ ตัว remap จึงต้องแยกกัน */
const MERGE_PARTS = [
  { part: "word/footnotes.xml", root: "footnotes", item: "footnote", relType: "footnotes",
    refs: ["footnoteReference"],
    ct: "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml" },
  { part: "word/endnotes.xml", root: "endnotes", item: "endnote", relType: "endnotes",
    refs: ["endnoteReference"],
    ct: "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml" },
  // คอมเมนต์อ้างถึง 3 จุดในเนื้อความ: จุดวางเครื่องหมาย กับหัวและท้ายช่วงที่คลุมไว้
  { part: "word/comments.xml", root: "comments", item: "comment", relType: "comments",
    refs: ["commentReference", "commentRangeStart", "commentRangeEnd"],
    ct: "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml" },
];

/* numbering.xml: spec เดียวกับ MERGE_PARTS (part/relType/ct) ใช้ตอนเขียนไฟล์ผลลัพธ์ท้ายสุดได้เหมือนกัน
 * (ดู allMergedParts ใกล้ท้ายไฟล์) แต่ตัวออกเลขใหม่/remap เนื้อหาแยกเป็นฟังก์ชันของตัวเอง เพราะโครง
 * เป็นสองชั้น (abstractNum → num) ไม่ใช่ item ชั้นเดียวที่มี w:id แบบ footnote/endnote/comment */
const NUMBERING_PART = "word/numbering.xml";
const NUMBERING_SPEC = {
  part: NUMBERING_PART,
  relType: "numbering",
  ct: "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml",
};

const PAGE_BREAK =
  '<w:p xmlns:w="' + W + '"><w:r><w:br w:type="page"/></w:r></w:p>';

/**
 * รวมไฟล์ .docx หลายไฟล์
 * options: pageBreak = แทรกการขึ้นหน้าใหม่ระหว่างไฟล์
 * คืน { blob, parts } — parts บอกว่าดึงเนื้อหาจากไฟล์ไหนมากี่ย่อหน้า
 */
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
  return zip;
}

export async function joinDocx(files, { pageBreak = true, onProgress } = {}) {
  if (files.length < 2) throw new Error(tr("ต้องเลือกอย่างน้อย 2 ไฟล์จึงจะรวมได้", "Choose at least 2 files to combine them"));
  const [JSZipLib] = await loadLibs("jszip");

  const base = await openDocxZip(files[0], JSZipLib);
  const baseDocFile = base.file("word/document.xml");
  if (!baseDocFile) throw new Error(tr(`${files[0].name}: เนื้อในไม่ใช่ไฟล์ Word (.docx) ที่ถูกต้อง, ตรวจไฟล์ต้นทางแล้วลองใหม่`, `${files[0].name}: the content inside isn't a valid Word (.docx) file, check the source and try again`));
  const baseDocXml = await baseDocFile.async("string");
  const baseDoc = new DOMParser().parseFromString(baseDocXml, "application/xml");
  const body = baseDoc.getElementsByTagNameNS(W, "body")[0];
  if (!body) throw new Error(tr(`${files[0].name}: เปิดไม่ได้ อาจไม่ใช่ .docx ที่ถูกต้อง, ตรวจไฟล์ต้นทางแล้วลองใหม่`, `${files[0].name}: could not open, it may not be a valid .docx, check the source and try again`));

  const baseRelsXml = base.file("word/_rels/document.xml.rels")
    ? await base.file("word/_rels/document.xml.rels").async("string")
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${RELS_NS}"></Relationships>`;
  const baseRels = new DOMParser().parseFromString(baseRelsXml, "application/xml");
  const relsRoot = baseRels.documentElement;

  // สถานะของ part ที่ต้อง merge (เชิงอรรถ, อ้างอิงท้ายเรื่อง, คอมเมนต์) เริ่มจากของไฟล์ฐาน
  // maxId = เลข w:id สูงสุดที่ใช้ไปแล้ว ไฟล์ถัดไปจะออกเลขต่อจากนี้เสมอ จึงไม่มีทางชนกัน
  const merged = [];
  for (const spec of MERGE_PARTS) {
    const f = base.file(spec.part);
    const doc = f
      ? new DOMParser().parseFromString(await f.async("string"), "application/xml")
      : null;
    let maxId = 0;
    if (doc) {
      for (const it of doc.getElementsByTagNameNS(W, spec.item)) {
        const id = parseInt(it.getAttributeNS(W, "id"), 10);
        if (!Number.isNaN(id) && id > maxId) maxId = id;
      }
    }
    merged.push({ spec, doc, maxId, isNew: false, written: false });
  }

  // สถานะของ numbering.xml เริ่มจากของไฟล์ฐาน เหมือน merged ข้างบน แต่ต้องคุมเลข "สองชั้น" แยกกัน:
  // maxAbstractId (นิยามรูปแบบ) เริ่มนับที่ 0 ได้ปกติ ส่วน maxNumId (ฉลากที่เนื้อหาอ้างถึง) ห้ามออกเลข 0
  // เพราะ w:numId="0" เป็นค่าสงวนของ OOXML แปลว่า "ปิดการใส่เลข/หัวข้อย่อย" ไม่ใช่ id ของรายการจริง
  const numbering = { spec: NUMBERING_SPEC, doc: null, isNew: false, written: false, maxAbstractId: -1, maxNumId: 0 };
  {
    const f = base.file(NUMBERING_PART);
    if (f) numbering.doc = new DOMParser().parseFromString(await f.async("string"), "application/xml");
    if (numbering.doc) {
      for (const an of numbering.doc.getElementsByTagNameNS(W, "abstractNum")) {
        const id = parseInt(an.getAttributeNS(W, "abstractNumId"), 10);
        if (!Number.isNaN(id) && id > numbering.maxAbstractId) numbering.maxAbstractId = id;
      }
      for (const n of numbering.doc.getElementsByTagNameNS(W, "num")) {
        const id = parseInt(n.getAttributeNS(W, "numId"), 10);
        if (!Number.isNaN(id) && id > numbering.maxNumId) numbering.maxNumId = id;
      }
    }
  }

  const extraFiles = {};          // ไฟล์สื่อที่ต้องเพิ่มเข้าแพ็กเกจ
  const parts = [{ name: files[0].name, paragraphs: countParagraphs(body) }];
  let relSeq = 1000;              // เริ่มรหัสใหม่ให้ห่างจากของเดิม กันชนกันแน่นอน

  for (let i = 1; i < files.length; i++) {
    onProgress?.({ done: i, total: files.length - 1 });
    const zip = await JSZipLib.loadAsync(await files[i].arrayBuffer());
    const docFile = zip.file("word/document.xml");
    if (!docFile) throw new Error(tr(`เปิดไฟล์ “${files[i].name}” ไม่ได้ อาจไม่ใช่ .docx ที่ถูกต้อง`, `Could not open "${files[i].name}", it may not be a valid .docx`));

    const doc = new DOMParser().parseFromString(await docFile.async("string"), "application/xml");
    const srcBody = doc.getElementsByTagNameNS(W, "body")[0];
    if (!srcBody) throw new Error(tr(`ไฟล์ “${files[i].name}” ไม่มีเนื้อหา`, `"${files[i].name}" has no content`));

    // สร้างตารางแปลงรหัสความสัมพันธ์เก่า → ใหม่ พร้อมคัดลอกไฟล์สื่อที่เกี่ยวข้อง
    const map = new Map();
    const relsFile = zip.file("word/_rels/document.xml.rels");
    if (relsFile) {
      const rels = new DOMParser().parseFromString(await relsFile.async("string"), "application/xml");
      for (const rel of rels.getElementsByTagName("Relationship")) {
        const type = rel.getAttribute("Type") || "";
        const target = rel.getAttribute("Target") || "";
        // ข้ามส่วนที่ผูกกับโครงเอกสาร (styles/numbering/settings) เพราะใช้ของไฟล์แรก
        // footnotes/endnotes/comments ถูกจัดการแยกด้านล่าง (merge เนื้อหาจริง ไม่ใช่ข้ามหรือก็อปเป็น media)
        if (/(styles|numbering|settings|webSettings|fontTable|theme|comments|footnotes|endnotes)/.test(target)) continue;

        const newId = `rIdJoin${relSeq++}`;
        map.set(rel.getAttribute("Id"), newId);

        let newTarget = target;
        const isExternal = rel.getAttribute("TargetMode") === "External";
        if (!isExternal && !target.startsWith("http")) {
          const srcPath = "word/" + target.replace(/^\.\//, "");
          const entry = zip.file(srcPath);
          if (entry) {
            const ext = srcPath.split(".").pop();
            const newName = `media/join${relSeq}_${i}.${ext}`;
            extraFiles["word/" + newName] = await entry.async("uint8array");
            newTarget = newName;
          }
        }
        const el = baseRels.createElementNS(RELS_NS, "Relationship");
        el.setAttribute("Id", newId);
        el.setAttribute("Type", type);
        el.setAttribute("Target", newTarget);
        if (isExternal) el.setAttribute("TargetMode", "External");
        relsRoot.appendChild(el);
      }
    }

    // merge เนื้อของ part กลุ่ม MERGE_PARTS จากไฟล์นี้เข้ากับของฐาน พร้อมออก w:id ใหม่ให้ไม่ชนกัน
    const idMaps = new Map();      // spec → Map(id เดิม → id ใหม่)
    for (const m of merged) {
      const map = new Map();
      idMaps.set(m.spec, map);
      const srcFile = zip.file(m.spec.part);
      if (!srcFile) continue;
      const srcDoc = new DOMParser().parseFromString(await srcFile.async("string"), "application/xml");
      if (!m.doc) {
        // ไฟล์ฐานไม่มี part นี้มาก่อน สร้างใหม่ + ผูก relationship (content-type เติมตอนประกอบ zip)
        m.doc = new DOMParser().parseFromString(
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:${m.spec.root} xmlns:w="${W}"></w:${m.spec.root}>`,
          "application/xml",
        );
        const relEl = baseRels.createElementNS(RELS_NS, "Relationship");
        relEl.setAttribute("Id", `rIdJoin${relSeq++}`);
        relEl.setAttribute("Type", `${R}/${m.spec.relType}`);
        relEl.setAttribute("Target", m.spec.part.slice("word/".length));
        relsRoot.appendChild(relEl);
        m.isNew = true;
      }
      const root = m.doc.documentElement;
      for (const it of [...srcDoc.getElementsByTagNameNS(W, m.spec.item)]) {
        const type = it.getAttributeNS(W, "type");
        // เส้นคั่นมาตรฐานที่ทุกไฟล์มีเหมือนกันอยู่แล้ว ใช้ของฐานพอ ไม่ต้องรวมซ้ำ
        if (type === "separator" || type === "continuationSeparator") continue;
        const oldId = it.getAttributeNS(W, "id");
        m.maxId += 1;
        const newId = String(m.maxId);
        map.set(oldId, newId);
        const imported = m.doc.importNode(it, true);
        for (const attr of [...imported.attributes]) {
          if (attr.namespaceURI === W && attr.localName === "id") attr.value = newId;
        }
        root.appendChild(imported);
      }
    }

    // merge numbering.xml ของไฟล์นี้เข้ากับของฐาน: ออกเลขใหม่ทั้ง abstractNumId (นิยามรูปแบบ)
    // และ numId (ฉลากที่เนื้อหาอ้างถึง) แล้วแก้ w:num ให้ชี้ไปยัง abstractNumId ใหม่ให้ตรงกัน
    // (numIdMap ใช้ remap w:numPr/w:numId ในเนื้อหาต่อด้านล่าง ผ่าน remapNumIds)
    const numIdMap = new Map();      // numId เดิมของไฟล์นี้ → numId ใหม่หลัง merge
    const srcNumFile = zip.file(NUMBERING_PART);
    if (srcNumFile) {
      const srcNumDoc = new DOMParser().parseFromString(await srcNumFile.async("string"), "application/xml");
      if (!numbering.doc) {
        // ไฟล์ฐานไม่มี numbering.xml มาก่อน สร้างใหม่ + ผูก relationship (content-type เติมตอนประกอบ zip)
        numbering.doc = new DOMParser().parseFromString(
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="${W}"></w:numbering>`,
          "application/xml",
        );
        const relEl = baseRels.createElementNS(RELS_NS, "Relationship");
        relEl.setAttribute("Id", `rIdJoin${relSeq++}`);
        relEl.setAttribute("Type", `${R}/numbering`);
        relEl.setAttribute("Target", "numbering.xml");
        relsRoot.appendChild(relEl);
        numbering.isNew = true;
      }
      const root = numbering.doc.documentElement;
      // schema ของ CT_Numbering บังคับลำดับ abstractNum* มาก่อน num* เสมอ ต้องแทรก abstractNum
      // ใหม่ไว้ก่อน <w:num> ตัวแรกที่มีอยู่ (ถ้ามี) ไม่ใช่ต่อท้ายรูตเฉย ๆ ไม่งั้นไฟล์เปิดไม่ขึ้น
      const firstNum = [...root.children].find((c) => c.namespaceURI === W && c.localName === "num");

      const abstractIdMap = new Map();   // abstractNumId เดิมของไฟล์นี้ → ใหม่
      for (const an of [...srcNumDoc.getElementsByTagNameNS(W, "abstractNum")]) {
        numbering.maxAbstractId += 1;
        const newId = String(numbering.maxAbstractId);
        abstractIdMap.set(an.getAttributeNS(W, "abstractNumId"), newId);
        const imported = numbering.doc.importNode(an, true);
        for (const attr of [...imported.attributes]) {
          if (attr.namespaceURI === W && attr.localName === "abstractNumId") attr.value = newId;
        }
        if (firstNum) root.insertBefore(imported, firstNum);
        else root.appendChild(imported);
      }
      for (const n of [...srcNumDoc.getElementsByTagNameNS(W, "num")]) {
        const oldId = n.getAttributeNS(W, "numId");
        numbering.maxNumId += 1;
        const newId = String(numbering.maxNumId);
        numIdMap.set(oldId, newId);
        const imported = numbering.doc.importNode(n, true);
        for (const attr of [...imported.attributes]) {
          if (attr.namespaceURI === W && attr.localName === "numId") attr.value = newId;
        }
        // <w:num> ชี้ไปยังนิยามรูปแบบผ่าน <w:abstractNumId w:val="..."/> ลูกของมันเอง (คนละที่กับ
        // attribute w:numId ข้างบน) ต้องแก้ให้ชี้ตาม abstractIdMap ของไฟล์นี้ ไม่งั้นจะชี้ผิดไฟล์
        const abstractRef = imported.getElementsByTagNameNS(W, "abstractNumId")[0];
        if (abstractRef) {
          for (const attr of [...abstractRef.attributes]) {
            if (attr.namespaceURI === W && attr.localName === "val" && abstractIdMap.has(attr.value)) {
              attr.value = abstractIdMap.get(attr.value);
            }
          }
        }
        root.appendChild(imported);
      }
    }

    if (pageBreak) {
      const br = new DOMParser().parseFromString(PAGE_BREAK, "application/xml").documentElement;
      body.appendChild(baseDoc.importNode(br, true));
    }

    let added = 0;
    for (const child of [...srcBody.childNodes]) {
      // การตั้งค่าหน้ากระดาษท้ายไฟล์ต้องไม่ตามมาด้วย ไม่งั้นหน้าเพี้ยนตั้งแต่ไฟล์ที่สอง
      if (child.nodeType === 1 && child.localName === "sectPr") continue;
      const node = baseDoc.importNode(child, true);
      remapRelIds(node, map);
      remapMergedIds(node, merged, idMaps);
      remapNumIds(node, numIdMap);
      body.appendChild(node);
      if (child.nodeType === 1 && child.localName === "p") added++;
    }
    parts.push({ name: files[i].name, paragraphs: added });
  }

  // sectPr ของไฟล์แรกต้องอยู่ท้าย body เสมอตามข้อกำหนดของ OOXML
  const sect = [...body.childNodes].find((n) => n.nodeType === 1 && n.localName === "sectPr");
  if (sect) body.appendChild(sect);

  // numbering ใช้ spec shape เดียวกับ merged (part/relType/ct) จึงเขียนไฟล์ผลลัพธ์ผ่านลูปเดียวกันได้เลย
  // ไม่ต้องเปิดทางแยกซ้ำซ้อน (ตัว remap เนื้อหา/ออกเลขใหม่เท่านั้นที่แยก เพราะโครงสองชั้นคนละแบบ)
  const allMergedParts = [...merged, numbering];

  const out = new JSZipLib();
  const ser = (d) => new XMLSerializer().serializeToString(d);
  for (const name of Object.keys(base.files)) {
    const entry = base.files[name];
    if (entry.dir) continue;
    if (name === "word/document.xml") { out.file(name, ser(baseDoc)); continue; }
    if (name === "word/_rels/document.xml.rels") { out.file(name, ser(baseRels)); continue; }
    const hit = allMergedParts.find((m) => m.spec.part === name && m.doc);
    if (hit) { out.file(name, ser(hit.doc)); hit.written = true; continue; }
    const fresh = allMergedParts.filter((m) => m.isNew);
    if (name === "[Content_Types].xml" && fresh.length) {
      let ct = await entry.async("string");
      for (const m of fresh) {
        if (ct.includes(`PartName="/${m.spec.part}"`)) continue;
        ct = ct.replace("</Types>", `<Override PartName="/${m.spec.part}" ContentType="${m.spec.ct}"/></Types>`);
      }
      out.file(name, ct);
      continue;
    }
    out.file(name, await entry.async("uint8array"));
  }
  // part ที่ไฟล์ฐานไม่มีมาก่อนแต่ไฟล์อื่นเติมเข้ามา ต้องเขียนเพิ่มเอง
  // (ลูปข้างบนไล่จากรายชื่อไฟล์ของฐาน จะไม่มีทางเจอชื่อนี้เพื่อ trigger เงื่อนไขด้านบน)
  for (const m of allMergedParts) if (m.doc && !m.written) out.file(m.spec.part, ser(m.doc));
  for (const [name, data] of Object.entries(extraFiles)) out.file(name, data);

  const blob = await out.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
  return { blob, parts };
}

function countParagraphs(body) {
  let n = 0;
  for (const c of body.childNodes) if (c.nodeType === 1 && c.localName === "p") n++;
  return n;
}

/** เปลี่ยนรหัสความสัมพันธ์ในทุก attribute ที่อ้างถึง (r:id, r:embed, r:link ฯลฯ) */
function remapRelIds(node, map) {
  if (!map.size) return;
  const walk = (n) => {
    if (n.nodeType === 1 && n.attributes) {
      for (const attr of [...n.attributes]) {
        if (attr.namespaceURI === R && map.has(attr.value)) attr.value = map.get(attr.value);
      }
    }
    for (const c of n.childNodes) walk(c);
  };
  walk(node);
}

/** เปลี่ยน w:id ของตัวอ้างอิงเชิงอรรถ/อ้างอิงท้ายเรื่อง/คอมเมนต์ ให้ตรงกับเลขใหม่ที่ออกให้ตอน merge
 *  (คนละเรื่องกับ r:id ข้างบน: w:footnoteReference w:id="N" ชี้เข้า <w:footnote w:id="N"> ในอีกไฟล์หนึ่ง
 *   ไม่ได้ชี้ผ่าน relationship เลย ถ้าลืม remap จุดนี้ เนื้อหาจะสลับกันโดยไม่มีอะไรฟ้อง) */
function remapMergedIds(node, merged, idMaps) {
  const byTag = new Map();
  for (const m of merged) {
    const map = idMaps.get(m.spec);
    if (!map || !map.size) continue;
    for (const tag of m.spec.refs) byTag.set(tag, map);
  }
  if (!byTag.size) return;
  const walk = (n) => {
    if (n.nodeType === 1 && n.namespaceURI === W && byTag.has(n.localName)) {
      const map = byTag.get(n.localName);
      for (const attr of [...n.attributes]) {
        if (attr.namespaceURI === W && attr.localName === "id" && map.has(attr.value)) {
          attr.value = map.get(attr.value);
        }
      }
    }
    for (const c of n.childNodes) walk(c);
  };
  walk(node);
}

/** เปลี่ยน w:numId ในเนื้อหา (ภายใน <w:numPr><w:numId w:val="N"/></w:numPr>) ให้ชี้ไปที่ <w:num>
 *  ที่ออกเลขใหม่ให้ตอน merge numbering.xml (คนละเรื่องกับ remapMergedIds: ที่นั่น w:id ของแต่ละ item
 *  ชี้ตรงถึงเนื้อหา ส่วนนี้ w:numId ชี้ไปที่ <w:num w:numId="N"> ซึ่งชี้ต่อไปยัง abstractNum อีกที
 *  จึงต้อง remap แค่ชั้นเดียวคือ numId ในเนื้อหา ส่วน abstractNumId ถูกจัดการไปแล้วตอนสร้าง <w:num> ใหม่)
 *  ‼️ w:numId w:val="0" เป็นค่าสงวนแปลว่า "ปิดการใส่เลข/หัวข้อย่อย" ไม่ใช่การอ้างอิงจริง ต้องปล่อยผ่าน
 *  ไม่ remap ไม่งั้นจะไปสร้างการอ้างอิงที่ไม่มีอยู่จริงในไฟล์ต้นทาง */
function remapNumIds(node, numIdMap) {
  if (!numIdMap.size) return;
  const walk = (n) => {
    if (n.nodeType === 1 && n.namespaceURI === W && n.localName === "numId") {
      for (const attr of [...n.attributes]) {
        if (attr.namespaceURI === W && attr.localName === "val" && attr.value !== "0" && numIdMap.has(attr.value)) {
          attr.value = numIdMap.get(attr.value);
        }
      }
    }
    for (const c of n.childNodes) walk(c);
  };
  walk(node);
}
