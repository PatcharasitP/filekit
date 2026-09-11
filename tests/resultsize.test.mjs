/* ตรวจว่า "แถวผลลัพธ์" ของทุกเครื่องมือบอกขนาดไฟล์ที่ได้
 *
 * ทำไมต้องมี: คนกดดาวน์โหลดเพื่อเอาไฟล์ไปใช้ต่อ (แนบเมล อัปโหลดเข้าระบบที่จำกัดขนาด)
 * "รวมเสร็จ 5 หน้า จาก 2 ไฟล์" ไม่ได้บอกว่าไฟล์ที่ได้ใหญ่แค่ไหน ต้องโหลดลงเครื่องแล้วไปดูเอง
 * สำรวจของจริง 11/09/2026: Smallpdf โชว์ "1 kB - 2 pages" ติดกับปุ่มดาวน์โหลด
 * ตอนพบครั้งแรก FileKit มี 11 แถวที่บอก และ 16 แถวที่ไม่บอก — ไม่สม่ำเสมอทั้งที่ blob อยู่ในมือแล้ว
 *
 * วิธีตรวจ: ตัดก้อน el("div", { class: "result" }, [...]) แบบนับวงเล็บให้สมดุล
 * แล้วดูว่าในก้อนนั้นมี fmtBytes() หรือคลาส r-size ไหม (สองทางนี้คือทางที่โค้ดนี้ใช้แสดงขนาด)
 *
 * ถ้าผิดจะรู้ได้ยังไง: ลบ fmtBytes ออกจากแถวไหนก็ตาม เทสนี้ต้องแดงทันทีพร้อมชื่อไฟล์+บรรทัด */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "src/tools");

let pass = 0; const fail = [];
const ck = (ok, msg) => { if (ok) { pass++; console.log("  ✅ " + msg); } else { fail.push(msg); console.log("  ❌ " + msg); } };

/** ตัดก้อน array ที่ตามหลังตำแหน่ง from โดยนับ [ ] ให้สมดุล — regex เดี่ยวกินข้ามก้อนได้ */
function block(src, from) {
  const i = src.indexOf("[", from);
  if (i < 0) return "";
  let d = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "[") d++;
    else if (src[j] === "]" && --d === 0) return src.slice(i, j + 1);
  }
  return "";
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".js")).sort();
// ‼️ กันกับดัก "ประชากรศูนย์" — parser พังแล้วไม่เจออะไรเลย เทสจะเขียวหลอก
ck(files.length >= 30, `อ่านไฟล์เครื่องมือได้ ${files.length} ไฟล์ (ต้อง >= 30 ไม่งั้นตัวอ่านพัง)`);

let rows = 0; const missing = [];
for (const f of files) {
  const src = readFileSync(join(DIR, f), "utf8");
  const re = /el\("div",\s*\{\s*class:\s*"result"\s*\}/g;
  for (let m; (m = re.exec(src)); ) {
    rows++;
    const blk = block(src, m.index + m[0].length);
    if (!/fmtBytes|r-size/.test(blk)) missing.push(`${f}:${src.slice(0, m.index).split("\n").length}`);
  }
}
ck(rows >= 20, `เจอแถวผลลัพธ์ ${rows} แถว (ต้อง >= 20 ไม่งั้นตัวอ่านพัง)`);
ck(missing.length === 0, `ทุกแถวผลลัพธ์บอกขนาดไฟล์${missing.length ? " — ขาด: " + missing.join(", ") : ""}`);

console.log(`\n${fail.length ? "❌" : "✅"} ผ่าน ${pass} ข้อ, ตก ${fail.length} ข้อ`);
process.exit(fail.length ? 1 : 0);
