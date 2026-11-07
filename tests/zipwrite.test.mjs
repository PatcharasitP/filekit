// zipwrite.test.mjs ตัวเขียน ZIP ของจดหมายเวียนข้อมูลใหญ่ (src/zipwrite.js) ตรวจด้วย zipfile ของ Python เป็นตัวอ่านอิสระ
// ต้อง: CRC ทุกไฟล์ถูก (testzip) , ชื่อไทยอ่านกลับตรง (ธง UTF-8) , เนื้อกลับมาตรงไบต์ , ไฟล์ที่บีบไว้ก่อน (deflate-raw) ใช้ซ้ำได้ ,
// ตัวเขียนแบบสตรีมส่งไบต์ออกทีละก้อนแล้วรวมเป็น ZIP ที่ถูกต้อง , CRC32 ตรงค่ามาตรฐาน
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const zw = await import(pathToFileURL(join(ROOT, "src/zipwrite.js")).href);
const enc = new TextEncoder();
const TMP = mkdtempSync(join(tmpdir(), "fk-zipwrite-"));

/** อ่าน ZIP ด้วย Python คืน {bad, names, data:{name: hex}} */
function pyRead(bytes) {
  const p = join(TMP, `z${Math.random().toString(36).slice(2)}.zip`);
  writeFileSync(p, bytes);
  const out = execFileSync("python3", ["-c", `import zipfile,json,sys
z=zipfile.ZipFile(sys.argv[1])
bad=z.testzip()
print(json.dumps({"bad": bad, "names": z.namelist(), "data": {} if bad else {n: z.read(n).hex() for n in z.namelist()}, "flags": [i.flag_bits & 0x800 for i in z.infolist()]}, ensure_ascii=False))`, p]);
  return JSON.parse(out.toString("utf8"));
}
const hex = (u8) => Buffer.from(u8).toString("hex");

test("CRC32 ตรงค่ามาตรฐาน (123456789 = cbf43926) , สตริงว่าง = 0", () => {
  assert.equal(zw.crc32(enc.encode("123456789")).toString(16), "cbf43926");
  assert.equal(zw.crc32(new Uint8Array(0)), 0);
});

test("ZIP ในหน่วยความจำ: ไฟล์เก็บตรงกับไฟล์ที่บีบไว้ก่อน อ่านด้วย Python ได้ CRC ถูก เนื้อตรง ชื่อไทยตรง", async () => {
  const big = enc.encode("<w:document>" + "สวัสดี ".repeat(2000) + "</w:document>");
  const pre = await zw.deflateEntry("word/styles.xml", big);
  assert.ok(pre.data.length < big.length / 5, "ไฟล์ที่บีบต้องเล็กลงจริง " + pre.data.length);
  const doc = enc.encode("<w:t>คุณทดสอบ ลำดับที่ 1</w:t>");
  const bytes = zw.makeZip([pre, zw.storeEntry("word/document.xml", doc), zw.storeEntry("เอกสาร ไทย.txt", enc.encode("ก"))]);
  const r = pyRead(bytes);
  assert.equal(r.bad, null, "testzip เจอไฟล์ CRC ผิด " + r.bad);
  assert.deepEqual(r.names, ["word/styles.xml", "word/document.xml", "เอกสาร ไทย.txt"]);
  assert.equal(r.data["word/styles.xml"], hex(big));
  assert.equal(r.data["word/document.xml"], hex(doc));
  assert.deepEqual(r.flags, [0x800, 0x800, 0x800]);
});

test("ไฟล์ที่บีบไว้ก่อนใช้ซ้ำได้หลาย ZIP โดยไม่บีบใหม่ (ไบต์เดิม)", async () => {
  const pre = await zw.deflateEntry("a.xml", enc.encode("x".repeat(5000)));
  const a = pyRead(zw.makeZip([pre, zw.storeEntry("b.txt", enc.encode("1"))]));
  const b = pyRead(zw.makeZip([pre, zw.storeEntry("b.txt", enc.encode("2"))]));
  assert.equal(a.bad, null); assert.equal(b.bad, null);
  assert.equal(a.data["a.xml"], b.data["a.xml"]);
  assert.notEqual(a.data["b.txt"], b.data["b.txt"]);
});

test("ตัวเขียนแบบสตรีม: ส่งไบต์ออกทีละไฟล์ รวมแล้วเป็น ZIP ถูกต้อง 300 ไฟล์ ชื่อไทย", async () => {
  const chunks = [];
  const s = zw.zipStream((u8) => { chunks.push(u8.slice()); });
  const docs = [];
  for (let i = 0; i < 300; i++) { const d = enc.encode(`เอกสารที่ ${i + 1} ` + "ข".repeat(i)); docs.push(d); await s.add(`จดหมาย-${i + 1}.docx`, d); }
  assert.equal(s.count, 300);
  await s.finish();
  assert.ok(chunks.length > 300, "ต้องส่งออกเป็นหลายก้อน ไม่รอรวมทั้งไฟล์");
  const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0)); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
  const r = pyRead(all);
  assert.equal(r.bad, null);
  assert.equal(r.names.length, 300);
  assert.equal(r.names[299], "จดหมาย-300.docx");
  assert.equal(r.data["จดหมาย-150.docx"], hex(docs[149]));
});

test("ประชากร: ZIP ที่เสียจริง Python จับได้ (ตัวตรวจไม่ตาบอด)", () => {
  const bytes = zw.makeZip([zw.storeEntry("a.txt", enc.encode("hello world"))]);
  const bad = bytes.slice(); bad[bad.indexOf(0x68)] ^= 0xff; // เปลี่ยนไบต์แรกของเนื้อ h
  assert.equal(pyRead(bad).bad, "a.txt");
});
