import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { patchXlsx, serialOf } from "../src/xlsxpatch.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const JSZip = require(join(ROOT, "vendor/jszip.min.js"));
const XLSX = require(join(ROOT, "vendor/xlsx.full.min.js"));

let pass = 0; const F = [];
const ck = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : F.push(`${name}\n      ได้    : ${JSON.stringify(got)}\n      ควรได้ : ${JSON.stringify(want)}`);
  console.log(`  ${ok ? "✅" : "❌"} ${name}`);
};

/* ไฟล์ทดสอบ tests/fixtures/lookup-main.xlsx ถูก Excel จริงเขียน (สร้างด้วย tools/build_lookup_samples.py แล้วให้ Excel บันทึกซ้ำ)
   จึงมี spans, x14ac, sharedStrings, สูตร shared, ช่องปลายทางที่ว่างแต่มีสไตล์ <c r="N3" s="3"/> ตามไฟล์จริงของบริษัท */
const orig = readFileSync(join(ROOT, "tests/fixtures/lookup-main.xlsx"));
const D = (y, m, d) => new Date(y, m - 1, d);
const edits = [
  { r: 3, c: 13, v: D(2026, 3, 27) },        // N3 วันที่ ช่องมีสไตล์วันที่อยู่แล้ว (s=3)
  { r: 3, c: 14, v: "TX-6900001" },          // O3 ข้อความ ช่องมีสไตล์ @ (s=5)
  { r: 3, c: 15, v: "TT-01" },
  { r: 5, c: 15, v: "ต้องไม่ถูกเขียน" },     // P5 เป็นสูตร ="" ห้ามทับ
  { r: 12, c: 14, v: "ทับของเดิม" },         // O12 มีข้อความเดิมอยู่ (ชั้นบนต้องตัดสินใจเองว่าจะส่งมาไหม)
  { r: 4, c: 13, v: D(2026, 4, 1) },         // แถวที่ถูกซ่อน (ฟิลเตอร์) ต้องเติมได้และยังซ่อนอยู่
  { r: 2, c: 17, v: "ใบกำกับใหม่" },           // R2 คอลัมน์ใหม่นอกขอบเดิม (หัวตาราง)
  { r: 3, c: 17, v: 1234.5 },
  { r: 4, c: 17, v: "a<b&c>\u0001\"'" },     // อักขระพิเศษ + อักขระควบคุมที่ XML ห้าม
  { r: 1, c: 13, v: "ท้ายแถว" },             // N1 แทรกหลัง K1 (ส่งมาก่อน A1 ตั้งใจให้ลำดับสลับ)
  { r: 1, c: 0, v: "หัวแถว" },               // A1 ต้องไปอยู่หน้า J1 แม้ส่งมาทีหลัง
];

console.log("\n━━ ① เขียนได้และอ่านกลับตรง ━━");
const { bytes, stat } = await patchXlsx(JSZip, orig, "2026", edits);
ck("สถิติ: เขียน 10 ช่อง ข้ามสูตร 1 ช่อง", [stat.written, stat.skippedFormula], [10, 1]);
// ‼️ อ่านวันที่เป็นเลขซีเรียลดิบ ไม่ใช้ cellDates เพราะ SheetJS เพี้ยน 4 วินาทีในเขตเวลาไทย (ดู sheetpick.js) ทำให้ได้วันก่อนหน้า
const wb = XLSX.read(bytes, { type: "array" });
const ws = wb.Sheets["2026"];
const v = (a) => ws[a] && ws[a].v;
ck("N3 เก็บเป็นเลขซีเรียลของ 27/03/2026 และแสดงเป็นวันที่ (สไตล์เดิม)", [v("N3"), ws["N3"].w], [46108, "27/03/2026"]);
ck("O3 / P3", [v("O3"), v("P3")], ["TX-6900001", "TT-01"]);
ck("P5 (สูตร) ไม่ถูกทับ", ws["P5"] && ws["P5"].f !== undefined, true);
ck("O12 ถูกทับตามที่สั่ง", v("O12"), "ทับของเดิม");
ck("แถวที่ซ่อนก็เติมได้ (01/04/2026 = 46113)", v("N4"), 46113);
ck("คอลัมน์ใหม่ R", [v("R2"), v("R3")], ["ใบกำกับใหม่", 1234.5]);
ck("อักขระพิเศษรอด อักขระควบคุมถูกตัด", v("R4"), "a<b&c>\"'");
ck("ขอบเขตชีตขยายเป็น R20", ws["!ref"], "A1:R20");

console.log("\n━━ ② ทุกอย่างที่ไม่ได้แก้ต้องเหมือนเดิมทุกไบต์ ━━");
const zo = await JSZip.loadAsync(orig), zn = await JSZip.loadAsync(bytes);
ck("รายชื่อไฟล์ใน zip เท่าเดิม", Object.keys(zn.files).sort(), Object.keys(zo.files).sort());
const changed = [];
for (const name of Object.keys(zo.files)) {
  if (zo.files[name].dir) continue;
  const a = await zo.file(name).async("string"), b = await zn.file(name).async("string");
  if (a !== b) changed.push(name);
}
// workbook.xml เปลี่ยนเพราะ R2 เป็นหัวคอลัมน์ใหม่ติดขวาฟิลเตอร์ ชื่อช่วงฟิลเตอร์ที่ซ่อนไว้จึงขยายตาม (06/10/2026)
ck("ไฟล์ที่ถูกแก้มีแค่ชีตเดียวกับ workbook.xml (และ styles ถ้าต้องเพิ่มสไตล์)", changed.filter((n) => n !== "xl/styles.xml"), ["xl/workbook.xml", "xl/worksheets/sheet1.xml"]);
const wbChanged = await zn.file("xl/workbook.xml").async("string"), wbOrig = await zo.file("xl/workbook.xml").async("string");
ck("workbook.xml ต่างเฉพาะชื่อช่วงฟิลเตอร์", wbChanged.replace("$R$20", "$Q$20"), wbOrig);
ck("styles ไม่ถูกแตะ เมื่อช่องปลายทางมีสไตล์วันที่อยู่แล้ว (N3 s=3) แต่ N4 ก็ s=3 เช่นกัน", changed.includes("xl/styles.xml"), false);

const cellsOf = (xml) => {
  const m = new Map();
  for (const x of xml.matchAll(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)) m.set(x[0].match(/\sr="([A-Z]+\d+)"/)[1], x[0]);
  return m;
};
const so = await zo.file("xl/worksheets/sheet1.xml").async("string");
const sn = await zn.file("xl/worksheets/sheet1.xml").async("string");
const co = cellsOf(so), cn = cellsOf(sn);
const touched = new Set(edits.map((e) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[e.c] + e.r));
const diff = [...co.keys()].filter((k) => !touched.has(k) && co.get(k) !== cn.get(k));
ck("ช่องอื่นทุกช่องเหมือนเดิมเป๊ะ (รวมสูตร shared ใน G)", diff, []);
ck("จำนวนช่องที่เพิ่ม = 5 (R2 R3 R4 A1 N1)", cn.size - co.size, 5);
const head = (x) => x.slice(0, x.indexOf("<sheetData"));
ck("ส่วนหัวชีต (view, pane, cols) เหมือนเดิม ยกเว้น dimension", head(sn).replace(/<dimension[^>]*>/, ""), head(so).replace(/<dimension[^>]*>/, ""));
const tailOf = (x) => x.slice(x.indexOf("</sheetData>"));
ck("ส่วนท้ายชีตเหมือนเดิม ยกเว้นฟิลเตอร์ขยายครอบหัวคอลัมน์ใหม่ R2 (A2:Q20 เป็น A2:R20)", tailOf(sn), tailOf(so).replace('ref="A2:Q20"', 'ref="A2:R20"'));
ck("แถวที่ซ่อนยังซ่อนอยู่", /<row r="4"[^>]*hidden="1"/.test(sn), true);
ck("แถวที่ไม่ได้แตะเหมือนเดิมทั้งแถว (แถว 7)", sn.match(/<row r="7"[\s\S]*?<\/row>/)[0], so.match(/<row r="7"[\s\S]*?<\/row>/)[0]);
ck("สูตร shared ของ G ยังอยู่ครบ", (sn.match(/<f t="shared"/g) || []).length, (so.match(/<f t="shared"/g) || []).length);
ck("ช่องในแถว 1 เรียงตามคอลัมน์ ไม่ใช่ตามลำดับที่ส่งมา", [...sn.match(/<row r="1"[\s\S]*?<\/row>/)[0].matchAll(/<c r="([A-Z]+1)"/g)].map((m) => m[1]), ["A1", "J1", "K1", "N1"]);
ck("แถวที่แก้ไม่มี spans ค้าง (ตัวเลขเดิมผิดได้เมื่อเพิ่มคอลัมน์)", /<row r="3"[^>]*spans=/.test(sn), false);
ck("แถวที่ไม่ได้แก้ยังมี spans เดิม", /<row r="7"[^>]*spans="1:17"/.test(sn), true);
ck("ข้อความในไฟล์หนีอักขระ < & > ครบ (SheetJS ยอมรับ XML เสียได้ จึงต้องเช็คตัวอักษรตรง ๆ)", sn.includes("a&lt;b&amp;c&gt;"), true);
ck("ช่องข้อความใส่แบบ inlineStr ไม่แตะ sharedStrings", /t="inlineStr"/.test(sn), true);
ck("ช่องปลายทางคงสไตล์เดิม (O3 ยัง s=5)", /<c r="O3" s="5" t="inlineStr">/.test(sn), true);

console.log("\n━━ ③ ช่องวันที่ที่ไม่มีสไตล์วันที่ ต้องได้สไตล์วันที่ใหม่ ไม่ใช่เลขดิบ ━━");
const r3 = await patchXlsx(JSZip, orig, "2026", [{ r: 3, c: 16, v: D(2026, 3, 27) }, { r: 4, c: 16, v: D(2026, 3, 28) }]);
const w3 = XLSX.read(r3.bytes, { type: "array", cellNF: true }).Sheets["2026"];
// สไตล์ใหม่ใช้รูปแบบวันที่มาตรฐานของ Excel (numFmtId 14) ซึ่งแสดงตามการตั้งค่าภูมิภาคของเครื่อง (เครื่องพี่ปอนด์ = dd/mm/yyyy)
// SheetJS เรียก id 14 ว่า m/d/yy จึงเห็น 3/27/26 ในเทสนี้ แต่ใน Excel ไทยจะเป็น 27/03/2026
ck("Q3 (ช่องเลขธรรมดา) ได้รูปแบบวันที่มาตรฐาน ไม่ใช่ตัวเลข 46108 เปล่า ๆ", [w3["Q3"].v, w3["Q3"].z], [46108, "m/d/yy"]);
ck("สร้างสไตล์ใหม่ครั้งเดียว ใช้ร่วมกันสองช่อง", r3.stat.dateStyles, 2);   // นับครั้งที่ตัดสินใจ (ตัวเลขสไตล์ใหม่เดียวกัน)
const sx = await (await JSZip.loadAsync(r3.bytes)).file("xl/styles.xml").async("string");
const so0 = await zo.file("xl/styles.xml").async("string");
const cnt = (x) => +x.match(/<cellXfs count="(\d+)"/)[1];
ck("cellXfs เพิ่ม 1 (ไม่ใช่ 2)", cnt(sx) - cnt(so0), 1);
ck("Q3 กับ Q4 ใช้สไตล์เดียวกัน", new Set([...(await (await JSZip.loadAsync(r3.bytes)).file("xl/worksheets/sheet1.xml").async("string")).matchAll(/<c r="Q[34]" s="(\d+)"/g)].map((m) => m[1])).size, 1);

console.log("\n━━ ④ ข้อผิดพลาดที่ต้องพูดชัด ━━");
let msg = "";
try { await patchXlsx(JSZip, orig, "ไม่มีชีตนี้", edits); } catch (e) { msg = e.message; }
ck("ชีตที่ไม่มีอยู่ → error บอกชื่อชีต", msg, "ไม่พบชีต “ไม่มีชีตนี้” ในไฟล์");
ck("serialOf วันที่ 27/03/2026 = 46108", serialOf(D(2026, 3, 27)), 46108);
ck("serialOf ระบบ 1904 ต่างกัน 1462 วัน", serialOf(D(2026, 3, 27), true), 46108 - 1462);

console.log("\n━━ ⑤ ไม่มีการแก้ = ไฟล์เนื้อหาเหมือนเดิม ━━");
const none = await patchXlsx(JSZip, orig, "2026", []);
const zz = await JSZip.loadAsync(none.bytes);
let same = true;
for (const name of Object.keys(zo.files)) if (!zo.files[name].dir && (await zo.file(name).async("string")) !== (await zz.file(name).async("string"))) same = false;
ck("ไม่มีคำสั่งแก้ ทุกไฟล์ใน zip เหมือนเดิม", same, true);

/* ── รอบ 06/10/2026 เพิ่มแถวใหม่ท้ายตาราง (Addon) ──────────────────────────────
   แถวใหม่ต้องหน้าตาเหมือนแถวข้อมูลแถวสุดท้าย (สไตล์วันที่ ตัวเลข) และต้องอยู่ในช่วงฟิลเตอร์
   ไม่งั้นพี่กดฟิลเตอร์แล้วแถวใหม่ไม่ถูกกรอง (Excel กรองเฉพาะในช่วง ref) */
console.log("\n━━ ⑥ ต่อแถวใหม่ท้ายตาราง ━━");
const add = [
  { r: 21, c: 6, v: "10682619999999" }, { r: 21, c: 13, v: D(2026, 10, 6) }, { r: 21, c: 14, v: "TX-NEW" },
  { r: 22, c: 6, v: "10682619999998" },
];
const ap = await patchXlsx(JSZip, orig, "2026", add, { appendFrom: 21, styleRow: 20 });
const za = await JSZip.loadAsync(ap.bytes);
const sa = await za.file("xl/worksheets/sheet1.xml").async("string");
const wa = XLSX.read(ap.bytes, { type: "array" }).Sheets["2026"];
ck("ค่าในแถวใหม่อ่านกลับตรง", [wa["G21"]?.v, wa["N21"]?.v, wa["O21"]?.v, wa["G22"]?.v], ["10682619999999", 46301, "TX-NEW", "10682619999998"]);
ck("ช่องวันที่ของแถวใหม่ได้สไตล์เดียวกับแถว 20 (s=3)", /<c r="N21" s="3"><v>/.test(sa), true);
ck("ช่องที่ไม่ได้เขียนแต่แถว 20 มีสไตล์ ก็มีสไตล์ด้วย (C21 วันที่, K21 ตัวเลข) และไม่มีค่า", [/<c r="C21" s="3"\/>/.test(sa), /<c r="K21" s="4"\/>/.test(sa)], [true, true]);
ck("ไม่ลอกสูตรจากแถวต้นแบบ (G21 เป็นค่า ไม่ใช่สูตร)", /<c r="G21"[^>]*>(?:(?!<\/c>).)*<f/.test(sa), false);
ck("styles ไม่ถูกแตะ (ใช้สไตล์เดิมได้)", (await za.file("xl/styles.xml").async("string")) === (await zo.file("xl/styles.xml").async("string")), true);
ck("ฟิลเตอร์ขยายครอบแถวใหม่", (sa.match(/<autoFilter ref="([^"]*)"/) || [])[1], "A2:Q22");
const wba = await za.file("xl/workbook.xml").async("string");
ck("ชื่อช่วงฟิลเตอร์ที่ Excel ซ่อนไว้ขยายตาม", (wba.match(/_xlnm\._FilterDatabase"[^>]*>([^<]*)</) || [])[1], "'2026'!$A$2:$Q$22");
ck("ขอบเขตชีตขยายถึงแถว 22", (sa.match(/<dimension ref="([^"]*)"/) || [])[1], "A1:Q22");
ck("แถวใหม่ไม่ถูกซ่อน", /<row r="2[12]"[^>]*hidden/.test(sa), false);
const plain = await patchXlsx(JSZip, orig, "2026", [{ r: 3, c: 14, v: "x" }]);
const sp0 = await (await JSZip.loadAsync(plain.bytes)).file("xl/worksheets/sheet1.xml").async("string");
ck("ไม่ได้ต่อแถว ฟิลเตอร์ไม่ขยับ", (sp0.match(/<autoFilter ref="([^"]*)"/) || [])[1], "A2:Q20");

// แถวต่อท้ายไปตกบนแถวที่มีอยู่แล้ว (ไฟล์จริงมีแถวว่างที่จัดรูปแบบรอไว้) ฟิลเตอร์ก็ต้องขยาย
const pre = await patchXlsx(JSZip, orig, "2026", [{ r: 21, c: 13, v: "x" }]);              // ทำให้มีแถว 21 อยู่ก่อน
const ov = await patchXlsx(JSZip, pre.bytes, "2026", [{ r: 21, c: 6, v: "K" }], { appendFrom: 21, styleRow: 20 });
const sov = await (await JSZip.loadAsync(ov.bytes)).file("xl/worksheets/sheet1.xml").async("string");
ck("แถวต่อท้ายที่มีอยู่แล้วในไฟล์ ฟิลเตอร์ก็ขยาย", (sov.match(/<autoFilter ref="([^"]*)"/) || [])[1], "A2:Q21");

// คอลัมน์ใหม่ต่อติดขวาฟิลเตอร์ (ผลการหา ป้าย Addon) ฟิลเตอร์ต้องครอบด้วย ไม่งั้นไม่มีปุ่มกรองให้กด (เจอใน Excel ตัวจริง 06/10/2026)
const wc = await patchXlsx(JSZip, orig, "2026", [...add, { r: 2, c: 17, v: "ผลการหา" }, { r: 2, c: 18, v: "Addon" }, { r: 21, c: 18, v: "Addon 10/2026" }], { appendFrom: 21, styleRow: 20 });
const swc = await (await JSZip.loadAsync(wc.bytes)).file("xl/worksheets/sheet1.xml").async("string");
ck("หัวคอลัมน์ใหม่ R2 S2 ติดกัน ฟิลเตอร์ขยายเป็น A2:S22", (swc.match(/<autoFilter ref="([^"]*)"/) || [])[1], "A2:S22");
const gap = await patchXlsx(JSZip, orig, "2026", [{ r: 2, c: 19, v: "ห่าง" }]);
const sgap = await (await JSZip.loadAsync(gap.bytes)).file("xl/worksheets/sheet1.xml").async("string");
ck("หัวคอลัมน์ใหม่ที่ไม่ติดกัน (T2 เว้น R S) ฟิลเตอร์ไม่ขยับ", (sgap.match(/<autoFilter ref="([^"]*)"/) || [])[1], "A2:Q20");

console.log("\n━━ ⑦ ตาราง Excel (Format as Table) ต้องขยายตามแถวใหม่ ━━");
const tb = readFileSync(join(ROOT, "tests/fixtures/lookup-table.xlsx"));
const tp = await patchXlsx(JSZip, tb, "T", [{ r: 5, c: 0, v: "K9" }, { r: 5, c: 1, v: "TX-9" }], { appendFrom: 5, styleRow: 4 });
const tx = await (await JSZip.loadAsync(tp.bytes)).file("xl/tables/table1.xml").async("string");
ck("ช่วงตารางขยายจาก A1:C4 เป็น A1:C5", (tx.match(/<table\b[^>]*\sref="([^"]*)"/) || [])[1], "A1:C5");
ck("ฟิลเตอร์ในตารางขยายตาม", (tx.match(/<autoFilter ref="([^"]*)"/) || [])[1], "A1:C5");

console.log(`\n${F.length ? "❌" : "✅"} ผ่าน ${pass} ข้อ ${F.length ? `ตก ${F.length} ข้อ` : ""}`);
if (F.length) { console.log("\n" + F.join("\n") + "\n"); process.exit(1); }
