/* ‼️ กฎจุดกลาง (·) ต้องบังคับถึง "ไฟล์ตัวอย่าง" ด้วย ไม่ใช่แค่โค้ดใน src/
 *
 * ทำไมต้องมี: accepts.test.mjs บังคับกฎนี้กับสตริงใน src/ มาตลอด แต่ข้อความในไฟล์ตัวอย่าง
 * ก็เป็นข้อความที่ผู้ใช้เห็นเหมือนกัน และแย่กว่าตรงที่มันไหลเข้าไปอยู่ใน "โค้ดที่ผู้ใช้คัดลอก
 * ไปใช้จริง" ด้วย (เช่นแปลงตารางเป็น Power Query แล้วจุดกลางติดไปในสูตร M)
 * เจอครั้งแรก 11/09/2026 ตอนเปิดดูภาพหน้าจอกล่องโค้ดด้วยตา ไม่ได้เจอจากเทสใด ๆ
 * รวม 24 จุด ใน 5 ไฟล์ ซึ่งไม่มีเครื่องมือไหนในโปรเจกต์มองเห็นเลย
 *
 * ‼️ ข้อจำกัดที่รู้ตัว: ไฟล์ .pdf กับ .jpg ตรวจด้วยวิธีนี้ไม่ได้ เพราะข้อความถูกเข้ารหัส
 *    เป็นรหัสตัวอักษรของฟอนต์ ไม่ใช่ UTF-8 ที่อ่านตรง ๆ ได้
 *    ตอนนี้รู้อยู่ว่า samples/ตัวอย่าง-รายงานประจำเดือน.pdf มีจุดกลาง 1 จุด
 *    (ลงคิวไว้ใน .claude/decisions.md แล้ว ต้องสร้างไฟล์ตัวอย่างใหม่ถึงจะแก้ได้)
 *    เทสนี้จึงบอกตรง ๆ ว่าครอบอะไรไม่ถึง ไม่ใช่เงียบแล้วทำเหมือนตรวจครบ
 *
 * รัน: node tests/samples.test.mjs */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "samples");

let pass = 0; const fail = [];
const ck = (ok, msg) => { if (ok) { pass++; console.log("  ✅ " + msg); } else { fail.push(msg); console.log("  ❌ " + msg); } };

/** อ่านไฟล์ใน .zip แบบไม่พึ่งเครื่องมือนอก — เดินหา local file header (PK\x03\x04) ทีละอัน
 *  พอสำหรับ OOXML ที่เราสร้างเอง (เก็บแบบ deflate หรือไม่บีบอัด) */
function zipEntries(buf) {
  const out = [];
  for (let i = 0; i + 30 <= buf.length; i++) {
    if (buf.readUInt32LE(i) !== 0x04034b50) continue;
    const method = buf.readUInt16LE(i + 8);
    const compSize = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const name = buf.slice(i + 30, i + 30 + nameLen).toString("utf8");
    const start = i + 30 + nameLen + extraLen;
    if (!compSize || start + compSize > buf.length) continue;   // ขนาดอยู่ใน data descriptor — ข้าม
    const raw = buf.slice(start, start + compSize);
    try {
      out.push({ name, data: method === 8 ? inflateRawSync(raw) : raw });
    } catch { /* ก้อนนี้แตกไม่ได้ ข้ามไป ไม่ใช่หน้าที่ของเทสนี้ */ }
  }
  return out;
}

const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const files = walk(DIR);
// ‼️ กันกับดักประชากรศูนย์
ck(files.length >= 12, `เจอไฟล์ตัวอย่าง ${files.length} ไฟล์ (ต้อง >= 12 ไม่งั้นตัวอ่านพัง)`);

const TEXT = new Set([".txt", ".csv", ".json", ".md", ".pq", ".m", ".dax"]);
const OOXML = new Set([".docx", ".xlsx", ".pptx"]);
const SKIP = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp", ".gif"]);

const bad = []; let scannedText = 0, scannedZip = 0, xmlParts = 0, xmlBytes = 0, skipped = [];
for (const p of files) {
  const ext = extname(p).toLowerCase();
  const rel = p.slice(ROOT.length + 1);
  if (TEXT.has(ext)) {
    scannedText++;
    const t = readFileSync(p, "utf8");
    const n = (t.match(/·/g) || []).length;
    if (n) bad.push(`${rel} (${n} จุด)`);
  } else if (OOXML.has(ext)) {
    scannedZip++;
    for (const e of zipEntries(readFileSync(p))) {
      if (!e.name.endsWith(".xml")) continue;
      xmlParts++;
      const t = e.data.toString("utf8");
      xmlBytes += t.length;
      const n = (t.match(/·/g) || []).length;
      if (n) bad.push(`${rel} [${e.name}] (${n} จุด)`);
    }
  } else if (SKIP.has(ext)) {
    skipped.push(rel);
  }
}

ck(scannedText >= 4, `สแกนไฟล์ข้อความได้ ${scannedText} ไฟล์ (ต้อง >= 4)`);
ck(scannedZip >= 3, `สแกนไฟล์ Office ได้ ${scannedZip} ไฟล์ (ต้อง >= 3)`);
/* ‼️ นับ "ชิ้นส่วนที่อ่านได้จริงข้างในไฟล์ zip" ไม่ใช่แค่จำนวนไฟล์ที่เปิด
   พิสูจน์มาแล้ว 11/09/2026: ทำให้ตัวอ่านข้างในพิการ (ข้ามทุก .xml) แล้วเทสยังเขียวสนิท
   เพราะตัวกันประชากรเดิมนับแค่ไฟล์ที่เปิดได้ ซึ่งยังเปิดได้อยู่
   ต้องนับให้ลึกถึงชั้นที่ตรวจจริง ๆ ไม่งั้นเครื่องตรวจพังแบบเงียบ */
ck(xmlParts >= 30 && xmlBytes > 50000,
   `อ่านชิ้นส่วนในไฟล์ Office ได้ ${xmlParts} ชิ้น รวม ${(xmlBytes / 1024).toFixed(0)} KB (ต้อง >= 30 ชิ้น และ > 50 KB)`);
ck(bad.length === 0, `ไม่มีจุดกลางในไฟล์ตัวอย่าง${bad.length ? " — พบ: " + bad.join(", ") : ""}`);
console.log(`  ℹ️ ตรวจไม่ถึง ${skipped.length} ไฟล์ (ข้อความถูกเข้ารหัสเป็นรหัสฟอนต์): ${skipped.join(", ")}`);

console.log(`\n${fail.length ? "❌" : "✅"} ผ่าน ${pass} ข้อ, ตก ${fail.length} ข้อ`);
process.exit(fail.length ? 1 : 0);
