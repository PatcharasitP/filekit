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

import { loadLibs } from "./loader.js";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";

const PAGE_BREAK =
  '<w:p xmlns:w="' + W + '"><w:r><w:br w:type="page"/></w:r></w:p>';

/**
 * รวมไฟล์ .docx หลายไฟล์
 * options: pageBreak = แทรกการขึ้นหน้าใหม่ระหว่างไฟล์
 * คืน { blob, parts } — parts บอกว่าดึงเนื้อหาจากไฟล์ไหนมากี่ย่อหน้า
 */
export async function joinDocx(files, { pageBreak = true, onProgress } = {}) {
  if (files.length < 2) throw new Error("ต้องเลือกอย่างน้อย 2 ไฟล์จึงจะรวมได้");
  const [JSZipLib] = await loadLibs("jszip");

  const base = await JSZipLib.loadAsync(await files[0].arrayBuffer());
  const baseDocXml = await base.file("word/document.xml").async("string");
  const baseDoc = new DOMParser().parseFromString(baseDocXml, "application/xml");
  const body = baseDoc.getElementsByTagNameNS(W, "body")[0];
  if (!body) throw new Error(`เปิดไฟล์ “${files[0].name}” ไม่ได้ — อาจไม่ใช่ .docx ที่ถูกต้อง`);

  const baseRelsXml = base.file("word/_rels/document.xml.rels")
    ? await base.file("word/_rels/document.xml.rels").async("string")
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${RELS_NS}"></Relationships>`;
  const baseRels = new DOMParser().parseFromString(baseRelsXml, "application/xml");
  const relsRoot = baseRels.documentElement;

  const extraFiles = {};          // ไฟล์สื่อที่ต้องเพิ่มเข้าแพ็กเกจ
  const parts = [{ name: files[0].name, paragraphs: countParagraphs(body) }];
  let relSeq = 1000;              // เริ่มรหัสใหม่ให้ห่างจากของเดิม กันชนกันแน่นอน

  for (let i = 1; i < files.length; i++) {
    onProgress?.({ done: i, total: files.length - 1 });
    const zip = await JSZipLib.loadAsync(await files[i].arrayBuffer());
    const docFile = zip.file("word/document.xml");
    if (!docFile) throw new Error(`เปิดไฟล์ “${files[i].name}” ไม่ได้ — อาจไม่ใช่ .docx ที่ถูกต้อง`);

    const doc = new DOMParser().parseFromString(await docFile.async("string"), "application/xml");
    const srcBody = doc.getElementsByTagNameNS(W, "body")[0];
    if (!srcBody) throw new Error(`ไฟล์ “${files[i].name}” ไม่มีเนื้อหา`);

    // สร้างตารางแปลงรหัสความสัมพันธ์เก่า → ใหม่ พร้อมคัดลอกไฟล์สื่อที่เกี่ยวข้อง
    const map = new Map();
    const relsFile = zip.file("word/_rels/document.xml.rels");
    if (relsFile) {
      const rels = new DOMParser().parseFromString(await relsFile.async("string"), "application/xml");
      for (const rel of rels.getElementsByTagName("Relationship")) {
        const type = rel.getAttribute("Type") || "";
        const target = rel.getAttribute("Target") || "";
        // ข้ามส่วนที่ผูกกับโครงเอกสาร (styles/numbering/settings) เพราะใช้ของไฟล์แรก
        if (/(styles|numbering|settings|webSettings|fontTable|theme|comments)/.test(target)) continue;

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
      body.appendChild(node);
      if (child.nodeType === 1 && child.localName === "p") added++;
    }
    parts.push({ name: files[i].name, paragraphs: added });
  }

  // sectPr ของไฟล์แรกต้องอยู่ท้าย body เสมอตามข้อกำหนดของ OOXML
  const sect = [...body.childNodes].find((n) => n.nodeType === 1 && n.localName === "sectPr");
  if (sect) body.appendChild(sect);

  const out = new JSZipLib();
  for (const name of Object.keys(base.files)) {
    const entry = base.files[name];
    if (entry.dir) continue;
    if (name === "word/document.xml") { out.file(name, new XMLSerializer().serializeToString(baseDoc)); continue; }
    if (name === "word/_rels/document.xml.rels") { out.file(name, new XMLSerializer().serializeToString(baseRels)); continue; }
    out.file(name, await entry.async("uint8array"));
  }
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
