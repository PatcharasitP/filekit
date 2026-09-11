/* ตรวจว่าไม่มี "1 pages" หลงเหลือในโหมดอังกฤษ
 *
 * ทำไมต้องมี: ภาษาไทยไม่มีพหูพจน์ "1 หน้า" กับ "5 หน้า" เขียนเหมือนกัน
 * เวลาเขียนคู่ไทย-อังกฤษใน tr() คนเขียนจึงแปลตรงตัวเป็น `${n} pages` โดยไม่ทันคิด
 * พอไฟล์ออกมาหน้าเดียวจริง ๆ ผู้ใช้โหมด EN เห็น "1 pages" ซึ่งผิดไวยากรณ์
 * (เจอจริง 11/09/2026 ที่ excel-to-pdf ตอนแปลง Excel ชีทเดียวได้ PDF หน้าเดียว)
 * ตอนพบครั้งแรกมี 128 จุด ใน 37 ไฟล์ — มากเกินกว่าจะอาศัยความจำของคนเขียน
 *
 * วิธีตรวจ: หารูปแบบ `${...} <คำนามพหูพจน์>` ที่ยังไม่ผ่าน pl()
 * ของที่ถูกต้องจะอยู่ในรูป ${pl(n, "page", "pages")} ซึ่งไม่เข้าแพตเทิร์นนี้
 *
 * ถ้าผิดจะรู้ได้ยังไง: เปลี่ยน pl(x, "page", "pages") กลับเป็น `${x} pages` ที่ไหนก็ได้
 * เทสนี้ต้องแดงทันทีพร้อมชื่อไฟล์และเลขบรรทัด */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// คำนามที่ใช้จริงในเว็บนี้ · เพิ่มคำใหม่ที่นี่เมื่อมีเครื่องมือที่นับของชนิดอื่น
const NOUNS = ["pages", "files", "rows", "sheets", "columns", "slides",
               "characters", "images", "spots", "paragraphs"];
const PAT = new RegExp(String.raw`\$\{[^{}]+\}\s+(${NOUNS.join("|")})\b`, "g");

let pass = 0; const fail = [];
const ck = (ok, msg) => { if (ok) { pass++; console.log("  ✅ " + msg); } else { fail.push(msg); console.log("  ❌ " + msg); } };

const files = [
  ...readdirSync(join(ROOT, "src")).filter((f) => f.endsWith(".js")).map((f) => ["src", f]),
  ...readdirSync(join(ROOT, "src/tools")).filter((f) => f.endsWith(".js")).map((f) => ["src/tools", f]),
];
// ‼️ กันกับดักประชากรศูนย์ — ถ้าอ่านไฟล์ไม่เจอ เทสจะเขียวหลอกทั้งที่ไม่ได้ตรวจอะไรเลย
ck(files.length >= 40, `อ่านไฟล์ได้ ${files.length} ไฟล์ (ต้อง >= 40 ไม่งั้นตัวอ่านพัง)`);

// ตัวช่วยต้องมีอยู่จริง ไม่งั้นทุกอย่างข้างล่างไม่มีความหมาย
const i18n = readFileSync(join(ROOT, "src/i18n.js"), "utf8");
ck(/export const pl = /.test(i18n), "src/i18n.js มีตัวช่วย pl() ให้ใช้");

const bad = [];
let checked = 0;
for (const [dir, f] of files) {
  const src = readFileSync(join(ROOT, dir, f), "utf8");
  if (dir === "src" && f === "i18n.js") continue;  // ตัวช่วยเองเขียนคำเหล่านี้ตรง ๆ ได้
  checked++;
  for (let m; (m = PAT.exec(src)); ) {
    bad.push(`${dir}/${f}:${src.slice(0, m.index).split("\n").length} → ${m[0].trim()}`);
  }
}
ck(checked >= 40, `สแกนแล้ว ${checked} ไฟล์`);
ck(bad.length === 0,
   `ไม่มีคำนามพหูพจน์ที่ยังไม่ผ่าน pl()${bad.length ? ` — พบ ${bad.length} จุด:\n     ` + bad.slice(0, 8).join("\n     ") : ""}`);

console.log(`\n${fail.length ? "❌" : "✅"} ผ่าน ${pass} ข้อ, ตก ${fail.length} ข้อ`);
process.exit(fail.length ? 1 : 0);
