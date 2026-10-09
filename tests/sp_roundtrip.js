// จำลองสิ่งที่ SharePoint ทำกับไฟล์ .xlsx หลัง OneDrive อัปขึ้น แล้ว OneDrive ดึงรุ่นนั้นกลับมาทับไฟล์ในเครื่อง
//
// ‼️ ที่มา (ทดสอบจริง 09/10/2026 บนทีม Data ของบัญชี 65 หลักฐาน .claude/evidence/2026-10-09-onedrive-team-sync-test/)
//    เขียนไฟล์ 7,316 ไบต์ลงโฟลเดอร์ทีมที่ shortcut ลง OneDrive ภายใน 1 วินาทีไฟล์ในเครื่องกลายเป็น 15,139 ไบต์
//    เทียบรายไฟล์ใน zip: ชีต สไตล์ ธีม workbook.xml ไบต์เดิมทุกตัว ส่วนที่ต่างมีแค่ชุดนี้
//      เพิ่ม  customXml/item1..3.xml, itemProps1..3.xml, _rels/item1..3.xml.rels, docProps/custom.xml, [trash]/0000..0003.dat
//      แก้   [Content_Types].xml, _rels/.rels, docProps/core.xml, xl/_rels/workbook.xml.rels (เพิ่มลิงก์ไป customXml)
//    เนื้อในที่นี้เป็นของสมมติ (ของจริงมีชื่อคนและรหัส content type ของ tenant ห้ามลงรีโปสาธารณะ) แต่ชุดไฟล์ที่ถูกแตะตรงกับของจริง
//
// ใช้ได้ทั้ง node (tests/xlsxpatch.test.mjs) และในหน้าเว็บ (tests/browser_lookup.py ฉีดเป็นสคริปต์ ตัดคำว่า export ออก)
export async function spRoundtrip(JSZip, bytes) {
  const z = await JSZip.loadAsync(bytes);
  for (let i = 1; i <= 3; i++) {
    z.file(`customXml/item${i}.xml`, `<?xml version="1.0" encoding="utf-8"?><ct:contentTypeSchema xmlns:ct="http://schemas.microsoft.com/office/2006/metadata/contentType" ma:contentTypeID="0x0101FA${i}"/>`);
    z.file(`customXml/itemProps${i}.xml`, `<?xml version="1.0" encoding="utf-8"?><ds:datastoreItem ds:itemID="{00000000-0000-0000-0000-00000000000${i}}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"/>`);
    z.file(`customXml/_rels/item${i}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps" Target="itemProps${i}.xml"/></Relationships>`);
  }
  for (let i = 0; i < 4; i++) z.file(`[trash]/000${i}.dat`, new Uint8Array(183).fill(0));
  z.file("docProps/custom.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="ContentTypeId"><vt:lpwstr xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">0x0101FA</vt:lpwstr></property></Properties>`);
  const edit = async (name, fn) => { const f = z.file(name); if (f) z.file(name, fn(await f.async("string"))); };
  await edit("[Content_Types].xml", (s) => s.replace("</Types>",
    `<Override PartName="/customXml/itemProps1.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/><Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/></Types>`));
  await edit("_rels/.rels", (s) => s.replace("</Relationships>",
    `<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/></Relationships>`));
  await edit("xl/_rels/workbook.xml.rels", (s) => s.replace("</Relationships>",
    `<Relationship Id="rId97" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/item1.xml"/></Relationships>`));
  await edit("docProps/core.xml", (s) => s.replace(/<dcterms:modified([^>]*)>[^<]*</, "<dcterms:modified$1>2026-10-09T08:23:35Z<"));
  return new Uint8Array(await z.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
}

// จำลองคนอื่นแก้ข้อมูลจริง (ข้อความในตารางข้อความรวมเปลี่ยน) ใช้เป็นเคสที่ตัวกันต้องยังกันอยู่
export async function editContent(JSZip, bytes) {
  const z = await JSZip.loadAsync(bytes);
  const name = z.file("xl/sharedStrings.xml") ? "xl/sharedStrings.xml" : Object.keys(z.files).find((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const s = await z.file(name).async("string");
  const out = name.endsWith("sharedStrings.xml") ? s.replace(/<t([^>]*)>/, "<t$1>แก้โดยคนอื่น ") : s.replace(/<v>/, "<v>9");
  if (out === s) throw new Error("editContent: หาจุดแก้ไม่เจอ");
  z.file(name, out);
  return new Uint8Array(await z.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
}
